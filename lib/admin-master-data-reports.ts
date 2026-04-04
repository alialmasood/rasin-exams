import { formatCollegeStudyStageLabel } from "@/lib/college-study-stage-display";
import type { StudyType } from "@/lib/college-study-subjects";
import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";
import { STUDY_TYPE_LABEL_AR } from "@/lib/study-type-labels-ar";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ACCOUNT_KIND_AR: Record<string, string> = {
  FORMATION: "تشكيل / كلية",
  FOLLOWUP: "متابعة مركزية",
};

const STATUS_AR: Record<string, string> = {
  ACTIVE: "نشط",
  DISABLED: "معطّل",
  LOCKED: "مقفل",
  PENDING: "قيد الانتظار",
};

const BRANCH_TYPE_AR: Record<string, string> = {
  DEPARTMENT: "قسم",
  BRANCH: "فرع",
};

function fmtDt(d: Date | null | undefined): string {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("ar-IQ", {
      timeZone: "Asia/Baghdad",
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
  } catch {
    return String(d);
  }
}

function accountKindAr(kind: string | null | undefined): string {
  if (!kind?.trim()) return "—";
  return ACCOUNT_KIND_AR[kind.trim().toUpperCase()] ?? kind;
}

function statusAr(status: string): string {
  return STATUS_AR[status.trim().toUpperCase()] ?? status;
}

function branchTypeAr(t: string): string {
  return BRANCH_TYPE_AR[t.trim().toUpperCase()] ?? t;
}

function formationDisplay(
  accountKind: string | null | undefined,
  formationName: string | null | undefined,
  holderName: string | null | undefined
): string {
  const k = (accountKind ?? "").toUpperCase();
  if (k === "FOLLOWUP") return (holderName ?? "").trim() || "—";
  return (formationName ?? "").trim() || "—";
}

function normalizeStudyType(raw: string): StudyType {
  const v = raw.trim().toUpperCase();
  if (v === "SEMESTER") return "SEMESTER";
  if (v === "COURSES") return "COURSES";
  if (v === "BOLOGNA") return "BOLOGNA";
  return "ANNUAL";
}

function studyTypeAr(raw: string): string {
  return STUDY_TYPE_LABEL_AR[normalizeStudyType(raw)] ?? raw;
}

const PRINT_STYLES = `
    * { box-sizing: border-box; }
    body { font-family: "Tajawal", Tahoma, sans-serif; margin: 0; padding: 16px; color: #0f172a; font-size: 11px; line-height: 1.45; background: #fff; }
    @page { size: A4 landscape; margin: 10mm; }
    @media print { body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    h1 { margin: 0 0 6px; font-size: 18px; color: #1e3a8a; }
    .sub { margin: 0 0 14px; font-size: 12px; color: #475569; }
    .summary { margin: 0 0 12px; padding: 10px 12px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; font-weight: 600; color: #334155; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #94a3b8; padding: 5px 4px; vertical-align: top; word-wrap: break-word; }
    th { background: #e2e8f0; font-weight: 800; color: #0f172a; font-size: 9px; line-height: 1.25; text-align: center; }
    td { text-align: center; font-size: 9px; }
    td.t-right { text-align: right; }
    .n { width: 28px; }
    .mono { font-family: ui-monospace, monospace; font-size: 8px; direction: ltr; text-align: left; }
    .dt { font-size: 8px; white-space: nowrap; }
    .foot { margin-top: 14px; padding-top: 8px; border-top: 1px solid #cbd5e1; font-size: 9px; color: #64748b; text-align: center; }
`;

/* ——— التشكيلات (حسابات الكلية + ملف التشكيل) ——— */

export type AdminFormationsReportRow = {
  user_id: string;
  username: string;
  full_name: string;
  status: string;
  account_kind: string | null;
  formation_name: string | null;
  dean_name: string | null;
  holder_name: string | null;
  user_created_at: Date;
  profile_updated_at: Date;
};

export async function listFormationsForAdminReport(): Promise<AdminFormationsReportRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    user_id: string;
    username: string;
    full_name: string;
    status: string;
    account_kind: string | null;
    formation_name: string | null;
    dean_name: string | null;
    holder_name: string | null;
    user_created_at: Date;
    profile_updated_at: Date;
  }>(
    `SELECT u.id::text AS user_id,
            u.username::text,
            u.full_name,
            u.status::text,
            p.account_kind::text,
            p.formation_name,
            p.dean_name,
            p.holder_name,
            u.created_at AS user_created_at,
            p.updated_at AS profile_updated_at
     FROM users u
     INNER JOIN college_account_profiles p ON p.user_id = u.id
     WHERE u.deleted_at IS NULL AND u.role = 'COLLEGE'
     ORDER BY
       CASE WHEN UPPER(TRIM(COALESCE(p.account_kind::text, ''))) = 'FOLLOWUP' THEN 1 ELSE 0 END,
       LOWER(TRIM(COALESCE(p.formation_name::text, p.holder_name::text, u.username::text))) ASC`
  );
  return r.rows.map((row) => ({
    user_id: row.user_id,
    username: row.username,
    full_name: row.full_name,
    status: row.status,
    account_kind: row.account_kind,
    formation_name: row.formation_name,
    dean_name: row.dean_name,
    holder_name: row.holder_name,
    user_created_at: row.user_created_at,
    profile_updated_at: row.profile_updated_at,
  }));
}

export function buildAdminFormationsReportHtml(rows: AdminFormationsReportRow[], generatedLabel: string): string {
  const z = escapeHtml;
  const summaryLine = `إجمالي التشكيلات والحسابات المسجّلة: ${rows.length}`;
  const tableRows = rows
    .map((row, idx) => {
      const disp = formationDisplay(row.account_kind, row.formation_name, row.holder_name);
      return `<tr>
  <td class="n">${idx + 1}</td>
  <td class="mono">${z(row.user_id)}</td>
  <td class="mono t-right">${z(row.username)}</td>
  <td class="t-right">${z(row.full_name)}</td>
  <td>${z(statusAr(row.status))}</td>
  <td>${z(accountKindAr(row.account_kind))}</td>
  <td class="t-right">${z(disp)}</td>
  <td class="t-right">${z((row.dean_name ?? "").trim() || "—")}</td>
  <td class="dt">${z(fmtDt(row.user_created_at))}</td>
  <td class="dt">${z(fmtDt(row.profile_updated_at))}</td>
</tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>تقرير التشكيلات — رصين</title>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <h1>تقرير التشكيلات المدخَلة في النظام</h1>
  <p class="sub">جامعة البصرة — نظام رصين لإدارة الامتحانات — وقت الإصدار: ${z(generatedLabel)}</p>
  <p class="summary">${z(summaryLine)}</p>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>معرّف المستخدم</th>
        <th>اسم المستخدم</th>
        <th>الاسم المعروض</th>
        <th>حالة الحساب</th>
        <th>نوع الحساب</th>
        <th>اسم التشكيل / وحدة المتابعة</th>
        <th>عميد / معاون</th>
        <th>تاريخ إنشاء الحساب</th>
        <th>آخر تحديث للملف</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <p class="foot">للحفظ PDF: من نافذة الطباعة اختر «حفظ كـ PDF».</p>
</body>
</html>`;
}

/* ——— الأقسام والفروع ——— */

export type AdminCollegeBranchesReportRow = {
  id: string;
  account_kind: string | null;
  formation_name: string | null;
  holder_name: string | null;
  branch_type: string;
  branch_name: string;
  branch_head_name: string;
  created_at: Date;
};

export async function listCollegeBranchesForAdminReport(): Promise<AdminCollegeBranchesReportRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    id: string;
    account_kind: string | null;
    formation_name: string | null;
    holder_name: string | null;
    branch_type: string;
    branch_name: string;
    branch_head_name: string;
    created_at: Date;
  }>(
    `SELECT s.id::text,
            p.account_kind::text,
            p.formation_name,
            p.holder_name,
            COALESCE(s.branch_type, 'DEPARTMENT') AS branch_type,
            s.branch_name,
            s.branch_head_name,
            s.created_at
     FROM college_subjects s
     INNER JOIN users u ON u.id = s.owner_user_id
     INNER JOIN college_account_profiles p ON p.user_id = u.id
     WHERE u.deleted_at IS NULL AND u.role = 'COLLEGE'
     ORDER BY
       LOWER(TRIM(COALESCE(p.formation_name::text, p.holder_name::text, u.username::text))) ASC,
       s.branch_name ASC`
  );
  return r.rows.map((row) => ({
    id: row.id,
    account_kind: row.account_kind,
    formation_name: row.formation_name,
    holder_name: row.holder_name,
    branch_type: row.branch_type,
    branch_name: row.branch_name,
    branch_head_name: row.branch_head_name,
    created_at: row.created_at,
  }));
}

export function buildAdminCollegeBranchesReportHtml(
  rows: AdminCollegeBranchesReportRow[],
  generatedLabel: string
): string {
  const z = escapeHtml;
  const summaryLine = `إجمالي الأقسام والفروع: ${rows.length}`;
  const tableRows = rows
    .map((row, idx) => {
      const disp = formationDisplay(row.account_kind, row.formation_name, row.holder_name);
      return `<tr>
  <td class="n">${idx + 1}</td>
  <td class="mono">${z(row.id)}</td>
  <td class="t-right">${z(disp)}</td>
  <td>${z(branchTypeAr(row.branch_type))}</td>
  <td class="t-right">${z(row.branch_name)}</td>
  <td class="t-right">${z(row.branch_head_name)}</td>
  <td class="dt">${z(fmtDt(row.created_at))}</td>
</tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>تقرير الأقسام والفروع — رصين</title>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <h1>تقرير الأقسام والفروع التابعة للتشكيلات</h1>
  <p class="sub">جامعة البصرة — نظام رصين لإدارة الامتحانات — وقت الإصدار: ${z(generatedLabel)}</p>
  <p class="summary">${z(summaryLine)}</p>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>معرّف السجل</th>
        <th>التشكيل / الوحدة</th>
        <th>النوع</th>
        <th>اسم القسم أو الفرع</th>
        <th>رئيس القسم</th>
        <th>تاريخ الإدخال</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <p class="foot">للحفظ PDF: من نافذة الطباعة اختر «حفظ كـ PDF».</p>
</body>
</html>`;
}

/* ——— المواد الدراسية ——— */

export type AdminStudySubjectsReportRow = {
  id: string;
  account_kind: string | null;
  formation_name: string | null;
  holder_name: string | null;
  branch_name: string;
  branch_type: string;
  subject_name: string;
  instructor_name: string;
  study_type: string;
  study_stage_level: number;
  created_at: Date;
};

export async function listStudySubjectsForAdminReport(): Promise<AdminStudySubjectsReportRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    id: string;
    account_kind: string | null;
    formation_name: string | null;
    holder_name: string | null;
    branch_name: string;
    branch_type: string;
    subject_name: string;
    instructor_name: string;
    study_type: string;
    study_stage_level: number | string;
    created_at: Date;
  }>(
    `SELECT s.id::text,
            p.account_kind::text,
            p.formation_name,
            p.holder_name,
            c.branch_name,
            COALESCE(c.branch_type, 'DEPARTMENT') AS branch_type,
            s.subject_name,
            TRIM(COALESCE(s.instructor_name::text, '')) AS instructor_name,
            COALESCE(s.study_type::text, 'ANNUAL') AS study_type,
            COALESCE(s.study_stage_level, 1)::int AS study_stage_level,
            s.created_at
     FROM college_study_subjects s
     INNER JOIN college_subjects c ON c.id = s.college_subject_id
     INNER JOIN users u ON u.id = s.owner_user_id
     INNER JOIN college_account_profiles p ON p.user_id = u.id
     WHERE u.deleted_at IS NULL AND u.role = 'COLLEGE'
     ORDER BY
       LOWER(TRIM(COALESCE(p.formation_name::text, p.holder_name::text, u.username::text))) ASC,
       c.branch_name ASC,
       s.subject_name ASC`
  );
  return r.rows.map((row) => ({
    id: row.id,
    account_kind: row.account_kind,
    formation_name: row.formation_name,
    holder_name: row.holder_name,
    branch_name: row.branch_name,
    branch_type: row.branch_type,
    subject_name: row.subject_name,
    instructor_name: row.instructor_name,
    study_type: row.study_type,
    study_stage_level: Number(row.study_stage_level) || 1,
    created_at: row.created_at,
  }));
}

export function buildAdminStudySubjectsReportHtml(
  rows: AdminStudySubjectsReportRow[],
  generatedLabel: string
): string {
  const z = escapeHtml;
  const summaryLine = `إجمالي المواد الدراسية: ${rows.length}`;
  const tableRows = rows
    .map((row, idx) => {
      const disp = formationDisplay(row.account_kind, row.formation_name, row.holder_name);
      const stageLabel = formatCollegeStudyStageLabel(row.study_stage_level);
      return `<tr>
  <td class="n">${idx + 1}</td>
  <td class="mono">${z(row.id)}</td>
  <td class="t-right">${z(disp)}</td>
  <td class="t-right">${z(row.branch_name)} <span class="mono">(${z(branchTypeAr(row.branch_type))})</span></td>
  <td class="t-right">${z(row.subject_name)}</td>
  <td class="t-right">${z(row.instructor_name.trim() || "—")}</td>
  <td>${z(studyTypeAr(row.study_type))}</td>
  <td>${z(stageLabel)}</td>
  <td class="dt">${z(fmtDt(row.created_at))}</td>
</tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>تقرير المواد الدراسية — رصين</title>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <h1>تقرير المواد الدراسية المدخَلة في النظام</h1>
  <p class="sub">جامعة البصرة — نظام رصين لإدارة الامتحانات — وقت الإصدار: ${z(generatedLabel)}</p>
  <p class="summary">${z(summaryLine)}</p>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>معرّف السجل</th>
        <th>التشكيل / الوحدة</th>
        <th>القسم أو الفرع</th>
        <th>اسم المادة</th>
        <th>التدريسي</th>
        <th>نوع الدراسة</th>
        <th>المرحلة</th>
        <th>تاريخ الإدخال</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <p class="foot">للحفظ PDF: من نافذة الطباعة اختر «حفظ كـ PDF».</p>
</body>
</html>`;
}

/* ——— القاعات الامتحانية ——— */

export type AdminExamRoomsReportRow = {
  id: string;
  account_kind: string | null;
  formation_name: string | null;
  holder_name: string | null;
  serial_no: number;
  room_name: string;
  supervisor_name: string;
  subject_name_1: string;
  subject_name_2: string | null;
  capacity_total: number;
  stage_level: number;
  stage_level_2: number | null;
  created_at: Date;
};

export async function listExamRoomsForAdminReport(): Promise<AdminExamRoomsReportRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    id: string;
    account_kind: string | null;
    formation_name: string | null;
    holder_name: string | null;
    serial_no: number;
    room_name: string;
    supervisor_name: string;
    subject_name_1: string;
    subject_name_2: string | null;
    capacity_total: number;
    stage_level: number;
    stage_level_2: number | null;
    created_at: Date;
  }>(
    `SELECT r.id::text,
            p.account_kind::text,
            p.formation_name,
            p.holder_name,
            r.serial_no,
            r.room_name,
            r.supervisor_name,
            s1.subject_name AS subject_name_1,
            s2.subject_name AS subject_name_2,
            r.capacity_total,
            r.stage_level,
            r.stage_level_2,
            r.created_at
     FROM college_exam_rooms r
     INNER JOIN users u ON u.id = r.owner_user_id
     INNER JOIN college_account_profiles p ON p.user_id = u.id
     INNER JOIN college_study_subjects s1
       ON s1.id = r.study_subject_id AND s1.owner_user_id = r.owner_user_id
     LEFT JOIN college_study_subjects s2
       ON s2.id = r.study_subject_id_2 AND s2.owner_user_id = r.owner_user_id
     WHERE u.deleted_at IS NULL AND u.role = 'COLLEGE'
     ORDER BY
       LOWER(TRIM(COALESCE(p.formation_name::text, p.holder_name::text, u.username::text))) ASC,
       r.serial_no ASC,
       r.id ASC`
  );
  return r.rows.map((row) => ({
    id: row.id,
    account_kind: row.account_kind,
    formation_name: row.formation_name,
    holder_name: row.holder_name,
    serial_no: row.serial_no,
    room_name: row.room_name,
    supervisor_name: row.supervisor_name,
    subject_name_1: row.subject_name_1,
    subject_name_2: row.subject_name_2,
    capacity_total: row.capacity_total,
    stage_level: row.stage_level,
    stage_level_2: row.stage_level_2,
    created_at: row.created_at,
  }));
}

export function buildAdminExamRoomsReportHtml(rows: AdminExamRoomsReportRow[], generatedLabel: string): string {
  const z = escapeHtml;
  const summaryLine = `إجمالي القاعات المسجّلة: ${rows.length}`;
  const tableRows = rows
    .map((row, idx) => {
      const disp = formationDisplay(row.account_kind, row.formation_name, row.holder_name);
      const sub2 = (row.subject_name_2 ?? "").trim();
      const subjectsCell = sub2
        ? `${z(row.subject_name_1)} / ${z(sub2)}`
        : z(row.subject_name_1);
      const st1 = formatCollegeStudyStageLabel(row.stage_level);
      const st2 =
        row.stage_level_2 != null ? formatCollegeStudyStageLabel(row.stage_level_2) : "";
      const stagesCell = st2 ? `${z(st1)} / ${z(st2)}` : z(st1);
      return `<tr>
  <td class="n">${idx + 1}</td>
  <td class="mono">${z(row.id)}</td>
  <td class="t-right">${z(disp)}</td>
  <td>${row.serial_no}</td>
  <td class="t-right">${z(row.room_name)}</td>
  <td class="t-right">${subjectsCell}</td>
  <td class="t-right">${z(row.supervisor_name)}</td>
  <td>${row.capacity_total}</td>
  <td>${stagesCell}</td>
  <td class="dt">${z(fmtDt(row.created_at))}</td>
</tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>تقرير القاعات — رصين</title>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <h1>تقرير القاعات الامتحانية المدخَلة في النظام</h1>
  <p class="sub">جامعة البصرة — نظام رصين لإدارة الامتحانات — وقت الإصدار: ${z(generatedLabel)}</p>
  <p class="summary">${z(summaryLine)}</p>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>معرّف السجل</th>
        <th>التشكيل / الوحدة</th>
        <th>التسلسل</th>
        <th>اسم القاعة</th>
        <th>المادة (أو المادتان)</th>
        <th>مراقب الامتحان</th>
        <th>السعة الإجمالية</th>
        <th>المرحلة</th>
        <th>تاريخ الإدخال</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <p class="foot">للحفظ PDF: من نافذة الطباعة اختر «حفظ كـ PDF».</p>
</body>
</html>`;
}
