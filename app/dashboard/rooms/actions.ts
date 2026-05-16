"use server";

import { isAdminRole, type UserRole } from "@/lib/authz";
import type { AdminCollegeExamRoomDayParticipationRow, AdminCollegeExamRoomRow } from "@/lib/college-rooms";
import {
  listAllCollegeExamRoomsForAdmin,
  listAllCollegeExamRoomsParticipatingOnDateForAdmin,
} from "@/lib/college-rooms";
import { getSession } from "@/lib/session";

export async function fetchAdminCollegeExamRoomsAction() {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return { ok: false as const, error: "غير مصرّح", rows: [] as AdminCollegeExamRoomRow[] };
  }
  const rows = await listAllCollegeExamRoomsForAdmin();
  return { ok: true as const, rows };
}

export async function fetchAdminRoomsByExamDateAction(examDate: string): Promise<
  | { ok: true; rows: AdminCollegeExamRoomDayParticipationRow[] }
  | { ok: false; error: string; rows: AdminCollegeExamRoomDayParticipationRow[] }
> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return { ok: false, error: "غير مصرّح", rows: [] };
  }
  const d = String(examDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return { ok: false, error: "تاريخ غير صالح.", rows: [] };
  }
  const rows = await listAllCollegeExamRoomsParticipatingOnDateForAdmin(d);
  return { ok: true, rows };
}
