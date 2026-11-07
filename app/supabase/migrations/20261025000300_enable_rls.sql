-- S.E.N.T.R.Y Week 1: row-level security.
-- UPDATE policies deliberately constrain both the existing row (USING)
-- and the replacement row (WITH CHECK) to prevent ownership escalation.

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.scans enable row level security;
alter table public.scan_checks enable row level security;
alter table public.evidence_sources enable row level security;
alter table public.risk_findings enable row level security;
alter table public.monitoring_subscriptions enable row level security;
alter table public.notifications enable row level security;
alter table public.scan_jobs enable row level security;
alter table public.idempotency_keys enable row level security;

-- profiles
create policy profiles_own_select on public.profiles
  for select to authenticated using (auth.uid() = user_id);
create policy profiles_own_insert on public.profiles
  for insert to authenticated with check (auth.uid() = user_id);
create policy profiles_own_update on public.profiles
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy profiles_own_delete on public.profiles
  for delete to authenticated using (auth.uid() = user_id);

-- products
create policy products_own_select on public.products
  for select to authenticated using (auth.uid() = user_id);
create policy products_own_insert on public.products
  for insert to authenticated with check (auth.uid() = user_id);
create policy products_own_update on public.products
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy products_own_delete on public.products
  for delete to authenticated using (auth.uid() = user_id);

-- scans
create policy scans_own_select on public.scans
  for select to authenticated using (auth.uid() = user_id);
create policy scans_own_insert on public.scans
  for insert to authenticated with check (auth.uid() = user_id);
create policy scans_own_update on public.scans
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy scans_own_delete on public.scans
  for delete to authenticated using (auth.uid() = user_id);

-- scan_checks: ownership is inherited from the parent scan.
create policy scan_checks_own_select on public.scan_checks
  for select to authenticated using (
    exists (select 1 from public.scans s where s.id = scan_checks.scan_id and s.user_id = auth.uid())
  );
create policy scan_checks_own_insert on public.scan_checks
  for insert to authenticated with check (
    exists (select 1 from public.scans s where s.id = scan_checks.scan_id and s.user_id = auth.uid())
  );
create policy scan_checks_own_update on public.scan_checks
  for update to authenticated using (
    exists (select 1 from public.scans s where s.id = scan_checks.scan_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.scans s where s.id = scan_checks.scan_id and s.user_id = auth.uid())
  );
create policy scan_checks_own_delete on public.scan_checks
  for delete to authenticated using (
    exists (select 1 from public.scans s where s.id = scan_checks.scan_id and s.user_id = auth.uid())
  );

-- evidence_sources: ownership is inherited from the parent scan.
create policy evidence_sources_own_select on public.evidence_sources
  for select to authenticated using (
    exists (select 1 from public.scans s where s.id = evidence_sources.scan_id and s.user_id = auth.uid())
  );
create policy evidence_sources_own_insert on public.evidence_sources
  for insert to authenticated with check (
    exists (select 1 from public.scans s where s.id = evidence_sources.scan_id and s.user_id = auth.uid())
  );
create policy evidence_sources_own_update on public.evidence_sources
  for update to authenticated using (
    exists (select 1 from public.scans s where s.id = evidence_sources.scan_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.scans s where s.id = evidence_sources.scan_id and s.user_id = auth.uid())
  );
create policy evidence_sources_own_delete on public.evidence_sources
  for delete to authenticated using (
    exists (select 1 from public.scans s where s.id = evidence_sources.scan_id and s.user_id = auth.uid())
  );

-- risk_findings: ownership is inherited from the parent scan.
create policy risk_findings_own_select on public.risk_findings
  for select to authenticated using (
    exists (select 1 from public.scans s where s.id = risk_findings.scan_id and s.user_id = auth.uid())
  );
create policy risk_findings_own_insert on public.risk_findings
  for insert to authenticated with check (
    exists (select 1 from public.scans s where s.id = risk_findings.scan_id and s.user_id = auth.uid())
  );
create policy risk_findings_own_update on public.risk_findings
  for update to authenticated using (
    exists (select 1 from public.scans s where s.id = risk_findings.scan_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.scans s where s.id = risk_findings.scan_id and s.user_id = auth.uid())
  );
create policy risk_findings_own_delete on public.risk_findings
  for delete to authenticated using (
    exists (select 1 from public.scans s where s.id = risk_findings.scan_id and s.user_id = auth.uid())
  );

-- monitoring_subscriptions
create policy monitoring_subscriptions_own_select on public.monitoring_subscriptions
  for select to authenticated using (auth.uid() = user_id);
create policy monitoring_subscriptions_own_insert on public.monitoring_subscriptions
  for insert to authenticated with check (auth.uid() = user_id);
create policy monitoring_subscriptions_own_update on public.monitoring_subscriptions
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy monitoring_subscriptions_own_delete on public.monitoring_subscriptions
  for delete to authenticated using (auth.uid() = user_id);

-- notifications
create policy notifications_own_select on public.notifications
  for select to authenticated using (auth.uid() = user_id);
create policy notifications_own_insert on public.notifications
  for insert to authenticated with check (auth.uid() = user_id);
create policy notifications_own_update on public.notifications
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy notifications_own_delete on public.notifications
  for delete to authenticated using (auth.uid() = user_id);

-- scan_jobs: ownership is inherited from the parent scan.
create policy scan_jobs_own_select on public.scan_jobs
  for select to authenticated using (
    exists (select 1 from public.scans s where s.id = scan_jobs.scan_id and s.user_id = auth.uid())
  );
create policy scan_jobs_own_insert on public.scan_jobs
  for insert to authenticated with check (
    exists (select 1 from public.scans s where s.id = scan_jobs.scan_id and s.user_id = auth.uid())
  );
create policy scan_jobs_own_update on public.scan_jobs
  for update to authenticated using (
    exists (select 1 from public.scans s where s.id = scan_jobs.scan_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.scans s where s.id = scan_jobs.scan_id and s.user_id = auth.uid())
  );
create policy scan_jobs_own_delete on public.scan_jobs
  for delete to authenticated using (
    exists (select 1 from public.scans s where s.id = scan_jobs.scan_id and s.user_id = auth.uid())
  );

-- idempotency_keys
create policy idempotency_keys_own_select on public.idempotency_keys
  for select to authenticated using (auth.uid() = user_id);
create policy idempotency_keys_own_insert on public.idempotency_keys
  for insert to authenticated with check (auth.uid() = user_id);
create policy idempotency_keys_own_update on public.idempotency_keys
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy idempotency_keys_own_delete on public.idempotency_keys
  for delete to authenticated using (auth.uid() = user_id);

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on
  public.profiles,
  public.products,
  public.scans,
  public.scan_checks,
  public.evidence_sources,
  public.risk_findings,
  public.monitoring_subscriptions,
  public.notifications,
  public.scan_jobs,
  public.idempotency_keys
  to authenticated;
grant all on
  public.profiles,
  public.products,
  public.scans,
  public.scan_checks,
  public.evidence_sources,
  public.risk_findings,
  public.monitoring_subscriptions,
  public.notifications,
  public.scan_jobs,
  public.idempotency_keys
  to service_role;
