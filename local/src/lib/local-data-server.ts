import { createLocalDatabaseClient } from "@/lib/local-db";

export function createLocalServerClient() {
  return createLocalDatabaseClient();
}

export function createLocalAdminClient() {
  return createLocalDatabaseClient();
}
