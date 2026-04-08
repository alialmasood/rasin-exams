import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SituationFormA4Preview } from "@/components/situation-form/situation-form-a4-preview";
import { getSituationFormSubmissionForOwner } from "@/lib/college-situation-form-submissions";
import { getCollegePortalDataOwnerUserId } from "@/lib/college-portal-scope";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { getSession } from "@/lib/session";
import { requireDepartmentPortalWorkspace } from "../../dept-workspace";

export const dynamic = "force-dynamic";

export default async function DepartmentExamSituationFormDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/");

  const { ws } = await requireDepartmentPortalWorkspace();
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) redirect("/department/status-followup");

  const row = await getSituationFormSubmissionForOwner(ownerUserId, id);
  if (!row) redirect("/department/status-followup");

  const profile = await getCollegeProfileByUserId(ws.sessionUserId);
  const branchFilter = profile?.scoped_branch_name?.trim();
  if (branchFilter && row.payload.department.trim() !== branchFilter) {
    notFound();
  }

  const submittedAtLabel = new Intl.DateTimeFormat("ar-IQ-u-ca-gregory-nu-latn", {
    timeZone: "Asia/Baghdad",
    dateStyle: "full",
    timeStyle: "short",
  }).format(row.submitted_at);

  return (
    <div className="mx-auto max-w-5xl px-3 pb-10 pt-4 sm:px-4" dir="rtl">
      <nav className="mb-4 text-[12px] font-semibold text-[#64748B]">
        <Link href="/department/status-followup" className="text-[#2563EB] hover:underline">
          متابعة المواقف
        </Link>
        <span className="mx-1.5 text-[#CBD5E1]">/</span>
        <span className="text-[#0F172A]">موقف مرفوع (نموذج)</span>
      </nav>
      <SituationFormA4Preview payload={row.payload} submittedAtLabel={submittedAtLabel} />
    </div>
  );
}
