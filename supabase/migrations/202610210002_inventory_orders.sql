-- LIBRE femme
-- Migration: inventory ledger, landed-cost hooks, and order confirmation.
-- Review and test before applying to Supabase.

begin;

-- Additional landed costs are allocated to each purchase line before receipt.
alter table public.purchase_items
  add column allocated_cost_usd numeric(14,2) not null default 0
  check (allocated_cost_usd >= 0);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'confirmed', 'cancelled')),
  source text not null default 'manual'
    check (source in ('manual', 'whatsapp')),
  customer_name text,
  customer_phone text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_confirmed_fields_consistent check (
    (status = 'confirmed' and confirmed_at is not null and confirmed_by is not null)
    or
    (status <> 'confirmed' and confirmed_at is null and confirmed_by is null)
  )
);

create index orders_status_created_at_idx on public.orders(status, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  sku_snapshot text not null,
  product_name_snapshot text not null,
  size_snapshot text,
  color_snapshot text,
  quantity integer not null check (quantity > 0),
  unit_sale_price_usd numeric(12,2) not null check (unit_sale_price_usd >= 0),
  unit_cost_usd numeric(12,2) check (unit_cost_usd is null or unit_cost_usd >= 0),
  line_total_usd numeric(14,2)
    generated always as (quantity * unit_sale_price_usd) stored,
  created_at timestamptz not null default now(),
  constraint order_items_variant_once unique (order_id, variant_id),
  constraint order_items_snapshots_not_blank check (
    length(trim(sku_snapshot)) > 0 and length(trim(product_name_snapshot)) > 0
  )
);

create index order_items_variant_id_idx on public.order_items(variant_id);
create index order_items_order_id_idx on public.order_items(order_id);

-- The stock table is a fast, lockable balance; the movement table is the audit ledger.
create table public.inventory_stock (
  variant_id uuid primary key references public.product_variants(id) on delete restrict,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  average_cost_usd numeric(14,4) not null default 0 check (average_cost_usd >= 0),
  updated_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  movement_type text not null
    check (movement_type in ('purchase_receipt', 'sale', 'adjustment_in', 'adjustment_out')),
  quantity_delta integer not null check (quantity_delta <> 0),
  unit_cost_usd numeric(14,4) not null check (unit_cost_usd >= 0),
  source_purchase_item_id uuid unique
    references public.purchase_items(id) on delete restrict,
  source_order_item_id uuid unique
    references public.order_items(id) on delete restrict,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_movement_source_consistency check (
    (movement_type = 'purchase_receipt'
      and quantity_delta > 0
      and source_purchase_item_id is not null
      and source_order_item_id is null)
    or
    (movement_type = 'sale'
      and quantity_delta < 0
      and source_order_item_id is not null
      and source_purchase_item_id is null)
    or
    (movement_type = 'adjustment_in'
      and quantity_delta > 0
      and source_purchase_item_id is null
      and source_order_item_id is null)
    or
    (movement_type = 'adjustment_out'
      and quantity_delta < 0
      and source_purchase_item_id is null
      and source_order_item_id is null)
  )
);

create index inventory_movements_variant_created_idx
  on public.inventory_movements(variant_id, created_at desc);

-- Ensure every variant has a balance row.
create or replace function public.ensure_variant_stock_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory_stock (variant_id)
  values (new.id)
  on conflict (variant_id) do nothing;
  return new;
end;
$$;

create trigger product_variant_stock_row
after insert on public.product_variants
for each row execute function public.ensure_variant_stock_row();

insert into public.inventory_stock (variant_id)
select v.id from public.product_variants v
on conflict (variant_id) do nothing;

-- All stock changes are represented by immutable ledger entries.
create or replace function public.apply_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_qty integer;
  current_avg numeric(14,4);
  next_qty integer;
  next_avg numeric(14,4);
begin
  insert into public.inventory_stock (variant_id)
  values (new.variant_id)
  on conflict (variant_id) do nothing;

  select s.quantity_on_hand, s.average_cost_usd
    into current_qty, current_avg
  from public.inventory_stock s
  where s.variant_id = new.variant_id
  for update;

  next_qty := current_qty + new.quantity_delta;
  if next_qty < 0 then
    raise exception 'Insufficient stock for variant % (available %, requested %)',
      new.variant_id, current_qty, abs(new.quantity_delta);
  end if;

  if new.quantity_delta > 0 then
    if next_qty = 0 then
      next_avg := 0;
    else
      next_avg := round(
        ((current_qty * current_avg)
          + (new.quantity_delta * new.unit_cost_usd)) / next_qty,
        4
      );
    end if;
  else
    next_avg := current_avg;
  end if;

  update public.inventory_stock
  set quantity_on_hand = next_qty,
      average_cost_usd = next_avg,
      updated_at = now()
  where variant_id = new.variant_id;

  return new;
end;
$$;

create trigger inventory_movement_apply
before insert on public.inventory_movements
for each row execute function public.apply_inventory_movement();

-- Prevent ledger edits/deletes: corrections must be new compensating movements.
create or replace function public.prevent_inventory_movement_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Inventory movements are immutable; add a compensating movement';
end;
$$;

create trigger inventory_movement_immutable
before update or delete on public.inventory_movements
for each row execute function public.prevent_inventory_movement_mutation();

-- Purchase receipt adds stock exactly once and captures the acquisition cost in USD.
create or replace function public.receive_purchase_into_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
begin
  if old.status <> 'received' and new.status = 'received' then
    if not exists (
      select 1 from public.purchase_items pi where pi.purchase_id = new.id
    ) then
      raise exception 'A purchase must contain at least one item before receipt';
    end if;

    for item in
      select pi.id, pi.variant_id, pi.quantity,
        (pi.unit_cost * new.exchange_rate_to_usd
          + pi.allocated_cost_usd / pi.quantity)::numeric(14,4) as landed_unit_cost
      from public.purchase_items pi
      where pi.purchase_id = new.id
      order by pi.variant_id
    loop
      insert into public.inventory_movements (
        variant_id, movement_type, quantity_delta, unit_cost_usd,
        source_purchase_item_id, created_by, note
      )
      values (
        item.variant_id, 'purchase_receipt', item.quantity,
        greatest(item.landed_unit_cost, 0),
        item.id, new.created_by, 'Received purchase ' || new.id::text
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger purchases_receive_inventory
after update of status on public.purchases
for each row execute function public.receive_purchase_into_inventory();

-- Guard order lifecycle and prevent edits after confirmation/cancellation.
create or replace function public.guard_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('confirmed', 'cancelled') then
    raise exception 'Orders in status % are immutable', old.status;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft' and new.status in ('pending', 'cancelled'))
      or
      (old.status = 'pending' and new.status in ('confirmed', 'cancelled'))
    ) then
      raise exception 'Invalid order status transition: % -> %', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;

create trigger orders_guard_update
before update on public.orders
for each row execute function public.guard_order_update();

create or replace function public.guard_order_item_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_order_id uuid;
  parent_status text;
begin
  if tg_op = 'UPDATE' and new.order_id is distinct from old.order_id then
    raise exception 'An order item cannot be moved to another order';
  end if;

  if tg_op = 'DELETE' then
    parent_order_id := old.order_id;
  else
    parent_order_id := new.order_id;
  end if;

  select o.status into parent_status
  from public.orders o
  where o.id = parent_order_id
  for update;

  if parent_status is null then
    raise exception 'Order not found for order item';
  end if;

  if parent_status not in ('draft', 'pending') then
    raise exception 'Order items can only change while order is draft or pending';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger order_items_guard_insert
before insert on public.order_items
for each row execute function public.guard_order_item_write();

create trigger order_items_guard_update
before update on public.order_items
for each row execute function public.guard_order_item_write();

create trigger order_items_guard_delete
before delete on public.order_items
for each row execute function public.guard_order_item_write();

-- Only a provisioned admin can confirm. Row locks + unique source movement make
-- confirmation atomic and prevent stock being deducted twice.
create or replace function public.confirm_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_status text;
  item record;
  available_qty integer;
  unit_cost numeric(14,4);
begin
  if not public.is_admin() then
    raise exception 'Only admins can confirm orders';
  end if;

  select o.status into order_status
  from public.orders o
  where o.id = p_order_id
  for update;

  if order_status is null then
    raise exception 'Order not found';
  end if;
  if order_status <> 'pending' then
    raise exception 'Only pending orders can be confirmed';
  end if;
  if not exists (select 1 from public.order_items oi where oi.order_id = p_order_id) then
    raise exception 'An order must contain at least one item';
  end if;

  -- Lock balances in stable variant order to reduce deadlock risk.
  for item in
    select oi.id, oi.variant_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
    order by oi.variant_id
  loop
    select s.quantity_on_hand, s.average_cost_usd
      into available_qty, unit_cost
    from public.inventory_stock s
    where s.variant_id = item.variant_id
    for update;

    if available_qty is null then
      raise exception 'No inventory balance exists for variant %', item.variant_id;
    end if;
    if available_qty < item.quantity then
      raise exception 'Insufficient stock for variant % (available %, requested %)',
        item.variant_id, available_qty, item.quantity;
    end if;

    update public.order_items
    set unit_cost_usd = unit_cost
    where id = item.id;

    insert into public.inventory_movements (
      variant_id, movement_type, quantity_delta, unit_cost_usd,
      source_order_item_id, created_by, note
    )
    values (
      item.variant_id, 'sale', -item.quantity, unit_cost,
      item.id, (select auth.uid()), 'Confirmed order ' || p_order_id::text
    );
  end loop;

  update public.orders
  set status = 'confirmed',
      confirmed_at = now(),
      confirmed_by = (select auth.uid()),
      updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.confirm_order(uuid) from public, anon;
grant execute on function public.confirm_order(uuid) to authenticated;

-- RLS and least-privilege access.
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_stock enable row level security;
alter table public.inventory_movements enable row level security;

create policy orders_admin_all on public.orders
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy order_items_admin_all on public.order_items
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy inventory_stock_admin_read on public.inventory_stock
  for select to authenticated
  using ((select public.is_admin()));

create policy inventory_movements_admin_read on public.inventory_movements
  for select to authenticated
  using ((select public.is_admin()));

revoke all on public.orders, public.order_items, public.inventory_stock,
  public.inventory_movements from anon, authenticated;

grant select, insert, update, delete on public.orders, public.order_items to authenticated;
grant select on public.inventory_stock, public.inventory_movements to authenticated;

commit;
