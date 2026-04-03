import { redirect } from "next/navigation";
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
  }
  return <CollegeQuickActionsProvider>{children}</CollegeQuickActionsProvider>;
}
