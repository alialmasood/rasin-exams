import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { ensureCoreSchema } from "@/lib/schema";

export type ChatScope = "PUBLIC" | "PRIVATE";

export type ChatRecipient = {
  userId: string;
  username: string;
  displayLabel: string;
  accountKind: "FORMATION" | "DEPARTMENT" | "FOLLOWUP" | null;
};

export type DashboardChatMessage = {
  id: string;
  scope: ChatScope;
  senderUserId: string;
  senderUsername: string;
  senderLabel: string;
  recipientUserId: string | null;
  body: string;
  createdAtIso: string;
};

export type PrivateConversationSummary = {
  peerUserId: string;
  unreadCount: number;
  lastMessageId: string | null;
  lastMessageBody: string | null;
  lastMessageAtIso: string | null;
  lastMessageSenderUserId: string | null;
};

function normalizeCollegeKindDb(v: string | null | undefined): ChatRecipient["accountKind"] {
  const t = String(v ?? "").trim().toUpperCase();
  if (t === "FORMATION") return "FORMATION";
  if (t === "DEPARTMENT") return "DEPARTMENT";
  if (t === "FOLLOWUP") return "FOLLOWUP";
  return null;
}

function accountKindLabelAr(kind: ChatRecipient["accountKind"]): string {
  if (kind === "FORMATION") return "عميد تشكيل";
  if (kind === "DEPARTMENT") return "رئيس قسم/فرع";
  if (kind === "FOLLOWUP") return "متابعة";
  return "حساب كلية";
}

function trimMessageBody(raw: string): string {
  const t = raw.trim();
  return t.length > 1200 ? t.slice(0, 1200).trim() : t;
}

export async function listChatRecipientsForCollege(selfUserId: string): Promise<ChatRecipient[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    user_id: string | number;
    username: string;
    account_kind: string | null;
    formation_name: string | null;
    holder_name: string | null;
    branch_name: string | null;
  }>(
    `SELECT u.id AS user_id, u.username,
            p.account_kind, p.formation_name, p.holder_name, s.branch_name
     FROM users u
     LEFT JOIN college_account_profiles p ON p.user_id = u.id
     LEFT JOIN college_subjects s ON s.id = p.college_subject_id
     WHERE u.role = 'COLLEGE'
       AND u.deleted_at IS NULL
       AND UPPER(TRIM(COALESCE(u.status::text,'ACTIVE'))) = 'ACTIVE'
       AND COALESCE(UPPER(TRIM(p.account_kind::text)), 'FORMATION') IN ('FORMATION', 'DEPARTMENT')
       AND u.id::text <> $1
     ORDER BY
       CASE
         WHEN COALESCE(UPPER(TRIM(p.account_kind::text)), '') = 'FOLLOWUP' THEN 0
         WHEN COALESCE(UPPER(TRIM(p.account_kind::text)), '') = 'FORMATION' THEN 1
         WHEN COALESCE(UPPER(TRIM(p.account_kind::text)), '') = 'DEPARTMENT' THEN 2
         ELSE 3
       END ASC,
       COALESCE(NULLIF(TRIM(p.formation_name), ''), NULLIF(TRIM(p.holder_name), ''), u.username) ASC,
       u.username ASC`,
    [selfUserId]
  );
  return r.rows.map((row) => {
    const kind = normalizeCollegeKindDb(row.account_kind);
    const name =
      kind === "FOLLOWUP"
        ? (row.holder_name ?? "").trim()
        : kind === "DEPARTMENT"
          ? (row.branch_name ?? "").trim()
          : (row.formation_name ?? "").trim();
    return {
      userId: String(row.user_id),
      username: row.username,
      accountKind: kind,
      displayLabel: name ? `${name} — ${accountKindLabelAr(kind)}` : `${row.username} — ${accountKindLabelAr(kind)}`,
    };
  });
}

async function senderLabelByUserId(userId: string, username: string): Promise<string> {
  const p = await getCollegeProfileByUserId(userId);
  if (!p) return username;
  if (p.account_kind === "DEPARTMENT") {
    return p.scoped_branch_name?.trim() || `${username} — رئيس قسم/فرع`;
  }
  if (p.account_kind === "FOLLOWUP") {
    return p.holder_name?.trim() || `${username} — متابعة`;
  }
  return p.formation_name?.trim() || username;
}

async function messageRowsToView(
  rows: Array<{
    id: string | number;
    scope: string;
    sender_user_id: string | number;
    sender_username: string;
    recipient_user_id: string | number | null;
    body: string;
    created_at: Date;
  }>
): Promise<DashboardChatMessage[]> {
  const cache = new Map<string, string>();
  const out: DashboardChatMessage[] = [];
  for (const row of rows) {
    const senderUserId = String(row.sender_user_id);
    let senderLabel = cache.get(senderUserId);
    if (!senderLabel) {
      senderLabel = await senderLabelByUserId(senderUserId, row.sender_username);
      cache.set(senderUserId, senderLabel);
    }
    out.push({
      id: String(row.id),
      scope: String(row.scope).toUpperCase() === "PRIVATE" ? "PRIVATE" : "PUBLIC",
      senderUserId,
      senderUsername: row.sender_username,
      senderLabel,
      recipientUserId: row.recipient_user_id != null ? String(row.recipient_user_id) : null,
      body: row.body,
      createdAtIso: row.created_at.toISOString(),
    });
  }
  return out;
}

export async function listPublicChatMessages(opts?: { sinceId?: string; limit?: number }): Promise<DashboardChatMessage[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const sinceId = opts?.sinceId?.trim();
  const limit = Math.min(Math.max(opts?.limit ?? 80, 1), 200);
  const r = await pool.query<{
    id: string | number;
    scope: string;
    sender_user_id: string | number;
    sender_username: string;
    recipient_user_id: string | number | null;
    body: string;
    created_at: Date;
  }>(
    sinceId && /^\d+$/.test(sinceId)
      ? `SELECT m.id, m.scope, m.sender_user_id, su.username AS sender_username,
                m.recipient_user_id, m.body, m.created_at
         FROM dashboard_chat_messages m
         INNER JOIN users su ON su.id::text = m.sender_user_id::text AND su.deleted_at IS NULL
         WHERE m.scope = 'PUBLIC' AND m.id > $1::bigint
         ORDER BY m.id ASC
         LIMIT $2`
      : `SELECT m.id, m.scope, m.sender_user_id, su.username AS sender_username,
                m.recipient_user_id, m.body, m.created_at
         FROM dashboard_chat_messages m
         INNER JOIN users su ON su.id::text = m.sender_user_id::text AND su.deleted_at IS NULL
         WHERE m.scope = 'PUBLIC'
         ORDER BY m.id DESC
         LIMIT $1`,
    sinceId && /^\d+$/.test(sinceId) ? [sinceId, limit] : [limit]
  );
  const rows = sinceId && /^\d+$/.test(sinceId) ? r.rows : [...r.rows].reverse();
  return messageRowsToView(rows);
}

export async function listPrivateChatMessages(input: {
  selfUserId: string;
  peerUserId: string;
  sinceId?: string;
  limit?: number;
}): Promise<DashboardChatMessage[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const self = input.selfUserId.trim();
  const peer = input.peerUserId.trim();
  if (!self || !peer || self === peer) return [];
  const sinceId = input.sinceId?.trim();
  const limit = Math.min(Math.max(input.limit ?? 80, 1), 200);
  const r = await pool.query<{
    id: string | number;
    scope: string;
    sender_user_id: string | number;
    sender_username: string;
    recipient_user_id: string | number | null;
    body: string;
    created_at: Date;
  }>(
    sinceId && /^\d+$/.test(sinceId)
      ? `SELECT m.id, m.scope, m.sender_user_id, su.username AS sender_username,
                m.recipient_user_id, m.body, m.created_at
         FROM dashboard_chat_messages m
         INNER JOIN users su ON su.id::text = m.sender_user_id::text AND su.deleted_at IS NULL
         WHERE m.scope = 'PRIVATE'
           AND m.id > $3::bigint
           AND ((m.sender_user_id::text = $1 AND m.recipient_user_id::text = $2)
             OR (m.sender_user_id::text = $2 AND m.recipient_user_id::text = $1))
         ORDER BY m.id ASC
         LIMIT $4`
      : `SELECT m.id, m.scope, m.sender_user_id, su.username AS sender_username,
                m.recipient_user_id, m.body, m.created_at
         FROM dashboard_chat_messages m
         INNER JOIN users su ON su.id::text = m.sender_user_id::text AND su.deleted_at IS NULL
         WHERE m.scope = 'PRIVATE'
           AND ((m.sender_user_id::text = $1 AND m.recipient_user_id::text = $2)
             OR (m.sender_user_id::text = $2 AND m.recipient_user_id::text = $1))
         ORDER BY m.id DESC
         LIMIT $3`,
    sinceId && /^\d+$/.test(sinceId) ? [self, peer, sinceId, limit] : [self, peer, limit]
  );
  const rows = sinceId && /^\d+$/.test(sinceId) ? r.rows : [...r.rows].reverse();
  return messageRowsToView(rows);
}

export async function sendPublicChatMessage(input: { senderUserId: string; body: string }): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  const sender = input.senderUserId.trim();
  const body = trimMessageBody(input.body);
  if (!sender || body.length < 1) return { ok: false, message: "نص الرسالة مطلوب." };
  const pool = getDbPool();
  await pool.query(
    `INSERT INTO dashboard_chat_messages (scope, sender_user_id, recipient_user_id, body, created_at)
     VALUES ('PUBLIC', $1, NULL, $2, NOW())`,
    [sender, body]
  );
  return { ok: true };
}

export async function sendPrivateChatMessage(input: {
  senderUserId: string;
  recipientUserId: string;
  body: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  const sender = input.senderUserId.trim();
  const recipient = input.recipientUserId.trim();
  const body = trimMessageBody(input.body);
  if (!sender || !recipient || sender === recipient) return { ok: false, message: "اختيار المستقبل غير صالح." };
  if (body.length < 1) return { ok: false, message: "نص الرسالة مطلوب." };
  const pool = getDbPool();
  await pool.query(
    `INSERT INTO dashboard_chat_messages (scope, sender_user_id, recipient_user_id, body, created_at)
     VALUES ('PRIVATE', $1, $2, $3, NOW())`,
    [sender, recipient, body]
  );
  return { ok: true };
}

export async function listPrivateConversationSummaries(selfUserId: string): Promise<PrivateConversationSummary[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const self = selfUserId.trim();
  if (!self) return [];
  const pool = getDbPool();
  const r = await pool.query<{
    peer_user_id: string | number;
    unread_count: string;
    last_message_id: string | number | null;
    last_message_body: string | null;
    last_message_at: Date | null;
    last_message_sender_user_id: string | number | null;
  }>(
    `WITH conv AS (
       SELECT
         CASE
           WHEN m.sender_user_id::text = $1 THEN m.recipient_user_id::text
           ELSE m.sender_user_id::text
         END AS peer_user_id,
         m.id,
         m.sender_user_id::text AS sender_user_id,
         m.recipient_user_id::text AS recipient_user_id,
         m.body,
         m.created_at
       FROM dashboard_chat_messages m
       WHERE m.scope = 'PRIVATE'
         AND (
           m.sender_user_id::text = $1
           OR m.recipient_user_id::text = $1
         )
     ),
     unread AS (
       SELECT
         c.peer_user_id,
         COUNT(*)::text AS unread_count
       FROM conv c
       LEFT JOIN dashboard_chat_reads r
         ON r.user_id = $1
        AND r.peer_user_id = c.peer_user_id
       WHERE c.sender_user_id <> $1
         AND c.id > COALESCE(r.last_read_message_id, 0)
       GROUP BY c.peer_user_id
     ),
     latest AS (
       SELECT DISTINCT ON (c.peer_user_id)
         c.peer_user_id,
         c.id AS last_message_id,
         c.body AS last_message_body,
         c.created_at AS last_message_at,
         c.sender_user_id AS last_message_sender_user_id
       FROM conv c
       ORDER BY c.peer_user_id, c.id DESC
     )
     SELECT
       l.peer_user_id,
       COALESCE(u.unread_count, '0') AS unread_count,
       l.last_message_id,
       l.last_message_body,
       l.last_message_at,
       l.last_message_sender_user_id
     FROM latest l
     LEFT JOIN unread u ON u.peer_user_id = l.peer_user_id
     ORDER BY l.last_message_at DESC NULLS LAST`
    ,
    [self]
  );
  return r.rows.map((row) => ({
    peerUserId: String(row.peer_user_id),
    unreadCount: Number(row.unread_count ?? 0),
    lastMessageId: row.last_message_id != null ? String(row.last_message_id) : null,
    lastMessageBody: row.last_message_body ?? null,
    lastMessageAtIso: row.last_message_at?.toISOString() ?? null,
    lastMessageSenderUserId:
      row.last_message_sender_user_id != null ? String(row.last_message_sender_user_id) : null,
  }));
}

export async function markPrivateConversationRead(input: {
  selfUserId: string;
  peerUserId: string;
  upToMessageId?: string | null;
}): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await ensureCoreSchema();
  const self = input.selfUserId.trim();
  const peer = input.peerUserId.trim();
  if (!self || !peer || self === peer) return;
  const pool = getDbPool();
  let upTo = 0;
  const provided = input.upToMessageId?.trim() ?? "";
  if (/^\d+$/.test(provided)) {
    upTo = Number(provided);
  } else {
    const maxr = await pool.query<{ max_id: string | null }>(
      `SELECT MAX(m.id)::text AS max_id
       FROM dashboard_chat_messages m
       WHERE m.scope = 'PRIVATE'
         AND (
           (m.sender_user_id::text = $1 AND m.recipient_user_id::text = $2)
           OR (m.sender_user_id::text = $2 AND m.recipient_user_id::text = $1)
         )`,
      [self, peer]
    );
    upTo = Number(maxr.rows[0]?.max_id ?? 0);
  }
  await pool.query(
    `INSERT INTO dashboard_chat_reads (user_id, peer_user_id, last_read_message_id, updated_at)
     VALUES ($1, $2, $3::bigint, NOW())
     ON CONFLICT (user_id, peer_user_id)
     DO UPDATE SET
       last_read_message_id = GREATEST(dashboard_chat_reads.last_read_message_id, EXCLUDED.last_read_message_id),
       updated_at = NOW()`,
    [self, peer, upTo]
  );
}
