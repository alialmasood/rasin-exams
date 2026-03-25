import { redirect } from "next/navigation";
import { AdminDashboardShell } from "@/components/dashboard/admin-dashboard-shell";
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

  return <AdminDashboardShell username={session.username}>{children}</AdminDashboardShell>;
}
