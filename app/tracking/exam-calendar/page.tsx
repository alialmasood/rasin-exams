import { redirect } from "next/navigation";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { calendarDateInTimeZone, EXAM_SITUATION_TZ } from "@/lib/exam-situation-window";
import { listUniversityExamCalendarDayAggregates } from "@/lib/university-exam-calendar";
import { getSession } from "@/lib/session";
import { UniversityExamCalendarClient } from "./university-exam-calendar-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "التقويم الامتحاني — المتابعة المركزية",
};

export default async function TrackingExamCalendarPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role === "ADMIN" || session.role === "SUPER_ADMIN") redirect("/dashboard");
  if (session.role !== "COLLEGE") redirect("/");

  const profile = await getCollegeProfileByUserId(session.uid);
  if (profile?.account_kind !== "FOLLOWUP") {
    redirect("/dashboard/college");
  }

  const [aggregates, todayYmd] = await Promise.all([
    listUniversityExamCalendarDayAggregates(),
    Promise.resolve(calendarDateInTimeZone(new Date(), EXAM_SITUATION_TZ)),
  ]);

  return <UniversityExamCalendarClient aggregates={aggregates} todayYmd={todayYmd} />;
}
