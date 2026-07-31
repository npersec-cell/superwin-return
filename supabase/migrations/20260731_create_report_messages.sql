-- ── Report Messages (chat between users and admins per report) ──
create table if not exists public.report_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  sender_id uuid references public.users(id) on delete set null,
  sender_role text not null check (sender_role in ('user', 'admin')),
  message text not null check (char_length(trim(message)) > 0 and char_length(trim(message)) <= 1000),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_report_messages_report_created on public.report_messages(report_id, created_at asc);
create index if not exists idx_report_messages_unread on public.report_messages(report_id, is_read);

-- Auto-cleanup: keep latest 100 messages per report
create or replace function public.report_cleanup_old(p_keep_count integer default 100)
returns integer as $$
declare
  deleted_count integer;
begin
  with to_delete as (
    select id
    from public.report_messages
    where report_id = any(
      select distinct report_id from public.report_messages
    )
    and id not in (
      select id from (
        select id, report_id,
          row_number() over (partition by report_id order by created_at desc) as rn
        from public.report_messages
      ) ranked
      where ranked.rn <= p_keep_count
    )
  )
  delete from public.report_messages
  where id in (select id from to_delete);
  
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$ language plpgsql security definer;
