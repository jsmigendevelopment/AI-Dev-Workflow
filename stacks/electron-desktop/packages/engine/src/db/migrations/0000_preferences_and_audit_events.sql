CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`object_type` text NOT NULL,
	`object_id` text,
	`request_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "audit_events_actor_check" CHECK("audit_events"."actor" in ('person')),
	CONSTRAINT "audit_events_action_check" CHECK("audit_events"."action" in ('preferences_changed')),
	CONSTRAINT "audit_events_object_type_check" CHECK("audit_events"."object_type" in ('preferences'))
);
--> statement-breakpoint
CREATE TABLE `preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "preferences_key_check" CHECK("preferences"."key" in ('list.page_size', 'list.refresh_seconds'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preferences_key_unique` ON `preferences` (`key`);