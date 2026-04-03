import { buildExamSituationReportHtml } from "@/lib/college-exam-situation-report-html";
import type { CentralTrackingExamRow, ExamSituationDetail } from "@/lib/college-exam-situations";
import { parseTimeToMinutes } from "@/lib/exam-situation-window";

function durationMinutes(start: string, end: string): number {
  const a = parseTimeToMinutes(start);
  const b = parseTimeToMinutes(end);
  if (a < 0 || b < 0) return 0;
  return Math.max(0, b - a);
}

function situationReportGeneratedAtLabel(): string {
  try {
    return new Date().toLocaleString("ar-IQ", {
      timeZone: "Asia/Baghdad",
      dateStyle: "full",
      timeStyle: "short",
    });
  } catch {
    return new Date().toISOString();
  }
}

/** يبني كائن تقرير الموقف الرسمي من صف المتابعة المركزية (معرّفات النظام الداخلية قد تكون «—»). */
export function centralTrackingRowToExamSituationDetail(row: CentralTrackingExamRow): ExamSituationDetail {
  const uploaded = row.reportStatus !== "NOT_SUBMITTED";
  const notesTrim = row.instructor.trim();
  const namesM = row.absenceNamesMorning ?? "";
  const namesE = row.absenceNamesEvening ?? "";

  return {
    schedule_id: row.scheduleId,
    college_subject_id: "—",
    study_subject_id: "—",
    exam_date: row.examDate,
    start_time: row.startTime,
    end_time: row.endTime,
    duration_minutes: durationMinutes(row.startTime, row.endTime),
    schedule_type: row.examType,
    workflow_status: "APPROVED",
    room_id: "—",
    room_name: row.roomName,
    capacity_total: row.studentsCount,
    attendance_count: row.attendanceCount,
    absence_count: row.absencesCount,
    subject_name: row.subject,
    study_type: row.studyTypeKey,
    branch_name: row.department,
    academic_year: row.academicYear,
    stage_level: row.stageLevel,
    head_submitted_at: row.headSubmittedAtIso ? new Date(row.headSubmittedAtIso) : null,
    dean_status: row.deanStatus,
    dean_reviewed_at: null,
    is_uploaded: uploaded,
    is_complete: row.reportStatus === "SUBMITTED",
    branch_head_name: "",
    supervisor_name: "",
    invigilators: "",
    absence_names: row.absenceDetails.trim() && row.absenceDetails !== "—" ? row.absenceDetails : "",
    notes: notesTrim && notesTrim !== "—" ? notesTrim : null,
    capacity_morning: row.capacityMorning,
    capacity_evening: row.capacityEvening,
    attendance_morning: row.attendanceMorning,
    absence_morning: row.absencesMorning,
    attendance_evening: row.attendanceEvening,
    absence_evening: row.absencesEvening,
    absence_names_morning: namesM,
    absence_names_evening: namesE,
  };
}

function openSituationPrintWindow(html: string): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  try {
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    const runPrint = () => {
      try {
        w.print();
      } catch {
        window.alert("تعذر بدء الطباعة. جرّب متصفحاً آخر أو أعد المحاولة.");
      }
    };
    if (w.document.readyState === "complete") {
      window.setTimeout(runPrint, 150);
    } else {
      w.addEventListener("load", () => window.setTimeout(runPrint, 150), { once: true });
    }
  } catch {
    try {
      w.close();
    } catch {
      /* ignore */
    }
    return false;
  }
  return true;
}

/** طباعة / حفظ PDF لتقرير الموقف الرسمي لجلسة واحدة (نفس قالب تقرير الكلية). */
export function printCentralTrackingSingleSituation(row: CentralTrackingExamRow): boolean {
  const detail = centralTrackingRowToExamSituationDetail(row);
  const html = buildExamSituationReportHtml(
    detail,
    row.collegeName.trim() || "—",
    "—",
    situationReportGeneratedAtLabel()
  );
  return openSituationPrintWindow(html);
}
