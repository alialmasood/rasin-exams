import { redirect } from "next/navigation";
import { listAllOfficialExamSituationsForAdmin } from "@/lib/college-exam-situations";
import { getSession } from "@/lib/session";
import { AdminSituationsFollowupView } from "./admin-situations-followup-view";

export const dynamic = "force-dynamic";

function baghdadIsoDateNow(): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Baghdad",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const d = parts.find((p) => p.type === "day")?.value ?? "";
    const iso = `${y}-${m}-${d}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date().toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default async function SituationsFollowupHubPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role === "COLLEGE") {
    redirect("/dashboard/college/status-followup");
  }

  const rows = await listAllOfficialExamSituationsForAdmin();
  const availableExamDates = [...new Set(rows.map((r) => r.exam_date).filter(Boolean))].sort((a, b) =>
    b.localeCompare(a)
  );
  const today = baghdadIsoDateNow();
  const defaultExamDate = availableExamDates.includes(today) ? today : (availableExamDates[0] ?? today);

  return (
    <AdminSituationsFollowupView
      rows={rows}
      availableExamDates={availableExamDates}
      defaultExamDate={defaultExamDate}
    />
  );
}
