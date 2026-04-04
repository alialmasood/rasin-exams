import { redirect } from "next/navigation";
import type { UserRole } from "@/lib/authz";
import { isAdminRole } from "@/lib/authz";
import { getSession } from "@/lib/session";
import { ReportsHubPanel } from "./reports-hub-panel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "التقارير — لوحة الإدارة",
};

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  if (!isAdminRole(session.role as UserRole)) {
    redirect(session.role === "COLLEGE" ? "/dashboard/college" : "/dashboard");
  }

  return <ReportsHubPanel />;
}
