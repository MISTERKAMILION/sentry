-- S.E.N.T.R.Y Week 2: durable queue job states.
-- This migration only adds enum values. A value added to an enum cannot be
-- used in the same transaction that adds it, so the queue objects that use
-- these values live in a later migration.

alter type public.scan_job_status add value if not exists 'retry_wait';
alter type public.scan_job_status add value if not exists 'cancelled';
