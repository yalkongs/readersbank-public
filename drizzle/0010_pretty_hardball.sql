ALTER TABLE "articles" ADD COLUMN "audio_url" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "audio_meta" jsonb;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "audio_status" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "audio_progress" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "audio_error" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "audio_started_at" timestamp with time zone;