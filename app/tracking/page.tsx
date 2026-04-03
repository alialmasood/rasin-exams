import { redirect } from "next/navigation";
import { logoutAction } from "@/app/dashboard/actions";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import {
  listExamDayUploadSummariesForOwner,
  listUploadedExamSituationsForFollowup,
  type StatusFollowupFormRow,
  type StatusFollowupRow,
  type StatusFollowupScheduleRow,
} from "@/lib/college-exam-situations";
import { listSubmittedSituationFormsForOwner } from "@/lib/college-situation-form-submissions";
import { getSession } from "@/lib/session";
import { StatusFollowupPanel } from "@/app/dashboard/college/status-followup/status-followup-panel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "متابعة الامتحانات",
};

function mergeFollowupRows(
  schedules: StatusFollowupScheduleRow[],
  forms: StatusFollowupFormRow[]
): StatusFollowupRow[] {
  type WithTs = StatusFollowupRow & { _ts: number };
  const a: WithTs[] = schedules.map((r) => ({
    ...r,
    _ts: r.head_submitted_at_iso ? new Date(r.head_submitted_at_iso).getTime() : 0,
  }));
  const b: WithTs[] = forms.map((r) => ({
    ...r,
    _ts: new Date(r.submitted_at_iso).getTime(),
  }));
  return [...a, ...b].sort((x, y) => y._ts - x._ts).map(({ _ts, ...row }) => row);
}

/** بوابة حساب المتابعة (FOLLOWUP) — نفس محتوى متابعة الموقف دون مسار لوحة التشكيل. */
export default async function TrackingPortalPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "COLLEGE") redirect("/dashboard");

  const profile = await getCollegeProfileByUserId(session.uid);
  if (profile?.account_kind !== "FOLLOWUP") {
    redirect("/dashboard/college");
  }

  const [scheduleRows, formRows, daySummaries] = await Promise.all([
    listUploadedExamSituationsForFollowup(session.uid),
    listSubmittedSituationFormsForOwner(session.uid),
    listExamDayUploadSummariesForOwner(session.uid),
  ]);
  const rows = mergeFollowupRows(scheduleRows, formRows);
  const collegeLabel = profile.holder_name ?? "—";

  return (
    <>
      <header className="border-b border-[#1b4e8f]/14 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-extrabold text-[#0f2f57]">متابعة الامتحانات</p>
            <p className="mt-0.5 truncate text-xs text-[#64748b]">
              {collegeLabel}
              <span className="mx-1 text-[#cbd5e1]">·</span>
              <span className="font-mono tabular-nums">@{session.username}</span>
            </p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-xl border border-[#1b4e8f]/28 bg-white px-3 py-2 text-xs font-bold text-[#0f2f57] shadow-sm transition hover:bg-[#eff6ff]"
            >
              تسجيل الخروج
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <StatusFollowupPanel rows={rows} collegeLabel={collegeLabel} daySummaries={daySummaries} />
      </main>
    </>
  );
}
