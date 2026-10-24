-- LIBRE femme
-- Migration: grant the table privileges required by the admin inventory/order UI.
-- Row-level security policies still restrict these operations to provisioned admins.

begin;

grant select, insert, update, delete
  on public.orders, public.order_items
  to authenticated;

grant select
  on public.inventory_stock, public.inventory_movements
  to authenticated;

commit;
