import { buildAdminTodayExamsReportHtml } from "@/lib/admin-today-exams-report-html";
import { aggregateSchedulesForTodayExams, baghdadIsoDateToday } from "@/lib/admin-today-exams";
import type { UserRole } from "@/lib/authz";
import { isAdminRole } from "@/lib/authz";
import { formatCollegeStudyStageLabel } from "@/lib/college-study-stage-display";
import { listAllCollegeExamSchedulesForAdminByDate } from "@/lib/college-exam-schedules";
import { STUDY_TYPE_LABEL_AR } from "@/lib/study-type-labels-ar";
import { formatExamMealSlotLabel } from "@/lib/exam-meal-slot";
import { getSession } from "@/lib/session";

function withAutoPrint(html: string): string {
  const script = `
<script>
  (function () {
    const run = function () { try { window.print(); } catch (e) {} };
    if (document.readyState === "complete") setTimeout(run, 140);
    else window.addEventListener("load", function () { setTimeout(run, 140); }, { once: true });
  })();
</script>`;
  if (html.includes("</body>")) return html.replace("</body>", `${script}</body>`);
  return `${html}${script}`;
}

export async function GET(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return new Response("غير مصرح.", { status: 403 });
  }

  const url = new URL(req.url);
  const raw = url.searchParams.get("date")?.trim() ?? "";
  const examDate = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : baghdadIsoDateToday();

  const scheduleRows = await listAllCollegeExamSchedulesForAdminByDate(examDate);
  const aggregated = aggregateSchedulesForTodayExams(scheduleRows);
  const formationCount = new Set(scheduleRows.map((r) => r.owner_user_id)).size;

  const rows = aggregated.map((r) => ({
    formation_label: r.formation_label,
    college_subject_name: r.college_subject_name,
    study_subject_name: r.study_subject_name,
    stage_label: formatCollegeStudyStageLabel(r.stage_level),
    study_type_label: STUDY_TYPE_LABEL_AR[r.study_type],
    meal_label: formatExamMealSlotLabel(r.meal_slot),
    room_sessions: r.room_sessions,
    total_students_in_rooms: r.total_students_in_rooms,
  }));

  const html = buildAdminTodayExamsReportHtml({
    examDate,
    formationCount,
    rows,
    generatedAt: new Date(),
    assetsBaseUrl: url.origin,
  });

  return new Response(withAutoPrint(html), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
