-- S.E.N.T.R.Y Week 1: schema, constraints, indexes, and evidence integrity.

create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text,
  amazon_url text,
  marketplace text not null default 'amazon.com',
  target_country text not null default 'US',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint products_name_or_url_required check (
    nullif(btrim(name), '') is not null or nullif(btrim(amazon_url), '') is not null
  ),
  constraint products_target_country_format check (target_country ~ '^[A-Z]{2}$')
);

create table public.scans (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null,
  status public.scan_status not null default 'queued',
  scoring_status public.scoring_status,
  compliance_risk_score smallint,
  coverage numeric(6, 5),
  manual_review_required boolean not null default false,
  scoring_config_version text not null default '2026-01',
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, user_id),
  constraint scans_product_owner_fk
    foreign key (product_id, user_id) references public.products(id, user_id) on delete cascade,
  constraint scans_risk_score_range check (
    compliance_risk_score is null or compliance_risk_score between 0 and 100
  ),
  constraint scans_coverage_range check (coverage is null or coverage between 0 and 1),
  constraint scans_scoring_config_version_present check (
    nullif(btrim(scoring_config_version), '') is not null
  ),
  constraint scans_score_presence check (
    (scoring_status = 'scored' and compliance_risk_score is not null)
    or (scoring_status is distinct from 'scored' and compliance_risk_score is null)
  )
);

create table public.scan_checks (
  id uuid primary key default extensions.gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  check_type public.check_type not null,
  status public.scan_check_status not null default 'queued',
  risk_score smallint,
  missing_weight numeric(6, 5),
  summary text,
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scan_id, check_type),
  constraint scan_checks_risk_score_range check (
    risk_score is null or risk_score between 0 and 100
  ),
  constraint scan_checks_missing_weight_range check (
    missing_weight is null or missing_weight between 0 and 1
  ),
  constraint scan_checks_unassessed_risk_is_null check (
    status not in ('queued', 'running', 'unavailable', 'failed') or risk_score is null
  )
);

create table public.evidence_sources (
  id uuid primary key default extensions.gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  check_type public.check_type not null,
  title text not null,
  summary text,
  source_url text not null,
  publisher text,
  risk_category text,
  matches_official_source boolean,
  published_at timestamptz,
  retrieved_at timestamptz not null default now(),
  fingerprint text not null,
  source_quality numeric(5, 4),
  product_match_confidence numeric(5, 4),
  verification_status text,
  created_at timestamptz not null default now(),
  unique (scan_id, fingerprint),
  constraint evidence_sources_fingerprint_format check (fingerprint ~ '^[0-9a-f]{64}$'),
  constraint evidence_sources_source_quality_range check (
    source_quality is null or source_quality between 0 and 1
  ),
  constraint evidence_sources_product_match_range check (
    product_match_confidence is null or product_match_confidence between 0 and 1
  )
);

create table public.risk_findings (
  id uuid primary key default extensions.gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  check_type public.check_type not null,
  title text not null,
  summary text not null,
  recommendation text,
  severity public.finding_severity not null,
  evidence_ids uuid[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint risk_findings_evidence_required check (cardinality(evidence_ids) > 0)
);

create table public.monitoring_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null,
  frequency public.monitoring_frequency not null default 'weekly',
  enabled boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id, frequency),
  constraint monitoring_product_owner_fk
    foreign key (product_id, user_id) references public.products(id, user_id) on delete cascade
);

create table public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  scan_id uuid not null,
  notification_type public.notification_type not null,
  deduplication_key text not null,
  subject text,
  body text,
  status public.notification_status not null default 'queued',
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scan_id, notification_type, deduplication_key),
  constraint notifications_scan_owner_fk
    foreign key (scan_id, user_id) references public.scans(id, user_id) on delete cascade,
  constraint notifications_deduplication_key_present check (
    nullif(btrim(deduplication_key), '') is not null
  )
);

create table public.scan_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  check_type public.check_type not null,
  status public.scan_job_status not null default 'queued',
  attempts integer not null default 0,
  locked_at timestamptz,
  locked_by text,
  heartbeat_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (scan_id, check_type),
  constraint scan_jobs_attempts_nonnegative check (attempts >= 0)
);

create table public.idempotency_keys (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null,
  key text not null,
  request_hash text not null,
  scan_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  unique (user_id, endpoint, key),
  constraint idempotency_scan_owner_fk
    foreign key (scan_id, user_id) references public.scans(id, user_id) on delete cascade,
  constraint idempotency_endpoint_present check (nullif(btrim(endpoint), '') is not null),
  constraint idempotency_key_present check (nullif(btrim(key), '') is not null),
  constraint idempotency_request_hash_format check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint idempotency_expiry_after_creation check (expires_at > created_at)
);

create index scans_user_created_idx on public.scans (user_id, created_at desc);
create index scans_product_idx on public.scans (product_id);
create index scan_checks_scan_idx on public.scan_checks (scan_id);
create index evidence_sources_scan_idx on public.evidence_sources (scan_id);
create index evidence_sources_fingerprint_idx on public.evidence_sources (fingerprint);
create index risk_findings_scan_idx on public.risk_findings (scan_id);
create index risk_findings_evidence_ids_idx on public.risk_findings using gin (evidence_ids);
create index monitoring_subscriptions_due_idx
  on public.monitoring_subscriptions (enabled, next_run_at)
  where enabled;
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_scan_idx on public.notifications (scan_id);
create index scan_jobs_queue_idx on public.scan_jobs (status, created_at);
create index scan_jobs_heartbeat_idx on public.scan_jobs (heartbeat_at) where status = 'running';
create index scan_jobs_scan_idx on public.scan_jobs (scan_id);
create index idempotency_keys_expiry_idx on public.idempotency_keys (expires_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger scans_set_updated_at before update on public.scans
for each row execute function public.set_updated_at();
create trigger scan_checks_set_updated_at before update on public.scan_checks
for each row execute function public.set_updated_at();
create trigger risk_findings_set_updated_at before update on public.risk_findings
for each row execute function public.set_updated_at();
create trigger monitoring_subscriptions_set_updated_at before update on public.monitoring_subscriptions
for each row execute function public.set_updated_at();
create trigger notifications_set_updated_at before update on public.notifications
for each row execute function public.set_updated_at();
create trigger scan_jobs_set_updated_at before update on public.scan_jobs
for each row execute function public.set_updated_at();

create or replace function public.validate_risk_finding_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  invalid_evidence_count integer;
begin
  if new.evidence_ids is null or cardinality(new.evidence_ids) = 0 then
    raise exception 'risk findings require at least one evidence id';
  end if;

  if (select count(distinct evidence_id) from unnest(new.evidence_ids) as ids(evidence_id))
     <> cardinality(new.evidence_ids) then
    raise exception 'risk finding evidence ids must be unique';
  end if;

  select count(*)
  into invalid_evidence_count
  from unnest(new.evidence_ids) as ids(evidence_id)
  left join public.evidence_sources as evidence
    on evidence.id = ids.evidence_id
    and evidence.scan_id = new.scan_id
  where evidence.id is null;

  if invalid_evidence_count > 0 then
    raise exception 'every evidence id must exist and belong to the finding scan';
  end if;

  return new;
end;
$$;

create trigger risk_findings_validate_evidence
before insert or update of scan_id, evidence_ids on public.risk_findings
for each row execute function public.validate_risk_finding_evidence();

create or replace function public.preserve_cited_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.risk_findings as finding
    where finding.scan_id = old.scan_id
      and finding.evidence_ids @> array[old.id]::uuid[]
  ) then
    raise exception 'cited evidence cannot be deleted, re-keyed, or moved to another scan';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger evidence_sources_preserve_citation
before delete or update of id, scan_id on public.evidence_sources
for each row execute function public.preserve_cited_evidence();
