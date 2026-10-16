CREATE TABLE "article_tags" (
	"article_id" uuid NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "article_tags_article_id_tag_id_pk" PRIMARY KEY("article_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title_ko" text,
	"title_original" text,
	"source_type" text NOT NULL,
	"source_url" text,
	"source_text" text,
	"source_file_blob" text,
	"lang" text,
	"lead_ko" text,
	"summary_ko" jsonb,
	"body_original" jsonb,
	"body_ko" jsonb,
	"untranslated" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cover_image" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" text,
	"current_step" text,
	"failed_step" text,
	"error" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"search_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" uuid NOT NULL,
	"step" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "article_tags" ADD CONSTRAINT "article_tags_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_tags" ADD CONSTRAINT "article_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "articles_list_idx" ON "articles" USING btree ("is_public","status","published_at");--> statement-breakpoint
CREATE INDEX "articles_source_url_idx" ON "articles" USING btree ("source_url");