import { redirect } from "next/navigation";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { listOfficialExamSituationsForOwner } from "@/lib/college-exam-situations";
import { buildUploadStatusListItems } from "@/lib/upload-status-display";
import { getSession } from "@/lib/session";
import { UploadStatusPanel } from "./upload-status-panel";

export const dynamic = "force-dynamic";

export default async function CollegeUploadStatusPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "COLLEGE") redirect("/dashboard");

  const [rows, profile] = await Promise.all([
    listOfficialExamSituationsForOwner(session.uid),
    getCollegeProfileByUserId(session.uid),
  ]);
  const listItems = buildUploadStatusListItems(rows);

  const collegeLabel =
    profile?.account_kind === "FOLLOWUP"
      ? (profile.holder_name ?? "—")
      : (profile?.formation_name ?? "—");

  return <UploadStatusPanel listItems={listItems} collegeLabel={collegeLabel} />;
}
