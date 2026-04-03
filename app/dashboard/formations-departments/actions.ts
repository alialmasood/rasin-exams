"use server";

import { isAdminRole, type UserRole } from "@/lib/authz";
import type { FormationActivityItem } from "@/lib/formation-activity-feed";
import { listFormationActivityFeed } from "@/lib/formation-activity-feed";
import { getSession } from "@/lib/session";

export async function fetchFormationActivityFeedAction() {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return { ok: false as const, error: "غير مصرّح", items: [] as FormationActivityItem[] };
  }
  const items = await listFormationActivityFeed(160);
  return { ok: true as const, items };
}
