import { listAllOfficialExamSituationsForAdmin } from "@/lib/college-exam-situations";
import { buildAdminFollowupCustomFormationReportHtml } from "@/lib/admin-followup-custom-report-html";
import { getSession } from "@/lib/session";

function withAutoPrint(html: string): string {
  const script = `
<script>
  (function () {
    const run = function () { try { window.print(); } catch (e) {} };
    if (document.readyState === "complete") setTimeout(run, 120);
    else window.addEventListener("load", function () { setTimeout(run, 120); }, { once: true });
  })();
</script>`;
  if (html.includes("</body>")) return html.replace("</body>", `${script}</body>`);
  return `${html}${script}`;
}

export async function GET(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session || session.role === "COLLEGE") {
    return new Response("غير مصرح.", { status: 403 });
  }

  const url = new URL(req.url);
  const ownerUserId = url.searchParams.get("ownerUserId")?.trim() ?? "";
  const examDate = url.searchParams.get("examDate")?.trim() ?? "";
  if (!ownerUserId || !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
    return new Response("معلمات التقرير غير صالحة.", { status: 400 });
  }

  const all = await listAllOfficialExamSituationsForAdmin();
  const rows = all.filter((r) => r.owner_user_id === ownerUserId && r.exam_date === examDate);
  if (rows.length === 0) {
    return new Response("لا توجد بيانات لهذا التشكيل في اليوم المحدد.", { status: 404 });
  }

  const formationLabel = rows[0]?.formation_label?.trim() || "—";
  const html = buildAdminFollowupCustomFormationReportHtml({
    examDate,
    formationLabel,
    rows,
    generatedAt: new Date(),
  });
  return new Response(withAutoPrint(html), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

