import { redirect } from "next/navigation";
import type { UserRole } from "@/lib/authz";
import { isAdminRole } from "@/lib/authz";
import { listCollegeAccounts } from "@/lib/college-accounts";
import { getSession } from "@/lib/session";
import { CollegeAccountsPanel } from "./college-accounts-panel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "إدارة الحسابات",
};

export default async function CollegeAccountsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  if (!isAdminRole(session.role as UserRole)) {
    redirect(session.role === "COLLEGE" ? "/dashboard/college" : "/dashboard");
  }

  const rows = await listCollegeAccounts();

  return <CollegeAccountsPanel initialRows={rows} />;
}
