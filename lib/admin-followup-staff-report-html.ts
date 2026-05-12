import type { AdminOfficialSituationFollowupRow } from "@/lib/college-exam-situations";
import { formatCollegeStudyStageLabel } from "@/lib/college-study-stage-display";

function esc(v: string): string {
  return String(v)
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

function fmtGeneratedAt(value: Date): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ-u-ca-gregory-nu-latn", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Baghdad",
    }).format(value);
  } catch {
    return value.toISOString();
  }
}

function fmtNum(n: number): string {
  try {
    return new Intl.NumberFormat("en-US").format(n);
  } catch {
    return String(n);
  }
}

function normalizeKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ar");
}

function splitNames(raw: string): string[] {
  return String(raw)
    .split(/[,،;|\n\r]+/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function timeRangeLabel(start: string, end: string): string {
  const s = start?.trim() || "--:--";
  const e = end?.trim() || "--:--";
  return `${s} - ${e}`;
}

function mealSlotLabel(slot: 1 | 2): string {
  return slot === 2 ? "الوجبة الثانية" : "الوجبة الأولى";
}

function hasSupervisorAbsence(row: AdminOfficialSituationFollowupRow): boolean {
  const info = row.situation_staff_absences;
  return info.supervisor_absent || info.supervisor_absence_reason.trim().length > 0 || info.supervisor_substitute_name.trim().length > 0;
}

type StaffAbsenceEntry = {
  formationLabel: string;
  branchName: string;
  subjectName: string;
  roomName: string;
  examDate: string;
  timeLabel: string;
  personName: string;
  reason: string;
  substituteName: string;
};

type BranchSection = {
  branchName: string;
  rows: AdminOfficialSituationFollowupRow[];
};

type FormationSection = {
  formationLabel: string;
  branches: BranchSection[];
};

function buildSections(rows: AdminOfficialSituationFollowupRow[]): FormationSection[] {
  const formationMap = new Map<string, Map<string, AdminOfficialSituationFollowupRow[]>>();

  for (const row of rows) {
    const formationLabel = row.formation_label.trim() || "—";
    const branchName = row.branch_name.trim() || "—";
    if (!formationMap.has(formationLabel)) formationMap.set(formationLabel, new Map());
    const branchMap = formationMap.get(formationLabel)!;
    if (!branchMap.has(branchName)) branchMap.set(branchName, []);
    branchMap.get(branchName)!.push(row);
  }

  return [...formationMap.entries()]
    .map(([formationLabel, branchMap]) => ({
      formationLabel,
      branches: [...branchMap.entries()]
        .map(([branchName, branchRows]) => ({
          branchName,
          rows: [...branchRows].sort((a, b) => {
            const byTime = `${a.start_time} ${a.end_time}`.localeCompare(`${b.start_time} ${b.end_time}`, "en");
            if (byTime !== 0) return byTime;
            const byRoom = a.room_name.localeCompare(b.room_name, "ar");
            if (byRoom !== 0) return byRoom;
            return a.subject_name.localeCompare(b.subject_name, "ar");
          }),
        }))
        .sort((a, b) => a.branchName.localeCompare(b.branchName, "ar")),
    }))
    .sort((a, b) => a.formationLabel.localeCompare(b.formationLabel, "ar"));
}

function collectSummary(rows: AdminOfficialSituationFollowupRow[]) {
  const formationSet = new Set<string>();
  const branchSet = new Set<string>();
  const roomSet = new Set<string>();
  const subjectSet = new Set<string>();
  const supervisorSet = new Set<string>();
  const invigilatorSet = new Set<string>();
  const absentSupervisorSet = new Set<string>();
  const absentInvigilatorSet = new Set<string>();
  const supervisorAbsenceItems: StaffAbsenceEntry[] = [];
  const invigilatorAbsenceItems: StaffAbsenceEntry[] = [];
  const supervisorItemSeen = new Set<string>();
  const invigilatorItemSeen = new Set<string>();

  for (const row of rows) {
    formationSet.add(row.formation_label.trim() || "—");
    branchSet.add(`${row.formation_label.trim() || "—"}::${row.branch_name.trim() || "—"}`);
    roomSet.add(row.room_id);
    subjectSet.add(`${row.study_subject_id}::${row.branch_name.trim() || "—"}`);

    const supervisorName = row.supervisor_name.trim();
    if (supervisorName) supervisorSet.add(normalizeKey(supervisorName));
    for (const invigilator of splitNames(row.invigilators)) {
      invigilatorSet.add(normalizeKey(invigilator));
    }

    const common = {
      formationLabel: row.formation_label.trim() || "—",
      branchName: row.branch_name.trim() || "—",
      subjectName: row.subject_name.trim() || "—",
      roomName: row.room_name.trim() || "—",
      examDate: row.exam_date,
      timeLabel: timeRangeLabel(row.start_time, row.end_time),
    };

    if (hasSupervisorAbsence(row)) {
      const item: StaffAbsenceEntry = {
        ...common,
        personName: supervisorName || "—",
        reason: row.situation_staff_absences.supervisor_absence_reason.trim() || "—",
        substituteName: row.situation_staff_absences.supervisor_substitute_name.trim() || "—",
      };
      const personKey = item.personName !== "—" ? normalizeKey(item.personName) : normalizeKey(`${item.formationLabel}-${item.branchName}-${item.roomName}`);
      absentSupervisorSet.add(personKey);
      const detailKey = normalizeKey(
        `${item.formationLabel}|${item.branchName}|${item.subjectName}|${item.roomName}|${item.timeLabel}|${item.personName}|${item.reason}|${item.substituteName}`
      );
      if (!supervisorItemSeen.has(detailKey)) {
        supervisorItemSeen.add(detailKey);
        supervisorAbsenceItems.push(item);
      }
    }

    for (const inv of row.situation_staff_absences.invigilator_absences) {
      const absentName = inv.absent_name.trim();
      if (!absentName) continue;
      const item: StaffAbsenceEntry = {
        ...common,
        personName: absentName,
        reason: inv.absence_reason.trim() || "—",
        substituteName: inv.substitute_name.trim() || "—",
      };
      absentInvigilatorSet.add(normalizeKey(absentName));
      const detailKey = normalizeKey(
        `${item.formationLabel}|${item.branchName}|${item.subjectName}|${item.roomName}|${item.timeLabel}|${item.personName}|${item.reason}|${item.substituteName}`
      );
      if (!invigilatorItemSeen.has(detailKey)) {
        invigilatorItemSeen.add(detailKey);
        invigilatorAbsenceItems.push(item);
      }
    }
  }

  return {
    formationCount: formationSet.size,
    branchCount: branchSet.size,
    roomCount: roomSet.size,
    subjectCount: subjectSet.size,
    supervisorCount: supervisorSet.size,
    invigilatorCount: invigilatorSet.size,
    absentSupervisorCount: absentSupervisorSet.size,
    absentInvigilatorCount: absentInvigilatorSet.size,
    supervisorAbsenceItems,
    invigilatorAbsenceItems,
  };
}

function renderAbsenceDetailItem(item: StaffAbsenceEntry): string {
  return `<li>
    <strong>${esc(item.personName)}</strong>
    <span> — السبب: ${esc(item.reason)}</span>
    <span> — البديل: ${esc(item.substituteName)}</span>
    <span> — التشكيل: ${esc(item.formationLabel)}</span>
    <span> — القسم/الفرع: ${esc(item.branchName)}</span>
    <span> — المادة: ${esc(item.subjectName)}</span>
    <span> — القاعة: ${esc(item.roomName)}</span>
    <span> — الوقت: ${esc(item.timeLabel)}</span>
  </li>`;
}

function renderAbsenceSummarySection(title: string, items: StaffAbsenceEntry[], emptyText: string): string {
  return `
    <section class="report-section">
      <div class="section-head">
        <h2>${esc(title)}</h2>
        <span class="section-count">عدد الحالات: ${fmtNum(items.length)}</span>
      </div>
      ${
        items.length > 0
          ? `<ul class="detail-list">${items.map(renderAbsenceDetailItem).join("")}</ul>`
          : `<div class="empty-block">${esc(emptyText)}</div>`
      }
    </section>`;
}

function renderSupervisorAbsenceCell(row: AdminOfficialSituationFollowupRow): string {
  if (!hasSupervisorAbsence(row)) return `<span class="muted">لا يوجد غياب</span>`;
  const name = row.supervisor_name.trim() || "—";
  const reason = row.situation_staff_absences.supervisor_absence_reason.trim() || "—";
  const substitute = row.situation_staff_absences.supervisor_substitute_name.trim() || "—";
  return `<div class="staff-stack">
    <span><strong>الاسم:</strong> ${esc(name)}</span>
    <span><strong>السبب:</strong> ${esc(reason)}</span>
    <span><strong>البديل:</strong> ${esc(substitute)}</span>
  </div>`;
}

function renderInvigilatorAbsenceCell(row: AdminOfficialSituationFollowupRow): string {
  const entries = row.situation_staff_absences.invigilator_absences.filter((item) => item.absent_name.trim().length > 0);
  if (entries.length === 0) return `<span class="muted">لا يوجد غياب</span>`;
  return `<div class="staff-stack">${entries
    .map(
      (item) => `<span><strong>${esc(item.absent_name.trim())}</strong> — السبب: ${esc(item.absence_reason.trim() || "—")} — البديل: ${esc(
        item.substitute_name.trim() || "—"
      )}</span>`
    )
    .join("")}</div>`;
}

function renderStaffNamesCell(title: string, values: string[], emptyText: string): string {
  if (values.length === 0) return `<span class="muted">${esc(emptyText)}</span>`;
  return `<div class="staff-stack">
    <span class="staff-title">${esc(title)}</span>
    ${values.map((value) => `<span>${esc(value)}</span>`).join("")}
  </div>`;
}

function renderBranchTable(branch: BranchSection): string {
  const rowsHtml = branch.rows
    .map(
      (row, index) => `<tr>
        <td class="num">${fmtNum(index + 1)}</td>
        <td>${esc(row.room_name.trim() || "—")}</td>
        <td>
          <span class="main-line">${esc(row.subject_name.trim() || "—")}</span>
          <span class="sub-line">${esc(formatCollegeStudyStageLabel(row.stage_level))}</span>
        </td>
        <td>
          <span class="main-line">${esc(fmtDate(row.exam_date))}</span>
          <span class="sub-line">${esc(mealSlotLabel(row.meal_slot))}</span>
        </td>
        <td class="time-cell">${esc(timeRangeLabel(row.start_time, row.end_time))}</td>
        <td>${renderStaffNamesCell("مشرف القاعة", row.supervisor_name.trim() ? [row.supervisor_name.trim()] : [], "غير مسجل")}</td>
        <td>${renderStaffNamesCell("المراقبون", splitNames(row.invigilators), "غير مسجلين")}</td>
        <td>${renderSupervisorAbsenceCell(row)}</td>
        <td>${renderInvigilatorAbsenceCell(row)}</td>
      </tr>`
    )
    .join("");

  return `
    <section class="report-section">
      <div class="section-head">
        <h2>${esc(branch.branchName)}</h2>
        <span class="section-count">عدد القاعات/السجلات: ${fmtNum(branch.rows.length)}</span>
      </div>
      <table class="staff-table" aria-label="${esc(branch.branchName)}">
        <thead>
          <tr>
            <th style="width: 4%">ت</th>
            <th style="width: 8%">القاعة</th>
            <th style="width: 15%">المادة والمرحلة</th>
            <th style="width: 12%">التاريخ والوجبة</th>
            <th style="width: 10%">وقت الامتحان</th>
            <th style="width: 12%">المشرف</th>
            <th style="width: 15%">المراقبون</th>
            <th style="width: 12%">غياب المشرف</th>
            <th style="width: 12%">غياب المراقبين</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="9" class="empty-row">لا توجد سجلات.</td></tr>`}
        </tbody>
      </table>
    </section>`;
}

export function buildAdminFollowupStaffDailyReportHtml(args: {
  examDate: string;
  rows: AdminOfficialSituationFollowupRow[];
  generatedAt: Date;
}): string {
  const { examDate, rows, generatedAt } = args;
  const sections = buildSections(rows);
  const summary = collectSummary(rows);
  const formationNames = [...new Set(rows.map((row) => row.formation_label.trim() || "—"))].sort((a, b) => a.localeCompare(b, "ar"));
  const logoSrc = "/logo2.png";
  const documentTitle = `تقرير المشرفين والمراقبين - ${examDate}`;

  const summaryRows: Array<[string, number, string, number]> = [
    ["عدد التشكيلات", summary.formationCount, "عدد الأقسام/الفروع", summary.branchCount],
    ["عدد القاعات", summary.roomCount, "عدد المواد الامتحانية", summary.subjectCount],
    ["عدد المشرفين الكلي", summary.supervisorCount, "عدد المراقبين الكلي", summary.invigilatorCount],
    ["عدد غياب المشرفين", summary.absentSupervisorCount, "عدد غياب المراقبين", summary.absentInvigilatorCount],
  ];

  const summaryTable = `
    <section class="summary-wrap">
      <table class="summary-table" aria-label="ملخص التقرير">
        <tbody>
          ${summaryRows
            .map(
              ([rightLabel, rightValue, leftLabel, leftValue]) => `
              <tr>
                <th>${esc(rightLabel)}</th>
                <td>${fmtNum(rightValue)}</td>
                <th>${esc(leftLabel)}</th>
                <td>${fmtNum(leftValue)}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </section>`;

  const formationSectionsHtml = sections
    .map(
      (formation) => `
        <section class="formation-block">
          <div class="formation-head">
            <h2>${esc(formation.formationLabel)}</h2>
            <span>عدد الأقسام/الفروع: ${fmtNum(formation.branches.length)}</span>
          </div>
          ${formation.branches.map((branch) => renderBranchTable(branch)).join("")}
        </section>`
    )
    .join("");

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(documentTitle)}</title>
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
      line-height: 1.55;
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
    .staff-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .meta-table,
    .summary-table,
    .staff-table {
      margin-bottom: 4mm;
    }
    .meta-table th,
    .meta-table td,
    .summary-table th,
    .summary-table td,
    .staff-table th,
    .staff-table td {
      border: 1px solid #9ca3af;
      padding: 5px 7px;
      text-align: right;
      vertical-align: top;
    }
    .meta-table th,
    .summary-table th,
    .staff-table th {
      background: #e7eef6;
      color: #1f2937;
      font-weight: 600;
    }
    .meta-table th { width: 22%; }
    .summary-table th { width: 30%; }
    .summary-table td {
      width: 20%;
      text-align: center;
      font-size: 14pt;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .summary-wrap { margin-bottom: 4mm; }
    .report-section {
      margin-top: 5mm;
      break-inside: avoid-page;
      page-break-inside: avoid;
    }
    .section-head,
    .formation-head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 2mm;
      padding-bottom: 1.5mm;
      border-bottom: 1px solid #9ca3af;
    }
    .section-head h2,
    .formation-head h2 {
      margin: 0;
      font-family: "Alhurra", "Times New Roman", serif;
      font-size: 13pt;
      font-weight: 400;
      color: #111827;
    }
    .formation-block {
      margin-top: 5mm;
      padding-top: 1mm;
    }
    .formation-head {
      border-bottom-width: 2px;
      border-bottom-color: #334155;
    }
    .formation-head span,
    .section-count {
      font-size: 8.8pt;
      font-weight: 600;
      color: #4b5563;
      white-space: nowrap;
    }
    .staff-table {
      font-size: 8pt;
    }
    .staff-table tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    .num,
    .time-cell {
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .main-line,
    .staff-title {
      display: block;
      font-weight: 700;
      color: #111827;
    }
    .sub-line {
      display: block;
      margin-top: 2px;
      color: #4b5563;
      font-size: 7.4pt;
    }
    .staff-stack {
      display: block;
      line-height: 1.6;
    }
    .staff-stack > span {
      display: block;
      margin-bottom: 2px;
    }
    .muted {
      color: #6b7280;
      font-size: 7.6pt;
    }
    .detail-list {
      margin: 0;
      padding: 0 18px 0 0;
      line-height: 1.9;
      font-size: 9pt;
    }
    .detail-list li {
      margin-bottom: 5px;
    }
    .empty-block,
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
      <h1>تقرير المشرفين والمراقبين</h1>
    </section>
    <table class="meta-table" aria-label="بيانات التقرير الأساسية">
      <tbody>
        <tr>
          <th>اليوم الامتحاني</th>
          <td>${esc(fmtDate(examDate))}</td>
        </tr>
        <tr>
          <th>التشكيلات المشمولة</th>
          <td>${esc(formationNames.length > 0 ? formationNames.join("، ") : "—")}</td>
        </tr>
        <tr>
          <th>نوع التقرير</th>
          <td>تقرير رسمي للمشرفين والمراقبين مع حالات الغياب والأسباب</td>
        </tr>
        <tr>
          <th>تاريخ إنشاء التقرير</th>
          <td>${esc(fmtGeneratedAt(generatedAt))}</td>
        </tr>
      </tbody>
    </table>
    ${summaryTable}
    ${renderAbsenceSummarySection("غياب المشرفين", summary.supervisorAbsenceItems, "لا توجد حالات غياب مشرفين مسجلة لهذا اليوم.")}
    ${renderAbsenceSummarySection("غياب المراقبين", summary.invigilatorAbsenceItems, "لا توجد حالات غياب مراقبين مسجلة لهذا اليوم.")}
    ${formationSectionsHtml || `<div class="empty-block">لا توجد بيانات للمشرفين والمراقبين في هذا اليوم.</div>`}
    <section class="foot">
      قياس الورق: A4 — التقرير مخصص للطباعة أو الحفظ بصيغة PDF مباشرة.
    </section>
  </main>
</body>
</html>`;
}
