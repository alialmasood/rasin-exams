import { redirect } from "next/navigation";
import { isAdminRole, type UserRole } from "@/lib/authz";
import { listAdminExamParticipationReport } from "@/lib/admin-exam-participation-report";
import { getSession } from "@/lib/session";
import { AdminStudentsParticipationPanel } from "./admin-students-participation-panel";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role === "COLLEGE") {
    redirect("/dashboard/college/exam-schedules");
  }
  if (!isAdminRole(session.role as UserRole)) {
    redirect("/dashboard");
  }

  const initialRows = await listAdminExamParticipationReport();
  return <AdminStudentsParticipationPanel initialRows={initialRows} />;
}
