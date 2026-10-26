-- ============================================================
-- Base de données de l'application de devis (Supabase)
-- À coller une seule fois dans : Supabase > SQL Editor > New query > Run
-- ============================================================

-- 1. Artisans (un compte = une entreprise)
create table if not exists public.artisans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  slug        text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name        text not null check (char_length(name) between 2 and 80),
  trade       text not null default 'autre',
  phone       text,
  rate_hour   numeric(8,2),
  travel_fee  numeric(8,2),
  created_at  timestamptz not null default now()
);

-- 2. Demandes de devis
create table if not exists public.requests (
  id              uuid primary key default gen_random_uuid(),
  artisan_id      uuid not null references public.artisans(id) on delete cascade,
  source          text not null check (source in ('lien','site','artisan')),
  client_name     text not null check (char_length(client_name) between 1 and 80),
  client_phone    text not null check (char_length(client_phone) between 6 and 30),
  client_email    text check (client_email is null or char_length(client_email) <= 120),
  zone            text not null check (char_length(zone) between 2 and 80),
  work_type       text check (work_type is null or char_length(work_type) <= 60),
  description     text not null check (char_length(description) between 3 and 2000),
  urgency         text check (urgency is null or char_length(urgency) <= 40),
  measures        text check (measures is null or char_length(measures) <= 300),
  hours           numeric(6,2),
  material_desc   text check (material_desc is null or char_length(material_desc) <= 300),
  material_price  numeric(10,2),
  photos          text[] not null default '{}',
  consent         boolean not null default false,
  ai              jsonb,
  ai_status       text not null default 'pending' check (ai_status in ('pending','running','done','error')),
  status          text not null default 'nouveau' check (status in ('nouveau','envoye','archive')),
  created_at      timestamptz not null default now()
);
create index if not exists requests_artisan_created on public.requests(artisan_id, created_at desc);

-- 3. Fonctions publiques (lecture minimale, sans exposer la table)
create or replace function public.get_artisan(p_slug text)
returns table(id uuid, name text, trade text)
language sql security definer set search_path = public stable as $$
  select a.id, a.name, a.trade from public.artisans a where a.slug = lower(p_slug)
$$;

create or replace function public.artisan_exists(p_id uuid)
returns boolean
language sql security definer set search_path = public stable as $$
  select exists(select 1 from public.artisans where id = p_id)
$$;

create or replace function public.is_my_artisan(p_id uuid)
returns boolean
language sql security definer set search_path = public stable as $$
  select exists(select 1 from public.artisans where id = p_id and user_id = auth.uid())
$$;

revoke all on function public.get_artisan(text), public.artisan_exists(uuid), public.is_my_artisan(uuid) from public;
grant execute on function public.get_artisan(text), public.artisan_exists(uuid) to anon, authenticated;
grant execute on function public.is_my_artisan(uuid) to authenticated;

-- Droits d'accès explicites (la sécurité ligne par ligne ci-dessous filtre ensuite)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.artisans to authenticated;
grant insert on public.requests to anon;
grant select, insert, update, delete on public.requests to authenticated;

-- 4. Sécurité ligne par ligne
alter table public.artisans enable row level security;
alter table public.requests enable row level security;

drop policy if exists artisans_own on public.artisans;
create policy artisans_own on public.artisans
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Un client (sans compte) peut seulement CRÉER une demande, jamais lire.
drop policy if exists requests_public_insert on public.requests;
create policy requests_public_insert on public.requests
  for insert to anon, authenticated
  with check (
    consent = true
    and source in ('lien','site')
    and status = 'nouveau'
    and ai is null and ai_status = 'pending'
    and hours is null and material_price is null
    and coalesce(array_length(photos,1),0) <= 5
    and public.artisan_exists(artisan_id)
  );

-- L'artisan connecté voit et gère uniquement ses demandes.
drop policy if exists requests_owner on public.requests;
create policy requests_owner on public.requests
  for all to authenticated
  using (public.is_my_artisan(artisan_id))
  with check (public.is_my_artisan(artisan_id));

-- 5. Photos (stockage privé, 5 Mo max, JPEG)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

drop policy if exists photos_insert on storage.objects;
create policy photos_insert on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'photos'
    and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
             then public.artisan_exists(((storage.foldername(name))[1])::uuid)
             else false end
  );

drop policy if exists photos_read_own on storage.objects;
create policy photos_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
             then public.is_my_artisan(((storage.foldername(name))[1])::uuid)
             else false end
  );

drop policy if exists photos_delete_own on storage.objects;
create policy photos_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
             then public.is_my_artisan(((storage.foldername(name))[1])::uuid)
             else false end
  );

-- 6. Mise à jour en direct du tableau de l'artisan
do $$ begin
  alter publication supabase_realtime add table public.requests;
exception when duplicate_object then null; end $$;
