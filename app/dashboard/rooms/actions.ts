"use server";

import { isAdminRole, type UserRole } from "@/lib/authz";
import type { AdminCollegeExamRoomRow } from "@/lib/college-rooms";
import { listAllCollegeExamRoomsForAdmin } from "@/lib/college-rooms";
import { getSession } from "@/lib/session";

export async function fetchAdminCollegeExamRoomsAction() {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return { ok: false as const, error: "غير مصرّح", rows: [] as AdminCollegeExamRoomRow[] };
  }
  const rows = await listAllCollegeExamRoomsForAdmin();
  return { ok: true as const, rows };
}
