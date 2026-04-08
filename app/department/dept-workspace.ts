import { redirect } from "next/navigation";
import type { CollegeWorkspaceForPages } from "@/lib/college-portal-scope";
import { loadCollegeWorkspaceForPages } from "@/lib/college-portal-scope";
import { getSession } from "@/lib/session";

export async function requireDepartmentPortalWorkspace(): Promise<{
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
  ws: CollegeWorkspaceForPages;
}> {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "COLLEGE") redirect("/dashboard");
  const ws = await loadCollegeWorkspaceForPages(session);
  if (!ws || ws.basePath !== "/department") redirect("/dashboard/college");
  return { session, ws };
}
