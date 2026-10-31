-- Ensure the public storefront can read only the curated catalog views.
-- These views expose published products and their public variant/image fields,
-- not private purchase, cost, inventory-ledger, or customer data.
grant usage on schema public to anon, authenticated;
grant select on public.public_catalog_products to anon, authenticated;
grant select on public.public_catalog_variants to anon, authenticated;
grant select on public.public_catalog_images to anon, authenticated;
