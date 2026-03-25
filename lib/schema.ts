import type { Pool } from "pg";
import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { RasinDbMigrationRequiredError } from "@/lib/schema-errors";

let coreReady = false;

async function indexExists(pool: Pool, indexName: string) {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = $1
     ) AS exists`,
    [indexName]
  );
  return Boolean(result.rows[0]?.exists);
}

async function createIndexSafe(pool: Pool, indexName: string, sql: string) {
  if (await indexExists(pool, indexName)) return;

  try {
    await pool.query(sql);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    const message = String(e?.message ?? "");
    const permissionDenied =
      e?.code === "42501" ||
      message.includes("must be owner") ||
      message.includes("permission denied");

    if (permissionDenied) {
      if (await indexExists(pool, indexName)) return;
      console.warn(
        `[schema] تعذر إنشاء الفهرس ${indexName} لأن مستخدم قاعدة البيانات ليس مالك الجدول. ` +
          `شغّل مرة واحدة كـ superuser: database/migrations/002_exams_app_own_core_tables.sql`
      );
      return;
    }
    throw err;
  }
}

async function tableExists(pool: Pool, tableName: string) {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [tableName]
  );
  return Boolean(result.rows[0]?.exists);
}

async function getTableColumns(pool: Pool, tableName: string) {
  const result = await pool.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return new Set(result.rows.map((row) => row.column_name));
}

function isPermissionError(err: unknown) {
  const e = err as { code?: string; message?: string };
  const message = String(e?.message ?? "");
  return (
    e?.code === "42501" ||
    message.includes("must be owner") ||
    message.includes("permission denied")
  );
}

/**
 * إذا وُجد جدول users قديمًا ببنية مختلفة (مثلاً من بداية المشروع)، فإن CREATE TABLE IF NOT EXISTS لن يضيف الأعمدة الجديدة.
 * نحاول هنا إضافة الأعمدة الناقصة وتعبئتها ثم ضبط NOT NULL حيث يلزم.
 */
async function alignUsersTableWithRasinModel(pool: Pool) {
  const exists = await tableExists(pool, "users");
  if (!exists) return;

  let columns = await getTableColumns(pool, "users");
  const hadPasswordColumn = columns.has("password");

  const addColumn = async (sql: string) => {
    try {
      await pool.query(sql);
    } catch (err) {
      if (isPermissionError(err)) {
        throw new RasinDbMigrationRequiredError(
          "لا يمكن تعديل جدول users لأن مستخدم التطبيق ليس مالك الجدول أو ليست لديه صلاحية ALTER. شغّل مرة واحدة كـ postgres الملف: database/migrations/003_align_users_table_rasin.sql (يُحدّث الأعمدة والفهارس وينقل الملكية إلى exams_app)."
        );
      }
      throw err;
    }
  };

  await addColumn(
    `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name VARCHAR(200)`
  );
  await addColumn(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email VARCHAR(180)`);
  await addColumn(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone VARCHAR(40)`);
  await addColumn(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
  await addColumn(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role VARCHAR(30)`);
  await addColumn(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status VARCHAR(20)`);
  await addColumn(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN`);
  await addColumn(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`);
  await addColumn(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER`);
  await addColumn(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ`);
  await addColumn(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ`);
  await addColumn(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);
  await addColumn(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
  await addColumn(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_by BIGINT`);
  await addColumn(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_by BIGINT`);

  columns = await getTableColumns(pool, "users");

  if (hadPasswordColumn && columns.has("password_hash")) {
    await pool.query(`
      UPDATE public.users
      SET password_hash = password
      WHERE password_hash IS NULL AND password IS NOT NULL
    `);
  }

  await pool.query(`
    UPDATE public.users
    SET full_name = COALESCE(NULLIF(TRIM(full_name), ''), username, 'مستخدم')
    WHERE full_name IS NULL
  `);
  await pool.query(`UPDATE public.users SET role = 'USER' WHERE role IS NULL`);
  await pool.query(`UPDATE public.users SET status = 'ACTIVE' WHERE status IS NULL`);
  await pool.query(
    `UPDATE public.users SET must_change_password = FALSE WHERE must_change_password IS NULL`
  );
  await pool.query(
    `UPDATE public.users SET failed_login_attempts = 0 WHERE failed_login_attempts IS NULL`
  );
  await pool.query(`UPDATE public.users SET created_at = NOW() WHERE created_at IS NULL`);
  await pool.query(`UPDATE public.users SET updated_at = NOW() WHERE updated_at IS NULL`);

  const nullHashes = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM public.users WHERE password_hash IS NULL`
  );
  if (Number(nullHashes.rows[0]?.c ?? 0) > 0) {
    throw new RasinDbMigrationRequiredError(
      "توجد صفوف في users بدون password_hash. صحّح البيانات يدويًا أو شغّل database/migrations/003_align_users_table_rasin.sql كـ postgres."
    );
  }

  const enforceNotNull = async (ddl: string) => {
    try {
      await pool.query(ddl);
    } catch (err) {
      if (isPermissionError(err)) {
        throw new RasinDbMigrationRequiredError(
          "تعذر ضبط قيود الأعمدة على users. شغّل database/migrations/003_align_users_table_rasin.sql كـ postgres."
        );
      }
      throw err;
    }
  };

  await enforceNotNull(`ALTER TABLE public.users ALTER COLUMN full_name SET NOT NULL`);
  await enforceNotNull(`ALTER TABLE public.users ALTER COLUMN password_hash SET NOT NULL`);
  await enforceNotNull(`ALTER TABLE public.users ALTER COLUMN role SET NOT NULL`);
  await enforceNotNull(`ALTER TABLE public.users ALTER COLUMN status SET NOT NULL`);
  await enforceNotNull(
    `ALTER TABLE public.users ALTER COLUMN must_change_password SET NOT NULL`
  );
  await enforceNotNull(
    `ALTER TABLE public.users ALTER COLUMN failed_login_attempts SET NOT NULL`
  );
  await enforceNotNull(`ALTER TABLE public.users ALTER COLUMN created_at SET NOT NULL`);
  await enforceNotNull(`ALTER TABLE public.users ALTER COLUMN updated_at SET NOT NULL`);

  const finalCols = await getTableColumns(pool, "users");
  const required = [
    "username",
    "full_name",
    "password_hash",
    "role",
    "status",
    "must_change_password",
    "failed_login_attempts",
    "created_at",
    "updated_at",
  ];
  const missing = required.filter((name) => !finalCols.has(name));
  if (missing.length > 0) {
    throw new RasinDbMigrationRequiredError(
      `جدول users غير متوافق مع نظام رصين (أعمدة ناقصة: ${missing.join(", ")}). شغّل database/migrations/003_align_users_table_rasin.sql كـ postgres أو أنشئ قاعدة بيانات جديدة.`
    );
  }
}

export async function ensureCoreSchema() {
  if (coreReady) return;
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is not configured.");
  }
  const pool = getDbPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      full_name VARCHAR(200) NOT NULL,
      username VARCHAR(100) UNIQUE NOT NULL,
      email VARCHAR(180) UNIQUE,
      phone VARCHAR(40),
      password_hash TEXT NOT NULL,
      role VARCHAR(30) NOT NULL CHECK (role IN ('SUPER_ADMIN','ADMIN','MANAGER','USER')),
      status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE','DISABLED','LOCKED','PENDING')) DEFAULT 'ACTIVE',
      must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
      last_login_at TIMESTAMPTZ,
      failed_login_attempts INT NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      created_by BIGINT,
      updated_by BIGINT
    );
  `);

  await alignUsersTableWithRasinModel(pool);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_user_id BIGINT,
      action VARCHAR(100) NOT NULL,
      target_user_id BIGINT,
      metadata JSONB,
      ip_address VARCHAR(64),
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await createIndexSafe(pool, "idx_users_role", "CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)");
  await createIndexSafe(pool, "idx_users_status", "CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)");
  await createIndexSafe(
    pool,
    "idx_users_deleted_at",
    "CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at)"
  );
  await createIndexSafe(
    pool,
    "idx_audit_target",
    "CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_user_id)"
  );

  coreReady = true;
}
