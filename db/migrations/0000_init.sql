CREATE TABLE IF NOT EXISTS "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" varchar(20) NOT NULL DEFAULT 'producto',
	"name" text NOT NULL,
	"category" text NOT NULL DEFAULT 'General',
	"description" text NOT NULL DEFAULT '',
	"price" integer NOT NULL DEFAULT 0,
	"stock" integer NOT NULL DEFAULT 0,
	"duration_minutes" integer NOT NULL DEFAULT 30,
	"image" text NOT NULL DEFAULT '',
	"featured" boolean NOT NULL DEFAULT false,
	"active" boolean NOT NULL DEFAULT true,
	"created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL DEFAULT '',
	"phone" text NOT NULL DEFAULT '',
	"address" text NOT NULL DEFAULT '',
	"notes" text NOT NULL DEFAULT '',
	"created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL UNIQUE,
	"customer_id" integer,
	"customer_name" text NOT NULL,
	"email" text NOT NULL DEFAULT '',
	"phone" text NOT NULL DEFAULT '',
	"address" text NOT NULL DEFAULT '',
	"items" jsonb NOT NULL,
	"total" integer NOT NULL,
	"status" text NOT NULL DEFAULT 'Pendiente',
	"payment_status" text NOT NULL DEFAULT 'Pendiente',
	"created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"appointment_number" text NOT NULL UNIQUE,
	"customer_id" integer,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL DEFAULT '',
	"email" text NOT NULL DEFAULT '',
	"service_id" integer,
	"service_name" text NOT NULL,
	"price" integer NOT NULL DEFAULT 0,
	"date" text NOT NULL,
	"time" text NOT NULL,
	"notes" text NOT NULL DEFAULT '',
	"status" text NOT NULL DEFAULT 'Pendiente',
	"payment_status" text NOT NULL DEFAULT 'Pendiente',
	"created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"folio" text NOT NULL UNIQUE,
	"source_type" text NOT NULL,
	"source_id" integer NOT NULL,
	"customer_id" integer,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL DEFAULT '',
	"concept" text NOT NULL,
	"total" integer NOT NULL,
	"paid" integer NOT NULL DEFAULT 0,
	"status" text NOT NULL DEFAULT 'Pendiente',
	"created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"folio" text NOT NULL UNIQUE,
	"invoice_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"method" text NOT NULL DEFAULT 'Efectivo',
	"note" text NOT NULL DEFAULT '',
	"created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "content" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS "orders_created_idx" ON "orders" ("created_at");
CREATE INDEX IF NOT EXISTS "appointments_date_idx" ON "appointments" ("date");
CREATE INDEX IF NOT EXISTS "invoices_source_idx" ON "invoices" ("source_type", "source_id");
CREATE INDEX IF NOT EXISTS "payments_invoice_idx" ON "payments" ("invoice_id");
