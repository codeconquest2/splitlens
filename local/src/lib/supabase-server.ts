import { createLocalDatabaseClient } from "@/lib/local-db";

export function createServerSupabaseClient() {
  return createLocalDatabaseClient();
}

export function createAdminSupabaseClient() {
  return createLocalDatabaseClient();
}
