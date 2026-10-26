-- Lignes de matériel et fournisseur (à exécuter une fois)
alter table public.requests add column if not exists materials jsonb
  check (materials is null or (jsonb_typeof(materials) = 'array' and jsonb_array_length(materials) <= 40));
alter table public.artisans add column if not exists supplier_name text check (supplier_name is null or char_length(supplier_name) <= 80);
alter table public.artisans add column if not exists supplier_phone text check (supplier_phone is null or char_length(supplier_phone) <= 30);
alter table public.artisans add column if not exists supplier_email text check (supplier_email is null or char_length(supplier_email) <= 120);

-- Un client sans compte ne peut pas remplir le matériel ni les prix.
drop policy if exists requests_public_insert on public.requests;
create policy requests_public_insert on public.requests
  for insert to anon, authenticated
  with check (
    consent = true
    and source in ('lien','site')
    and status = 'nouveau'
    and ai is null and ai_status = 'pending'
    and hours is null and material_price is null and materials is null
    and coalesce(array_length(photos,1),0) <= 5
    and public.artisan_exists(artisan_id)
  );
