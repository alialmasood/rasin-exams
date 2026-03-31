"use server";

import { isAdminRole, type UserRole } from "@/lib/authz";
import type { AdminCollegeExamScheduleRow } from "@/lib/college-exam-schedules";
import { listAllCollegeExamSchedulesForAdmin } from "@/lib/college-exam-schedules";
import { getSession } from "@/lib/session";

export async function fetchAdminExamSchedulesAction() {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return { ok: false as const, error: "غير مصرّح", rows: [] as AdminCollegeExamScheduleRow[] };
  }
  const rows = await listAllCollegeExamSchedulesForAdmin();
  return { ok: true as const, rows };
}
