import { redirect, notFound } from "next/navigation";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { getExamSituationBundleForOwner } from "@/lib/college-exam-situations";
import { getSession } from "@/lib/session";
import { SituationDetailClient } from "./situation-detail-client";

export const dynamic = "force-dynamic";

export default async function UploadStatusDetailPage({
  params,
}: {
  params: Promise<{ scheduleId: string }>;
}) {
  const { scheduleId } = await params;
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "COLLEGE") redirect("/dashboard");

  const [bundle, profile] = await Promise.all([
    getExamSituationBundleForOwner(session.uid, scheduleId),
    getCollegeProfileByUserId(session.uid),
  ]);
  if (!bundle) notFound();

  const collegeLabel =
    profile?.account_kind === "FOLLOWUP"
      ? (profile.holder_name ?? "—")
      : (profile?.formation_name ?? "—");
  const deanName = profile?.dean_name ?? "";

  return (
    <SituationDetailClient
      key={bundle.sessions
        .map((s) => `${s.schedule_id}-${s.attendance_count}-${s.absence_count}-${s.head_submitted_at ?? "0"}-${s.dean_status}`)
        .join("|")}
      bundle={bundle}
      collegeLabel={collegeLabel}
      deanName={deanName}
    />
  );
}
