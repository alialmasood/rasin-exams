import { redirect } from "next/navigation";
import { CollegePortalBasePathProvider } from "@/components/dashboard/college-portal-base-path";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { getSession } from "@/lib/session";
import { CollegeQuickActionsProvider } from "./college-quick-actions";

export const dynamic = "force-dynamic";

export default async function CollegeLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session?.role === "COLLEGE") {
    const profile = await getCollegeProfileByUserId(session.uid);
    if (profile?.account_kind === "FOLLOWUP") {
      redirect("/tracking");
    }
    if (profile?.account_kind === "DEPARTMENT") {
      redirect("/department");
    }
  }
  return (
    <CollegePortalBasePathProvider value="/dashboard/college">
      <CollegeQuickActionsProvider>{children}</CollegeQuickActionsProvider>
    </CollegePortalBasePathProvider>
  );
}
