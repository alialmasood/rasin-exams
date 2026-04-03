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
      role VARCHAR(30) NOT NULL CHECK (role IN ('SUPER_ADMIN','ADMIN','MANAGER','USER','COLLEGE')),
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

  await widenUsersRoleCheckForCollege(pool);

  await ensureCollegeAccountProfilesTable(pool);
  await ensureCollegeSubjectsTable(pool);
  await ensureCollegeStudySubjectsTable(pool);
  await ensureCollegeExamRoomsTable(pool);
  await ensureCollegeExamSchedulesTable(pool);
  await ensureCollegeHolidaysTable(pool);
  await ensureCollegeExamSituationReportsTable(pool);
  await ensureCollegeSituationFormSubmissionsTable(pool);

  await createIndexSafe(
    pool,
    "idx_college_profiles_user",
    "CREATE INDEX IF NOT EXISTS idx_college_profiles_user ON college_account_profiles(user_id)"
  );
  await createIndexSafe(
    pool,
    "idx_college_subjects_owner",
    "CREATE INDEX IF NOT EXISTS idx_college_subjects_owner ON college_subjects(owner_user_id)"
  );
  await createIndexSafe(
    pool,
    "idx_college_study_subjects_owner",
    "CREATE INDEX IF NOT EXISTS idx_college_study_subjects_owner ON college_study_subjects(owner_user_id)"
  );
  await createIndexSafe(
    pool,
    "idx_college_study_subjects_branch",
    "CREATE INDEX IF NOT EXISTS idx_college_study_subjects_branch ON college_study_subjects(college_subject_id)"
  );
  await createIndexSafe(
    pool,
    "idx_college_exam_rooms_owner",
    "CREATE INDEX IF NOT EXISTS idx_college_exam_rooms_owner ON college_exam_rooms(owner_user_id)"
  );
  await createIndexSafe(
    pool,
    "idx_college_exam_rooms_subject",
    "CREATE INDEX IF NOT EXISTS idx_college_exam_rooms_subject ON college_exam_rooms(study_subject_id)"
  );
  await createIndexSafe(
    pool,
    "idx_college_exam_schedules_owner",
    "CREATE INDEX IF NOT EXISTS idx_college_exam_schedules_owner ON college_exam_schedules(owner_user_id)"
  );
  await createIndexSafe(
    pool,
    "idx_college_exam_schedules_date",
    "CREATE INDEX IF NOT EXISTS idx_college_exam_schedules_date ON college_exam_schedules(exam_date, start_time)"
  );
  await createIndexSafe(
    pool,
    "idx_college_exam_schedules_status",
    "CREATE INDEX IF NOT EXISTS idx_college_exam_schedules_status ON college_exam_schedules(workflow_status)"
  );
  await createIndexSafe(
    pool,
    "idx_college_holidays_owner_date",
    "CREATE INDEX IF NOT EXISTS idx_college_holidays_owner_date ON college_holidays(owner_user_id, holiday_date)"
  );
  await createIndexSafe(
    pool,
    "idx_college_exam_situations_schedule",
    "CREATE INDEX IF NOT EXISTS idx_college_exam_situations_schedule ON college_exam_situation_reports(owner_user_id, exam_schedule_id)"
  );
  await createIndexSafe(
    pool,
    "idx_college_situation_form_sub_owner",
    "CREATE INDEX IF NOT EXISTS idx_college_situation_form_sub_owner ON college_situation_form_submissions(owner_user_id, submitted_at DESC)"
  );

  coreReady = true;
}

/** نوع users.id في القاعدة الفعلية (قد يكون INTEGER قديماً بينما المخطط الجديد BIGSERIAL). */
async function getUsersIdSqlType(pool: Pool): Promise<string> {
  const r = await pool.query<{
    udt_name: string;
    data_type: string;
    character_maximum_length: number | null;
  }>(
    `SELECT udt_name, data_type, character_maximum_length
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'`
  );
  const row = r.rows[0];
  if (!row) {
    throw new Error("لم يُعثر على عمود public.users.id");
  }
  switch (row.udt_name) {
    case "int4":
      return "INTEGER";
    case "int8":
      return "BIGINT";
    case "uuid":
      return "UUID";
    case "varchar":
      return row.character_maximum_length != null
        ? `VARCHAR(${row.character_maximum_length})`
        : "VARCHAR(100)";
    case "text":
      return "TEXT";
    default:
      throw new Error(
        `نوع public.users.id غير مدعوم تلقائيًا لجدول college_account_profiles: ${row.udt_name}. عدّل الجدول يدويًا أو أضف الدعم في getUsersIdSqlType.`
      );
  }
}

async function constraintExists(pool: Pool, constraintName: string) {
  const x = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = $1
     ) AS exists`,
    [constraintName]
  );
  return Boolean(x.rows[0]?.exists);
}

/**
 * إنشاء الجدول بدون REFERENCES في CREATE (حتى لا يفشل إذا كان نوع id مختلفًا)،
 * ثم إضافة المفتاح الأجنبي بـ ALTER إن أمكن.
 */
async function ensureCollegeAccountProfilesTable(pool: Pool) {
  const userIdType = await getUsersIdSqlType(pool);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS college_account_profiles (
      id BIGSERIAL PRIMARY KEY,
      user_id ${userIdType} NOT NULL,
      formation_name VARCHAR(300),
      dean_name VARCHAR(200),
      holder_name VARCHAR(200),
      account_kind VARCHAR(20) NOT NULL DEFAULT 'FORMATION',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id),
      UNIQUE (formation_name)
    );
  `);

  await alignCollegeAccountProfilesColumns(pool);

  if (await constraintExists(pool, "college_account_profiles_user_id_fkey")) {
    return;
  }

  try {
    await pool.query(`
      ALTER TABLE public.college_account_profiles
      ADD CONSTRAINT college_account_profiles_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
    `);
  } catch (err: unknown) {
    const msg = String((err as { message?: string }).message ?? "");
    if (msg.includes("already exists")) return;
    if (isPermissionError(err)) {
      console.warn(
        "[schema] تعذر إضافة المفتاح الأجنبي college_account_profiles.user_id → users.id. تحقق من الصلاحيات أو شغّل database/migrations/005_college_account_profiles.sql كـ postgres."
      );
      return;
    }
    /* جدول قديم بعمود user_id بنوع لا يطابق users.id — يحتاج إصلاح يدوي */
    if (msg.includes("cannot be implemented") || msg.includes("incompatible")) {
      console.warn(
        "[schema] تعذر ربط college_account_profiles.user_id بـ users.id (غالبًا عدم تطابق النوع). " +
          "احذف الجدول college_account_profiles وأعد تشغيل التطبيق، أو عدّل نوع user_id ليطابق users.id."
      );
      return;
    }
    throw err;
  }
}

async function alignCollegeAccountProfilesColumns(pool: Pool) {
  const run = async (sql: string) => {
    try {
      await pool.query(sql);
    } catch (err: unknown) {
      if (isPermissionError(err)) {
        console.warn("[schema] تعذر توسيع college_account_profiles (صلاحيات). شغّل الترحيل كـ postgres.");
        return;
      }
      throw err;
    }
  };
  await run(
    `ALTER TABLE public.college_account_profiles ADD COLUMN IF NOT EXISTS holder_name VARCHAR(200)`
  );
  await run(
    `ALTER TABLE public.college_account_profiles ADD COLUMN IF NOT EXISTS account_kind VARCHAR(20) NOT NULL DEFAULT 'FORMATION'`
  );
  try {
    await pool.query(
      `ALTER TABLE public.college_account_profiles ALTER COLUMN formation_name DROP NOT NULL`
    );
  } catch (err: unknown) {
    if (!isPermissionError(err)) {
      const msg = String((err as { message?: string }).message ?? "");
      if (!msg.includes("does not exist") && !msg.includes("column \"formation_name\"")) throw err;
    }
  }
  try {
    await pool.query(`ALTER TABLE public.college_account_profiles ALTER COLUMN dean_name DROP NOT NULL`);
  } catch (err: unknown) {
    if (!isPermissionError(err)) {
      const msg = String((err as { message?: string }).message ?? "");
      if (!msg.includes("does not exist") && !msg.includes("column \"dean_name\"")) throw err;
    }
  }
}

async function ensureCollegeSubjectsTable(pool: Pool) {
  const userIdType = await getUsersIdSqlType(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS college_subjects (
      id BIGSERIAL PRIMARY KEY,
      owner_user_id ${userIdType} NOT NULL,
      branch_type VARCHAR(20) NOT NULL DEFAULT 'DEPARTMENT',
      branch_name VARCHAR(200) NOT NULL,
      branch_head_name VARCHAR(200) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  try {
    await pool.query(
      `ALTER TABLE public.college_subjects ADD COLUMN IF NOT EXISTS branch_type VARCHAR(20) NOT NULL DEFAULT 'DEPARTMENT'`
    );
    await pool.query(
      `UPDATE public.college_subjects
       SET branch_type = 'DEPARTMENT'
       WHERE branch_type IS NULL OR TRIM(branch_type) = ''`
    );
  } catch (err: unknown) {
    if (!isPermissionError(err)) throw err;
    console.warn("[schema] تعذر توسيع college_subjects بإضافة branch_type (صلاحيات).");
  }

  if (await constraintExists(pool, "college_subjects_owner_user_id_fkey")) {
    return;
  }
  try {
    await pool.query(`
      ALTER TABLE public.college_subjects
      ADD CONSTRAINT college_subjects_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE
    `);
  } catch (err: unknown) {
    const msg = String((err as { message?: string }).message ?? "");
    if (msg.includes("already exists")) return;
    if (isPermissionError(err)) {
      console.warn("[schema] تعذر إضافة المفتاح الأجنبي college_subjects.owner_user_id -> users.id");
      return;
    }
    if (msg.includes("cannot be implemented") || msg.includes("incompatible")) {
      console.warn("[schema] تعذر ربط college_subjects.owner_user_id بسبب عدم تطابق نوع users.id");
      return;
    }
    throw err;
  }
}

async function ensureCollegeStudySubjectsTable(pool: Pool) {
  const userIdType = await getUsersIdSqlType(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS college_study_subjects (
      id BIGSERIAL PRIMARY KEY,
      owner_user_id ${userIdType} NOT NULL,
      college_subject_id BIGINT NOT NULL,
      subject_name VARCHAR(220) NOT NULL,
      study_type VARCHAR(20) NOT NULL DEFAULT 'ANNUAL',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  try {
    await pool.query(
      `ALTER TABLE public.college_study_subjects ADD COLUMN IF NOT EXISTS study_type VARCHAR(20) NOT NULL DEFAULT 'ANNUAL'`
    );
    await pool.query(
      `UPDATE public.college_study_subjects
       SET study_type = 'ANNUAL'
       WHERE study_type IS NULL OR TRIM(study_type) = ''`
    );
  } catch (err: unknown) {
    if (!isPermissionError(err)) throw err;
    console.warn("[schema] تعذر توسيع college_study_subjects بإضافة study_type (صلاحيات).");
  }

  try {
    await pool.query(
      `ALTER TABLE public.college_study_subjects ADD COLUMN IF NOT EXISTS study_stage_level INTEGER NOT NULL DEFAULT 1`
    );
    await pool.query(
      `UPDATE public.college_study_subjects
       SET study_stage_level = 1
       WHERE study_stage_level IS NULL`
    );
  } catch (err: unknown) {
    if (!isPermissionError(err)) throw err;
    console.warn("[schema] تعذر توسيع college_study_subjects بإضافة study_stage_level (صلاحيات).");
  }

  try {
    await pool.query(
      `ALTER TABLE public.college_study_subjects ADD COLUMN IF NOT EXISTS instructor_name VARCHAR(200) NOT NULL DEFAULT ''`
    );
  } catch (err: unknown) {
    if (!isPermissionError(err)) throw err;
    console.warn("[schema] تعذر توسيع college_study_subjects بإضافة instructor_name (صلاحيات).");
  }

  if (!(await constraintExists(pool, "college_study_subjects_owner_user_id_fkey"))) {
    try {
      await pool.query(`
        ALTER TABLE public.college_study_subjects
        ADD CONSTRAINT college_study_subjects_owner_user_id_fkey
        FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE
      `);
    } catch (err: unknown) {
      const msg = String((err as { message?: string }).message ?? "");
      if (!msg.includes("already exists") && !isPermissionError(err)) throw err;
    }
  }

  if (!(await constraintExists(pool, "college_study_subjects_college_subject_id_fkey"))) {
    try {
      await pool.query(`
        ALTER TABLE public.college_study_subjects
        ADD CONSTRAINT college_study_subjects_college_subject_id_fkey
        FOREIGN KEY (college_subject_id) REFERENCES public.college_subjects(id) ON DELETE CASCADE
      `);
    } catch (err: unknown) {
      const msg = String((err as { message?: string }).message ?? "");
      if (!msg.includes("already exists") && !isPermissionError(err)) throw err;
    }
  }
}

async function ensureCollegeExamRoomsTable(pool: Pool) {
  const userIdType = await getUsersIdSqlType(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS college_exam_rooms (
      id BIGSERIAL PRIMARY KEY,
      owner_user_id ${userIdType} NOT NULL,
      study_subject_id BIGINT NOT NULL,
      serial_no INTEGER NOT NULL,
      room_name VARCHAR(200) NOT NULL,
      supervisor_name VARCHAR(200) NOT NULL,
      invigilators TEXT,
      capacity_total INTEGER NOT NULL DEFAULT 0,
      attendance_count INTEGER NOT NULL DEFAULT 0,
      absence_count INTEGER NOT NULL DEFAULT 0,
      absence_names TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  if (!(await constraintExists(pool, "college_exam_rooms_owner_user_id_fkey"))) {
    try {
      await pool.query(`
        ALTER TABLE public.college_exam_rooms
        ADD CONSTRAINT college_exam_rooms_owner_user_id_fkey
        FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE
      `);
    } catch (err: unknown) {
      const msg = String((err as { message?: string }).message ?? "");
      if (!msg.includes("already exists") && !isPermissionError(err)) throw err;
    }
  }

  if (!(await constraintExists(pool, "college_exam_rooms_study_subject_id_fkey"))) {
    try {
      await pool.query(`
        ALTER TABLE public.college_exam_rooms
        ADD CONSTRAINT college_exam_rooms_study_subject_id_fkey
        FOREIGN KEY (study_subject_id) REFERENCES public.college_study_subjects(id) ON DELETE RESTRICT
      `);
    } catch (err: unknown) {
      const msg = String((err as { message?: string }).message ?? "");
      if (!msg.includes("already exists") && !isPermissionError(err)) throw err;
    }
  }

  try {
    await pool.query(
      `ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS capacity_morning INTEGER NOT NULL DEFAULT 0`
    );
    await pool.query(
      `ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS capacity_evening INTEGER NOT NULL DEFAULT 0`
    );
    await pool.query(
      `ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS study_subject_id_2 BIGINT`
    );
    await pool.query(
      `ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS supervisor_name_2 VARCHAR(200)`
    );
    await pool.query(`ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS invigilators_2 TEXT`);
    await pool.query(
      `ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS capacity_morning_2 INTEGER NOT NULL DEFAULT 0`
    );
    await pool.query(
      `ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS capacity_evening_2 INTEGER NOT NULL DEFAULT 0`
    );
    await pool.query(
      `ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS capacity_total_2 INTEGER NOT NULL DEFAULT 0`
    );
    await pool.query(
      `ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS attendance_count_2 INTEGER NOT NULL DEFAULT 0`
    );
    await pool.query(
      `ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS absence_count_2 INTEGER NOT NULL DEFAULT 0`
    );
    await pool.query(`ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS absence_names_2 TEXT`);
    await pool.query(
      `ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS stage_level SMALLINT NOT NULL DEFAULT 1`
    );
    await pool.query(`ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS stage_level_2 SMALLINT`);
    await pool.query(
      `ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS attendance_morning INTEGER NOT NULL DEFAULT 0`
    );
    await pool.query(
      `ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS absence_morning INTEGER NOT NULL DEFAULT 0`
    );
    await pool.query(
      `ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS attendance_evening INTEGER NOT NULL DEFAULT 0`
    );
    await pool.query(
      `ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS absence_evening INTEGER NOT NULL DEFAULT 0`
    );
    await pool.query(`ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS absence_names_morning TEXT`);
    await pool.query(`ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS absence_names_evening TEXT`);
    await pool.query(
      `ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS attendance_morning_2 INTEGER NOT NULL DEFAULT 0`
    );
    await pool.query(
      `ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS absence_morning_2 INTEGER NOT NULL DEFAULT 0`
    );
    await pool.query(
      `ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS attendance_evening_2 INTEGER NOT NULL DEFAULT 0`
    );
    await pool.query(
      `ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS absence_evening_2 INTEGER NOT NULL DEFAULT 0`
    );
    await pool.query(`ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS absence_names_morning_2 TEXT`);
    await pool.query(`ALTER TABLE public.college_exam_rooms ADD COLUMN IF NOT EXISTS absence_names_evening_2 TEXT`);
    await pool.query(`
      UPDATE public.college_exam_rooms
      SET capacity_morning = capacity_total
      WHERE capacity_morning = 0 AND capacity_evening = 0 AND COALESCE(capacity_total, 0) > 0
    `);
    await pool.query(`
      UPDATE public.college_exam_rooms
      SET
        attendance_morning = attendance_count,
        absence_morning = absence_count,
        absence_names_morning = absence_names
      WHERE attendance_morning = 0 AND absence_morning = 0 AND attendance_evening = 0 AND absence_evening = 0
        AND (
          attendance_count > 0 OR absence_count > 0
          OR TRIM(COALESCE(absence_names, '')) <> ''
        )
    `);
    await pool.query(`
      UPDATE public.college_exam_rooms
      SET
        attendance_morning_2 = attendance_count_2,
        absence_morning_2 = absence_count_2,
        absence_names_morning_2 = absence_names_2
      WHERE attendance_morning_2 = 0 AND absence_morning_2 = 0 AND attendance_evening_2 = 0 AND absence_evening_2 = 0
        AND (
          attendance_count_2 > 0 OR absence_count_2 > 0
          OR TRIM(COALESCE(absence_names_2, '')) <> ''
        )
    `);
  } catch (err: unknown) {
    if (!isPermissionError(err)) throw err;
    console.warn("[schema] تعذر توسيع college_exam_rooms (سعة صباحية/مسائية أو امتحان ثانٍ).");
  }

  if (!(await constraintExists(pool, "college_exam_rooms_study_subject_id_2_fkey"))) {
    try {
      await pool.query(`
        ALTER TABLE public.college_exam_rooms
        ADD CONSTRAINT college_exam_rooms_study_subject_id_2_fkey
        FOREIGN KEY (study_subject_id_2) REFERENCES public.college_study_subjects(id) ON DELETE RESTRICT
      `);
    } catch (err: unknown) {
      const msg = String((err as { message?: string }).message ?? "");
      if (!msg.includes("already exists") && !isPermissionError(err)) throw err;
    }
  }

  await createIndexSafe(
    pool,
    "idx_college_exam_rooms_subject_2",
    "CREATE INDEX IF NOT EXISTS idx_college_exam_rooms_subject_2 ON college_exam_rooms(study_subject_id_2)"
  );
}

async function ensureCollegeExamSchedulesTable(pool: Pool) {
  const userIdType = await getUsersIdSqlType(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS college_exam_schedules (
      id BIGSERIAL PRIMARY KEY,
      owner_user_id ${userIdType} NOT NULL,
      college_subject_id BIGINT NOT NULL,
      study_subject_id BIGINT NOT NULL,
      room_id BIGINT NOT NULL,
      schedule_type VARCHAR(40) NOT NULL DEFAULT 'FINAL',
      workflow_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
      stage_level SMALLINT NOT NULL DEFAULT 1,
      term_label VARCHAR(140),
      exam_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  try {
    await pool.query(
      `ALTER TABLE public.college_exam_schedules ADD COLUMN IF NOT EXISTS workflow_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'`
    );
    await pool.query(
      `UPDATE public.college_exam_schedules
       SET workflow_status = 'DRAFT'
       WHERE workflow_status IS NULL OR TRIM(workflow_status) = ''`
    );
  } catch (err: unknown) {
    if (!isPermissionError(err)) throw err;
  }
  try {
    await pool.query(
      `ALTER TABLE public.college_exam_schedules ADD COLUMN IF NOT EXISTS stage_level SMALLINT NOT NULL DEFAULT 1`
    );
  } catch (err: unknown) {
    if (!isPermissionError(err)) throw err;
  }
  try {
    await pool.query(
      `ALTER TABLE public.college_exam_schedules ADD COLUMN IF NOT EXISTS academic_year VARCHAR(60)`
    );
  } catch (err: unknown) {
    if (!isPermissionError(err)) throw err;
  }

  if (!(await constraintExists(pool, "college_exam_schedules_owner_user_id_fkey"))) {
    try {
      await pool.query(`
        ALTER TABLE public.college_exam_schedules
        ADD CONSTRAINT college_exam_schedules_owner_user_id_fkey
        FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE
      `);
    } catch (err: unknown) {
      const msg = String((err as { message?: string }).message ?? "");
      if (!msg.includes("already exists") && !isPermissionError(err)) throw err;
    }
  }
  if (!(await constraintExists(pool, "college_exam_schedules_college_subject_id_fkey"))) {
    try {
      await pool.query(`
        ALTER TABLE public.college_exam_schedules
        ADD CONSTRAINT college_exam_schedules_college_subject_id_fkey
        FOREIGN KEY (college_subject_id) REFERENCES public.college_subjects(id) ON DELETE RESTRICT
      `);
    } catch (err: unknown) {
      const msg = String((err as { message?: string }).message ?? "");
      if (!msg.includes("already exists") && !isPermissionError(err)) throw err;
    }
  }
  if (!(await constraintExists(pool, "college_exam_schedules_study_subject_id_fkey"))) {
    try {
      await pool.query(`
        ALTER TABLE public.college_exam_schedules
        ADD CONSTRAINT college_exam_schedules_study_subject_id_fkey
        FOREIGN KEY (study_subject_id) REFERENCES public.college_study_subjects(id) ON DELETE RESTRICT
      `);
    } catch (err: unknown) {
      const msg = String((err as { message?: string }).message ?? "");
      if (!msg.includes("already exists") && !isPermissionError(err)) throw err;
    }
  }
  if (!(await constraintExists(pool, "college_exam_schedules_room_id_fkey"))) {
    try {
      await pool.query(`
        ALTER TABLE public.college_exam_schedules
        ADD CONSTRAINT college_exam_schedules_room_id_fkey
        FOREIGN KEY (room_id) REFERENCES public.college_exam_rooms(id) ON DELETE RESTRICT
      `);
    } catch (err: unknown) {
      const msg = String((err as { message?: string }).message ?? "");
      if (!msg.includes("already exists") && !isPermissionError(err)) throw err;
    }
  }
  try {
    await pool.query(`
      UPDATE public.college_exam_schedules
      SET workflow_status = 'APPROVED', updated_at = NOW()
      WHERE UPPER(TRIM(workflow_status::text)) IN ('SUBMITTED', 'DRAFT')
    `);
  } catch (err: unknown) {
    if (!isPermissionError(err)) throw err;
  }
}

async function ensureCollegeHolidaysTable(pool: Pool) {
  const userIdType = await getUsersIdSqlType(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS college_holidays (
      id BIGSERIAL PRIMARY KEY,
      owner_user_id ${userIdType} NOT NULL,
      holiday_date DATE NOT NULL,
      holiday_name VARCHAR(200) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (owner_user_id, holiday_date, holiday_name)
    );
  `);
  if (!(await constraintExists(pool, "college_holidays_owner_user_id_fkey"))) {
    try {
      await pool.query(`
        ALTER TABLE public.college_holidays
        ADD CONSTRAINT college_holidays_owner_user_id_fkey
        FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE
      `);
    } catch (err: unknown) {
      const msg = String((err as { message?: string }).message ?? "");
      if (!msg.includes("already exists") && !isPermissionError(err)) throw err;
    }
  }
}

/** قواعد قديمة: قيد role لا يتضمن COLLEGE — نوسّعه دون كسر التثبيتات الحالية. */
async function ensureCollegeSituationFormSubmissionsTable(pool: Pool) {
  const userIdType = await getUsersIdSqlType(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS college_situation_form_submissions (
      id BIGSERIAL PRIMARY KEY,
      owner_user_id ${userIdType} NOT NULL,
      college_label_snapshot TEXT NOT NULL,
      payload JSONB NOT NULL,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  if (!(await constraintExists(pool, "college_situation_form_submissions_owner_user_id_fkey"))) {
    try {
      await pool.query(`
        ALTER TABLE public.college_situation_form_submissions
        ADD CONSTRAINT college_situation_form_submissions_owner_user_id_fkey
        FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE
      `);
    } catch (err: unknown) {
      const msg = String((err as { message?: string }).message ?? "");
      if (!msg.includes("already exists") && !isPermissionError(err)) throw err;
    }
  }
}

async function ensureCollegeExamSituationReportsTable(pool: Pool) {
  const userIdType = await getUsersIdSqlType(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS college_exam_situation_reports (
      id BIGSERIAL PRIMARY KEY,
      owner_user_id ${userIdType} NOT NULL,
      exam_schedule_id BIGINT NOT NULL,
      head_submitted_at TIMESTAMPTZ,
      dean_status VARCHAR(20) NOT NULL DEFAULT 'NONE',
      dean_reviewed_at TIMESTAMPTZ,
      dean_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (owner_user_id, exam_schedule_id)
    );
  `);
  if (!(await constraintExists(pool, "college_exam_situation_reports_owner_user_id_fkey"))) {
    try {
      await pool.query(`
        ALTER TABLE public.college_exam_situation_reports
        ADD CONSTRAINT college_exam_situation_reports_owner_user_id_fkey
        FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE
      `);
    } catch (err: unknown) {
      const msg = String((err as { message?: string }).message ?? "");
      if (!msg.includes("already exists") && !isPermissionError(err)) throw err;
    }
  }
  if (!(await constraintExists(pool, "college_exam_situation_reports_exam_schedule_id_fkey"))) {
    try {
      await pool.query(`
        ALTER TABLE public.college_exam_situation_reports
        ADD CONSTRAINT college_exam_situation_reports_exam_schedule_id_fkey
        FOREIGN KEY (exam_schedule_id) REFERENCES public.college_exam_schedules(id) ON DELETE CASCADE
      `);
    } catch (err: unknown) {
      const msg = String((err as { message?: string }).message ?? "");
      if (!msg.includes("already exists") && !isPermissionError(err)) throw err;
    }
  }
}

async function widenUsersRoleCheckForCollege(pool: Pool) {
  try {
    await pool.query(`ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check`);
  } catch (err) {
    if (!isPermissionError(err)) throw err;
  }
  try {
    await pool.query(`
      ALTER TABLE public.users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('SUPER_ADMIN','ADMIN','MANAGER','USER','COLLEGE'))
    `);
  } catch (err: unknown) {
    const msg = String((err as { message?: string }).message ?? "");
    if (msg.includes("already exists") || msg.includes("duplicate")) return;
    if (isPermissionError(err)) {
      console.warn(
        "[schema] تعذر تحديث قيد users_role_check. شغّل database/migrations/005_college_account_profiles.sql كـ postgres إن لزم."
      );
      return;
    }
    throw err;
  }
}
