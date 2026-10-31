-- Public, read-only catalog projections for variant color swatches and color-specific photos.
-- NULL color_hex means a general product photo shown for any selected color.
alter table public.product_images
  add column if not exists color_hex text null;

create index if not exists product_images_color_position_idx
  on public.product_images (product_id, color_hex, position);

create or replace view public.public_catalog_variant_colors as
select pv.id, pv.color_hex
from public.product_variants pv
join public.products p on p.id = pv.product_id
where p.status = 'published'
  and pv.is_active = true;

create or replace view public.public_catalog_variant_images as
select pi.id, pi.product_id, pi.color_hex, pi.storage_path, pi.alt_text, pi.position
from public.product_images pi
join public.products p on p.id = pi.product_id
where p.status = 'published'
  and pi.color_hex is not null;

grant usage on schema public to anon, authenticated;
grant select on public.public_catalog_variant_colors to anon, authenticated;
grant select on public.public_catalog_variant_images to anon, authenticated;
