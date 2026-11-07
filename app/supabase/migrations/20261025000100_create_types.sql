-- S.E.N.T.R.Y Week 1: shared database types.

create type public.scan_status as enum (
  'queued',
  'running',
  'completed',
  'failed'
);

create type public.scoring_status as enum (
  'scored',
  'incomplete',
  'failed'
);

create type public.check_type as enum (
  'legal',
  'ip',
  'safety',
  'recalls'
);

create type public.scan_check_status as enum (
  'queued',
  'running',
  'completed',
  'partial',
  'unavailable',
  'failed'
);

create type public.finding_severity as enum (
  'info',
  'low',
  'moderate',
  'high',
  'critical'
);

create type public.scan_job_status as enum (
  'queued',
  'running',
  'completed',
  'failed'
);

create type public.monitoring_frequency as enum ('weekly');

create type public.notification_type as enum (
  'scan_acknowledgement',
  'scan_progress',
  'scan_completed',
  'scan_incomplete',
  'scan_partial',
  'scan_failed',
  'monitoring_finding',
  'periodic_summary'
);

create type public.notification_status as enum (
  'queued',
  'sent',
  'failed'
);
