-- Security layer: a restricted application role, row-level security on every table that
-- holds client data, and an insert-only ledger. The API also checks permissions in code;
-- this is the second wall, so a bug in a query cannot leak one client's data to another
-- (FRS section 2 security requirement, AC-05, AC-16).
--
-- Each API request runs in a transaction that sets:
--   app.user_kind  staff | client | driver | system
--   app.org_id     the client's organization (clients only)
--   app.user_id    the signed-in user
-- The role gets no password here. Set it outside migrations, per environment.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ngb_app') THEN
    CREATE ROLE ngb_app LOGIN;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO ngb_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ngb_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ngb_app;
--> statement-breakpoint
-- Append-only history: the application can add rows but never change or remove them.
REVOKE UPDATE, DELETE ON milestone_events, eta_revisions, consents, audit_log FROM ngb_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION forbid_ledger_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; record a correction instead', TG_TABLE_NAME;
END
$$;
--> statement-breakpoint
CREATE TRIGGER milestone_events_append_only BEFORE UPDATE OR DELETE ON milestone_events
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_changes();
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_changes();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_setting(name text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting(name, true), '')
$$;
--> statement-breakpoint
-- Security definer so the driver check can read assignments without recursing into RLS.
CREATE OR REPLACE FUNCTION app_can_see(org uuid, ship uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE app_setting('app.user_kind')
    WHEN 'staff' THEN true
    WHEN 'system' THEN true
    WHEN 'client' THEN org = app_setting('app.org_id')::uuid
    WHEN 'driver' THEN ship IS NOT NULL AND EXISTS (
      SELECT 1 FROM transport_assignments ta
      WHERE ta.shipment_id = ship
        AND ta.driver_user_id = app_setting('app.user_id')::uuid
        AND ta.status <> 'cancelled')
    ELSE false
  END
$$;
--> statement-breakpoint
-- Login runs before any user context exists, so it reads credentials through this function only.
CREATE OR REPLACE FUNCTION auth_lookup(login_email text)
  RETURNS TABLE (id uuid, name text, role text, organization_id uuid, password_hash text, is_active boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.name, u.role, u.organization_id, u.password_hash, u.is_active
  FROM users u WHERE lower(u.email) = lower(login_email)
$$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  -- Tables scoped by organization and shipment.
  FOREACH t IN ARRAY ARRAY['shipments', 'containers', 'milestone_events', 'eta_revisions', 'exceptions',
                           'documents', 'transport_assignments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_scope ON %I USING (app_can_see(organization_id, %s)) WITH CHECK (app_can_see(organization_id, %s))',
      t,
      CASE WHEN t = 'shipments' THEN 'id' ELSE 'shipment_id' END,
      CASE WHEN t = 'shipments' THEN 'id' ELSE 'shipment_id' END);
  END LOOP;
  -- Tables scoped by organization only. Drivers see none of them.
  FOREACH t IN ARRAY ARRAY['contacts', 'consents', 'invoices', 'invoice_lines', 'invoice_shipments', 'payments',
                           'invoice_reminders', 'notifications', 'assignment_containers'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_scope ON %I USING (app_can_see(organization_id, NULL)) WITH CHECK (app_can_see(organization_id, NULL))',
      t);
  END LOOP;
END
$$;
--> statement-breakpoint
-- A driver needs the assignment link for their own trucks.
CREATE POLICY driver_scope ON assignment_containers FOR SELECT USING (
  app_setting('app.user_kind') = 'driver' AND EXISTS (
    SELECT 1 FROM transport_assignments ta
    WHERE ta.id = assignment_id AND ta.driver_user_id = app_setting('app.user_id')::uuid));
--> statement-breakpoint
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_scope ON organizations USING (app_can_see(id, NULL)) WITH CHECK (app_can_see(id, NULL));
--> statement-breakpoint
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_scope ON users USING (
  app_setting('app.user_kind') IN ('staff', 'system')
  OR id = app_setting('app.user_id')::uuid
  OR (app_setting('app.user_kind') = 'client' AND organization_id = app_setting('app.org_id')::uuid)
) WITH CHECK (app_setting('app.user_kind') IN ('staff', 'system') OR id = app_setting('app.user_id')::uuid);
--> statement-breakpoint
-- The outbox is worker-only plumbing; staff and system contexts may write to it.
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY writer_scope ON outbox_events USING (app_setting('app.user_kind') = 'system')
  WITH CHECK (app_setting('app.user_kind') IS NOT NULL);
--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_scope ON audit_log USING (app_setting('app.user_kind') IN ('staff', 'system'))
  WITH CHECK (app_setting('app.user_kind') IS NOT NULL);
