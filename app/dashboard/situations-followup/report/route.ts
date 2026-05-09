import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { getExamSituationBundleForOwner } from "@/lib/college-exam-situations";
import {
  buildExamSituationBundleReportHtml,
  buildExamSituationReportHtml,
} from "@/lib/college-exam-situation-report-html";
import { getSession } from "@/lib/session";

function withAutoPrint(html: string): string {
  const script = `
<script>
  (function () {
    const run = function () {
      try { window.print(); } catch (e) {}
    };
    if (document.readyState === "complete") {
      setTimeout(run, 120);
    } else {
      window.addEventListener("load", function () { setTimeout(run, 120); }, { once: true });
    }
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
  const scheduleId = url.searchParams.get("scheduleId")?.trim() ?? "";
  if (!ownerUserId || !/^\d+$/.test(scheduleId)) {
    return new Response("معرّفات التقرير غير صالحة.", { status: 400 });
  }

  const [bundle, ownerProfile] = await Promise.all([
    getExamSituationBundleForOwner(ownerUserId, scheduleId),
    getCollegeProfileByUserId(ownerUserId),
  ]);
  if (!bundle?.sessions.length) {
    return new Response("تعذر تحميل بيانات الموقف.", { status: 404 });
  }

  const collegeLabel =
    ownerProfile?.formation_name?.trim() || ownerProfile?.holder_name?.trim() || ownerProfile?.dean_name?.trim() || "—";
  const deanName = ownerProfile?.dean_name ?? "";
  const origin = url.origin;
  const baseHtml =
    bundle.sessions.length > 1
      ? buildExamSituationBundleReportHtml(bundle.sessions, collegeLabel, deanName, new Date(), origin)
      : buildExamSituationReportHtml(bundle.sessions[0]!, collegeLabel, deanName, new Date(), origin);

  return new Response(withAutoPrint(baseHtml), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
