import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";

export type AdminAccountsUsersReportRow = {
  id: string;
  full_name: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  created_at: Date;
  last_login_at: Date | null;
  formation_name: string | null;
  dean_name: string | null;
  holder_name: string | null;
  account_kind: string | null;
};

const ROLE_AR: Record<string, string> = {
  SUPER_ADMIN: "سوبر مدير",
  ADMIN: "مدير النظام",
  MANAGER: "مدير",
  USER: "مستخدم",
  COLLEGE: "حساب كلية / تشكيل",
};

const STATUS_AR: Record<string, string> = {
  ACTIVE: "نشط",
  DISABLED: "معطّل",
  LOCKED: "مقفل",
  PENDING: "قيد الانتظار",
};

const ACCOUNT_KIND_AR: Record<string, string> = {
  FORMATION: "تشكيل / كلية",
  FOLLOWUP: "متابعة مركزية",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function roleAr(role: string): string {
  return ROLE_AR[role.trim().toUpperCase()] ?? role;
}

function statusAr(status: string): string {
  return STATUS_AR[status.trim().toUpperCase()] ?? status;
}

function accountKindAr(kind: string | null | undefined): string {
  if (!kind?.trim()) return "—";
  return ACCOUNT_KIND_AR[kind.trim().toUpperCase()] ?? kind;
}

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

function collegeDisplayLabel(row: AdminAccountsUsersReportRow): string {
  if (row.role.toUpperCase() !== "COLLEGE") return "—";
  const k = (row.account_kind ?? "").toUpperCase();
  if (k === "FOLLOWUP") {
    return (row.holder_name ?? "").trim() || "—";
  }
  return (row.formation_name ?? "").trim() || "—";
}

/**
 * قائمة المستخدمين غير المحذوفين مع ملف الكلية إن وُجد — لتقرير الإدارة.
 */
export async function listUsersForAdminAccountsReport(): Promise<AdminAccountsUsersReportRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    id: string | number;
    full_name: string;
    username: string;
    email: string | null;
    phone: string | null;
    role: string;
    status: string;
    created_at: Date;
    last_login_at: Date | null;
    formation_name: string | null;
    dean_name: string | null;
    holder_name: string | null;
    account_kind: string | null;
  }>(
    `SELECT u.id::text,
            u.full_name,
            u.username,
            u.email,
            u.phone,
            u.role::text,
            u.status::text,
            u.created_at,
            u.last_login_at,
            p.formation_name,
            p.dean_name,
            p.holder_name,
            p.account_kind::text
     FROM users u
     LEFT JOIN college_account_profiles p ON p.user_id = u.id
     WHERE u.deleted_at IS NULL
     ORDER BY
       CASE u.role
         WHEN 'SUPER_ADMIN' THEN 0
         WHEN 'ADMIN' THEN 1
         WHEN 'MANAGER' THEN 2
         WHEN 'COLLEGE' THEN 3
         WHEN 'USER' THEN 4
         ELSE 5
       END,
       LOWER(TRIM(u.username::text)) ASC`
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    full_name: row.full_name,
    username: row.username,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    created_at: row.created_at,
    last_login_at: row.last_login_at,
    formation_name: row.formation_name,
    dean_name: row.dean_name,
    holder_name: row.holder_name,
    account_kind: row.account_kind,
  }));
}

export function buildAdminAccountsUsersReportHtml(
  rows: AdminAccountsUsersReportRow[],
  generatedLabel: string
): string {
  const z = escapeHtml;
  const byRole = new Map<string, number>();
  let collegeCount = 0;
  for (const row of rows) {
    const rk = row.role.toUpperCase();
    byRole.set(rk, (byRole.get(rk) ?? 0) + 1);
    if (rk === "COLLEGE") collegeCount += 1;
  }
  const summaryParts = [
    `إجمالي السجلات: ${rows.length}`,
    ...[...byRole.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([role, n]) => `${roleAr(role)}: ${n}`),
  ];
  const summaryLine = summaryParts.join(" — ");

  const tableRows = rows
    .map((row, idx) => {
      const collegeKind = row.role.toUpperCase() === "COLLEGE" ? accountKindAr(row.account_kind) : "—";
      const deanCell =
        row.role.toUpperCase() === "COLLEGE" ? z((row.dean_name ?? "").trim() || "—") : "—";
      return `<tr>
  <td class="n">${idx + 1}</td>
  <td class="mono">${z(row.id)}</td>
  <td>${z(row.full_name)}</td>
  <td class="mono">${z(row.username)}</td>
  <td>${row.email ? z(row.email) : "—"}</td>
  <td>${row.phone ? z(row.phone) : "—"}</td>
  <td>${z(roleAr(row.role))}</td>
  <td>${z(statusAr(row.status))}</td>
  <td>${z(collegeKind)}</td>
  <td>${z(collegeDisplayLabel(row))}</td>
  <td>${deanCell}</td>
  <td class="dt">${z(fmtDt(row.created_at))}</td>
  <td class="dt">${z(fmtDt(row.last_login_at))}</td>
</tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>تقرير الحسابات والمستخدمين — رصين</title>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>
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
    td:nth-child(3), td:nth-child(4) { text-align: right; }
    .n { width: 28px; }
    .mono { font-family: ui-monospace, monospace; font-size: 8px; direction: ltr; text-align: left; }
    .dt { font-size: 8px; white-space: nowrap; }
    .foot { margin-top: 14px; padding-top: 8px; border-top: 1px solid #cbd5e1; font-size: 9px; color: #64748b; text-align: center; }
    .warn { margin-top: 10px; font-size: 10px; color: #b45309; font-weight: 600; }
  </style>
</head>
<body>
  <h1>تقرير الحسابات والمستخدمين</h1>
  <p class="sub">جامعة البصرة — نظام رصين لإدارة الامتحانات — وقت الإصدار: ${z(generatedLabel)}</p>
  <p class="summary">${z(summaryLine)}</p>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>المعرّف</th>
        <th>الاسم الكامل</th>
        <th>اسم المستخدم</th>
        <th>البريد</th>
        <th>الهاتف</th>
        <th>الدور</th>
        <th>الحالة</th>
        <th>نوع حساب الكلية</th>
        <th>التشكيل / الوحدة</th>
        <th>عميد / معاون</th>
        <th>تاريخ الإنشاء</th>
        <th>آخر دخول</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <p class="warn">تنبيه أمني: لا يتضمن التقرير كلمات المرور. يُستعمل للمراجعة الإدارية فقط.</p>
  <p class="foot">للحفظ PDF: من نافذة الطباعة اختر «حفظ كـ PDF».</p>
</body>
</html>`;
}
