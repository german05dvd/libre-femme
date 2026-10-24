-- Manual stock and money register for LIBRE femme.
-- Catalog creation stays separate; only confirmed register entries change stock.
begin;

alter table public.product_variants
  add column if not exists color_hex text
  check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}

create table public.manual_register_entries (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in ('purchase', 'sale', 'adjustment_in', 'adjustment_out')),
  occurred_at timestamptz not null default now(),
  reference text,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'confirmed' and confirmed_at is not null) or status <> 'confirmed')
);

create table public.manual_register_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.manual_register_entries(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_cost_usd numeric(14,4) not null default 0 check (unit_cost_usd >= 0),
  unit_sale_price_usd numeric(14,2) not null default 0 check (unit_sale_price_usd >= 0),
  created_at timestamptz not null default now()
);
create index manual_register_lines_entry_idx on public.manual_register_lines(entry_id);
create index manual_register_entries_date_idx on public.manual_register_entries(occurred_at desc);

alter table public.inventory_movements
  add column manual_register_line_id uuid unique references public.manual_register_lines(id) on delete restrict;

alter table public.inventory_movements
  drop constraint inventory_movement_source_consistency;
alter table public.inventory_movements
  add constraint inventory_movement_source_consistency check (
    (movement_type = 'purchase_receipt' and quantity_delta > 0
      and ((source_purchase_item_id is not null and source_order_item_id is null and manual_register_line_id is null)
        or (source_purchase_item_id is null and source_order_item_id is null and manual_register_line_id is not null)))
    or
    (movement_type = 'sale' and quantity_delta < 0
      and ((source_order_item_id is not null and source_purchase_item_id is null and manual_register_line_id is null)
        or (source_order_item_id is null and source_purchase_item_id is null and manual_register_line_id is not null)))
    or
    (movement_type = 'adjustment_in' and quantity_delta > 0 and source_purchase_item_id is null and source_order_item_id is null and manual_register_line_id is null)
    or
    (movement_type = 'adjustment_out' and quantity_delta < 0 and source_purchase_item_id is null and source_order_item_id is null and manual_register_line_id is null)
  );

create or replace function public.confirm_manual_register_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.manual_register_entries%rowtype;
  line public.manual_register_lines%rowtype;
begin
  if not public.is_admin() then raise exception 'Only admins can confirm register entries'; end if;
  select * into e from public.manual_register_entries where id = p_entry_id for update;
  if not found then raise exception 'Register entry not found'; end if;
  if e.status <> 'draft' then raise exception 'Only draft entries can be confirmed'; end if;
  if not exists (select 1 from public.manual_register_lines where entry_id = e.id) then
    raise exception 'A register entry must contain at least one line';
  end if;

  for line in select * from public.manual_register_lines where entry_id = e.id order by variant_id, id
  loop
    if e.entry_type = 'purchase' then
      insert into public.inventory_movements (
        variant_id, movement_type, quantity_delta, unit_cost_usd,
        manual_register_line_id, created_by, note, created_at
      ) values (
        line.variant_id, 'purchase_receipt', line.quantity, line.unit_cost_usd,
        line.id, e.created_by, coalesce(e.notes, 'Manual purchase'), e.occurred_at
      );
    elsif e.entry_type = 'sale' then
      insert into public.inventory_movements (
        variant_id, movement_type, quantity_delta, unit_cost_usd,
        manual_register_line_id, created_by, note, created_at
      ) values (
        line.variant_id, 'sale', -line.quantity, 0,
        line.id, e.created_by, coalesce(e.notes, 'Manual sale'), e.occurred_at
      );
    elsif e.entry_type = 'adjustment_in' then
      insert into public.inventory_movements (
        variant_id, movement_type, quantity_delta, unit_cost_usd, created_by, note, created_at
      ) values (line.variant_id, 'adjustment_in', line.quantity, line.unit_cost_usd, e.created_by, coalesce(e.notes, 'Manual adjustment'), e.occurred_at);
    else
      insert into public.inventory_movements (
        variant_id, movement_type, quantity_delta, unit_cost_usd, created_by, note, created_at
      ) values (line.variant_id, 'adjustment_out', -line.quantity, 0, e.created_by, coalesce(e.notes, 'Manual adjustment'), e.occurred_at);
    end if;
  end loop;

  update public.manual_register_entries
  set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
  where id = e.id;
end;
$$;

alter table public.manual_register_entries enable row level security;
alter table public.manual_register_lines enable row level security;
create policy manual_register_entries_admin_all on public.manual_register_entries
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy manual_register_lines_admin_all on public.manual_register_lines
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.manual_register_entries, public.manual_register_lines from public, anon, authenticated;
grant select, insert, update on public.manual_register_entries, public.manual_register_lines to authenticated;
revoke all on function public.confirm_manual_register_entry(uuid) from public, anon;
grant execute on function public.confirm_manual_register_entry(uuid) to authenticated;

drop view if exists public.admin_inventory_register;
create view public.admin_inventory_register as
select
  im.id, im.created_at, im.movement_type,
  case when im.movement_type in ('purchase_receipt','adjustment_in') then 'entrada'
       when im.movement_type in ('sale','adjustment_out') then 'salida' end as action,
  p.name as product_name, v.sku, v.size, v.color, v.color_hex,
  abs(im.quantity_delta) as quantity,
  case when im.movement_type = 'sale' then mrl.unit_sale_price_usd
       when im.movement_type = 'purchase_receipt' then im.unit_cost_usd
       else null end as unit_price_usd,
  case when im.movement_type = 'sale' then abs(im.quantity_delta) * mrl.unit_sale_price_usd
       else abs(im.quantity_delta) * im.unit_cost_usd end as total_usd,
  case when im.movement_type = 'sale' then coalesce((
    select sum(a.quantity * a.unit_cost_usd) from public.inventory_cost_allocations a
    where a.sale_movement_id = im.id
  ), 0) else im.unit_cost_usd end as unit_cost_usd,
  case when im.movement_type = 'sale' then (
    select round(sum(a.quantity * a.unit_cost_usd), 2) from public.inventory_cost_allocations a
    where a.sale_movement_id = im.id
  ) else null end as cost_of_sale_usd,
  mrl.unit_sale_price_usd,
  im.note, im.source_order_item_id, im.source_purchase_item_id
from public.inventory_movements im
join public.product_variants v on v.id = im.variant_id
join public.products p on p.id = v.product_id
left join public.order_items oi on oi.id = im.source_order_item_id
left join public.manual_register_lines mrl on mrl.id = im.manual_register_line_id
where public.is_admin();
revoke all on public.admin_inventory_register from public, anon, authenticated;
grant select on public.admin_inventory_register to authenticated;

commit;
);

drop view if exists public.public_catalog_variants;
create view public.public_catalog_variants as
select v.id, v.product_id, v.size, v.color, v.color_hex, v.sale_price,
  coalesce(s.quantity_on_hand, 0) as quantity_on_hand
from public.product_variants v
join public.products p on p.id = v.product_id
left join public.inventory_stock s on s.variant_id = v.id
where v.is_active and p.status = 'published';
grant select on public.public_catalog_variants to anon, authenticated;

create table public.manual_register_entries (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in ('purchase', 'sale', 'adjustment_in', 'adjustment_out')),
  occurred_at timestamptz not null default now(),
  reference text,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'confirmed' and confirmed_at is not null) or status <> 'confirmed')
);

create table public.manual_register_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.manual_register_entries(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_cost_usd numeric(14,4) not null default 0 check (unit_cost_usd >= 0),
  unit_sale_price_usd numeric(14,2) not null default 0 check (unit_sale_price_usd >= 0),
  created_at timestamptz not null default now()
);
create index manual_register_lines_entry_idx on public.manual_register_lines(entry_id);
create index manual_register_entries_date_idx on public.manual_register_entries(occurred_at desc);

alter table public.inventory_movements
  add column manual_register_line_id uuid unique references public.manual_register_lines(id) on delete restrict;

alter table public.inventory_movements
  drop constraint inventory_movement_source_consistency;
alter table public.inventory_movements
  add constraint inventory_movement_source_consistency check (
    (movement_type = 'purchase_receipt' and quantity_delta > 0
      and ((source_purchase_item_id is not null and source_order_item_id is null and manual_register_line_id is null)
        or (source_purchase_item_id is null and source_order_item_id is null and manual_register_line_id is not null)))
    or
    (movement_type = 'sale' and quantity_delta < 0
      and ((source_order_item_id is not null and source_purchase_item_id is null and manual_register_line_id is null)
        or (source_order_item_id is null and source_purchase_item_id is null and manual_register_line_id is not null)))
    or
    (movement_type = 'adjustment_in' and quantity_delta > 0 and source_purchase_item_id is null and source_order_item_id is null and manual_register_line_id is null)
    or
    (movement_type = 'adjustment_out' and quantity_delta < 0 and source_purchase_item_id is null and source_order_item_id is null and manual_register_line_id is null)
  );

create or replace function public.confirm_manual_register_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.manual_register_entries%rowtype;
  line public.manual_register_lines%rowtype;
begin
  if not public.is_admin() then raise exception 'Only admins can confirm register entries'; end if;
  select * into e from public.manual_register_entries where id = p_entry_id for update;
  if not found then raise exception 'Register entry not found'; end if;
  if e.status <> 'draft' then raise exception 'Only draft entries can be confirmed'; end if;
  if not exists (select 1 from public.manual_register_lines where entry_id = e.id) then
    raise exception 'A register entry must contain at least one line';
  end if;

  for line in select * from public.manual_register_lines where entry_id = e.id order by variant_id, id
  loop
    if e.entry_type = 'purchase' then
      insert into public.inventory_movements (
        variant_id, movement_type, quantity_delta, unit_cost_usd,
        manual_register_line_id, created_by, note, created_at
      ) values (
        line.variant_id, 'purchase_receipt', line.quantity, line.unit_cost_usd,
        line.id, e.created_by, coalesce(e.notes, 'Manual purchase'), e.occurred_at
      );
    elsif e.entry_type = 'sale' then
      insert into public.inventory_movements (
        variant_id, movement_type, quantity_delta, unit_cost_usd,
        manual_register_line_id, created_by, note, created_at
      ) values (
        line.variant_id, 'sale', -line.quantity, 0,
        line.id, e.created_by, coalesce(e.notes, 'Manual sale'), e.occurred_at
      );
    elsif e.entry_type = 'adjustment_in' then
      insert into public.inventory_movements (
        variant_id, movement_type, quantity_delta, unit_cost_usd, created_by, note, created_at
      ) values (line.variant_id, 'adjustment_in', line.quantity, line.unit_cost_usd, e.created_by, coalesce(e.notes, 'Manual adjustment'), e.occurred_at);
    else
      insert into public.inventory_movements (
        variant_id, movement_type, quantity_delta, unit_cost_usd, created_by, note, created_at
      ) values (line.variant_id, 'adjustment_out', -line.quantity, 0, e.created_by, coalesce(e.notes, 'Manual adjustment'), e.occurred_at);
    end if;
  end loop;

  update public.manual_register_entries
  set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
  where id = e.id;
end;
$$;

alter table public.manual_register_entries enable row level security;
alter table public.manual_register_lines enable row level security;
create policy manual_register_entries_admin_all on public.manual_register_entries
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy manual_register_lines_admin_all on public.manual_register_lines
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.manual_register_entries, public.manual_register_lines from public, anon, authenticated;
grant select, insert, update on public.manual_register_entries, public.manual_register_lines to authenticated;
revoke all on function public.confirm_manual_register_entry(uuid) from public, anon;
grant execute on function public.confirm_manual_register_entry(uuid) to authenticated;

drop view if exists public.admin_inventory_register;
create view public.admin_inventory_register as
select
  im.id, im.created_at, im.movement_type,
  case when im.movement_type in ('purchase_receipt','adjustment_in') then 'entrada'
       when im.movement_type in ('sale','adjustment_out') then 'salida' end as action,
  p.name as product_name, v.sku, v.size, v.color, v.color_hex,
  abs(im.quantity_delta) as quantity,
  case when im.movement_type = 'sale' then mrl.unit_sale_price_usd
       when im.movement_type = 'purchase_receipt' then im.unit_cost_usd
       else null end as unit_price_usd,
  case when im.movement_type = 'sale' then abs(im.quantity_delta) * mrl.unit_sale_price_usd
       else abs(im.quantity_delta) * im.unit_cost_usd end as total_usd,
  case when im.movement_type = 'sale' then coalesce((
    select sum(a.quantity * a.unit_cost_usd) from public.inventory_cost_allocations a
    where a.sale_movement_id = im.id
  ), 0) else im.unit_cost_usd end as unit_cost_usd,
  case when im.movement_type = 'sale' then (
    select round(sum(a.quantity * a.unit_cost_usd), 2) from public.inventory_cost_allocations a
    where a.sale_movement_id = im.id
  ) else null end as cost_of_sale_usd,
  mrl.unit_sale_price_usd,
  im.note, im.source_order_item_id, im.source_purchase_item_id
from public.inventory_movements im
join public.product_variants v on v.id = im.variant_id
join public.products p on p.id = v.product_id
left join public.order_items oi on oi.id = im.source_order_item_id
left join public.manual_register_lines mrl on mrl.id = im.manual_register_line_id
where public.is_admin();

commit;
