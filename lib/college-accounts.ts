import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { ensureCoreSchema } from "@/lib/schema";
import { isValidFormationName } from "@/lib/college-formations";

export type CollegeAccountKind = "FORMATION" | "FOLLOWUP";

export type CollegeAccountRow = {
  id: string;
  user_id: string;
  account_kind: CollegeAccountKind;
  formation_name: string | null;
  dean_name: string | null;
  holder_name: string | null;
  username: string;
  status: string;
  created_at: Date;
};

export async function listCollegeAccounts(): Promise<CollegeAccountRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    id: string | number;
    user_id: string | number;
    account_kind: string;
    formation_name: string | null;
    dean_name: string | null;
    holder_name: string | null;
    username: string;
    status: string;
    created_at: Date;
  }>(
    `SELECT p.id, p.user_id,
            COALESCE(p.account_kind, 'FORMATION') AS account_kind,
            p.formation_name, p.dean_name, p.holder_name,
            u.username, u.status, p.created_at
     FROM college_account_profiles p
     INNER JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
     ORDER BY COALESCE(p.account_kind, 'FORMATION') ASC,
              p.formation_name ASC NULLS LAST,
              p.holder_name ASC NULLS LAST`
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    user_id: String(row.user_id),
    account_kind: (row.account_kind === "FOLLOWUP" ? "FOLLOWUP" : "FORMATION") as CollegeAccountKind,
    formation_name: row.formation_name,
    dean_name: row.dean_name,
    holder_name: row.holder_name,
    username: row.username,
    status: row.status,
    created_at: row.created_at,
  }));
}

export type CollegeProfileRow = {
  account_kind: CollegeAccountKind;
  formation_name: string | null;
  dean_name: string | null;
  holder_name: string | null;
};

export async function getCollegeProfileByUserId(userId: string): Promise<CollegeProfileRow | null> {
  if (!isDatabaseConfigured()) return null;
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    account_kind: string;
    formation_name: string | null;
    dean_name: string | null;
    holder_name: string | null;
  }>(
    `SELECT COALESCE(account_kind, 'FORMATION') AS account_kind,
            formation_name, dean_name, holder_name
     FROM college_account_profiles
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    account_kind: row.account_kind === "FOLLOWUP" ? "FOLLOWUP" : "FORMATION",
    formation_name: row.formation_name,
    dean_name: row.dean_name,
    holder_name: row.holder_name,
  };
}

export async function createCollegeAccount(input: {
  accountKind: CollegeAccountKind;
  formationName: string;
  deanName: string;
  holderName: string;
  username: string;
  password: string;
  confirmPassword: string;
  createdByUserId: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const username = input.username.trim().toLowerCase();

  if (input.password.length < 8) {
    return { ok: false, message: "كلمة المرور يجب أن تكون 8 أحرف على الأقل." };
  }
  if (input.password !== input.confirmPassword) {
    return { ok: false, message: "كلمة المرور وتأكيدها غير متطابقتين." };
  }
  if (username.length < 3) {
    return { ok: false, message: "اسم المستخدم يجب أن يكون 3 أحرف على الأقل." };
  }
  if (!/^[a-z0-9._-]+$/i.test(username)) {
    return {
      ok: false,
      message: "اسم المستخدم يقبل حروفًا إنجليزية وأرقامًا و . _ - فقط.",
    };
  }

  let fullNameForUser: string;
  let formationName: string | null = null;
  let deanName: string | null = null;
  let holderName: string | null = null;

  if (input.accountKind === "FORMATION") {
    const fn = input.formationName.trim();
    const dn = input.deanName.trim();
    if (!isValidFormationName(fn)) {
      return { ok: false, message: "اختر تشكيلًا صالحًا من القائمة." };
    }
    if (dn.length < 2) {
      return { ok: false, message: "يرجى إدخال اسم عميد الكلية (حرفان على الأقل)." };
    }
    formationName = fn;
    deanName = dn;
    fullNameForUser = dn;
  } else {
    const hn = input.holderName.trim();
    if (hn.length < 2) {
      return { ok: false, message: "يرجى إدخال اسم صاحب الحساب (حرفان على الأقل)." };
    }
    holderName = hn;
    fullNameForUser = hn;
  }

  if (!isDatabaseConfigured()) {
    return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  }

  await ensureCoreSchema();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const dupUser = await client.query(
      `SELECT 1 FROM users WHERE deleted_at IS NULL AND LOWER(TRIM(username::text)) = $1 LIMIT 1`,
      [username]
    );
    if ((dupUser.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return { ok: false, message: "اسم المستخدم مستخدم مسبقًا." };
    }

    if (input.accountKind === "FORMATION" && formationName) {
      const dupFormation = await client.query(
        `SELECT 1 FROM college_account_profiles WHERE formation_name = $1 LIMIT 1`,
        [formationName]
      );
      if ((dupFormation.rowCount ?? 0) > 0) {
        await client.query("ROLLBACK");
        return { ok: false, message: "يوجد بالفعل حساب لهذا التشكيل." };
      }
    }

    const createdBy =
      input.createdByUserId && /^[0-9]+$/.test(input.createdByUserId.trim())
        ? input.createdByUserId.trim()
        : null;

    const insUser = await client.query<{ id: string | number }>(
      `INSERT INTO users
        (full_name, username, email, phone, password_hash, role, status, must_change_password,
         failed_login_attempts, created_at, updated_at, created_by)
       VALUES ($1, $2, NULL, NULL, $3, 'COLLEGE', 'ACTIVE', FALSE, 0, NOW(), NOW(), $4)
       RETURNING id`,
      [fullNameForUser, username, hashPassword(input.password), createdBy]
    );
    const newUserId = insUser.rows[0].id;

    await client.query(
      `INSERT INTO college_account_profiles
        (user_id, formation_name, dean_name, holder_name, account_kind, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [
        newUserId,
        formationName,
        deanName,
        holderName,
        input.accountKind,
      ]
    );

    const legacyCol = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password' LIMIT 1`
    );
    if ((legacyCol.rowCount ?? 0) > 0) {
      await client.query(`UPDATE users SET password = password_hash WHERE id = $1`, [newUserId]);
    }

    const actorForAudit =
      input.createdByUserId && /^[0-9]+$/.test(input.createdByUserId.trim())
        ? input.createdByUserId.trim()
        : null;
    const targetForAudit = /^[0-9]+$/.test(String(newUserId)) ? String(newUserId) : null;
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, target_user_id, metadata)
       VALUES ($1, 'COLLEGE_ACCOUNT_CREATED', $2, $3)`,
      [
        actorForAudit,
        targetForAudit,
        JSON.stringify({
          accountKind: input.accountKind,
          formationName,
          username,
        }),
      ]
    );

    await client.query("COMMIT");
    return { ok: true };
  } catch (e: unknown) {
    await client.query("ROLLBACK");
    const msg = String((e as { message?: string }).message ?? "");
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return { ok: false, message: "تعذر الحفظ: بيانات مكررة (مستخدم أو تشكيل)." };
    }
    console.error("[createCollegeAccount]", e);
    return { ok: false, message: "حدث خطأ أثناء حفظ الحساب." };
  } finally {
    client.release();
  }
}
