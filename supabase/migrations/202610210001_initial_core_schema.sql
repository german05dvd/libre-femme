-- LIBRE femme
-- Migration: initial core schema
-- This file is versioned in Git; it has NOT been applied to Supabase.
-- Review security policies and public data exposure before applying.

begin;

create extension if not exists pgcrypto;

-- 1. Product catalog
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  category text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_not_blank check (length(trim(name)) > 0),
  constraint products_slug_not_blank check (length(trim(slug)) > 0)
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  sku text not null unique,
  size text,
  color text,
  sale_price numeric(12,2) not null check (sale_price >= 0),
  weight_lb numeric(10,3) check (weight_lb is null or weight_lb > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint variants_sku_not_blank check (length(trim(sku)) > 0)
);

create index product_variants_product_id_idx
  on public.product_variants(product_id);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null unique,
  alt_text text,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);

create index product_images_product_position_idx
  on public.product_images(product_id, position);

-- 2. Admin profiles. No client-side policy can create or promote admins.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null,
  role text not null default 'admin' check (role = 'admin'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_not_blank
    check (length(trim(display_name)) > 0)
);

-- 3. Suppliers
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  website text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_name_not_blank check (length(trim(name)) > 0)
);

-- 4. Purchases and historical line-item acquisition costs
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id) on delete restrict,
  reference text,
  status text not null default 'draft'
    check (status in ('draft', 'ordered', 'received', 'cancelled')),
  purchase_date date not null default current_date,
  currency char(3) not null default 'USD',
  exchange_rate_to_usd numeric(12,6) not null default 1
    check (exchange_rate_to_usd > 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index purchases_supplier_id_idx on public.purchases(supplier_id);
create index purchases_date_idx on public.purchases(purchase_date);
create index purchases_status_idx on public.purchases(status);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  line_total numeric(14,2)
    generated always as (quantity * unit_cost) stored,
  created_at timestamptz not null default now(),
  constraint purchase_items_variant_per_purchase unique (purchase_id, variant_id)
);

create index purchase_items_variant_id_idx on public.purchase_items(variant_id);

-- 5. Purchase history integrity.
-- Allowed transitions:
-- draft -> ordered or cancelled
-- ordered -> received or cancelled
-- received and cancelled are terminal states.
create or replace function public.guard_purchase_update()
returns trigger
language plpgsql
set search_path = ''
as $
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'Purchases must be created in draft status';
    end if;
    return new;
  end if;

  if old.status in ('received', 'cancelled') then
    raise exception 'Purchases in status % are immutable', old.status;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft' and new.status in ('ordered', 'cancelled'))
      or
      (old.status = 'ordered' and new.status in ('received', 'cancelled'))
    ) then
      raise exception 'Invalid purchase status transition: % -> %',
        old.status, new.status;
    end if;
  end if;

  return new;
end;
$;

create trigger purchases_guard_update
before insert or update on public.purchases
for each row execute function public.guard_purchase_update();

create or replace function public.guard_purchase_item_write()
returns trigger
language plpgsql
set search_path = ''
as $
declare
  parent_purchase_id uuid;
  parent_status text;
begin
  if tg_op = 'UPDATE' and new.purchase_id is distinct from old.purchase_id then
    raise exception 'A purchase item cannot be moved to another purchase';
  end if;

  if tg_op = 'DELETE' then
    parent_purchase_id := old.purchase_id;
  else
    parent_purchase_id := new.purchase_id;
  end if;

  select p.status into parent_status
  from public.purchases p
  where p.id = parent_purchase_id
  for update;

  if parent_status is null then
    raise exception 'Purchase not found for purchase item';
  end if;

  if parent_status not in ('draft', 'ordered') then
    raise exception 'Items can only be changed while purchase is draft or ordered';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$;

create trigger purchase_items_guard_insert
before insert on public.purchase_items
for each row execute function public.guard_purchase_item_write();

create trigger purchase_items_guard_update
before update on public.purchase_items
for each row execute function public.guard_purchase_item_write();

create trigger purchase_items_guard_delete
before delete on public.purchase_items
for each row execute function public.guard_purchase_item_write();

-- 6. Admin authorization helper. Profile provisioning is a controlled operation.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 7. Row-level security
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;
alter table public.profiles enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

-- Public access is provided through restricted views below, not base tables.
-- Authenticated access to base tables is restricted to provisioned admins.

create policy products_admin_all
  on public.products for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Public variant access is provided through a restricted view below.

create policy variants_admin_all
  on public.product_variants for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Public image access is provided through a restricted view below.

create policy images_admin_all
  on public.product_images for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy profiles_read_self_or_admin
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
-- Intentionally no profile INSERT/UPDATE/DELETE policies for client roles.

create policy suppliers_admin_all
  on public.suppliers for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy purchases_admin_all
  on public.purchases for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy purchase_items_admin_all
  on public.purchase_items for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- 8. Restricted public catalog views.
-- Views are owned by the migration role and intentionally use owner permissions.
-- They expose only the fields required by the storefront and filter unpublished data.
create view public.public_catalog_products as
select id, name, slug, description, category
from public.products
where status = 'published';

create view public.public_catalog_variants as
select v.id, v.product_id, v.size, v.color, v.sale_price
from public.product_variants v
join public.products p on p.id = v.product_id
where v.is_active and p.status = 'published';

create view public.public_catalog_images as
select i.id, i.product_id, i.storage_path, i.alt_text, i.position
from public.product_images i
join public.products p on p.id = i.product_id
where p.status = 'published';

-- 9. Explicit privileges.
-- No anonymous privileges on base tables; public reads use restricted views.
revoke all on public.products, public.product_variants, public.product_images,
  public.profiles, public.suppliers, public.purchases, public.purchase_items
from anon, authenticated;

revoke all on public.public_catalog_products,
  public.public_catalog_variants, public.public_catalog_images
from public, anon, authenticated;

grant select on public.public_catalog_products,
  public.public_catalog_variants, public.public_catalog_images to anon;

grant select, insert, update, delete on public.products,
  public.product_variants, public.product_images to authenticated;

grant select on public.profiles to authenticated;

grant select, insert, update, delete on public.suppliers, public.purchases,
  public.purchase_items to authenticated;

commit;
