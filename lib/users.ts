import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { isRasinDbMigrationRequiredError } from "@/lib/schema-errors";
import { assertValidSetupSecret } from "@/lib/setup-secret";
import { assertValidSuperAdminGatePin } from "@/lib/super-admin-gate";
import type { UserStatus } from "@/lib/authz";
import { hashPassword, verifyPassword } from "@/lib/password";
import { ensureCoreSchema } from "@/lib/schema";

/** يُحدَّد مرة واحدة: جدول Prisma القديم قد يستخدم عمود password بدل password_hash */
let usersHasLegacyPasswordColumn: boolean | undefined;

async function usersTableHasLegacyPasswordColumn(): Promise<boolean> {
  if (usersHasLegacyPasswordColumn !== undefined) return usersHasLegacyPasswordColumn;
  if (!isDatabaseConfigured()) {
    usersHasLegacyPasswordColumn = false;
    return false;
  }
  const pool = getDbPool();
  const r = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password' LIMIT 1`
  );
  usersHasLegacyPasswordColumn = (r.rowCount ?? 0) > 0;
  return usersHasLegacyPasswordColumn;
}

function verifyAgainstStoredHashes(
  plain: string,
  passwordHash: string | null | undefined,
  legacyPassword: string | null | undefined
): boolean {
  const ordered = [passwordHash, legacyPassword].filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0
  );
  for (const stored of ordered) {
    try {
      if (verifyPassword(plain, stored.trim())) return true;
    } catch {
      /* تجاهل تنسيقات غير صالحة لـ bcrypt */
    }
  }
  return false;
}

function normalizeRole(role: unknown): string {
  if (role == null) return "";
  return String(role).replace(/^"|"$/g, "").toUpperCase();
}

/** حساب مدير النظام الوحيد (ADMIN) الذي تُديره صفحة السوبر-إعداد */
export type SystemAdminRow = {
  /** معرّف الصف كما في DB: BIGINT أو UUID كنص */
  id: string;
  full_name: string;
  username: string;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
};

/** مصادقة مستخدم مدير النظام (ADMIN) النشط فقط — للدخول من الصفحة الرئيسية */
export async function authenticateSystemAdmin(
  username: string,
  password: string
): Promise<{ id: string; username: string; full_name: string } | null> {
  if (!isDatabaseConfigured()) return null;
  const u = username.trim().toLowerCase();
  if (!u || !password) return null;

  await ensureCoreSchema();
  const pool = getDbPool();
  const legacyCol = await usersTableHasLegacyPasswordColumn();
  const sql = legacyCol
    ? `SELECT id, username, full_name, password_hash, password AS legacy_password, status, role
       FROM users
       WHERE deleted_at IS NULL AND LOWER(TRIM(username::text)) = $1
       LIMIT 1`
    : `SELECT id, username, full_name, password_hash, status, role
       FROM users
       WHERE deleted_at IS NULL AND LOWER(TRIM(username::text)) = $1
       LIMIT 1`;

  type AuthRow = {
    id: string | number;
    username: string;
    full_name: string;
    password_hash: string | null;
    status: UserStatus;
    role: unknown;
    legacy_password?: string | null;
  };

  const result = await pool.query<AuthRow>(sql, [u]);

  const row = result.rows[0];
  if (!row || row.status !== "ACTIVE") return null;

  const roleNorm = normalizeRole(row.role);
  if (roleNorm !== "ADMIN" && roleNorm !== "SUPER_ADMIN") return null;

  const legacyPwd = legacyCol ? row.legacy_password : undefined;

  if (!verifyAgainstStoredHashes(password, row.password_hash, legacyPwd)) return null;

  return { id: String(row.id), username: row.username, full_name: row.full_name };
}

export async function getSystemAdmin(): Promise<SystemAdminRow | null> {
  if (!isDatabaseConfigured()) return null;
  await ensureCoreSchema();
  const pool = getDbPool();
  const result = await pool.query<{
    id: string | number;
    full_name: string;
    username: string;
    status: UserStatus;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, full_name, username, status, created_at, updated_at
     FROM users
     WHERE role = 'ADMIN' AND deleted_at IS NULL
     ORDER BY id ASC
     LIMIT 1`
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    full_name: row.full_name,
    username: row.username,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * لصفحات الواجهة التي تقرأ مدير النظام: يلتقط خطأ الترحيل اليدوي بدل إسقاط الصفحة.
 */
export async function tryGetSystemAdminForPage(): Promise<
  | { migrationRequired: true; message: string }
  | { migrationRequired: false; admin: SystemAdminRow | null }
> {
  if (!isDatabaseConfigured()) {
    return { migrationRequired: false, admin: null };
  }
  try {
    const admin = await getSystemAdmin();
    return { migrationRequired: false, admin };
  } catch (e) {
    if (isRasinDbMigrationRequiredError(e)) {
      return { migrationRequired: true, message: e.message };
    }
    throw e;
  }
}

async function insertSystemAdminUser(input: {
  fullName: string;
  username: string;
  password: string;
  confirmPassword: string;
}) {
  if (input.password !== input.confirmPassword) {
    throw new Error("كلمة المرور وتأكيدها غير متطابقين.");
  }
  if (input.password.length < 8) {
    throw new Error("كلمة المرور يجب أن تكون 8 أحرف على الأقل.");
  }

  await ensureCoreSchema();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT 1 FROM users WHERE role = 'ADMIN' AND deleted_at IS NULL LIMIT 1`
    );
    if ((existing.rowCount ?? 0) > 0) {
      throw new Error("يوجد بالفعل حساب مدير نظام. لا يمكن إنشاء أكثر من واحد.");
    }

    const username = input.username.trim().toLowerCase();
    const dup = await client.query(
      `SELECT 1 FROM users WHERE deleted_at IS NULL AND LOWER(TRIM(username::text)) = $1 LIMIT 1`,
      [username]
    );
    if ((dup.rowCount ?? 0) > 0) {
      throw new Error("اسم المستخدم مستخدم مسبقًا.");
    }

    const ins = await client.query<{ id: string | number }>(
      `INSERT INTO users
        (full_name, username, email, phone, password_hash, role, status, must_change_password,
         failed_login_attempts, created_at, updated_at)
       VALUES ($1, $2, NULL, NULL, $3, 'ADMIN', 'ACTIVE', FALSE, 0, NOW(), NOW())
       RETURNING id`,
      [input.fullName.trim(), username, hashPassword(input.password)]
    );

    const newId = String(ins.rows[0].id);
    /* مزامنة عمود password القديم (مثل Prisma) حتى تطابق password_hash */
    if (await usersTableHasLegacyPasswordColumn()) {
      await client.query(`UPDATE users SET password = password_hash WHERE id = $1`, [newId]);
    }
    /* target_user_id BIGINT لا يقبل UUID؛ نخزّن المعرّف في metadata */
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, target_user_id, metadata)
       VALUES (NULL, 'SYSTEM_ADMIN_CREATED', NULL, $1)`,
      [JSON.stringify({ username, userId: newId })]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function createSystemAdmin(input: {
  setupSecret: string;
  fullName: string;
  username: string;
  password: string;
  confirmPassword: string;
}) {
  assertValidSetupSecret(input.setupSecret);
  await insertSystemAdminUser(input);
}

/** إنشاء ADMIN بعد التحقق من رمز البوابة (6464 أو SUPER_ADMIN_GATE_PIN) */
export async function createSystemAdminWithGatePin(input: {
  gatePin: string;
  fullName: string;
  username: string;
  password: string;
  confirmPassword: string;
}) {
  assertValidSuperAdminGatePin(input.gatePin);
  await insertSystemAdminUser(input);
}

export async function updateSystemAdminPassword(input: {
  setupSecret: string;
  userId: string;
  newPassword: string;
  confirmPassword: string;
}) {
  assertValidSetupSecret(input.setupSecret);
  if (!input.userId.trim()) {
    throw new Error("معرّف المستخدم غير صالح.");
  }
  if (input.newPassword !== input.confirmPassword) {
    throw new Error("كلمة المرور الجديدة وتأكيدها غير متطابقين.");
  }
  if (input.newPassword.length < 8) {
    throw new Error("كلمة المرور يجب أن تكون 8 أحرف على الأقل.");
  }

  await ensureCoreSchema();
  const pool = getDbPool();
  const result = await pool.query(
    `UPDATE users
     SET password_hash = $1, updated_at = NOW()
     WHERE id = $2 AND role = 'ADMIN' AND deleted_at IS NULL`,
    [hashPassword(input.newPassword), input.userId]
  );
  if (result.rowCount === 0) {
    throw new Error("تعذر تحديث كلمة المرور.");
  }
  await pool.query(
    `INSERT INTO audit_logs (actor_user_id, action, target_user_id, metadata)
     VALUES (NULL, 'SYSTEM_ADMIN_PASSWORD_CHANGED', NULL, $1)`,
    [JSON.stringify({ targetUserId: input.userId })]
  );
}

export async function setSystemAdminStatus(input: {
  setupSecret: string;
  userId: string;
  disabled: boolean;
}) {
  assertValidSetupSecret(input.setupSecret);
  if (!input.userId.trim()) {
    throw new Error("معرّف المستخدم غير صالح.");
  }
  const status: UserStatus = input.disabled ? "DISABLED" : "ACTIVE";

  await ensureCoreSchema();
  const pool = getDbPool();
  const result = await pool.query(
    `UPDATE users
     SET status = $1, updated_at = NOW()
     WHERE id = $2 AND role = 'ADMIN' AND deleted_at IS NULL`,
    [status, input.userId]
  );
  if (result.rowCount === 0) {
    throw new Error("تعذر تحديث حالة الحساب.");
  }
  await pool.query(
    `INSERT INTO audit_logs (actor_user_id, action, target_user_id, metadata)
     VALUES (NULL, 'SYSTEM_ADMIN_STATUS_CHANGED', NULL, $1)`,
    [JSON.stringify({ targetUserId: input.userId, status })]
  );
}
