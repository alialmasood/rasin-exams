import Link from "next/link";
import { redirect } from "next/navigation";
import { SituationFormA4Preview } from "@/components/situation-form/situation-form-a4-preview";
import { getSituationFormSubmissionForOwner } from "@/lib/college-situation-form-submissions";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ExamSituationFormDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "COLLEGE") redirect("/dashboard");

  const row = await getSituationFormSubmissionForOwner(session.uid, id);
  if (!row) redirect("/dashboard/college/status-followup");

  const submittedAtLabel = new Intl.DateTimeFormat("ar-IQ-u-ca-gregory-nu-latn", {
    timeZone: "Asia/Baghdad",
    dateStyle: "full",
    timeStyle: "short",
  }).format(row.submitted_at);

  return (
    <div className="mx-auto max-w-5xl px-3 pb-10 pt-4 sm:px-4" dir="rtl">
      <nav className="mb-4 text-[12px] font-semibold text-[#64748B]">
        <Link href="/dashboard/college/status-followup" className="text-[#2563EB] hover:underline">
          متابعة المواقف
        </Link>
        <span className="mx-1.5 text-[#CBD5E1]">/</span>
        <span className="text-[#0F172A]">موقف مرفوع (نموذج)</span>
      </nav>
      <SituationFormA4Preview payload={row.payload} submittedAtLabel={submittedAtLabel} />
    </div>
  );
}
