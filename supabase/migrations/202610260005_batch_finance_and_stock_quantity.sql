-- LIBRE femme: real stock quantities and batch-level financial reporting.
begin;

alter table public.manual_register_entries
  add column if not exists batch_total_cost_usd numeric(14,2)
  check (batch_total_cost_usd is null or batch_total_cost_usd >= 0);

-- Backfill historical purchase totals from the costs already captured on their lines.
update public.manual_register_entries e
set batch_total_cost_usd = x.total_cost
from (
  select entry_id, round(sum(quantity * unit_cost_usd), 2) as total_cost
  from public.manual_register_lines
  group by entry_id
) x
where x.entry_id = e.id
  and e.entry_type = 'purchase'
  and e.batch_total_cost_usd is null;

-- Public storefront exposes a count, not merely a boolean, so customers can
-- select quantities up to the real on-hand balance. This never reserves stock.
drop view if exists public.public_catalog_variants;
create view public.public_catalog_variants as
select
  v.id, v.product_id, v.size, v.color, v.sale_price,
  (coalesce(s.quantity_on_hand, 0) > 0) as is_available,
  v.color_hex,
  coalesce(s.quantity_on_hand, 0)::integer as stock_quantity
from public.product_variants v
join public.products p on p.id = v.product_id
left join public.inventory_stock s on s.variant_id = v.id
where v.is_active and p.status = 'published';
grant select on public.public_catalog_variants to anon, authenticated;

-- Financial reports aggregate by the manual operation (a box/lot), not by
-- each SKU line. Sale cost is still calculated from the immutable FIFO ledger.
create or replace view public.admin_financial_entries as
select
  e.id,
  e.occurred_at as created_at,
  e.entry_type,
  e.status,
  e.reference,
  e.notes,
  case when e.entry_type = 'purchase'
       then coalesce(e.batch_total_cost_usd, sum(l.quantity * l.unit_cost_usd), 0)
       else 0 end::numeric(14,2) as purchase_total_usd,
  case when e.entry_type = 'sale'
       then coalesce(sum(l.quantity * l.unit_sale_price_usd), 0)
       else 0 end::numeric(14,2) as sales_total_usd,
  case when e.entry_type = 'sale'
       then coalesce(sum((
         select sum(a.quantity * a.unit_cost_usd)
         from public.inventory_movements im
         join public.inventory_cost_allocations a on a.sale_movement_id = im.id
         where im.manual_register_line_id = l.id
       )), 0)
       else 0 end::numeric(14,2) as cost_of_sales_usd,
  coalesce(sum(l.quantity), 0)::integer as unit_count
from public.manual_register_entries e
left join public.manual_register_lines l on l.entry_id = e.id
where public.is_admin()
group by e.id, e.occurred_at, e.entry_type, e.status, e.reference, e.notes, e.batch_total_cost_usd;

revoke all on public.admin_financial_entries from public, anon, authenticated;
grant select on public.admin_financial_entries to authenticated;

commit;
