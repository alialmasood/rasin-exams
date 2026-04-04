import { formatCollegeStudyStageLabel, isPostgraduateStudyStageLevel } from "@/lib/college-study-stage-display";
import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normWorkflow(s: string): string {
  return String(s ?? "DRAFT")
    .trim()
    .toUpperCase();
}

function isOfficialWorkflow(w: string): boolean {
  const u = normWorkflow(w);
  return u === "SUBMITTED" || u === "APPROVED";
}

export type AdminExamScheduleAggRow = {
  schedule_id: string;
  owner_user_id: string;
  formation_label: string;
  owner_username: string;
  college_subject_id: string;
  branch_name: string;
  exam_date: string;
  stage_level: number;
  workflow_status: string;
  is_uploaded: boolean;
  capacity_total: number;
  attendance_count: number;
  absence_count: number;
};

/**
 * كل صف = جلسة امتحانية واحدة (صف في college_exam_schedules + سعة/حضور/غياب من القاعة حسب المادة).
 * نفس منطق `listOfficialExamSituationsForOwner` عبر كل التشكيلات.
 */
export async function listExamScheduleAggregateRowsForAdminReport(): Promise<AdminExamScheduleAggRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    schedule_id: string | number;
    owner_user_id: string | number;
    formation_label: string;
    owner_username: string;
    college_subject_id: string;
    branch_name: string;
    exam_date: string;
    stage_level: number;
    workflow_status: string;
    is_uploaded: boolean;
    capacity_total: number | string;
    attendance_count: number | string;
    absence_count: number | string;
  }>(
    `SELECT e.id AS schedule_id,
            e.owner_user_id,
            COALESCE(
              NULLIF(TRIM(
                CASE
                  WHEN UPPER(COALESCE(p.account_kind::text, 'FORMATION')) = 'FOLLOWUP'
                    THEN COALESCE(p.holder_name, '')
                  ELSE COALESCE(p.formation_name, '')
                END
              ), ''),
              u.username::text
            ) AS formation_label,
            u.username::text AS owner_username,
            e.college_subject_id::text AS college_subject_id,
            c.branch_name,
            e.exam_date::text AS exam_date,
            e.stage_level,
            COALESCE(e.workflow_status::text, 'DRAFT') AS workflow_status,
            (rep.head_submitted_at IS NOT NULL) AS is_uploaded,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.capacity_total
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.capacity_total_2, 0)
              ELSE r.capacity_total
            END AS capacity_total,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.attendance_count
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.attendance_count_2, 0)
              ELSE r.attendance_count
            END AS attendance_count,
            CASE
              WHEN e.study_subject_id = r.study_subject_id THEN r.absence_count
              WHEN r.study_subject_id_2 IS NOT NULL AND e.study_subject_id = r.study_subject_id_2
                THEN COALESCE(r.absence_count_2, 0)
              ELSE r.absence_count
            END AS absence_count
     FROM college_exam_schedules e
     INNER JOIN college_subjects c
       ON c.id = e.college_subject_id AND c.owner_user_id = e.owner_user_id
     INNER JOIN college_study_subjects s
       ON s.id = e.study_subject_id AND s.owner_user_id = e.owner_user_id
     INNER JOIN college_exam_rooms r
       ON r.id = e.room_id AND r.owner_user_id = e.owner_user_id
     INNER JOIN users u
       ON u.id = e.owner_user_id AND u.role = 'COLLEGE' AND u.deleted_at IS NULL
     LEFT JOIN college_account_profiles p ON p.user_id = u.id
     LEFT JOIN college_exam_situation_reports rep
       ON rep.exam_schedule_id = e.id AND rep.owner_user_id = e.owner_user_id
     ORDER BY formation_label ASC, u.username ASC, e.exam_date ASC, e.id ASC`
  );
  return r.rows.map((row) => ({
    schedule_id: String(row.schedule_id),
    owner_user_id: String(row.owner_user_id),
    formation_label: row.formation_label,
    owner_username: row.owner_username,
    college_subject_id: row.college_subject_id,
    branch_name: row.branch_name,
    exam_date: row.exam_date,
    stage_level: Number(row.stage_level ?? 1),
    workflow_status: row.workflow_status,
    is_uploaded: Boolean(row.is_uploaded),
    capacity_total: Math.max(0, Math.floor(Number(row.capacity_total ?? 0))),
    attendance_count: Math.max(0, Math.floor(Number(row.attendance_count ?? 0))),
    absence_count: Math.max(0, Math.floor(Number(row.absence_count ?? 0))),
  }));
}

type StageBucket = { sessions: number; capacity: number; attendance: number; absence: number };
type FormationBucket = {
  label: string;
  username: string;
  days: Set<string>;
  sessions: number;
  officialSessions: number;
  capacity: number;
  attendance: number;
  absence: number;
  uploaded: number;
};
type BranchBucket = {
  formation_label: string;
  owner_user_id: string;
  branch_name: string;
  college_subject_id: string;
  sessions: number;
  capacity: number;
  attendance: number;
  absence: number;
};

export type AdminExamSystemAggregates = {
  totalSessions: number;
  officialSessions: number;
  distinctCalendarDays: number;
  /** مجموع (عدد أيام فريدة لكل تشكيل) — يتجاوز الأيام المشتركة بين تشكيلين */
  sumFormationDistinctDays: number;
  totalCapacity: number;
  totalAttendance: number;
  totalAbsence: number;
  uploadedSituations: number;
  postgraduate: {
    sessions: number;
    capacity: number;
    studentsRecorded: number;
  };
  byStage: Array<{ stage_level: number; stage_label: string } & StageBucket>;
  byFormation: (FormationBucket & {
    distinct_days: number;
  })[];
  byBranch: BranchBucket[];
};

function computeBuckets(rows: AdminExamScheduleAggRow[]): AdminExamSystemAggregates {
  const globalDays = new Set<string>();
  const byStage = new Map<number, StageBucket>();
  const byFormation = new Map<string, FormationBucket>();
  const byBranch = new Map<string, BranchBucket>();

  let totalCapacity = 0;
  let totalAttendance = 0;
  let totalAbsence = 0;
  let officialSessions = 0;
  let uploadedSituations = 0;

  let pgSessions = 0;
  let pgCapacity = 0;
  let pgStudents = 0;

  for (const row of rows) {
    globalDays.add(row.exam_date);
    const cap = row.capacity_total;
    const att = row.attendance_count;
    const abs = row.absence_count;

    totalCapacity += cap;
    totalAttendance += att;
    totalAbsence += abs;

    if (isOfficialWorkflow(row.workflow_status)) officialSessions += 1;
    if (row.is_uploaded) uploadedSituations += 1;

    if (isPostgraduateStudyStageLevel(row.stage_level)) {
      pgSessions += 1;
      pgCapacity += cap;
      pgStudents += att + abs;
    }

    const st = row.stage_level;
    if (!byStage.has(st)) byStage.set(st, { sessions: 0, capacity: 0, attendance: 0, absence: 0 });
    const sb = byStage.get(st)!;
    sb.sessions += 1;
    sb.capacity += cap;
    sb.attendance += att;
    sb.absence += abs;

    const fk = row.owner_user_id;
    if (!byFormation.has(fk)) {
      byFormation.set(fk, {
        label: row.formation_label,
        username: row.owner_username,
        days: new Set(),
        sessions: 0,
        officialSessions: 0,
        capacity: 0,
        attendance: 0,
        absence: 0,
        uploaded: 0,
      });
    }
    const fb = byFormation.get(fk)!;
    fb.days.add(row.exam_date);
    fb.sessions += 1;
    if (isOfficialWorkflow(row.workflow_status)) fb.officialSessions += 1;
    fb.capacity += cap;
    fb.attendance += att;
    fb.absence += abs;
    if (row.is_uploaded) fb.uploaded += 1;

    const bk = `${row.owner_user_id}|${row.college_subject_id}`;
    if (!byBranch.has(bk)) {
      byBranch.set(bk, {
        formation_label: row.formation_label,
        owner_user_id: row.owner_user_id,
        branch_name: row.branch_name,
        college_subject_id: row.college_subject_id,
        sessions: 0,
        capacity: 0,
        attendance: 0,
        absence: 0,
      });
    }
    const bb = byBranch.get(bk)!;
    bb.sessions += 1;
    bb.capacity += cap;
    bb.attendance += att;
    bb.absence += abs;
  }

  const stageList = [...byStage.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([stage_level, b]) => ({
      stage_level,
      stage_label: formatCollegeStudyStageLabel(stage_level),
      ...b,
    }));

  const formationList = [...byFormation.values()]
    .map((fb) => ({
      ...fb,
      distinct_days: fb.days.size,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));

  const branchList = [...byBranch.values()].sort((a, b) => {
    const c = a.formation_label.localeCompare(b.formation_label, "ar");
    if (c !== 0) return c;
    return a.branch_name.localeCompare(b.branch_name, "ar");
  });

  let sumFormationDistinctDays = 0;
  for (const f of formationList) sumFormationDistinctDays += f.distinct_days;

  return {
    totalSessions: rows.length,
    officialSessions,
    distinctCalendarDays: globalDays.size,
    sumFormationDistinctDays,
    totalCapacity,
    totalAttendance,
    totalAbsence,
    uploadedSituations,
    postgraduate: {
      sessions: pgSessions,
      capacity: pgCapacity,
      studentsRecorded: pgStudents,
    },
    byStage: stageList,
    byFormation: formationList,
    byBranch: branchList,
  };
}

function tableSection(title: string, headers: string[], bodyRows: string): string {
  const z = escapeHtml;
  const head = headers.map((h) => `<th>${z(h)}</th>`).join("");
  return `<h2 class="h2">${z(title)}</h2>
<table>
  <thead><tr>${head}</tr></thead>
  <tbody>${bodyRows}</tbody>
</table>`;
}

export function buildAdminExamSystemAggregatesReportHtml(
  rows: AdminExamScheduleAggRow[],
  generatedLabel: string
): string {
  const z = escapeHtml;
  const agg = computeBuckets(rows);

  const summaryItems: string[] = [
    `عدد جلسات الجدول الامتحاني (صفوف الجدولة لجميع التشكيلات): ${agg.totalSessions.toLocaleString("ar-IQ")}`,
    `منها جلسات بحالة مسار «مرسل» أو «معتمد» في الجدول: ${agg.officialSessions.toLocaleString("ar-IQ")}`,
    `عدد الأيام التقويمية الفريدة التي وردت فيها جلسات (على مستوى النظام كاملاً): ${agg.distinctCalendarDays.toLocaleString("ar-IQ")}`,
    `مجموع «أيام امتحان» لكل تشكيل على حدة (يُجمع عدد الأيام الفريدة لكل تشكيل — اليوم الواحد يُكرّر إن وقع في أكثر من تشكيل): ${agg.sumFormationDistinctDays.toLocaleString("ar-IQ")}`,
    `إجمالي المقاعد المجدولة (سعة القاعة للمادة حسب الجلسة): ${agg.totalCapacity.toLocaleString("ar-IQ")}`,
    `إجمالي الحضور المسجّل في القاعات: ${agg.totalAttendance.toLocaleString("ar-IQ")}`,
    `إجمالي الغياب المسجّل: ${agg.totalAbsence.toLocaleString("ar-IQ")}`,
    `عدد الجلسات التي رُفع لها موقف امتحاني (تسجيل head_submitted_at): ${agg.uploadedSituations.toLocaleString("ar-IQ")}`,
    `الدراسات العليا (المراحل 11–13): جلسات ${agg.postgraduate.sessions.toLocaleString("ar-IQ")} — مقاعد مجدولة ${agg.postgraduate.capacity.toLocaleString("ar-IQ")} — مجموع (حضور + غياب) المسجّل ${agg.postgraduate.studentsRecorded.toLocaleString("ar-IQ")}`,
  ];

  const summaryBlock = summaryItems.map((line) => `<li>${z(line)}</li>`).join("");

  const stageRows = agg.byStage
    .map(
      (s) => `<tr>
  <td>${z(s.stage_label)} <span class="mono">(${s.stage_level})</span></td>
  <td>${s.sessions.toLocaleString("ar-IQ")}</td>
  <td>${s.capacity.toLocaleString("ar-IQ")}</td>
  <td>${s.attendance.toLocaleString("ar-IQ")}</td>
  <td>${s.absence.toLocaleString("ar-IQ")}</td>
</tr>`
    )
    .join("\n");

  const formationRows = agg.byFormation
    .map(
      (f) => `<tr>
  <td class="t-right">${z(f.label)}</td>
  <td class="mono">${z(f.username)}</td>
  <td>${f.distinct_days.toLocaleString("ar-IQ")}</td>
  <td>${f.sessions.toLocaleString("ar-IQ")}</td>
  <td>${f.officialSessions.toLocaleString("ar-IQ")}</td>
  <td>${f.uploaded.toLocaleString("ar-IQ")}</td>
  <td>${f.capacity.toLocaleString("ar-IQ")}</td>
  <td>${f.attendance.toLocaleString("ar-IQ")}</td>
  <td>${f.absence.toLocaleString("ar-IQ")}</td>
</tr>`
    )
    .join("\n");

  const branchRows = agg.byBranch
    .map(
      (b) => `<tr>
  <td class="t-right">${z(b.formation_label)}</td>
  <td class="t-right">${z(b.branch_name)}</td>
  <td>${b.sessions.toLocaleString("ar-IQ")}</td>
  <td>${b.capacity.toLocaleString("ar-IQ")}</td>
  <td>${b.attendance.toLocaleString("ar-IQ")}</td>
  <td>${b.absence.toLocaleString("ar-IQ")}</td>
</tr>`
    )
    .join("\n");

  const styles = `
    * { box-sizing: border-box; }
    body { font-family: "Tajawal", Tahoma, sans-serif; margin: 0; padding: 16px; color: #0f172a; font-size: 11px; line-height: 1.45; background: #fff; }
    @page { size: A4 landscape; margin: 8mm; }
    @media print { body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    h1 { margin: 0 0 6px; font-size: 17px; color: #1e3a8a; }
    .sub { margin: 0 0 10px; font-size: 11px; color: #475569; }
    .h2 { margin: 18px 0 8px; font-size: 14px; color: #0f172a; }
    ul.sum { margin: 0 0 14px; padding-right: 20px; font-weight: 600; color: #334155; }
    ul.sum li { margin-bottom: 6px; }
    .note { margin: 10px 0 14px; padding: 10px 12px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; font-size: 10px; color: #78350f; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 8px; }
    th, td { border: 1px solid #94a3b8; padding: 4px 3px; vertical-align: top; word-wrap: break-word; }
    th { background: #e2e8f0; font-weight: 800; font-size: 9px; text-align: center; }
    td { text-align: center; font-size: 9px; }
    td.t-right { text-align: right; }
    .mono { font-family: ui-monospace, monospace; font-size: 8px; direction: ltr; text-align: left; }
    .foot { margin-top: 12px; padding-top: 8px; border-top: 1px solid #cbd5e1; font-size: 9px; color: #64748b; text-align: center; }
  `;

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>تقرير إحصائيات الجداول والمواقف — رصين</title>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>${styles}</style>
</head>
<body>
  <h1>تقرير إحصائيات الجداول الامتحانية والمواقف (جميع التشكيلات)</h1>
  <p class="sub">جامعة البصرة — نظام رصين — وقت الإصدار: ${z(generatedLabel)}</p>
  <p class="note">
    <strong>تعريفات:</strong> «جلسة» = صف واحد في جدول <span class="mono">college_exam_schedules</span> (قاعة + مادة + وقت).
    المقاعد والحضور والغياب تُؤخذ من سجل القاعة للمادة المطابقة للجلسة (بما في ذلك القاعات ذات مادتين).
    «موقف مرفوع» = وجود تسجيل رفع من رئيس القسم في <span class="mono">college_exam_situation_reports</span>.
    الدراسات العليا هنا = المراحل المخزّنة كـ 11 (دبلوم) و12 (ماجستير) و13 (دكتوراه).
  </p>
  <ul class="sum">${summaryBlock}</ul>
  ${tableSection(
    "حسب المرحلة الدراسية في الجدول",
    ["المرحلة", "عدد الجلسات", "المقاعد المجدولة", "الحضور", "الغياب"],
    stageRows || `<tr><td colspan="5">لا توجد جلسات.</td></tr>`
  )}
  ${tableSection(
    "حسب التشكيل",
    [
      "التشكيل",
      "اسم المستخدم",
      "أيام فريدة",
      "جلسات",
      "جلسات رسمية*",
      "مواقف مرفوعة",
      "مقاعد",
      "حضور",
      "غياب",
    ],
    formationRows || `<tr><td colspan="9">لا توجد بيانات.</td></tr>`
  )}
  <p class="sub" style="margin-top:-4px;font-size:9px;">*رسمية = حالة الجدول «مرسل» أو «معتمد».</p>
  ${tableSection(
    "حسب القسم أو الفرع",
    ["التشكيل", "القسم / الفرع", "عدد الجلسات", "المقاعد", "الحضور", "الغياب"],
    branchRows || `<tr><td colspan="6">لا توجد بيانات.</td></tr>`
  )}
  <p class="foot">للحفظ PDF: من نافذة الطباعة اختر «حفظ كـ PDF». — إجمالي صفوف المصدر: ${rows.length.toLocaleString("ar-IQ")}</p>
</body>
</html>`;
}
