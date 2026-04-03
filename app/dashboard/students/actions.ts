"use server";

import { isAdminRole, type UserRole } from "@/lib/authz";
import type { AdminExamParticipationRow } from "@/lib/admin-exam-participation-report";
import { listAdminExamParticipationReport } from "@/lib/admin-exam-participation-report";
import { getSession } from "@/lib/session";

export async function fetchAdminExamParticipationAction() {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return { ok: false as const, error: "غير مصرّح", rows: [] as AdminExamParticipationRow[] };
  }
  const rows = await listAdminExamParticipationReport();
  return { ok: true as const, rows };
}
