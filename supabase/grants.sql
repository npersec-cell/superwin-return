-- SUPERWIN RETURN - Supabase grants
-- Run this in Supabase SQL Editor if server health check returns:
-- permission denied for table users

-- Allow server-side service_role API access to the public schema and tables.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all routines in schema public to service_role;

-- Keep future tables accessible to service_role too.
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;
alter default privileges in schema public grant all privileges on routines to service_role;
