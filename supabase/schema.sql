-- Run once in your own Supabase project's SQL editor. The publishable key is safe
-- in the browser; never use the service_role/secret key in this application.
create table if not exists public.notebooks (
 owner uuid primary key references auth.users(id) on delete cascade,
 state text not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.notebooks enable row level security;
create policy "owner reads notebook" on public.notebooks for select to authenticated using ((select auth.uid())=owner);
-- All writes use the compare-and-swap function; direct browser writes are denied.
create or replace function public.save_notebook(expected_revision bigint,new_state text)
returns bigint language plpgsql security definer set search_path='' as $$
declare next_revision bigint;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if length(new_state)>16000000 then raise exception 'Notebook too large'; end if;
 if expected_revision=0 then
  insert into public.notebooks(owner,state,revision) values(auth.uid(),new_state,1) on conflict do nothing returning revision into next_revision;
 else
  update public.notebooks set state=new_state,revision=revision+1,updated_at=now() where owner=auth.uid() and revision=expected_revision returning revision into next_revision;
 end if;
 if next_revision is null then raise exception 'Concurrent update; merge and retry' using errcode='40001'; end if;
 return next_revision;
end;
$$;
revoke all on function public.save_notebook(bigint,text) from public;
grant execute on function public.save_notebook(bigint,text) to authenticated;
-- Polling is always enabled. Realtime can additionally be enabled in the
-- Supabase dashboard for this table; publication permissions are optional.
