import { Pool } from "pg";

let pool: Pool | null = null;

/** True إذا وُجدت سلسلة اتصال صالحة (قبل التحقق من إمكانية الاتصال الفعلي). */
export function getRawDatabaseUrl(): string | null {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.PRISMA_DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim() === "") return null;
  return databaseUrl;
}

export function isDatabaseConfigured(): boolean {
  return getRawDatabaseUrl() !== null;
}

function getConnectionString() {
  const databaseUrl = getRawDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  // Prisma-style URL may include unsupported params for pg, keep only known safe base.
  const url = new URL(databaseUrl);
  url.searchParams.delete("schema");
  return url.toString();
}

export function getDbPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getConnectionString(),
    });
  }

  return pool;
}
