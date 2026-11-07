-- S.E.N.T.R.Y Week 2: lease, fencing, retry, and ownership columns.
-- Reuses scan_jobs.locked_at, locked_by, heartbeat_at, attempts, last_error,
-- and completed_at. Adds only what the durable queue requires.

alter table public.scan_jobs
  add column user_id uuid,
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column next_attempt_at timestamptz,
  add column error_code text,
  add column max_attempts integer not null default 3;

-- Backfill ownership before enforcing it. Every job already references a scan.
update public.scan_jobs as job
set user_id = scan.user_id
from public.scans as scan
where scan.id = job.scan_id
  and job.user_id is null;

-- Backfill terminal timestamps only for terminal rows created before the
-- timestamp invariant existed.
update public.scan_jobs
set completed_at = coalesce(completed_at, updated_at)
where status in ('completed', 'failed')
  and completed_at is null;

alter table public.scan_jobs
  alter column user_id set not null;

alter table public.scan_jobs
  add constraint scan_jobs_owner_fk
    foreign key (scan_id, user_id) references public.scans (id, user_id)
    on delete cascade,
  add constraint scan_jobs_max_attempts_bounded
    check (max_attempts between 1 and 10),
  add constraint scan_jobs_attempts_within_budget
    check (attempts between 0 and max_attempts),
  add constraint scan_jobs_running_requires_lease
    check (
      status <> 'running'
      or (
        locked_by is not null
        and locked_at is not null
        and heartbeat_at is not null
        and lease_token is not null
        and lease_expires_at is not null
      )
    ),
  add constraint scan_jobs_non_running_clears_lease
    check (
      status = 'running'
      or (lease_token is null and lease_expires_at is null)
    ),
  add constraint scan_jobs_lease_after_lock
    check (
      lease_expires_at is null
      or locked_at is null
      or lease_expires_at > locked_at
    ),
  add constraint scan_jobs_retry_wait_has_schedule
    check (status <> 'retry_wait' or next_attempt_at is not null),
  add constraint scan_jobs_schedule_only_when_retrying
    check (status = 'retry_wait' or next_attempt_at is null),
  add constraint scan_jobs_error_code_format
    check (error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  add constraint scan_jobs_terminal_has_timestamp
    check (
      status in ('queued', 'running', 'retry_wait')
      or completed_at is not null
    ),
  add constraint scan_jobs_open_has_no_completion
    check (
      status in ('completed', 'failed', 'cancelled')
      or completed_at is null
    );

create unique index scan_jobs_lease_token_uidx
  on public.scan_jobs (lease_token)
  where lease_token is not null;

create index scan_jobs_claimable_idx
  on public.scan_jobs (status, next_attempt_at, created_at)
  where status in ('queued', 'retry_wait');

create index scan_jobs_lease_expiry_idx
  on public.scan_jobs (lease_expires_at)
  where status = 'running';
