import { redirect } from "next/navigation";
import { CentralTrackingDashboard } from "@/app/tracking/central-tracking-dashboard";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { listCentralTrackingExamRowsForDate } from "@/lib/college-exam-situations";
import { calendarDateInTimeZone, EXAM_SITUATION_TZ } from "@/lib/exam-situation-window";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "المتابعة المركزية — رصين",
};

/**
 * `/tracking` — بوابة **حساب المتابعة المركزية** فقط (يُنشأ من إدارة الحسابات بنوع «متابعة»
 * لرئاسة الجامعة / المساعد العلمي). ليس مسار متابعة كلية منفصلة.
 */
export default async function TrackingPage() {
  const session = await getSession();
  if (!session) redirect("/");

  if (session.role === "ADMIN" || session.role === "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  if (session.role !== "COLLEGE") {
    redirect("/");
  }

  const profile = await getCollegeProfileByUserId(session.uid);
  if (profile?.account_kind !== "FOLLOWUP") {
    redirect("/dashboard/college");
  }

  const today = calendarDateInTimeZone(new Date(), EXAM_SITUATION_TZ);
  const rows = await listCentralTrackingExamRowsForDate(today);
  const accountDisplayName = profile.holder_name?.trim() || "حساب المتابعة المركزية";

  return (
    <CentralTrackingDashboard
      initialDate={today}
      initialRows={rows}
      session={session}
      accountDisplayName={accountDisplayName}
    />
  );
}
