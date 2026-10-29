-- Public, read-only catalog projections for variant swatches and variant-specific photos.
-- Existing product_images rows remain general product photos because variant_id defaults to NULL.
alter table public.product_images
  add column if not exists variant_id uuid null references public.product_variants(id) on delete cascade;

create index if not exists product_images_variant_position_idx
  on public.product_images (variant_id, position)
  where variant_id is not null;

create or replace view public.public_catalog_variant_colors as
select pv.id, pv.color_hex
from public.product_variants pv
join public.products p on p.id = pv.product_id
where p.status = 'published'
  and pv.is_active = true;

create or replace view public.public_catalog_variant_images as
select pi.id, pi.product_id, pi.variant_id, pi.storage_path, pi.alt_text, pi.position
from public.product_images pi
join public.products p on p.id = pi.product_id
join public.product_variants pv on pv.id = pi.variant_id and pv.product_id = pi.product_id
where p.status = 'published'
  and pv.is_active = true
  and pi.variant_id is not null;

grant usage on schema public to anon, authenticated;
grant select on public.public_catalog_variant_colors to anon, authenticated;
grant select on public.public_catalog_variant_images to anon, authenticated;
