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

function mealSlotLabel(slot: 1 | 2): string {
  return slot === 2 ? "الثانية" : "الأولى";
}

function scheduleTypeLabel(kind: AdminOfficialSituationFollowupRow["schedule_type"]): string {
  return kind === "SEMESTER" ? "نصفي" : "نهائي";
}

type AggregatedExamSubject = {
  key: string;
  subjectName: string;
  branchName: string;
  stageLevel: number;
  scheduleType: AdminOfficialSituationFollowupRow["schedule_type"];
  mealSlot: 1 | 2;
  roomCount: number;
  roomNames: string[];
  totalStudents: number;
  attendance: number;
  absence: number;
  approvedRooms: number;
  authenticatedRooms: number;
  isFullyApproved: boolean;
  isFullyAuthenticated: boolean;
};

function buildAggregatedSubjectKey(row: AdminOfficialSituationFollowupRow): string {
  const studySubjectId = row.study_subject_id.trim() || row.subject_name.trim() || row.schedule_id;
  const branchName = row.branch_name.trim() || "—";
  return [studySubjectId, branchName, String(row.stage_level), row.schedule_type, String(row.meal_slot)].join("::");
}

function aggregateExamSubjects(rows: AdminOfficialSituationFollowupRow[]): AggregatedExamSubject[] {
  const bySubject = new Map<
    string,
    {
      key: string;
      subjectName: string;
      branchName: string;
      stageLevel: number;
      scheduleType: AdminOfficialSituationFollowupRow["schedule_type"];
      mealSlot: 1 | 2;
      roomIds: Set<string>;
      roomNames: Set<string>;
      totalStudents: number;
      attendance: number;
      absence: number;
      approvedRooms: number;
      authenticatedRooms: number;
    }
  >();

  for (const row of rows) {
    const key = buildAggregatedSubjectKey(row);
    if (!bySubject.has(key)) {
      bySubject.set(key, {
        key,
        subjectName: row.subject_name.trim() || "—",
        branchName: row.branch_name.trim() || "—",
        stageLevel: Number(row.stage_level ?? 1),
        scheduleType: row.schedule_type,
        mealSlot: row.meal_slot,
        roomIds: new Set<string>(),
        roomNames: new Set<string>(),
        totalStudents: 0,
        attendance: 0,
        absence: 0,
        approvedRooms: 0,
        authenticatedRooms: 0,
      });
    }
    const item = bySubject.get(key)!;
    item.roomIds.add(row.room_id);
    if (row.room_name.trim()) item.roomNames.add(row.room_name.trim());
    item.totalStudents += Math.max(0, Number(row.capacity_total ?? 0));
    item.attendance += Math.max(0, Number(row.attendance_count ?? 0));
    item.absence += Math.max(0, Number(row.absence_count ?? 0));
    if (row.dean_status === "APPROVED") item.approvedRooms += 1;
    if (row.is_uploaded) item.authenticatedRooms += 1;
  }

  return [...bySubject.values()]
    .map((item) => ({
      key: item.key,
      subjectName: item.subjectName,
      branchName: item.branchName,
      stageLevel: item.stageLevel,
      scheduleType: item.scheduleType,
      mealSlot: item.mealSlot,
      roomCount: item.roomIds.size,
      roomNames: [...item.roomNames].sort((a, b) => a.localeCompare(b, "ar")),
      totalStudents: item.totalStudents,
      attendance: item.attendance,
      absence: item.absence,
      approvedRooms: item.approvedRooms,
      authenticatedRooms: item.authenticatedRooms,
      isFullyApproved: item.roomIds.size > 0 && item.approvedRooms === item.roomIds.size,
      isFullyAuthenticated: item.roomIds.size > 0 && item.authenticatedRooms === item.roomIds.size,
    }))
    .sort((a, b) => {
      const byBranch = a.branchName.localeCompare(b.branchName, "ar");
      if (byBranch !== 0) return byBranch;
      const byStage = a.stageLevel - b.stageLevel;
      if (byStage !== 0) return byStage;
      const byMeal = a.mealSlot - b.mealSlot;
      if (byMeal !== 0) return byMeal;
      return a.subjectName.localeCompare(b.subjectName, "ar");
    });
}

function renderSubjectList(title: string, subjects: AggregatedExamSubject[], emptyText: string, tone: "blue" | "green" | "amber"): string {
  const toneClass =
    tone === "green" ? "section-green" : tone === "amber" ? "section-amber" : "section-blue";
  const items = subjects
    .map((subject) => {
      const roomsText = `${fmtNum(subject.roomCount)} ${subject.roomCount === 1 ? "قاعة" : "قاعات"}`;
      const roomNamesText = subject.roomNames.length > 0 ? subject.roomNames.join("، ") : "—";
      return `
      <div class="subject-item">
        <div class="subject-head">
          <div class="subject-title">${esc(subject.subjectName)}</div>
          <div class="subject-subtitle">
            ${esc(subject.branchName)} · ${esc(formatCollegeStudyStageLabel(subject.stageLevel))} · ${esc(mealSlotLabel(subject.mealSlot))} · ${esc(scheduleTypeLabel(subject.scheduleType))}
          </div>
        </div>
        <div class="chips">
          <span class="chip chip-blue">القاعات: ${fmtNum(subject.roomCount)}</span>
          <span class="chip chip-slate">إجمالي الطلبة: ${fmtNum(subject.totalStudents)}</span>
          <span class="chip chip-green">الحضور: ${fmtNum(subject.attendance)}</span>
          <span class="chip chip-rose">الغياب: ${fmtNum(subject.absence)}</span>
        </div>
        <div class="subject-note">
          توزيع القاعات: ${esc(roomsText)}${subject.roomNames.length > 0 ? ` (${esc(roomNamesText)})` : ""}<br />
          اعتماد رئيس القسم/الفرع: ${fmtNum(subject.approvedRooms)} / ${fmtNum(subject.roomCount)} قاعات<br />
          مصادقة حساب العميد: ${fmtNum(subject.authenticatedRooms)} / ${fmtNum(subject.roomCount)} قاعات
        </div>
      </div>`;
    })
    .join("");

  return `
    <section class="subject-section ${toneClass}">
      <div class="section-head">
        <h2>${esc(title)}</h2>
        <span class="section-count">${fmtNum(subjects.length)}</span>
      </div>
      ${subjects.length > 0 ? `<div class="subject-list">${items}</div>` : `<div class="empty">${esc(emptyText)}</div>`}
    </section>`;
}

export function buildAdminFollowupCustomFormationReportHtml(args: {
  examDate: string;
  formationLabel: string;
  rows: AdminOfficialSituationFollowupRow[];
  generatedAt: Date;
}): string {
  const { examDate, formationLabel, rows, generatedAt } = args;
  const branches = [...new Set(rows.map((r) => r.branch_name.trim() || "—"))].sort((a, b) => a.localeCompare(b, "ar"));
  const subjects = aggregateExamSubjects(rows);
  const approvedByDept = subjects.filter((subject) => subject.isFullyApproved);
  const notApprovedByDept = subjects.filter((subject) => !subject.isFullyApproved);
  const authenticated = subjects.filter((subject) => subject.isFullyAuthenticated);
  const notAuthenticated = subjects.filter((subject) => !subject.isFullyAuthenticated);
  const totalStudentsExamined = rows.reduce((sum, r) => sum + Math.max(0, Number(r.capacity_total ?? 0)), 0);
  const attendanceTotal = rows.reduce((sum, r) => sum + Math.max(0, Number(r.attendance_count ?? 0)), 0);
  const absenceTotal = rows.reduce((sum, r) => sum + Math.max(0, Number(r.absence_count ?? 0)), 0);
  const usedRooms = new Set(rows.map((r) => r.room_id)).size;
  const examinedSubjects = subjects.length;
  const stageSet = new Set(subjects.map((subject) => Number(subject.stageLevel)).filter((n) => Number.isFinite(n)));
  const stages = [...stageSet].sort((a, b) => a - b).map((n) => formatCollegeStudyStageLabel(n));
  const generatedAtText = new Intl.DateTimeFormat("ar-IQ-u-ca-gregory-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Baghdad",
  }).format(generatedAt);

  const summaryStats: Array<[string, number]> = [
    ["عدد المواد المعتمدة", approvedByDept.length],
    ["عدد المواد غير المعتمدة", notApprovedByDept.length],
    ["عدد المواد المصادق عليها", authenticated.length],
    ["عدد المواد غير المصادق عليها", notAuthenticated.length],
    ["عدد الطلاب الذين تم امتحانهم", totalStudentsExamined],
    ["عدد القاعات المستخدمة", usedRooms],
    ["عدد المواد الدراسية الممتحنة", examinedSubjects],
    ["عدد المراحل الممتحنة", stageSet.size],
    ["عدد الطلبة الحضور", attendanceTotal],
    ["عدد الطلبة الغياب", absenceTotal],
  ];
  const summaryRows = Array.from({ length: Math.ceil(summaryStats.length / 2) }, (_, index) => {
    const right = summaryStats[index * 2];
    const left = summaryStats[index * 2 + 1];
    return `
      <tr>
        <th>${esc(String(right?.[0] ?? "—"))}</th>
        <td>${fmtNum(Number(right?.[1] ?? 0))}</td>
        <th>${esc(String(left?.[0] ?? "—"))}</th>
        <td>${fmtNum(Number(left?.[1] ?? 0))}</td>
      </tr>`;
  }).join("");
  const summaryTable = `
    <section class="summary-wrap">
      <table class="summary-table" aria-label="الملخص الإحصائي للتقرير">
        <tbody>${summaryRows}</tbody>
      </table>
    </section>`;
  const cards = summaryTable;

  const examinedSubjectsSection = renderSubjectList(
    "المواد الدراسية / الامتحانية الممتحنة",
    subjects,
    "لا توجد مواد ممتحنة ضمن هذا التقرير.",
    "blue"
  );
  const approvedSection = renderSubjectList(
    "المواد المعتمدة من رئيس القسم / الفرع",
    approvedByDept,
    "لا توجد مواد مكتملة الاعتماد من رئيس القسم / الفرع.",
    "green"
  );
  const notApprovedSection = renderSubjectList(
    "المواد غير المعتمدة من رئيس القسم / الفرع",
    notApprovedByDept,
    "لا توجد مواد غير معتمدة من رئيس القسم / الفرع.",
    "amber"
  );
  const authenticatedSection = renderSubjectList(
    "المواد التي تم المصادقة عليها من حساب العميد",
    authenticated,
    "لا توجد مواد مصادق عليها من حساب العميد.",
    "green"
  );
  const notAuthenticatedSection = renderSubjectList(
    "المواد التي لم يتم المصادقة عليها من حساب العميد",
    notAuthenticated,
    "لا توجد مواد بانتظار مصادقة حساب العميد.",
    "amber"
  );

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>تقرير مخصص - ${esc(formationLabel)} - ${esc(examDate)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #0f172a; font-family: Tahoma, Arial, sans-serif; background: #fff; }
    .sheet { border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; }
    .head { background: #1e3a8a; color: #fff; padding: 12px 14px; border-bottom: 2px solid #0f172a; }
    .head h1 { margin: 0; font-size: 18px; }
    .head p { margin: 3px 0 0; font-size: 11px; opacity: .92; }
    .meta { padding: 8px 14px; border-bottom: 1px solid #dbe4f0; background: #f8fafc; font-size: 12px; line-height: 1.7; }
    .meta strong { color: #334155; }
    .summary-wrap { padding: 8px 14px 6px; }
    .summary-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; }
    .summary-table th, .summary-table td { border: 1px solid #cbd5e1; padding: 6px 7px; }
    .summary-table th { width: 30%; background: #f8fafc; color: #334155; font-weight: 700; text-align: right; }
    .summary-table td { width: 20%; text-align: center; font-size: 17px; font-weight: 800; color: #0f172a; }
    .stages { padding: 0 14px 8px; font-size: 12px; color: #334155; }
    .stages .pill { display: inline-block; margin: 4px 0 0 5px; border: 1px solid #cbd5e1; background: #fff; color: #1e3a8a; border-radius: 999px; padding: 1px 7px; font-size: 10px; font-weight: 700; }
    .sections { padding: 0 14px 12px; }
    .subject-section { border: 1px solid #dbe4f0; border-radius: 6px; background: #fff; margin-top: 8px; overflow: hidden; break-inside: avoid-page; page-break-inside: avoid; }
    .section-blue { border-color: #bfdbfe; }
    .section-green { border-color: #bbf7d0; }
    .section-amber { border-color: #fde68a; }
    .section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .section-head h2 { margin: 0; font-size: 13px; }
    .section-count { min-width: 30px; text-align: center; border-radius: 999px; background: #e2e8f0; padding: 1px 7px; font-size: 10px; font-weight: 800; color: #334155; }
    .subject-list { padding: 8px 10px; }
    .subject-item { border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 8px; background: #fcfdff; break-inside: avoid-page; page-break-inside: avoid; }
    .subject-item + .subject-item { margin-top: 6px; }
    .subject-title { font-size: 13px; font-weight: 800; color: #0f172a; }
    .subject-subtitle { margin-top: 2px; font-size: 10px; color: #64748b; }
    .chips { margin-top: 5px; }
    .chip { display: inline-block; margin: 0 0 4px 4px; border-radius: 999px; padding: 1px 7px; font-size: 10px; font-weight: 700; }
    .chip-blue { background: #dbeafe; color: #1d4ed8; }
    .chip-slate { background: #e2e8f0; color: #334155; }
    .chip-green { background: #dcfce7; color: #166534; }
    .chip-rose { background: #ffe4e6; color: #be123c; }
    .subject-note { margin-top: 3px; font-size: 10px; line-height: 1.6; color: #475569; }
    .empty { padding: 10px; font-size: 11px; color: #64748b; }
    .foot { border-top: 1px solid #e2e8f0; padding: 7px 14px; color: #64748b; font-size: 10px; text-align: center; }
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
    ${cards}
    <section class="stages">
      <strong>المراحل الممتحنة:</strong>
      ${stages.length > 0 ? stages.map((s) => `<span class="pill">${esc(s)}</span>`).join("") : " — "}
    </section>
    <section class="sections">
      ${examinedSubjectsSection}
      ${approvedSection}
      ${notApprovedSection}
      ${authenticatedSection}
      ${notAuthenticatedSection}
    </section>
    <section class="foot">
      تاريخ إنشاء التقرير: ${esc(generatedAtText)}
    </section>
  </main>
</body>
</html>`;
}

