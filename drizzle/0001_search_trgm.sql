CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS articles_search_trgm_idx ON articles USING gin (search_text gin_trgm_ops);
