-- Historique des demandes : chaque modification ou suppression garde l'ancienne version.
-- Lisible uniquement par l'administrateur (tableau de bord Supabase), jamais par l'application.
create table if not exists public.requests_history (
  id          bigserial primary key,
  request_id  uuid not null,
  artisan_id  uuid,
  operation   text not null,
  old_row     jsonb not null,
  changed_by  uuid default auth.uid(),
  changed_at  timestamptz not null default now()
);
create index if not exists requests_history_req on public.requests_history(request_id, changed_at desc);
alter table public.requests_history enable row level security;
revoke all on public.requests_history from anon, authenticated;

create or replace function public.requests_keep_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then return new; end if;
  insert into public.requests_history(request_id, artisan_id, operation, old_row)
  values (old.id, old.artisan_id, tg_op, to_jsonb(old));
  return coalesce(new, old);
end $$;
revoke all on function public.requests_keep_history() from public, anon, authenticated;

drop trigger if exists requests_history_trg on public.requests;
create trigger requests_history_trg
  after update or delete on public.requests
  for each row execute function public.requests_keep_history();
