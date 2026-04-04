"use server";

import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import {
  listUniversityExamCalendarDayDetail,
  type UniversityExamCalendarDayDetailLine,
} from "@/lib/university-exam-calendar";
import { getSession } from "@/lib/session";

export async function getUniversityExamCalendarDayDetailAction(
  examDate: string
): Promise<
  | { ok: true; lines: UniversityExamCalendarDayDetailLine[] }
  | { ok: false; message: string }
> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") {
    return { ok: false, message: "غير مصرح." };
  }
  const profile = await getCollegeProfileByUserId(session.uid);
  if (profile?.account_kind !== "FOLLOWUP") {
    return { ok: false, message: "غير مصرح." };
  }
  const d = examDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return { ok: false, message: "صيغة التاريخ غير صالحة." };
  }
  const lines = await listUniversityExamCalendarDayDetail(d);
  return { ok: true, lines };
}
