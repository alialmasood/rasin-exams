import { redirect } from "next/navigation";
import { CollegePortalBasePathProvider } from "@/components/dashboard/college-portal-base-path";
import { AdminDashboardShell } from "@/components/dashboard/admin-dashboard-shell";
import { departmentDashboardNavSections } from "@/components/dashboard/nav-config";
import { CollegeQuickActionsProvider } from "@/app/dashboard/college/college-quick-actions";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { collegePortalDisplayLabel, loadCollegeWorkspaceForPages } from "@/lib/college-portal-scope";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DepartmentLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "COLLEGE") redirect("/dashboard");
  const ws = await loadCollegeWorkspaceForPages(session);
  if (!ws || ws.basePath !== "/department") redirect("/dashboard/college");

  const profile = await getCollegeProfileByUserId(session.uid);
  const sidebarTagline = profile ? collegePortalDisplayLabel(profile) : ws.collegeLabel;

  return (
    <CollegePortalBasePathProvider value="/department">
      <CollegeQuickActionsProvider>
        <AdminDashboardShell
          username={session.username}
          role={session.role}
          displayName={session.username}
          sidebarTagline={sidebarTagline}
          roleDescription="حساب قسم / فرع"
          collegeNavSections={departmentDashboardNavSections}
          collegeNavRootPath="/department"
        >
          {children}
        </AdminDashboardShell>
      </CollegeQuickActionsProvider>
    </CollegePortalBasePathProvider>
  );
}
