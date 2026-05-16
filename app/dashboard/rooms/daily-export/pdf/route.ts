import { buildAdminRoomsByDateReportHtml } from "@/lib/admin-rooms-by-date-export";
import { baghdadIsoDateToday } from "@/lib/admin-today-exams";
import type { UserRole } from "@/lib/authz";
import { isAdminRole } from "@/lib/authz";
import { listAllCollegeExamRoomsParticipatingOnDateForAdmin } from "@/lib/college-rooms";
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

function generatedLabelAr(): string {
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

export async function GET(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return new Response("غير مصرح.", { status: 403 });
  }

  const url = new URL(req.url);
  const raw = url.searchParams.get("date")?.trim() ?? "";
  const examDate = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : baghdadIsoDateToday();
  const rows = await listAllCollegeExamRoomsParticipatingOnDateForAdmin(examDate);

  const html = buildAdminRoomsByDateReportHtml({
    examDate,
    rows,
    generatedLabel: generatedLabelAr(),
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
