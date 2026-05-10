import type { AdminOfficialSituationFollowupRow } from "@/lib/college-exam-situations";
import { formatCollegeStudyStageLabel } from "@/lib/college-study-stage-display";

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ-u-ca-gregory-nu-latn", {
      dateStyle: "full",
      timeZone: "Asia/Baghdad",
    }).format(new Date(`${iso}T12:00:00`));
  } catch {
    return iso;
  }
}

function fmtNum(n: number): string {
  try {
    return new Intl.NumberFormat("en-US").format(n);
  } catch {
    return String(n);
  }
}

export function buildAdminFollowupCustomFormationReportHtml(args: {
  examDate: string;
  formationLabel: string;
  rows: AdminOfficialSituationFollowupRow[];
  generatedAt: Date;
}): string {
  const { examDate, formationLabel, rows, generatedAt } = args;
  const branches = [...new Set(rows.map((r) => r.branch_name.trim() || "—"))].sort((a, b) => a.localeCompare(b, "ar"));
  const approvedByDept = rows.filter((r) => r.dean_status === "APPROVED").length;
  const notApprovedByDept = rows.length - approvedByDept;
  const authenticated = rows.filter((r) => r.is_uploaded).length;
  const notAuthenticated = rows.length - authenticated;
  const examinedStudents = rows.reduce((sum, r) => sum + Math.max(0, Number(r.attendance_count ?? 0)), 0);
  const usedRooms = new Set(rows.map((r) => r.schedule_id)).size;
  const examinedSubjects = new Set(rows.map((r) => r.subject_name.trim())).size;
  const stageSet = new Set(rows.map((r) => Number(r.stage_level)).filter((n) => Number.isFinite(n)));
  const stages = [...stageSet].sort((a, b) => a - b).map((n) => formatCollegeStudyStageLabel(n));
  const generatedAtText = new Intl.DateTimeFormat("ar-IQ-u-ca-gregory-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Baghdad",
  }).format(generatedAt);

  const cards = [
    ["عدد المواد المعتمدة", approvedByDept],
    ["عدد المواد غير المعتمدة", notApprovedByDept],
    ["عدد المواد المصادق عليها", authenticated],
    ["عدد المواد غير المصادق عليها", notAuthenticated],
    ["عدد الطلاب الذين تم امتحانهم", examinedStudents],
    ["عدد القاعات المستخدمة", usedRooms],
    ["عدد المواد الدراسية الممتحنة", examinedSubjects],
    ["عدد المراحل الممتحنة", stageSet.size],
  ]
    .map(
      ([title, value]) => `
      <div class="card">
        <div class="card-title">${esc(String(title))}</div>
        <div class="card-value">${fmtNum(Number(value))}</div>
      </div>`
    )
    .join("");

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>تقرير مخصص - ${esc(formationLabel)} - ${esc(examDate)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #0f172a; font-family: Tahoma, Arial, sans-serif; background: #fff; }
    .sheet { border: 1px solid #dbe4f0; border-radius: 10px; overflow: hidden; }
    .head { background: linear-gradient(90deg, #1e3a8a, #2563eb); color: #fff; padding: 14px 16px; }
    .head h1 { margin: 0; font-size: 20px; }
    .head p { margin: 4px 0 0; font-size: 12px; opacity: .95; }
    .meta { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; font-size: 13px; line-height: 1.9; }
    .meta strong { color: #334155; }
    .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; padding: 12px 16px; }
    .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 9px; background: #fff; min-height: 70px; }
    .card-title { font-size: 11px; color: #64748b; font-weight: 700; line-height: 1.4; }
    .card-value { margin-top: 6px; font-size: 24px; font-weight: 800; color: #0f172a; }
    .stages { padding: 0 16px 12px; font-size: 13px; color: #334155; }
    .stages .pill { display: inline-block; margin: 4px 0 0 6px; border: 1px solid #bfdbfe; background: #eff6ff; color: #1e3a8a; border-radius: 999px; padding: 2px 9px; font-size: 11px; font-weight: 700; }
    .foot { border-top: 1px solid #e2e8f0; padding: 9px 16px; color: #64748b; font-size: 11px; text-align: center; }
  </style>
</head>
<body>
  <main class="sheet">
    <section class="head">
      <h1>تقرير مخصص — متابعة المواقف الامتحانية</h1>
      <p>تقرير رسمي لحجم الورقة A4</p>
    </section>
    <section class="meta">
      <div><strong>اسم الكلية / التشكيل:</strong> ${esc(formationLabel)}</div>
      <div><strong>القسم / الفرع:</strong> ${esc(branches.length > 0 ? branches.join("، ") : "—")}</div>
      <div><strong>اليوم الامتحاني:</strong> ${esc(fmtDate(examDate))}</div>
    </section>
    <section class="cards">${cards}</section>
    <section class="stages">
      <strong>المراحل الممتحنة:</strong>
      ${stages.length > 0 ? stages.map((s) => `<span class="pill">${esc(s)}</span>`).join("") : " — "}
    </section>
    <section class="foot">
      تاريخ إنشاء التقرير: ${esc(generatedAtText)}
    </section>
  </main>
</body>
</html>`;
}

