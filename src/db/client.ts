// src/db/client.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "@/lib/env";
import * as schema from "./schema";

function create() {
  return drizzle(neon(env("DATABASE_URL")), { schema });
}

let instance: ReturnType<typeof create> | null = null;

export function db() {
  return (instance ??= create());
}
