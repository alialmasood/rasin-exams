import { redirect } from "next/navigation";
import { AdminDashboardShell } from "@/components/dashboard/admin-dashboard-shell";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  let displayName = "admin";
  let sidebarTagline = "adminuob";
  let roleDescription = "مدير النظام";

  if (session.role === "COLLEGE") {
    const profile = await getCollegeProfileByUserId(session.uid);
    displayName = session.username;
    sidebarTagline =
      profile?.account_kind === "FOLLOWUP"
        ? (profile.holder_name ?? "متابعة مركزية")
        : (profile?.formation_name ?? "حساب كلية");
    roleDescription =
      profile?.account_kind === "FOLLOWUP" ? "متابعة مركزية" : "حساب كلية";
  }

  return (
    <AdminDashboardShell
      username={session.username}
      role={session.role}
      displayName={displayName}
      sidebarTagline={sidebarTagline}
      roleDescription={roleDescription}
    >
      {children}
    </AdminDashboardShell>
  );
}
