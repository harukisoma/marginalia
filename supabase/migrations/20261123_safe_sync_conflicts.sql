-- Preserve every cloud notebook before changing the sync function. This schema
-- is not exposed through the Data API and is inaccessible to app users.
begin;
create schema if not exists marginalia_recovery;
revoke all on schema marginalia_recovery from public, anon, authenticated;
create table if not exists marginalia_recovery.notebooks_before_sync_fix_20261123
 as select owner,state,revision,updated_at,now() as archived_at from public.notebooks;
alter table marginalia_recovery.notebooks_before_sync_fix_20261123 enable row level security;
revoke all on marginalia_recovery.notebooks_before_sync_fix_20261123 from public,anon,authenticated;
create table if not exists marginalia_recovery.sync_function_before_fix_20261123
 as select pg_get_functiondef('public.save_notebook(bigint,text)'::regprocedure) as definition,now() as archived_at;
alter table marginalia_recovery.sync_function_before_fix_20261123 enable row level security;
revoke all on marginalia_recovery.sync_function_before_fix_20261123 from public,anon,authenticated;

-- Keep the original function, owner, privileges and search_path. Change ONLY
-- the application conflict code: SQLSTATE 40001 can make PostgREST 14 retry the
-- same doomed transaction forever. PT409 returns an HTTP 409 to the client.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.save_notebook(bigint,text)'::regprocedure) into definition;
 if position('Concurrent update; merge and retry' in definition)=0 then
  raise exception 'Unexpected save_notebook definition; inspect before migrating';
 end if;
 if position('''40001''' in definition)>0 then
  execute replace(definition,'''40001''','''PT409''');
 elsif position('''PT409''' in definition)=0 then
  raise exception 'Expected sync conflict code was not found';
 end if;
end;
$migration$;
notify pgrst,'reload schema';
commit;

-- Read-only verification; never return notebook content or authentication data.
select
 (select count(*) from public.notebooks) as current_notebooks,
 (select count(*) from marginalia_recovery.notebooks_before_sync_fix_20261123) as protected_copies,
 position('''PT409''' in pg_get_functiondef('public.save_notebook(bigint,text)'::regprocedure))>0 as safe_conflict_code;
