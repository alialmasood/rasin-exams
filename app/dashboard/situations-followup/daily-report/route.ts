import { listAllOfficialExamSituationsForAdmin } from "@/lib/college-exam-situations";
import { buildAdminDailySituationsReportHtml } from "@/lib/admin-situations-daily-report-html";
import { getSession } from "@/lib/session";

function baghdadIsoDateNow(): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Baghdad",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const d = parts.find((p) => p.type === "day")?.value ?? "";
    const iso = `${y}-${m}-${d}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date().toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

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
  const examDateRaw = url.searchParams.get("examDate")?.trim() ?? "";
  const examDate = /^\d{4}-\d{2}-\d{2}$/.test(examDateRaw) ? examDateRaw : baghdadIsoDateNow();

  const all = await listAllOfficialExamSituationsForAdmin();
  const rows = all.filter((r) => r.exam_date === examDate);
  const html = buildAdminDailySituationsReportHtml({
    examDate,
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
