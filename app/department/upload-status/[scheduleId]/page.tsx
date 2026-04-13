import { notFound, redirect } from "next/navigation";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { collegePortalDisplayLabel, departmentCanAccessCollegeSubjectRow } from "@/lib/college-portal-scope";
import { getExamSituationBundleForOwner } from "@/lib/college-exam-situations";
import { getSession } from "@/lib/session";
import { SituationDetailClient } from "@/app/dashboard/college/upload-status/[scheduleId]/situation-detail-client";
import { requireDepartmentPortalWorkspace } from "../../dept-workspace";

export const dynamic = "force-dynamic";

export default async function DepartmentUploadStatusDetailPage({
  params,
}: {
  params: Promise<{ scheduleId: string }>;
}) {
  const { scheduleId } = await params;
  const session = await getSession();
  if (!session) redirect("/");

  const { ws } = await requireDepartmentPortalWorkspace();

  const [bundle, profile] = await Promise.all([
    getExamSituationBundleForOwner(ws.dataOwnerUserId, scheduleId),
    getCollegeProfileByUserId(ws.sessionUserId),
  ]);
  if (!bundle?.sessions.length) notFound();

  const first = bundle.sessions[0]!;
  if (!departmentCanAccessCollegeSubjectRow(session, first.college_subject_id)) {
    notFound();
  }

  const collegeLabel = profile ? collegePortalDisplayLabel(profile) : ws.collegeLabel;
  const deanName = profile?.dean_name ?? "";

  return (
    <SituationDetailClient
      key={bundle.sessions
        .map(
          (s) =>
            `${s.schedule_id}-${s.attendance_count}-${s.absence_count}-${s.exam_booklets_received}-${s.exam_booklets_used}-${s.exam_booklets_damaged}-${s.head_submitted_at ?? "0"}-${s.dean_status}`
        )
        .join("|")}
      bundle={bundle}
      collegeLabel={collegeLabel}
      deanName={deanName}
    />
  );
}
