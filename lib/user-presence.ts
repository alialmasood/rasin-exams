import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";

/** يُعتبر المستخدم «متصلاً» إذا وُجد نبض خلال هذه المدة. */
export const DASHBOARD_PRESENCE_ONLINE_WINDOW_MS = 120_000;

export type DashboardOnlineUser = {
  userId: string;
  username: string;
  role: string;
  collegeAccountKind: string | null;
  displayLabel: string;
  lastSeenAtIso: string;
};

function clampDisplayLabel(raw: string): string {
  const t = raw.trim().slice(0, 280);
  return t.length > 0 ? t : "—";
}

export async function upsertDashboardUserPresence(input: {
  userId: string;
  username: string;
  role: string;
  collegeAccountKind?: string | null;
  displayLabel: string;
}): Promise<{ ok: true } | { ok: false; reason: "no_db" | "invalid_user" }> {
  if (!isDatabaseConfigured()) return { ok: false, reason: "no_db" };
  const uid = input.userId.trim();
  if (!uid) return { ok: false, reason: "invalid_user" };
  await ensureCoreSchema();
  const pool = getDbPool();
  const label = clampDisplayLabel(input.displayLabel);
  const kind =
    input.collegeAccountKind === "FORMATION" ||
    input.collegeAccountKind === "FOLLOWUP" ||
    input.collegeAccountKind === "DEPARTMENT"
      ? input.collegeAccountKind
      : null;
  await pool.query(
    `INSERT INTO dashboard_user_presence (user_id, username, role, college_account_kind, display_label, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       username = EXCLUDED.username,
       role = EXCLUDED.role,
       college_account_kind = EXCLUDED.college_account_kind,
       display_label = EXCLUDED.display_label,
       last_seen_at = NOW()`,
    [uid, input.username.trim().slice(0, 120), input.role.trim().slice(0, 40), kind, label]
  );
  return { ok: true };
}

export async function listDashboardOnlineUsers(): Promise<
  { ok: true; users: DashboardOnlineUser[] } | { ok: false; reason: "no_db" }
> {
  if (!isDatabaseConfigured()) return { ok: false, reason: "no_db" };
  await ensureCoreSchema();
  const pool = getDbPool();
  const windowSec = Math.max(30, Math.floor(DASHBOARD_PRESENCE_ONLINE_WINDOW_MS / 1000));
  const r = await pool.query<{
    user_id: string;
    username: string;
    role: string;
    college_account_kind: string | null;
    display_label: string;
    last_seen_at: Date;
  }>(
    `SELECT user_id, username, role, college_account_kind, display_label, last_seen_at
     FROM dashboard_user_presence
     WHERE last_seen_at > NOW() - ($1::int * INTERVAL '1 second')
     ORDER BY last_seen_at DESC`,
    [windowSec]
  );
  return {
    ok: true,
    users: r.rows.map((row) => ({
      userId: row.user_id,
      username: row.username,
      role: row.role,
      collegeAccountKind: row.college_account_kind,
      displayLabel: row.display_label,
      lastSeenAtIso:
        row.last_seen_at instanceof Date ? row.last_seen_at.toISOString() : String(row.last_seen_at),
    })),
  };
}
