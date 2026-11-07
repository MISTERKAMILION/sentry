create or replace function public.claim_job(
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns table (
  job_id uuid,
  scan_id uuid,
  user_id uuid,
  check_type public.check_type,
  attempts integer,
  max_attempts integer,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker_id text := nullif(btrim(p_worker_id), '');
  v_now timestamptz := now();
  v_lease_token uuid := gen_random_uuid();
begin
  if v_worker_id is null or char_length(v_worker_id) > 200 then
    raise exception 'worker id must be between 1 and 200 characters'
      using errcode = 'P0400';
  end if;

  if p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 3600 then
    raise exception 'lease seconds must be between 1 and 3600'
      using errcode = 'P0400';
  end if;

  return query
  update public.scan_jobs as job
  set status = 'running',
      attempts = job.attempts + 1,
      locked_at = v_now,
      locked_by = v_worker_id,
      heartbeat_at = v_now,
      lease_token = v_lease_token,
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      next_attempt_at = null,
      error_code = null,
      last_error = null,
      completed_at = null
  where job.id = (
    select candidate.id
    from public.scan_jobs as candidate
    join public.scans as scan on scan.id = candidate.scan_id
    where candidate.status in ('queued', 'retry_wait')
      and (candidate.next_attempt_at is null or candidate.next_attempt_at <= v_now)
      and candidate.attempts < candidate.max_attempts
      and scan.status in ('queued', 'running')
    order by
      coalesce(candidate.next_attempt_at, candidate.created_at),
      candidate.created_at,
      candidate.id
    limit 1
    for update of candidate skip locked
  )
  returning
    job.id,
    job.scan_id,
    job.user_id,
    job.check_type,
    job.attempts,
    job.max_attempts,
    job.lease_token,
    job.lease_expires_at,
    job.created_at;
end;
$$;

revoke all on function public.claim_job(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_job(text, integer)
  to service_role;

create or replace function public.heartbeat_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 60
)
returns table (
  job_id uuid,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  if p_job_id is null or p_lease_token is null then
    raise exception 'job id and lease token are required'
      using errcode = 'P0400';
  end if;

  if p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 3600 then
    raise exception 'lease seconds must be between 1 and 3600'
      using errcode = 'P0400';
  end if;

  return query
  update public.scan_jobs as job
  set heartbeat_at = v_now,
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds)
  where job.id = p_job_id
    and job.status = 'running'
    and job.lease_token = p_lease_token
    and job.lease_expires_at > v_now
  returning job.id, job.lease_expires_at;
end;
$$;

revoke all on function public.heartbeat_job(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.heartbeat_job(uuid, uuid, integer)
  to service_role;

create or replace function public.recover_expired_leases(
  p_limit integer default 100
)
returns table (
  job_id uuid,
  scan_id uuid,
  status public.scan_job_status,
  attempts integer,
  next_attempt_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'limit must be between 1 and 1000'
      using errcode = 'P0400';
  end if;

  return query
  with expired as materialized (
    select job.id
    from public.scan_jobs as job
    where job.status = 'running'
      and job.lease_expires_at <= v_now
    order by job.lease_expires_at, job.id
    limit p_limit
    for update skip locked
  )
  update public.scan_jobs as job
  set status = case
        when job.attempts >= job.max_attempts
          then 'failed'::public.scan_job_status
        else 'retry_wait'::public.scan_job_status
      end,
      lease_token = null,
      lease_expires_at = null,
      next_attempt_at = case
        when job.attempts >= job.max_attempts then null
        else v_now + make_interval(
          secs => least(300, power(2, job.attempts)::integer)
        )
      end,
      completed_at = case
        when job.attempts >= job.max_attempts then v_now
        else null
      end,
      error_code = 'LEASE_EXPIRED',
      last_error = 'Worker lease expired'
  from expired
  where job.id = expired.id
  returning
    job.id,
    job.scan_id,
    job.status,
    job.attempts,
    job.next_attempt_at,
    job.completed_at;
end;
$$;

revoke all on function public.recover_expired_leases(integer)
  from public, anon, authenticated;
grant execute on function public.recover_expired_leases(integer)
  to service_role;

create or replace function public.complete_job(
  p_job_id uuid,
  p_lease_token uuid
)
returns table (
  job_id uuid,
  status public.scan_job_status,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_job_id uuid;
  v_status public.scan_job_status;
  v_completed_at timestamptz;
begin
  if p_job_id is null or p_lease_token is null then
    raise exception 'job id and lease token are required'
      using errcode = 'P0400';
  end if;

  update public.scan_jobs as job
  set status = 'completed',
      completed_at = v_now,
      lease_token = null,
      lease_expires_at = null,
      next_attempt_at = null,
      error_code = null,
      last_error = null
  where job.id = p_job_id
    and job.status = 'running'
    and job.lease_token = p_lease_token
    and job.lease_expires_at > v_now
  returning job.id, job.status, job.completed_at
  into v_job_id, v_status, v_completed_at;

  if not found then
    raise exception 'job lease is stale, expired, or no longer running'
      using errcode = 'P0409';
  end if;

  return query select v_job_id, v_status, v_completed_at;
end;
$$;

revoke all on function public.complete_job(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_job(uuid, uuid)
  to service_role;

create or replace function public.fail_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_error text default null,
  p_retry_after_seconds integer default null
)
returns table (
  job_id uuid,
  status public.scan_job_status,
  attempts integer,
  next_attempt_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_error_code text := upper(nullif(btrim(p_error_code), ''));
  v_max_attempts integer;
  v_job_id uuid;
  v_status public.scan_job_status;
  v_attempts integer;
  v_next_attempt_at timestamptz;
  v_completed_at timestamptz;
begin
  if p_job_id is null or p_lease_token is null then
    raise exception 'job id and lease token are required'
      using errcode = 'P0400';
  end if;

  if v_error_code is null or v_error_code !~ '^[A-Z][A-Z0-9_]{0,63}$' then
    raise exception 'error code must match ^[A-Z][A-Z0-9_]{0,63}$'
      using errcode = 'P0400';
  end if;

  if p_retry_after_seconds is not null
     and (p_retry_after_seconds < 1 or p_retry_after_seconds > 3600) then
    raise exception 'retry delay must be between 1 and 3600 seconds'
      using errcode = 'P0400';
  end if;

  select job.max_attempts
  into v_max_attempts
  from public.scan_jobs as job
  where job.id = p_job_id
    and job.status = 'running'
    and job.lease_token = p_lease_token
    and job.lease_expires_at > v_now
  for update;

  if not found then
    raise exception 'job lease is stale, expired, or no longer running'
      using errcode = 'P0409';
  end if;

  update public.scan_jobs as job
  set status = case
        when job.attempts >= v_max_attempts
          then 'failed'::public.scan_job_status
        else 'retry_wait'::public.scan_job_status
      end,
      next_attempt_at = case
        when job.attempts >= v_max_attempts then null
        else v_now + make_interval(
          secs => coalesce(
            p_retry_after_seconds,
            least(300, power(2, job.attempts)::integer)
          )
        )
      end,
      completed_at = case
        when job.attempts >= v_max_attempts then v_now
        else null
      end,
      lease_token = null,
      lease_expires_at = null,
      error_code = v_error_code,
      last_error = nullif(left(coalesce(p_error, ''), 4000), '')
  where job.id = p_job_id
    and job.status = 'running'
    and job.lease_token = p_lease_token
    and job.lease_expires_at > v_now
  returning
    job.id,
    job.status,
    job.attempts,
    job.next_attempt_at,
    job.completed_at
  into v_job_id, v_status, v_attempts, v_next_attempt_at, v_completed_at;

  if not found then
    raise exception 'job could not be failed' using errcode = 'P0500';
  end if;

  return query select
    v_job_id,
    v_status,
    v_attempts,
    v_next_attempt_at,
    v_completed_at;
end;
$$;

revoke all on function public.fail_job(uuid, uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.fail_job(uuid, uuid, text, text, integer)
  to service_role;
