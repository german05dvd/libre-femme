-- LIBRE femme: FIFO cost layers and unified admin movement register.
-- This migration is intended for review and CI only; do not apply to remote Supabase
-- until the schema and rollout plan have been approved.

begin;

-- Public catalog shows the live, ledger-derived stock per variant.
create or replace view public.public_catalog_variants as
select v.id, v.product_id, v.size, v.color, v.sale_price,
  coalesce(s.quantity_on_hand, 0) as quantity_on_hand
from public.product_variants v
join public.products p on p.id = v.product_id
left join public.inventory_stock s on s.variant_id = v.id
where v.is_active and p.status = 'published';

grant select on public.public_catalog_variants to anon;

create table public.inventory_cost_layers (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  source_movement_id uuid not null unique references public.inventory_movements(id) on delete restrict,
  received_at timestamptz not null,
  quantity_received integer not null check (quantity_received > 0),
  quantity_remaining integer not null check (quantity_remaining >= 0 and quantity_remaining <= quantity_received),
  unit_cost_usd numeric(14,4) not null check (unit_cost_usd >= 0),
  created_at timestamptz not null default now()
);

create index inventory_cost_layers_fifo_idx
  on public.inventory_cost_layers(variant_id, received_at, id)
  where quantity_remaining > 0;

create table public.inventory_cost_allocations (
  id uuid primary key default gen_random_uuid(),
  sale_movement_id uuid not null references public.inventory_movements(id) on delete restrict,
  cost_layer_id uuid not null references public.inventory_cost_layers(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_cost_usd numeric(14,4) not null check (unit_cost_usd >= 0),
  created_at timestamptz not null default now(),
  unique (sale_movement_id, cost_layer_id)
);

create index inventory_cost_allocations_sale_idx
  on public.inventory_cost_allocations(sale_movement_id);

-- Reconstruct cost layers from the immutable ledger in chronological order. This
-- also safely handles any pre-existing receipts and sales when this migration runs.
do $fifo$
declare
  movement record;
  layer record;
  remaining_to_consume integer;
  take_quantity integer;
begin
  for movement in
    select im.*
    from public.inventory_movements im
    order by im.variant_id, im.created_at, im.id
  loop
    if movement.quantity_delta > 0 then
      insert into public.inventory_cost_layers (
        variant_id, source_movement_id, received_at,
        quantity_received, quantity_remaining, unit_cost_usd
      ) values (
        movement.variant_id, movement.id, movement.created_at,
        movement.quantity_delta, movement.quantity_delta, movement.unit_cost_usd
      );
    else
      remaining_to_consume := abs(movement.quantity_delta);
      for layer in
        select l.id, l.quantity_remaining, l.unit_cost_usd
        from public.inventory_cost_layers l
        where l.variant_id = movement.variant_id and l.quantity_remaining > 0
        order by l.received_at, l.id
        for update
      loop
        exit when remaining_to_consume = 0;
        take_quantity := least(remaining_to_consume, layer.quantity_remaining);
        update public.inventory_cost_layers
        set quantity_remaining = quantity_remaining - take_quantity
        where id = layer.id;
        insert into public.inventory_cost_allocations (
          sale_movement_id, cost_layer_id, quantity, unit_cost_usd
        ) values (
          movement.id, layer.id, take_quantity, layer.unit_cost_usd
        );
        remaining_to_consume := remaining_to_consume - take_quantity;
      end loop;
      if remaining_to_consume > 0 then
        raise exception 'Cannot reconstruct FIFO cost for movement %: missing % units',
          movement.id, remaining_to_consume;
      end if;
    end if;
  end loop;
end;
$fifo$;

-- Every future stock-in creates a FIFO layer. Every stock-out consumes oldest
-- remaining layers and records exact per-layer cost allocations.
create or replace function public.apply_fifo_cost_layers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_to_consume integer;
  layer record;
  take_quantity integer;
begin
  if new.quantity_delta > 0 then
    insert into public.inventory_cost_layers (
      variant_id, source_movement_id, received_at,
      quantity_received, quantity_remaining, unit_cost_usd
    ) values (
      new.variant_id, new.id, new.created_at,
      new.quantity_delta, new.quantity_delta, new.unit_cost_usd
    );
    return new;
  end if;

  remaining_to_consume := abs(new.quantity_delta);
  for layer in
    select l.id, l.quantity_remaining, l.unit_cost_usd
    from public.inventory_cost_layers l
    where l.variant_id = new.variant_id and l.quantity_remaining > 0
    order by l.received_at, l.id
    for update
  loop
    exit when remaining_to_consume = 0;
    take_quantity := least(remaining_to_consume, layer.quantity_remaining);
    update public.inventory_cost_layers
    set quantity_remaining = quantity_remaining - take_quantity
    where id = layer.id;
    insert into public.inventory_cost_allocations (
      sale_movement_id, cost_layer_id, quantity, unit_cost_usd
    ) values (new.id, layer.id, take_quantity, layer.unit_cost_usd);

    remaining_to_consume := remaining_to_consume - take_quantity;
  end loop;

  if remaining_to_consume > 0 then
    raise exception 'FIFO layers are insufficient for movement % (missing % units)',
      new.id, remaining_to_consume;
  end if;


  return new;
end;
$$;

create trigger inventory_movement_fifo_cost
after insert on public.inventory_movements
for each row execute function public.apply_fifo_cost_layers();

alter table public.inventory_cost_layers enable row level security;
alter table public.inventory_cost_allocations enable row level security;

create policy inventory_cost_layers_admin_read
  on public.inventory_cost_layers for select to authenticated
  using ((select public.is_admin()));
create policy inventory_cost_allocations_admin_read
  on public.inventory_cost_allocations for select to authenticated
  using ((select public.is_admin()));

revoke all on public.inventory_cost_layers, public.inventory_cost_allocations
  from public, anon, authenticated;
grant select on public.inventory_cost_layers, public.inventory_cost_allocations
  to authenticated;

-- One chronological book for all stock movements, with prices appropriate to
-- the movement type. Access is limited to provisioned administrators.
create view public.admin_inventory_register as
select
  im.id,
  im.created_at,
  im.movement_type,
  case
    when im.movement_type in ('purchase_receipt', 'adjustment_in') then 'entrada'
    when im.movement_type in ('sale', 'adjustment_out') then 'salida'
  end as action,
  p.name as product_name,
  v.sku,
  v.size,
  v.color,
  abs(im.quantity_delta) as quantity,
  case when im.movement_type = 'sale' then oi.unit_sale_price_usd
       else im.unit_cost_usd end as unit_price_usd,
  case when im.movement_type = 'sale' then oi.line_total_usd
       else abs(im.quantity_delta) * im.unit_cost_usd end as total_usd,
  case when im.movement_type = 'sale' then oi.unit_cost_usd else im.unit_cost_usd end as unit_cost_usd,
  case when im.movement_type = 'sale' then (
    select round(sum(a.quantity * a.unit_cost_usd), 2)
    from public.inventory_cost_allocations a
    where a.sale_movement_id = im.id
  ) else null end as cost_of_sale_usd,
  oi.unit_sale_price_usd as unit_sale_price_usd,
  im.note,
  im.source_order_item_id,
  im.source_purchase_item_id
from public.inventory_movements im
join public.product_variants v on v.id = im.variant_id
join public.products p on p.id = v.product_id
left join public.order_items oi on oi.id = im.source_order_item_id
where public.is_admin();

revoke all on public.admin_inventory_register from public, anon, authenticated;
grant select on public.admin_inventory_register to authenticated;

commit;
