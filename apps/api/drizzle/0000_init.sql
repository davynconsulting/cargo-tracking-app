CREATE TABLE "assignment_containers" (
	"assignment_id" uuid NOT NULL,
	"container_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	CONSTRAINT "assignment_containers_assignment_id_container_id_pk" PRIMARY KEY("assignment_id","container_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"opted_in" boolean NOT NULL,
	"phone" text,
	"source" text NOT NULL,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"timezone" text DEFAULT 'Africa/Dar_es_Salaam' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"whatsapp_opt_in" boolean DEFAULT false NOT NULL,
	"push_enabled" boolean DEFAULT false NOT NULL,
	"email_opt_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "containers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"container_number" text NOT NULL,
	"size_type" text,
	"seal_number" text,
	"terminal_or_icd" text,
	"journey" text DEFAULT 'at_sea' NOT NULL,
	"return_status" text DEFAULT 'not_due' NOT NULL,
	"discharge_at" timestamp with time zone,
	"gate_out_at" timestamp with time zone,
	"delivery_at" timestamp with time zone,
	"empty_return_at" timestamp with time zone,
	"return_due_at" timestamp with time zone,
	"free_days" integer,
	"condition" text,
	"return_depot" text,
	"last_event_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"file_storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"client_visible" boolean DEFAULT true NOT NULL,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"replaces_document_id" uuid
);
--> statement-breakpoint
CREATE TABLE "eta_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"previous_eta" timestamp with time zone,
	"new_eta" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"notes" text,
	"material" boolean NOT NULL,
	"revised_by" uuid,
	"revised_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"container_id" uuid,
	"type" text NOT NULL,
	"dedupe_key" text,
	"owner_role" text NOT NULL,
	"owner_user_id" uuid,
	"reason" text NOT NULL,
	"next_action" text NOT NULL,
	"due_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"client_visible" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"opened_by" uuid,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution" text,
	CONSTRAINT "exceptions_dedupeKey_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_shipments" (
	"invoice_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	CONSTRAINT "invoice_shipments_invoice_id_shipment_id_pk" PRIMARY KEY("invoice_id","shipment_id")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"issue_date" timestamp with time zone NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"currency" text NOT NULL,
	"subtotal" numeric(18, 2) NOT NULL,
	"tax" numeric(18, 2) NOT NULL,
	"total_amount" numeric(18, 2) NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"disputed" boolean DEFAULT false NOT NULL,
	"dispute_reason" text,
	"credit_approved_by" uuid,
	"credit_approval_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoiceNumber_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"country" text NOT NULL,
	CONSTRAINT "locations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "milestone_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"container_id" uuid,
	"milestone_type" text NOT NULL,
	"previous_status" text,
	"new_status" text,
	"event_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" uuid,
	"source" text NOT NULL,
	"location" text,
	"notes" text,
	"reason_code" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence_document_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"visibility" text DEFAULT 'client' NOT NULL,
	"correction_of_event_id" uuid,
	"override_reason" text,
	"idempotency_key" text NOT NULL,
	CONSTRAINT "milestone_events_idempotencyKey_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"recipient_contact_id" uuid NOT NULL,
	"shipment_id" uuid,
	"source_id" text NOT NULL,
	"channel" text NOT NULL,
	"template" text NOT NULL,
	"locale" text NOT NULL,
	"body" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_dedupeKey_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"client_code" text NOT NULL,
	"tax_id" text,
	"billing_address" text,
	"billing_terms_days" integer,
	"credit_limit" numeric(18, 2),
	"credit_currency" text,
	"preferred_language" text DEFAULT 'en' NOT NULL,
	"timezone" text DEFAULT 'Africa/Dar_es_Salaam' NOT NULL,
	"account_manager_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_clientCode_unique" UNIQUE("client_code")
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"method" text NOT NULL,
	"transaction_reference" text NOT NULL,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"receipt_number" text,
	CONSTRAINT "payments_receiptNumber_unique" UNIQUE("receipt_number")
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"origin_location_id" uuid,
	"destination_location_id" uuid,
	"port_processing_hours" integer DEFAULT 96 NOT NULL,
	"transit_hours" integer DEFAULT 72 NOT NULL,
	"silence_alert_hours" integer DEFAULT 24 NOT NULL,
	CONSTRAINT "routes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"name" text PRIMARY KEY NOT NULL,
	"value" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"booking_reference" text,
	"bl_number" text,
	"shipping_line" text,
	"vessel_name" text,
	"voyage_number" text,
	"origin_port" text NOT NULL,
	"origin_terminal" text,
	"destination_country" text NOT NULL,
	"destination_city" text NOT NULL,
	"delivery_address" text,
	"cargo_description" text,
	"package_count" integer,
	"gross_weight_kg" numeric(12, 2),
	"route_id" uuid,
	"planned_vessel_arrival" timestamp with time zone,
	"vessel_arrived_at" timestamp with time zone,
	"docs_status" text DEFAULT 'missing' NOT NULL,
	"customs_status" text DEFAULT 'not_started' NOT NULL,
	"current_eta" timestamp with time zone,
	"eta_updated_at" timestamp with time zone,
	"eta_reason" text,
	"assigned_ops_user_id" uuid,
	"assigned_agent_user_id" uuid,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "transport_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"truck_registration" text NOT NULL,
	"trailer_registration" text,
	"driver_user_id" uuid,
	"driver_name" text NOT NULL,
	"driver_phone" text,
	"transporter_name" text,
	"planned_loading_at" timestamp with time zone,
	"actual_loading_at" timestamp with time zone,
	"route_id" uuid,
	"border_crossing" text,
	"transit_document_refs" text,
	"status" text DEFAULT 'assigned' NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"organization_id" uuid,
	"phone" text,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "assignment_containers" ADD CONSTRAINT "assignment_containers_assignment_id_transport_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."transport_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_containers" ADD CONSTRAINT "assignment_containers_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_containers" ADD CONSTRAINT "assignment_containers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eta_revisions" ADD CONSTRAINT "eta_revisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eta_revisions" ADD CONSTRAINT "eta_revisions_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eta_revisions" ADD CONSTRAINT "eta_revisions_revised_by_users_id_fk" FOREIGN KEY ("revised_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_shipments" ADD CONSTRAINT "invoice_shipments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_shipments" ADD CONSTRAINT "invoice_shipments_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_shipments" ADD CONSTRAINT "invoice_shipments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credit_approved_by_users_id_fk" FOREIGN KEY ("credit_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_events" ADD CONSTRAINT "milestone_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_events" ADD CONSTRAINT "milestone_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_events" ADD CONSTRAINT "milestone_events_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_events" ADD CONSTRAINT "milestone_events_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_contact_id_contacts_id_fk" FOREIGN KEY ("recipient_contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_origin_location_id_locations_id_fk" FOREIGN KEY ("origin_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_destination_location_id_locations_id_fk" FOREIGN KEY ("destination_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_assigned_ops_user_id_users_id_fk" FOREIGN KEY ("assigned_ops_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_assigned_agent_user_id_users_id_fk" FOREIGN KEY ("assigned_agent_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_driver_user_id_users_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "containers_shipment_id_index" ON "containers" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "containers_organization_id_index" ON "containers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "containers_container_number_index" ON "containers" USING btree ("container_number");--> statement-breakpoint
CREATE INDEX "exceptions_status_owner_role_index" ON "exceptions" USING btree ("status","owner_role");--> statement-breakpoint
CREATE INDEX "exceptions_shipment_id_index" ON "exceptions" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_reminders_invoice_id_stage_index" ON "invoice_reminders" USING btree ("invoice_id","stage");--> statement-breakpoint
CREATE INDEX "milestone_events_shipment_id_event_at_index" ON "milestone_events" USING btree ("shipment_id","event_at");--> statement-breakpoint
CREATE INDEX "milestone_events_organization_id_index" ON "milestone_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notifications_status_next_attempt_at_index" ON "notifications" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notifications_organization_id_index" ON "notifications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "outbox_events_processed_at_id_index" ON "outbox_events" USING btree ("processed_at","id");--> statement-breakpoint
CREATE INDEX "shipments_organization_id_index" ON "shipments" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_bl_number_index" ON "shipments" USING btree ("bl_number");