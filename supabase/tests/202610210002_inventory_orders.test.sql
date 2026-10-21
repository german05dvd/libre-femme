begin;

select plan(20);

select has_table('public', 'products', 'products table exists');
select has_table('public', 'purchase_items', 'purchase items table exists');
select has_table('public', 'purchase_expenses', 'purchase expenses table exists');
select has_table('public', 'purchase_expense_allocations', 'expense allocations table exists');
select has_table('public', 'orders', 'orders table exists');
select has_table('public', 'order_items', 'order items table exists');
select has_table('public', 'inventory_stock', 'inventory balance table exists');
select has_table('public', 'inventory_movements', 'inventory ledger table exists');

select ok(
  (select c.relrowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'orders'),
  'RLS enabled on orders'
);
select ok(
  (select c.relrowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'order_items'),
  'RLS enabled on order items'
);
select ok(
  (select c.relrowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'inventory_stock'),
  'RLS enabled on inventory stock'
);
select ok(
  (select c.relrowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'inventory_movements'),
  'RLS enabled on inventory movements'
);

select ok(
  exists (select 1 from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'confirm_order'),
  'atomic order confirmation function exists'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'purchases_receive_inventory' and not tgisinternal),
  'purchase receipt creates inventory movements'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'orders_guard_update' and not tgisinternal),
  'order lifecycle guard exists'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'inventory_movement_immutable' and not tgisinternal),
  'inventory ledger immutability trigger exists'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'inventory_movement_apply' and not tgisinternal),
  'inventory balance trigger exists'
);

select ok(not has_table_privilege('anon', 'public.orders', 'SELECT'),
  'anonymous users cannot read orders');
select ok(not has_table_privilege('anon', 'public.inventory_stock', 'SELECT'),
  'anonymous users cannot read inventory balances');
select ok(not has_table_privilege('anon', 'public.inventory_movements', 'SELECT'),
  'anonymous users cannot read inventory movements');

select * from finish();
rollback;
