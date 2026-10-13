-- Private job relay: the iPhone submits requests; the signed-in Mac executes
-- them with local ChatGPT credentials. No OpenAI tokens leave the Mac.
create table if not exists public.ai_hosts (
 owner uuid not null references auth.users(id) on delete cascade,
 host_id text not null,
 connected boolean not null default false,
 models jsonb not null default '[]',
 updated_at timestamptz not null default now(),
 primary key(owner,host_id)
);
create table if not exists public.ai_requests (
 id uuid primary key,
 owner uuid not null references auth.users(id) on delete cascade,
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 payload jsonb not null check(octet_length(payload::text)<6000000),
 result jsonb,
 error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists ai_requests_queue on public.ai_requests(owner,status,created_at);
alter table public.ai_hosts enable row level security;
alter table public.ai_requests enable row level security;
create policy "owner reads AI hosts" on public.ai_hosts for select to authenticated using((select auth.uid())=owner);
create policy "owner inserts AI host" on public.ai_hosts for insert to authenticated with check((select auth.uid())=owner);
create policy "owner updates AI host" on public.ai_hosts for update to authenticated using((select auth.uid())=owner) with check((select auth.uid())=owner);
create policy "owner reads AI requests" on public.ai_requests for select to authenticated using((select auth.uid())=owner);
create policy "owner submits AI request" on public.ai_requests for insert to authenticated with check((select auth.uid())=owner and status='queued');
create policy "owner updates AI request" on public.ai_requests for update to authenticated using((select auth.uid())=owner) with check((select auth.uid())=owner);
