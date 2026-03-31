import { redirect } from "next/navigation";
import { isAdminRole, type UserRole } from "@/lib/authz";
import { listAllCollegeExamRoomsForAdmin } from "@/lib/college-rooms";
import { getSession } from "@/lib/session";
import { AdminRoomsPanel } from "./admin-rooms-panel";

export const dynamic = "force-dynamic";

export default async function RoomsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role === "COLLEGE") {
    redirect("/dashboard/college/rooms-management");
  }
  if (!isAdminRole(session.role as UserRole)) {
    redirect("/dashboard");
  }

  const initialRows = await listAllCollegeExamRoomsForAdmin();
  return <AdminRoomsPanel initialRows={initialRows} />;
}
