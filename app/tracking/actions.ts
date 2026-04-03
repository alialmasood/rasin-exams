"use server";

import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { listCentralTrackingExamRowsForDate, type CentralTrackingExamRow } from "@/lib/college-exam-situations";
import { getSession } from "@/lib/session";

export async function refreshCentralTrackingAction(
  examDate: string
): Promise<{ ok: true; rows: CentralTrackingExamRow[] } | { ok: false; message: string }> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") {
    return { ok: false, message: "غير مصرح." };
  }
  const profile = await getCollegeProfileByUserId(session.uid);
  if (profile?.account_kind !== "FOLLOWUP") {
    return { ok: false, message: "غير مصرح." };
  }
  const rows = await listCentralTrackingExamRowsForDate(examDate);
  return { ok: true, rows };
}
