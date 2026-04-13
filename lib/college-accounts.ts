import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { ensureCoreSchema } from "@/lib/schema";
import { COLLEGE_ACCOUNT_DEPT_SUBJECT_CREATE_PREFIX } from "@/lib/college-account-constants";
import {
  getFixedCollegeDepartmentNamesForFormation,
  getFixedFormationSubjectDefinitions,
  isValidFormationName,
} from "@/lib/college-formations";

type DepartmentSubjectPick =
  | { mode: "existing"; id: number }
  | { mode: "create"; branchName: string; branchType: "DEPARTMENT" | "BRANCH" };

function parseDepartmentSubjectPick(input: {
  formationNameTrimmed: string;
  collegeSubjectIdRaw: string;
  newBranchName?: string;
  newBranchType?: string;
}): { ok: true; pick: DepartmentSubjectPick } | { ok: false; message: string } {
  const sid = input.collegeSubjectIdRaw.trim();
  const freeName = (input.newBranchName ?? "").trim();
  const freeType = input.newBranchType?.trim().toUpperCase() === "BRANCH" ? "BRANCH" : "DEPARTMENT";
  const fixed = getFixedCollegeDepartmentNamesForFormation(input.formationNameTrimmed);

  if (/^[0-9]+$/.test(sid)) {
    return { ok: true, pick: { mode: "existing", id: Number.parseInt(sid, 10) } };
  }

  if (sid.startsWith(COLLEGE_ACCOUNT_DEPT_SUBJECT_CREATE_PREFIX)) {
    try {
      const json = decodeURIComponent(sid.slice(COLLEGE_ACCOUNT_DEPT_SUBJECT_CREATE_PREFIX.length));
      const payload = JSON.parse(json) as { n?: string; t?: string };
      const branchName = String(payload.n ?? "").trim();
      const branchType = payload.t === "BRANCH" ? "BRANCH" : "DEPARTMENT";
      if (branchName.length < 2) {
        return { ok: false, message: "اختر القسم أو الفرع من القائمة." };
      }
      if (fixed) {
        const ok = fixed.some((x) => x.trim() === branchName.trim());
        if (!ok) {
          return { ok: false, message: "القسم المختار غير معتمد لهذا التشكيل." };
        }
      }
      return { ok: true, pick: { mode: "create", branchName, branchType } };
    } catch {
      return { ok: false, message: "اختيار القسم أو الفرع غير صالح." };
    }
  }

  if (freeName.length >= 2) {
    if (fixed) {
      return { ok: false, message: "يرجى اختيار القسم أو الفرع من القائمة المعتمدة لهذا التشكيل." };
    }
    return { ok: true, pick: { mode: "create", branchName: freeName, branchType: freeType } };
  }

  return { ok: false, message: "اختر القسم أو الفرع من القائمة، أو أدخل اسمه." };
}

export type CollegeAccountKind = "FORMATION" | "FOLLOWUP" | "DEPARTMENT";

function normalizeAccountKindDb(raw: string): CollegeAccountKind {
  const u = raw.trim().toUpperCase();
  if (u === "FOLLOWUP") return "FOLLOWUP";
  if (u === "DEPARTMENT") return "DEPARTMENT";
  return "FORMATION";
}

export type CollegeAccountRow = {
  id: string;
  user_id: string;
  account_kind: CollegeAccountKind;
  formation_name: string | null;
  dean_name: string | null;
  holder_name: string | null;
  /** للعرض: اسم القسم/الفرع عند حساب قسم */
  branch_name: string | null;
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
    branch_name: string | null;
    username: string;
    status: string;
    created_at: Date;
  }>(
    `SELECT p.id, p.user_id,
            COALESCE(p.account_kind, 'FORMATION') AS account_kind,
            p.formation_name, p.dean_name, p.holder_name,
            sub.branch_name AS branch_name,
            u.username, u.status, p.created_at
     FROM college_account_profiles p
     INNER JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
     LEFT JOIN college_subjects sub ON sub.id = p.college_subject_id
     ORDER BY COALESCE(p.account_kind, 'FORMATION') ASC,
              p.formation_name ASC NULLS LAST,
              p.holder_name ASC NULLS LAST`
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    user_id: String(row.user_id),
    account_kind: normalizeAccountKindDb(String(row.account_kind)),
    formation_name: row.formation_name,
    dean_name: row.dean_name,
    holder_name: row.holder_name,
    branch_name: row.branch_name,
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
  college_subject_id: string | null;
  scoped_branch_name: string | null;
  scoped_branch_type: "DEPARTMENT" | "BRANCH" | null;
  /** مالك بيانات التشكيل (لحساب القسم) */
  tenant_owner_user_id: string | null;
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
    college_subject_id: string | number | null;
    scoped_branch_name: string | null;
    scoped_branch_type: string | null;
    tenant_owner_user_id: string | null;
  }>(
    `SELECT COALESCE(p.account_kind, 'FORMATION') AS account_kind,
            p.formation_name, p.dean_name, p.holder_name,
            p.college_subject_id::text AS college_subject_id,
            s.branch_name AS scoped_branch_name,
            COALESCE(s.branch_type, 'DEPARTMENT') AS scoped_branch_type,
            s.owner_user_id::text AS tenant_owner_user_id
     FROM college_account_profiles p
     LEFT JOIN college_subjects s ON s.id = p.college_subject_id
     WHERE p.user_id = $1
     LIMIT 1`,
    [userId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const kind = normalizeAccountKindDb(String(row.account_kind));
  return {
    account_kind: kind,
    formation_name: row.formation_name,
    dean_name: row.dean_name,
    holder_name: row.holder_name,
    college_subject_id: row.college_subject_id != null ? String(row.college_subject_id) : null,
    scoped_branch_name: row.scoped_branch_name,
    scoped_branch_type: row.scoped_branch_type === "BRANCH" ? "BRANCH" : row.scoped_branch_name ? "DEPARTMENT" : null,
    tenant_owner_user_id: row.tenant_owner_user_id,
  };
}

/** أقسام/فروع التشكيل المسجّلة مسبقًا (للمدير عند إنشاء حساب قسم) — اختياري؛ يمكن إنشاء القسم من نفس صفحة الحسابات. */
export async function listCollegeSubjectsByFormationNameForAdmin(formationName: string): Promise<
  { id: string; branch_name: string; branch_type: "DEPARTMENT" | "BRANCH" }[]
> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const fn = formationName.trim();
  if (!fn) return [];
  const pool = getDbPool();
  const r = await pool.query<{
    id: string | number;
    branch_name: string;
    branch_type: string;
  }>(
    `SELECT s.id, s.branch_name, COALESCE(s.branch_type, 'DEPARTMENT') AS branch_type
     FROM college_subjects s
     INNER JOIN college_account_profiles p ON p.user_id = s.owner_user_id
     WHERE p.account_kind = 'FORMATION' AND p.formation_name = $1
     ORDER BY s.branch_name ASC`,
    [fn]
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    branch_name: row.branch_name,
    branch_type: row.branch_type === "BRANCH" ? "BRANCH" : "DEPARTMENT",
  }));
}

export type AutoProvisionedDepartmentCredential = {
  branchName: string;
  branchType: "DEPARTMENT" | "BRANCH";
  username: string;
  password: string;
};

const ARABIC_TO_LATIN_MAP: Record<string, string> = {
  ا: "a",
  أ: "a",
  إ: "i",
  آ: "a",
  ب: "b",
  ت: "t",
  ث: "th",
  ج: "j",
  ح: "h",
  خ: "kh",
  د: "d",
  ذ: "dh",
  ر: "r",
  ز: "z",
  س: "s",
  ش: "sh",
  ص: "s",
  ض: "d",
  ط: "t",
  ظ: "z",
  ع: "a",
  غ: "gh",
  ف: "f",
  ق: "q",
  ك: "k",
  گ: "g",
  ل: "l",
  م: "m",
  ن: "n",
  ه: "h",
  و: "w",
  ي: "y",
  ى: "a",
  ة: "h",
  ء: "a",
  ئ: "y",
  ؤ: "w",
};

function transliterateArabicToAscii(input: string): string {
  const raw = input.trim().toLowerCase();
  let out = "";
  for (const ch of raw) {
    if (/[a-z0-9]/.test(ch)) {
      out += ch;
      continue;
    }
    out += ARABIC_TO_LATIN_MAP[ch] ?? "";
  }
  return out.replace(/[^a-z0-9]+/g, "");
}

function formationPrefixTwoLetters(formationName: string): string {
  const base = transliterateArabicToAscii(formationName.replace(/^\s*كلية\s*/u, ""));
  if (base.length >= 2) return base.slice(0, 2);
  return "cl";
}

function branchUsernameWord(branchName: string, index: number): string {
  const base = transliterateArabicToAscii(branchName.replace(/^(قسم|فرع)\s+/u, ""));
  if (base.length > 0) return base;
  return `unit${index + 1}`;
}

function passwordPrefixPart(input: string): string {
  const t = transliterateArabicToAscii(input);
  if (t.length >= 2) return t.slice(0, 2);
  if (t.length === 1) return `${t}x`;
  return "xx";
}

function randomThreeDigits(used: Set<string>): string {
  for (let i = 0; i < 2000; i += 1) {
    const n = Math.floor(Math.random() * 1000);
    const s = String(n).padStart(3, "0");
    if (!used.has(s)) {
      used.add(s);
      return s;
    }
  }
  throw new Error("تعذر توليد رمز رقمي فريد.");
}

export async function autoCreateDepartmentAccountsForFormation(input: {
  formationName: string;
  createdByUserId: string | null;
}): Promise<{ ok: true; created: AutoProvisionedDepartmentCredential[] } | { ok: false; message: string }> {
  const formationName = input.formationName.trim();
  if (!isValidFormationName(formationName)) {
    return { ok: false, message: "اختر تشكيلًا صالحًا." };
  }
  if (!isDatabaseConfigured()) {
    return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  }
  await ensureCoreSchema();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ownerRow = await client.query<{ user_id: string | number }>(
      `SELECT user_id FROM college_account_profiles
       WHERE account_kind = 'FORMATION' AND formation_name = $1
       LIMIT 1`,
      [formationName]
    );
    const ownerUserId = ownerRow.rows[0]?.user_id;
    if (ownerUserId == null) {
      await client.query("ROLLBACK");
      return { ok: false, message: "لا يوجد حساب تشكيل لهذا الاسم. أنشئ حساب التشكيل أولًا." };
    }

    const fixedDefs = getFixedFormationSubjectDefinitions(formationName);
    const subjectRows: Array<{ id: number; branch_name: string; branch_type: "DEPARTMENT" | "BRANCH" }> = [];
    if (fixedDefs) {
      for (const def of fixedDefs) {
        const ex = await client.query<{ id: string | number; branch_type: string }>(
          `SELECT id, COALESCE(branch_type, 'DEPARTMENT') AS branch_type
           FROM college_subjects
           WHERE owner_user_id = $1 AND LOWER(TRIM(branch_name)) = LOWER(TRIM($2))
           LIMIT 1`,
          [ownerUserId, def.branch_name]
        );
        const sid = ex.rows[0]?.id;
        if (sid != null) {
          await client.query(
            `UPDATE college_subjects
             SET branch_type = $2, updated_at = NOW()
             WHERE id = $1::bigint`,
            [sid, def.branch_type]
          );
          subjectRows.push({
            id: Number(sid),
            branch_name: def.branch_name,
            branch_type: def.branch_type,
          });
        } else {
          const ins = await client.query<{ id: string | number }>(
            `INSERT INTO college_subjects (owner_user_id, branch_type, branch_name, branch_head_name, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())
             RETURNING id`,
            [ownerUserId, def.branch_type, def.branch_name, def.branch_type === "BRANCH" ? "رئاسة فرع" : "رئاسة قسم"]
          );
          subjectRows.push({
            id: Number(ins.rows[0].id),
            branch_name: def.branch_name,
            branch_type: def.branch_type,
          });
        }
      }
    } else {
      const ex = await client.query<{ id: string | number; branch_name: string; branch_type: string }>(
        `SELECT id, branch_name, COALESCE(branch_type, 'DEPARTMENT') AS branch_type
         FROM college_subjects
         WHERE owner_user_id = $1
         ORDER BY branch_name ASC`,
        [ownerUserId]
      );
      for (const row of ex.rows) {
        subjectRows.push({
          id: Number(row.id),
          branch_name: row.branch_name,
          branch_type: row.branch_type === "BRANCH" ? "BRANCH" : "DEPARTMENT",
        });
      }
    }

    if (subjectRows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, message: "لا توجد أقسام/فروع مرتبطة بهذا التشكيل لتكوين الحسابات." };
    }

    const linked = await client.query<{ college_subject_id: string | number }>(
      `SELECT college_subject_id
       FROM college_account_profiles
       WHERE account_kind = 'DEPARTMENT' AND college_subject_id IS NOT NULL`
    );
    const linkedSet = new Set(linked.rows.map((r) => Number(r.college_subject_id)));
    const targets = subjectRows.filter((s) => !linkedSet.has(s.id));
    if (targets.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, message: "كل الأقسام/الفروع في هذا التشكيل لديها حسابات بالفعل." };
    }

    const actorId =
      input.createdByUserId && /^[0-9]+$/.test(input.createdByUserId.trim()) ? input.createdByUserId.trim() : null;
    const existingUsers = await client.query<{ username: string }>(
      `SELECT LOWER(TRIM(username::text)) AS username FROM users WHERE deleted_at IS NULL`
    );
    const usedUsernames = new Set(existingUsers.rows.map((r) => r.username));
    const usedRandomCodes = new Set<string>();
    const created: AutoProvisionedDepartmentCredential[] = [];
    const formationPrefix = formationPrefixTwoLetters(formationName);
    const formationPassPrefix = passwordPrefixPart(formationName);

    for (let i = 0; i < targets.length; i += 1) {
      const t = targets[i];
      const headTitle = t.branch_type === "BRANCH" ? "رئاسة فرع" : "رئاسة قسم";
      const baseWord = branchUsernameWord(t.branch_name, i);
      let username = `${formationPrefix}${baseWord}`;
      if (username.length < 3) username = `${formationPrefix}unit${i + 1}`;
      if (username.length > 100) username = username.slice(0, 100);
      let counter = 1;
      while (usedUsernames.has(username)) {
        const suffix = String(counter);
        const cut = Math.max(1, 100 - suffix.length);
        username = `${username.slice(0, cut)}${suffix}`;
        counter += 1;
      }
      usedUsernames.add(username);

      const branchPassPrefix = passwordPrefixPart(t.branch_name);
      const password = `${formationPassPrefix}${branchPassPrefix}#${randomThreeDigits(usedRandomCodes)}`;
      const hash = hashPassword(password);

      const insUser = await client.query<{ id: string | number }>(
        `INSERT INTO users
          (full_name, username, email, phone, password_hash, role, status, must_change_password,
           failed_login_attempts, created_at, updated_at, created_by)
         VALUES ($1, $2, NULL, NULL, $3, 'COLLEGE', 'ACTIVE', FALSE, 0, NOW(), NOW(), $4)
         RETURNING id`,
        [headTitle, username, hash, actorId]
      );
      const userId = insUser.rows[0].id;

      await client.query(
        `INSERT INTO college_account_profiles
          (user_id, formation_name, dean_name, holder_name, account_kind, college_subject_id, created_at, updated_at)
         VALUES ($1, $2, $3, NULL, 'DEPARTMENT', $4, NOW(), NOW())`,
        [userId, formationName, headTitle, t.id]
      );

      const legacyCol = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password' LIMIT 1`
      );
      if ((legacyCol.rowCount ?? 0) > 0) {
        await client.query(`UPDATE users SET password = $1 WHERE id = $2`, [hash, userId]);
      }

      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, target_user_id, metadata)
         VALUES ($1, 'COLLEGE_ACCOUNT_CREATED', $2, $3)`,
        [
          actorId,
          /^[0-9]+$/.test(String(userId)) ? String(userId) : null,
          JSON.stringify({
            accountKind: "DEPARTMENT",
            formationName,
            collegeSubjectId: t.id,
            branchName: t.branch_name,
            autoProvisioned: true,
            username,
          }),
        ]
      );

      created.push({
        branchName: t.branch_name,
        branchType: t.branch_type,
        username,
        password,
      });
    }

    await client.query("COMMIT");
    return { ok: true, created };
  } catch (e: unknown) {
    await client.query("ROLLBACK");
    console.error("[autoCreateDepartmentAccountsForFormation]", e);
    return { ok: false, message: "تعذر تكوين الحسابات تلقائيًا." };
  } finally {
    client.release();
  }
}

export async function createCollegeAccount(input: {
  accountKind: CollegeAccountKind;
  formationName: string;
  deanName: string;
  holderName: string;
  /** معرّف قسم مسجّل، أو قيمة create:… عند الاختيار من قائمة معتمدة بدون سجل بعد */
  collegeSubjectId?: string;
  /** عند التشكيلات بدون قائمة ثابتة ولا أقسام مسجّلة بعد: اسم القسم/الفرع الجديد */
  newBranchName?: string;
  newBranchType?: string;
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
  let collegeSubjectId: number | null = null;
  let departmentSubjectPick: DepartmentSubjectPick | null = null;

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
  } else if (input.accountKind === "DEPARTMENT") {
    const fn = input.formationName.trim();
    const head = input.deanName.trim();
    if (!isValidFormationName(fn)) {
      return { ok: false, message: "اختر تشكيلًا صالحًا من القائمة." };
    }
    if (head.length < 2) {
      return { ok: false, message: "يرجى إدخال اسم رئيس القسم أو الفرع (حرفان على الأقل)." };
    }
    formationName = fn;
    deanName = head;
    fullNameForUser = head;
    const pickResult = parseDepartmentSubjectPick({
      formationNameTrimmed: fn,
      collegeSubjectIdRaw: input.collegeSubjectId ?? "",
      newBranchName: input.newBranchName,
      newBranchType: input.newBranchType,
    });
    if (!pickResult.ok) {
      return { ok: false, message: pickResult.message };
    }
    departmentSubjectPick = pickResult.pick;
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
        `SELECT 1 FROM college_account_profiles
         WHERE account_kind = 'FORMATION' AND formation_name = $1 LIMIT 1`,
        [formationName]
      );
      if ((dupFormation.rowCount ?? 0) > 0) {
        await client.query("ROLLBACK");
        return { ok: false, message: "يوجد بالفعل حساب تشكيل لهذا الاسم." };
      }
    }

    if (input.accountKind === "DEPARTMENT" && formationName && departmentSubjectPick) {
      const fRow = await client.query<{ user_id: string | number }>(
        `SELECT user_id FROM college_account_profiles
         WHERE account_kind = 'FORMATION' AND formation_name = $1 LIMIT 1`,
        [formationName]
      );
      const formationOwnerId = fRow.rows[0]?.user_id;
      if (formationOwnerId == null) {
        await client.query("ROLLBACK");
        return {
          ok: false,
          message: "لا يوجد حساب تشكيل لهذا الاسم. أنشئ حساب التشكيل أولاً من هذه الصفحة.",
        };
      }

      const head = deanName ?? "";
      let resolvedSubjectId: number;

      if (departmentSubjectPick.mode === "create") {
        const { branchName, branchType } = departmentSubjectPick;
        const ex = await client.query<{ id: string | number }>(
          `SELECT id FROM college_subjects
           WHERE owner_user_id = $1 AND LOWER(TRIM(branch_name)) = LOWER(TRIM($2))
           LIMIT 1`,
          [formationOwnerId, branchName]
        );
        const existingId = ex.rows[0]?.id;
        if (existingId != null) {
          resolvedSubjectId = Number(existingId);
          await client.query(
            `UPDATE college_subjects
             SET branch_head_name = $2, branch_type = $3, updated_at = NOW()
             WHERE id = $1::bigint AND owner_user_id = $4`,
            [resolvedSubjectId, head, branchType, formationOwnerId]
          );
        } else {
          const ins = await client.query<{ id: string | number }>(
            `INSERT INTO college_subjects (owner_user_id, branch_type, branch_name, branch_head_name, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())
             RETURNING id`,
            [formationOwnerId, branchType, branchName, head]
          );
          resolvedSubjectId = Number(ins.rows[0].id);
        }
      } else {
        resolvedSubjectId = departmentSubjectPick.id;
        const subOk = await client.query(
          `SELECT 1 FROM college_subjects
           WHERE id = $1::bigint AND owner_user_id = $2 LIMIT 1`,
          [resolvedSubjectId, formationOwnerId]
        );
        if ((subOk.rowCount ?? 0) === 0) {
          await client.query("ROLLBACK");
          return { ok: false, message: "القسم/الفرع المختار لا يتبع هذا التشكيل أو غير موجود." };
        }
      }

      const dupDept = await client.query(
        `SELECT 1 FROM college_account_profiles WHERE college_subject_id = $1::bigint LIMIT 1`,
        [resolvedSubjectId]
      );
      if ((dupDept.rowCount ?? 0) > 0) {
        await client.query("ROLLBACK");
        return { ok: false, message: "يوجد بالفعل حساب مرتبط بهذا القسم/الفرع." };
      }

      collegeSubjectId = resolvedSubjectId;
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
        (user_id, formation_name, dean_name, holder_name, account_kind, college_subject_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [
        newUserId,
        formationName,
        deanName,
        holderName,
        input.accountKind,
        input.accountKind === "DEPARTMENT" ? collegeSubjectId : null,
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
          collegeSubjectId: input.accountKind === "DEPARTMENT" ? collegeSubjectId : undefined,
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
      return { ok: false, message: "تعذر الحفظ: بيانات مكررة (مستخدم أو تشكيل أو قسم)." };
    }
    console.error("[createCollegeAccount]", e);
    return { ok: false, message: "حدث خطأ أثناء حفظ الحساب." };
  } finally {
    client.release();
  }
}

/**
 * عمود audit_logs.target_user_id قد يكون BIGINT بينما users.id قد يكون UUID — نُدرج القيمة فقط إن كانت أرقاماً فقط.
 * وإلا نُمرّر null ونُضمّن المعرّف في metadata.
 */
function auditTargetUserIdColumnValue(userId: string): string | null {
  return /^[0-9]+$/.test(userId.trim()) ? userId.trim() : null;
}

/** يتحقق من أن معرّف السجل يطابق حساب كلية نشطًا (غير محذوف) ويعيد user_id */
async function resolveCollegeUserIdForProfile(profileId: string): Promise<string | null> {
  const id = profileId.trim();
  if (!/^[0-9]+$/.test(id)) return null;
  if (!isDatabaseConfigured()) return null;
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{ user_id: string }>(
    `SELECT p.user_id::text AS user_id
     FROM college_account_profiles p
     INNER JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
     WHERE p.id = $1::bigint AND u.role = 'COLLEGE'
     LIMIT 1`,
    [id]
  );
  return r.rows[0]?.user_id ?? null;
}

export async function updateCollegeAccountUserPassword(input: {
  profileId: string;
  password: string;
  confirmPassword: string;
  actorUserId: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (input.password.length < 8) {
    return { ok: false, message: "كلمة المرور يجب أن تكون 8 أحرف على الأقل." };
  }
  if (input.password !== input.confirmPassword) {
    return { ok: false, message: "كلمة المرور وتأكيدها غير متطابقتين." };
  }
  const userId = await resolveCollegeUserIdForProfile(input.profileId);
  if (!userId) {
    return { ok: false, message: "لم يُعثر على الحساب أو أنه غير صالح." };
  }
  if (!isDatabaseConfigured()) {
    return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  }
  await ensureCoreSchema();
  const pool = getDbPool();
  const hash = hashPassword(input.password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const up = await client.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND role = 'COLLEGE' AND deleted_at IS NULL`,
      [hash, userId]
    );
    if ((up.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return { ok: false, message: "تعذر تحديث كلمة المرور." };
    }
    const legacyCol = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password' LIMIT 1`
    );
    if ((legacyCol.rowCount ?? 0) > 0) {
      await client.query(`UPDATE users SET password = $1 WHERE id = $2`, [hash, userId]);
    }
    const actorForAudit =
      input.actorUserId && /^[0-9]+$/.test(input.actorUserId.trim()) ? input.actorUserId.trim() : null;
    const targetForAudit = auditTargetUserIdColumnValue(userId);
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, target_user_id, metadata)
       VALUES ($1, 'COLLEGE_ACCOUNT_PASSWORD_CHANGED', $2, $3)`,
      [
        actorForAudit,
        targetForAudit,
        JSON.stringify({
          profileId: input.profileId.trim(),
          targetUserIdText: userId,
        }),
      ]
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (e: unknown) {
    await client.query("ROLLBACK");
    console.error("[updateCollegeAccountUserPassword]", e);
    return { ok: false, message: "تعذر تحديث كلمة المرور." };
  } finally {
    client.release();
  }
}

export async function setCollegeAccountUserDisabled(input: {
  profileId: string;
  disabled: boolean;
  actorUserId: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await resolveCollegeUserIdForProfile(input.profileId);
  if (!userId) {
    return { ok: false, message: "لم يُعثر على الحساب أو أنه غير صالح." };
  }
  if (!isDatabaseConfigured()) {
    return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  }
  await ensureCoreSchema();
  const pool = getDbPool();
  const status = input.disabled ? "DISABLED" : "ACTIVE";
  try {
    const up = await pool.query(
      `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 AND role = 'COLLEGE' AND deleted_at IS NULL`,
      [status, userId]
    );
    if ((up.rowCount ?? 0) === 0) {
      return { ok: false, message: "تعذر تحديث حالة الحساب." };
    }
    const actorForAudit =
      input.actorUserId && /^[0-9]+$/.test(input.actorUserId.trim()) ? input.actorUserId.trim() : null;
    const targetForAudit = auditTargetUserIdColumnValue(userId);
    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, action, target_user_id, metadata)
       VALUES ($1, $2, $3, $4)`,
      [
        actorForAudit,
        input.disabled ? "COLLEGE_ACCOUNT_DISABLED" : "COLLEGE_ACCOUNT_ENABLED",
        targetForAudit,
        JSON.stringify({
          profileId: input.profileId.trim(),
          targetUserIdText: userId,
        }),
      ]
    );
    return { ok: true };
  } catch (e: unknown) {
    console.error("[setCollegeAccountUserDisabled]", e);
    return { ok: false, message: "تعذر تحديث حالة الحساب." };
  }
}

/** حذف المستخدم من قاعدة البيانات (CASCADE يزيل الملف والبيانات المرتبطة بحسب المخطط). */
export async function deleteCollegeAccountPermanently(
  profileId: string,
  actorUserId: string | null
): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await resolveCollegeUserIdForProfile(profileId);
  if (!userId) {
    return { ok: false, message: "لم يُعثر على الحساب أو أنه غير صالح." };
  }
  if (!isDatabaseConfigured()) {
    return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  }
  await ensureCoreSchema();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const actorForAudit =
      actorUserId && /^[0-9]+$/.test(actorUserId.trim()) ? actorUserId.trim() : null;
    const targetForAudit = auditTargetUserIdColumnValue(userId);
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, target_user_id, metadata)
       VALUES ($1, 'COLLEGE_ACCOUNT_PURGED', $2, $3)`,
      [
        actorForAudit,
        targetForAudit,
        JSON.stringify({
          profileId: profileId.trim(),
          hard: true,
          targetUserIdText: userId,
        }),
      ]
    );
    const del = await client.query(
      `DELETE FROM users WHERE id = $1 AND role = 'COLLEGE' AND deleted_at IS NULL`,
      [userId]
    );
    if ((del.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return { ok: false, message: "تعذر حذف الحساب." };
    }
    await client.query("COMMIT");
    return { ok: true };
  } catch (e: unknown) {
    await client.query("ROLLBACK");
    console.error("[deleteCollegeAccountPermanently]", e);
    return { ok: false, message: "تعذر حذف الحساب (قد تكون هناك بيانات مرتبطة تمنع الحذف)." };
  } finally {
    client.release();
  }
}
