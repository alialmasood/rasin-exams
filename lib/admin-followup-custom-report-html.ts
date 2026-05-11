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

function completionLabel(done: number, total: number): string {
  return total > 0 && done === total ? "مكتمل" : "قيد المتابعة";
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

function renderSubjectList(title: string, subjects: AggregatedExamSubject[], emptyText: string): string {
  const rows = subjects
    .map((subject, index) => {
      const roomNamesText = subject.roomNames.length > 0 ? subject.roomNames.join("، ") : "لا توجد أسماء قاعات مسجلة";
      return `
      <tr>
        <td class="num">${fmtNum(index + 1)}</td>
        <td>
          <span class="subject-main">${esc(subject.subjectName)}</span>
          <span class="cell-note">${esc(subject.branchName)} · ${esc(formatCollegeStudyStageLabel(subject.stageLevel))}</span>
        </td>
        <td class="num">${esc(scheduleTypeLabel(subject.scheduleType))}</td>
        <td class="num">${esc(mealSlotLabel(subject.mealSlot))}</td>
        <td>
          <span class="subject-main">${fmtNum(subject.roomCount)}</span>
          <span class="cell-note">${esc(roomNamesText)}</span>
        </td>
        <td class="num">${fmtNum(subject.totalStudents)}</td>
        <td class="num">${fmtNum(subject.attendance)}</td>
        <td class="num">${fmtNum(subject.absence)}</td>
        <td class="num">
          <span class="ratio-main">${fmtNum(subject.approvedRooms)} / ${fmtNum(subject.roomCount)}</span>
          <span class="cell-note">${esc(completionLabel(subject.approvedRooms, subject.roomCount))}</span>
        </td>
        <td class="num">
          <span class="ratio-main">${fmtNum(subject.authenticatedRooms)} / ${fmtNum(subject.roomCount)}</span>
          <span class="cell-note">${esc(completionLabel(subject.authenticatedRooms, subject.roomCount))}</span>
        </td>
      </tr>`;
    })
    .join("");

  return `
    <section class="report-section">
      <div class="section-head">
        <h2>${esc(title)}</h2>
        <span class="section-count">عدد المواد: ${fmtNum(subjects.length)}</span>
      </div>
      <table class="subject-table" aria-label="${esc(title)}">
        <thead>
          <tr>
            <th style="width: 5%">ت</th>
            <th style="width: 22%">المادة والقسم / الفرع</th>
            <th style="width: 8%">نوع الامتحان</th>
            <th style="width: 7%">الوجبة</th>
            <th style="width: 17%">القاعات</th>
            <th style="width: 9%">الطلبة</th>
            <th style="width: 8%">الحضور</th>
            <th style="width: 8%">الغياب</th>
            <th style="width: 8%">اعتماد القسم</th>
            <th style="width: 8%">مصادقة العميد</th>
          </tr>
        </thead>
        <tbody>
          ${
            subjects.length > 0
              ? rows
              : `<tr><td colspan="10" class="empty-row">${esc(emptyText)}</td></tr>`
          }
        </tbody>
      </table>
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
  const logoSrc = "/logo2.png";

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
    "لا توجد مواد ممتحنة ضمن هذا التقرير."
  );
  const approvedSection = renderSubjectList(
    "المواد المعتمدة من رئيس القسم / الفرع",
    approvedByDept,
    "لا توجد مواد مكتملة الاعتماد من رئيس القسم / الفرع."
  );
  const notApprovedSection = renderSubjectList(
    "المواد غير المعتمدة من رئيس القسم / الفرع",
    notApprovedByDept,
    "لا توجد مواد غير معتمدة من رئيس القسم / الفرع."
  );
  const authenticatedSection = renderSubjectList(
    "المواد التي تم المصادقة عليها من حساب العميد",
    authenticated,
    "لا توجد مواد مصادق عليها من حساب العميد."
  );
  const notAuthenticatedSection = renderSubjectList(
    "المواد التي لم يتم المصادقة عليها من حساب العميد",
    notAuthenticated,
    "لا توجد مواد بانتظار مصادقة حساب العميد."
  );

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>تقرير مخصص - ${esc(formationLabel)} - ${esc(examDate)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm 9mm 12mm; }
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @font-face {
      font-family: "Alhurra";
      src: url("/fonts/Alhurra-Regular.woff2") format("woff2");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    body {
      margin: 0;
      color: #111827;
      font-family: "Arial (Body CS)", Arial, Tahoma, sans-serif;
      background: #fff;
      font-size: 10pt;
      line-height: 1.5;
    }
    .sheet {
      border: 1px solid #9ca3af;
      padding: 8mm 8mm 6mm;
      background: #fff;
    }
    .report-brand {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 10px;
      margin: 0 0 4mm;
      padding-bottom: 3mm;
      border-bottom: 1px solid #9ca3af;
    }
    .report-brand-side {
      font-family: "Alhurra", "Times New Roman", serif;
      font-size: 11pt;
      font-weight: 400;
      color: #1f2937;
    }
    .report-brand-college-side { text-align: left; }
    .report-brand-uni-side { text-align: right; }
    .report-brand-logo { height: 48px; width: auto; max-width: 88px; object-fit: contain; }
    .title-block { text-align: center; margin-bottom: 4mm; }
    .title-kicker {
      margin: 0 0 1mm;
      font-size: 9pt;
      color: #6b7280;
      letter-spacing: 0.02em;
    }
    .title-block h1 {
      margin: 0;
      font-family: "Alhurra", "Times New Roman", serif;
      font-size: 18pt;
      font-weight: 400;
      color: #111827;
    }
    .meta-table,
    .summary-table,
    .subject-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .meta-table { margin-bottom: 4mm; font-size: 9.4pt; }
    .meta-table th,
    .meta-table td,
    .summary-table th,
    .summary-table td,
    .subject-table th,
    .subject-table td {
      border: 1px solid #9ca3af;
      padding: 5px 7px;
      text-align: right;
      vertical-align: top;
    }
    .meta-table th,
    .summary-table th,
    .subject-table th {
      background: #e7eef6;
      color: #1f2937;
      font-weight: 600;
    }
    .summary-table tbody tr:nth-child(even),
    .subject-table tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    .meta-table th { width: 22%; }
    .summary-wrap { margin-bottom: 4mm; }
    .summary-table { font-size: 9.3pt; }
    .summary-table th { width: 30%; }
    .summary-table td {
      width: 20%;
      text-align: center;
      font-size: 14pt;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: #111827;
    }
    .stages-box {
      border: 1px solid #9ca3af;
      padding: 6px 8px;
      margin-bottom: 4mm;
      font-size: 9.3pt;
    }
    .stages-box h2 {
      margin: 0 0 2mm;
      font-family: "Alhurra", "Times New Roman", serif;
      font-size: 11pt;
      color: #111827;
      font-weight: 400;
    }
    .pill {
      display: inline-block;
      margin: 0 0 4px 4px;
      border: 1px solid #9ca3af;
      background: #fff;
      padding: 1px 8px;
      font-size: 8.7pt;
      color: #1f2937;
    }
    .sections { display: block; }
    .report-section {
      margin-top: 5mm;
      break-inside: avoid-page;
      page-break-inside: avoid;
    }
    .section-head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 2mm;
      padding-bottom: 1.5mm;
      border-bottom: 1px solid #9ca3af;
    }
    .section-head h2 {
      margin: 0;
      font-family: "Alhurra", "Times New Roman", serif;
      font-size: 13pt;
      font-weight: 400;
      color: #111827;
    }
    .section-count {
      font-size: 8.8pt;
      font-weight: 600;
      color: #4b5563;
      white-space: nowrap;
    }
    .subject-table { font-size: 8.1pt; }
    .subject-table td.num,
    .subject-table th.num {
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .subject-main {
      display: block;
      font-weight: 600;
      color: #111827;
    }
    .ratio-main {
      display: block;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: #111827;
    }
    .cell-note {
      display: block;
      margin-top: 2px;
      font-size: 7.5pt;
      line-height: 1.4;
      color: #4b5563;
    }
    .empty-row {
      text-align: center !important;
      color: #6b7280;
      padding: 8px;
      font-size: 9pt;
    }
    .foot {
      margin-top: 6mm;
      padding-top: 3mm;
      border-top: 1px solid #9ca3af;
      color: #6b7280;
      font-size: 8.6pt;
      text-align: center;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  </style>
</head>
<body>
  <main class="sheet">
    <section class="report-brand" dir="ltr">
      <div class="report-brand-side report-brand-college-side">متابعة المواقف الامتحانية</div>
      <div style="text-align:center"><img class="report-brand-logo" src="${esc(logoSrc)}" alt="" /></div>
      <div class="report-brand-side report-brand-uni-side">جامعة البصرة</div>
    </section>
    <section class="title-block">
      <p class="title-kicker">وثيقة رسمية مولدة آليًا</p>
      <h1>تقرير مخصص لمتابعة المواقف الامتحانية</h1>
    </section>
    <table class="meta-table" aria-label="بيانات التقرير الأساسية">
      <tbody>
        <tr>
          <th>اسم الكلية / التشكيل</th>
          <td>${esc(formationLabel)}</td>
        </tr>
        <tr>
          <th>القسم / الفرع</th>
          <td>${esc(branches.length > 0 ? branches.join("، ") : "—")}</td>
        </tr>
        <tr>
          <th>اليوم الامتحاني</th>
          <td>${esc(fmtDate(examDate))}</td>
        </tr>
      </tbody>
    </table>
    ${cards}
    <section class="stages-box">
      <h2>المراحل الممتحنة</h2>
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

