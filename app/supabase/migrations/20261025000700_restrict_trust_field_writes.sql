revoke insert, update on public.scans from anon, authenticated;
grant select on public.scans to authenticated;

revoke insert, update, delete on public.scan_jobs from anon, authenticated;
grant select on public.scan_jobs to authenticated;

create or replace function public.internal_create_scan_only(
  p_user_id uuid,
  p_product_name text,
  p_amazon_url text,
  p_marketplace text,
  p_target_country text,
  p_scoring_config_version text,
  p_idempotency_key text
)
returns table (
  product_id uuid,
  scan_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_scan_id uuid;
begin
  if p_user_id is null then
    raise exception 'authenticated user is required' using errcode = 'P0401';
  end if;

  if nullif(btrim(p_marketplace), '') is null
     or nullif(btrim(p_scoring_config_version), '') is null then
    raise exception 'marketplace and scoring configuration version are required'
      using errcode = 'P0400';
  end if;

  insert into public.products (
    user_id,
    name,
    amazon_url,
    marketplace,
    target_country
  ) values (
    p_user_id,
    nullif(btrim(p_product_name), ''),
    nullif(btrim(p_amazon_url), ''),
    p_marketplace,
    p_target_country
  )
  returning id into v_product_id;

  insert into public.scans (
    user_id,
    product_id,
    status,
    scoring_status,
    compliance_risk_score,
    coverage,
    manual_review_required,
    scoring_config_version,
    idempotency_key
  ) values (
    p_user_id,
    v_product_id,
    'queued',
    null,
    null,
    null,
    false,
    p_scoring_config_version,
    p_idempotency_key
  )
  returning id into v_scan_id;

  return query select v_product_id, v_scan_id;
end;
$$;

revoke all on function public.internal_create_scan_only(
  uuid, text, text, text, text, text, text
) from public, anon, authenticated;

create or replace function public.internal_enqueue_initial_jobs(
  p_scan_id uuid,
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if p_scan_id is null or p_user_id is null then
    raise exception 'scan and user are required' using errcode = 'P0400';
  end if;

  if not exists (
    select 1
    from public.scans as scan
    where scan.id = p_scan_id
      and scan.user_id = p_user_id
  ) then
    raise exception 'scan is unavailable' using errcode = 'P0404';
  end if;

  insert into public.scan_jobs (
    scan_id,
    user_id,
    check_type,
    status
  )
  select
    p_scan_id,
    p_user_id,
    job_check.check_type,
    'queued'::public.scan_job_status
  from unnest(
    array['legal', 'ip', 'safety', 'recalls']::public.check_type[]
  ) as job_check(check_type)
  on conflict (scan_id, check_type) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.internal_enqueue_initial_jobs(
  uuid, uuid
) from public, anon, authenticated;

create or replace function public.create_scan_idempotent(
  p_endpoint text,
  p_key text,
  p_request_hash text,
  p_product_name text,
  p_amazon_url text,
  p_marketplace text,
  p_target_country text,
  p_monitor_weekly boolean,
  p_scoring_config_version text
)
returns table (
  scan_id uuid,
  scan_status public.scan_status,
  idempotent_replay boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_idempotency_id uuid;
  v_existing_hash text;
  v_existing_scan_id uuid;
  v_product_id uuid;
  v_scan_id uuid;
  v_status public.scan_status;
  v_jobs_inserted integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'P0401';
  end if;

  if nullif(btrim(p_endpoint), '') is null
     or nullif(btrim(p_key), '') is null
     or p_request_hash is null
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_scoring_config_version), '') is null then
    raise exception 'invalid idempotency or scoring parameters' using errcode = 'P0400';
  end if;

  if nullif(btrim(p_product_name), '') is null
     and nullif(btrim(p_amazon_url), '') is null then
    raise exception 'product name or Amazon URL is required' using errcode = 'P0400';
  end if;

  if p_target_country is null or p_target_country !~ '^[A-Z]{2}$' then
    raise exception 'target country must be an uppercase two-letter code' using errcode = 'P0400';
  end if;

  delete from public.idempotency_keys as expired
  where expired.user_id = v_user_id
    and expired.endpoint = p_endpoint
    and expired.key = p_key
    and expired.expires_at <= now();

  insert into public.idempotency_keys (
    user_id,
    endpoint,
    key,
    request_hash
  ) values (
    v_user_id,
    p_endpoint,
    p_key,
    p_request_hash
  )
  on conflict (user_id, endpoint, key) do nothing
  returning id into v_idempotency_id;

  if v_idempotency_id is null then
    select existing.request_hash, existing.scan_id
    into v_existing_hash, v_existing_scan_id
    from public.idempotency_keys as existing
    where existing.user_id = v_user_id
      and existing.endpoint = p_endpoint
      and existing.key = p_key
    for update;

    if not found then
      raise exception 'idempotency claim could not be read' using errcode = 'P0500';
    end if;

    if v_existing_hash <> p_request_hash then
      raise exception 'idempotency key was already used with a different request'
        using errcode = 'P0409';
    end if;

    if v_existing_scan_id is null then
      raise exception 'idempotency record has no associated scan' using errcode = 'P0500';
    end if;

    select existing_scan.status
    into v_status
    from public.scans as existing_scan
    where existing_scan.id = v_existing_scan_id
      and existing_scan.user_id = v_user_id;

    if not found then
      raise exception 'associated scan is unavailable' using errcode = 'P0404';
    end if;

    return query select v_existing_scan_id, v_status, true;
    return;
  end if;

  select created.product_id, created.scan_id
  into v_product_id, v_scan_id
  from public.internal_create_scan_only(
    v_user_id,
    p_product_name,
    p_amazon_url,
    p_marketplace,
    p_target_country,
    p_scoring_config_version,
    p_key
  ) as created;

  if v_product_id is null or v_scan_id is null then
    raise exception 'scan creation failed' using errcode = 'P0500';
  end if;

  v_jobs_inserted := public.internal_enqueue_initial_jobs(v_scan_id, v_user_id);

  if v_jobs_inserted <> 4 then
    raise exception 'initial job enqueue did not create every job'
      using errcode = 'P0500';
  end if;

  update public.idempotency_keys as claimed
  set scan_id = v_scan_id
  where claimed.id = v_idempotency_id;

  if p_monitor_weekly then
    insert into public.monitoring_subscriptions (
      user_id,
      product_id,
      frequency,
      enabled,
      next_run_at
    ) values (
      v_user_id,
      v_product_id,
      'weekly',
      true,
      now() + interval '7 days'
    )
    on conflict (user_id, product_id, frequency) do nothing;
  end if;

  return query select v_scan_id, 'queued'::public.scan_status, false;
end;
$$;

revoke all on function public.create_scan_idempotent(
  text, text, text, text, text, text, text, boolean, text
) from public, anon;
grant execute on function public.create_scan_idempotent(
  text, text, text, text, text, text, text, boolean, text
) to authenticated, service_role;
