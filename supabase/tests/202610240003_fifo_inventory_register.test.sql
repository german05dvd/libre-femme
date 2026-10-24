begin;

select plan(9);

select has_table('public', 'inventory_cost_layers', 'FIFO cost layers table exists');
select has_table('public', 'inventory_cost_allocations', 'per-sale FIFO allocations table exists');
select has_view('public', 'admin_inventory_register', 'admin movement register view exists');

select ok(
  (select c.relrowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'inventory_cost_layers'),
  'RLS enabled on FIFO cost layers'
);
select ok(
  (select c.relrowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'inventory_cost_allocations'),
  'RLS enabled on FIFO allocations'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'inventory_movement_fifo_cost' and not tgisinternal),
  'new stock movements maintain FIFO layers and allocations'
);
select ok(not has_table_privilege('anon', 'public.inventory_cost_layers', 'SELECT'),
  'anonymous users cannot read FIFO cost layers');
select ok(not has_table_privilege('anon', 'public.inventory_cost_allocations', 'SELECT'),
  'anonymous users cannot read FIFO allocations');
select ok(has_table_privilege('authenticated', 'public.admin_inventory_register', 'SELECT'),
  'authenticated role can query register view; admin predicate restricts rows');

select * from finish();
rollback;
