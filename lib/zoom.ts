import { createHmac } from "node:crypto";
import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";

const ZOOM_BASE = "https://api.zoom.us/v2";
const STATE_TTL_SECONDS = 10 * 60;
const EXPIRE_SAFETY_SECONDS = 90;

const ZOOM_ACCESS_TOKEN_KEY = "zoom_oauth_access_token";
const ZOOM_REFRESH_TOKEN_KEY = "zoom_oauth_refresh_token";
const ZOOM_EXPIRES_AT_KEY = "zoom_oauth_expires_at";
const ZOOM_ACCOUNT_ID_KEY = "zoom_oauth_account_id";
const ZOOM_CONNECTED_EMAIL_KEY = "zoom_oauth_connected_email";

type StoredZoomTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAtEpoch: number;
  accountId: string;
  email: string;
};

type ZoomTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  account_id?: string;
};

type ZoomUserMe = {
  id: string;
  email: string;
};

export type ZoomMeeting = {
  id: string;
  topic: string;
  join_url: string;
  start_url: string;
  status: string;
  start_time?: string;
};

function getEnv(name: string): string {
  const v = process.env[name]?.trim() ?? "";
  if (!v) throw new Error(`المتغير ${name} غير مهيأ.`);
  return v;
}

/** جاهزية OAuth — بدون رمي؛ لمسار الربط وواجهة المراقبة. */
export function isZoomOAuthConfigured(): boolean {
  const id = process.env.ZOOM_CLIENT_ID?.trim() ?? "";
  const secret = process.env.ZOOM_CLIENT_SECRET?.trim() ?? "";
  const redirect = process.env.ZOOM_REDIRECT_URI?.trim() ?? "";
  return Boolean(id && secret && redirect);
}

function getStateSecret(): string {
  return getEnv("AUTH_SECRET");
}

function normalizeFormationKey(v: string): string {
  return v.trim().replace(/\s+/g, " ").toLowerCase();
}

async function getSettingMap(keys: string[]): Promise<Map<string, string>> {
  if (!isDatabaseConfigured()) return new Map();
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{ setting_key: string; setting_value: string }>(
    `SELECT setting_key, setting_value FROM app_settings WHERE setting_key = ANY($1::text[])`,
    [keys]
  );
  const out = new Map<string, string>();
  for (const row of r.rows) out.set(row.setting_key, row.setting_value);
  return out;
}

async function upsertSetting(key: string, value: string) {
  await ensureCoreSchema();
  const pool = getDbPool();
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_at, updated_by)
     VALUES ($1, $2, NOW(), 'zoom-oauth')
     ON CONFLICT (setting_key) DO UPDATE SET
       setting_value = EXCLUDED.setting_value,
       updated_at = NOW(),
       updated_by = EXCLUDED.updated_by`,
    [key, value]
  );
}

async function saveZoomTokens(tokens: StoredZoomTokens) {
  await Promise.all([
    upsertSetting(ZOOM_ACCESS_TOKEN_KEY, tokens.accessToken),
    upsertSetting(ZOOM_REFRESH_TOKEN_KEY, tokens.refreshToken),
    upsertSetting(ZOOM_EXPIRES_AT_KEY, String(tokens.expiresAtEpoch)),
    upsertSetting(ZOOM_ACCOUNT_ID_KEY, tokens.accountId),
    upsertSetting(ZOOM_CONNECTED_EMAIL_KEY, tokens.email),
  ]);
}

async function readStoredZoomTokens(): Promise<StoredZoomTokens | null> {
  const m = await getSettingMap([
    ZOOM_ACCESS_TOKEN_KEY,
    ZOOM_REFRESH_TOKEN_KEY,
    ZOOM_EXPIRES_AT_KEY,
    ZOOM_ACCOUNT_ID_KEY,
    ZOOM_CONNECTED_EMAIL_KEY,
  ]);
  const accessToken = (m.get(ZOOM_ACCESS_TOKEN_KEY) ?? "").trim();
  const refreshToken = (m.get(ZOOM_REFRESH_TOKEN_KEY) ?? "").trim();
  const expiresAtEpoch = Number.parseInt((m.get(ZOOM_EXPIRES_AT_KEY) ?? "").trim(), 10);
  const accountId = (m.get(ZOOM_ACCOUNT_ID_KEY) ?? "").trim();
  const email = (m.get(ZOOM_CONNECTED_EMAIL_KEY) ?? "").trim();
  if (!accessToken || !refreshToken || !accountId || !email || !Number.isFinite(expiresAtEpoch)) return null;
  return { accessToken, refreshToken, expiresAtEpoch, accountId, email };
}

function zoomBasicAuthHeader(): string {
  const clientId = getEnv("ZOOM_CLIENT_ID");
  const clientSecret = getEnv("ZOOM_CLIENT_SECRET");
  const raw = `${clientId}:${clientSecret}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

function getZoomRedirectUri(): string {
  return getEnv("ZOOM_REDIRECT_URI");
}

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function stateSignature(raw: string): string {
  return createHmac("sha256", getStateSecret()).update(raw).digest("hex");
}

export function createZoomOAuthState(userId: string): string {
  const ts = nowEpochSeconds();
  const raw = `${userId}:${ts}`;
  const sig = stateSignature(raw);
  return Buffer.from(`${raw}:${sig}`, "utf8").toString("base64url");
}

export function verifyZoomOAuthState(state: string, expectedUserId: string): boolean {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const [uid, tsRaw, sig] = decoded.split(":");
    if (!uid || !tsRaw || !sig) return false;
    if (uid !== expectedUserId) return false;
    const ts = Number.parseInt(tsRaw, 10);
    if (!Number.isFinite(ts)) return false;
    if (nowEpochSeconds() - ts > STATE_TTL_SECONDS) return false;
    const raw = `${uid}:${ts}`;
    return stateSignature(raw) === sig;
  } catch {
    return false;
  }
}

export function buildZoomAuthorizeUrl(state: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: getEnv("ZOOM_CLIENT_ID"),
    redirect_uri: getZoomRedirectUri(),
    state,
  });
  return `https://zoom.us/oauth/authorize?${p.toString()}`;
}

async function requestZoomTokenByCode(code: string): Promise<ZoomTokenResponse> {
  const p = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getZoomRedirectUri(),
  });
  const res = await fetch(`https://zoom.us/oauth/token?${p.toString()}`, {
    method: "POST",
    headers: { Authorization: zoomBasicAuthHeader() },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`تعذر إتمام تفويض Zoom (${res.status}).`);
  return (await res.json()) as ZoomTokenResponse;
}

async function requestZoomTokenByRefresh(refreshToken: string): Promise<ZoomTokenResponse> {
  const p = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(`https://zoom.us/oauth/token?${p.toString()}`, {
    method: "POST",
    headers: { Authorization: zoomBasicAuthHeader() },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`تعذر تحديث جلسة Zoom (${res.status}).`);
  return (await res.json()) as ZoomTokenResponse;
}

async function fetchZoomMe(accessToken: string): Promise<ZoomUserMe> {
  const res = await fetch(`${ZOOM_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`تعذر تحميل معلومات المستخدم من Zoom (${res.status}).`);
  return (await res.json()) as ZoomUserMe;
}

export async function completeZoomOAuth(code: string): Promise<void> {
  const token = await requestZoomTokenByCode(code);
  const me = await fetchZoomMe(token.access_token);
  const expiresAt = nowEpochSeconds() + Math.max(60, token.expires_in);
  await saveZoomTokens({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAtEpoch: expiresAt,
    accountId: token.account_id?.trim() || me.id,
    email: me.email,
  });
}

export async function getZoomConnectionStatus(): Promise<{ connected: boolean; email?: string }> {
  const stored = await readStoredZoomTokens();
  if (!stored) return { connected: false };
  return { connected: true, email: stored.email };
}

export async function getValidZoomAccessToken(): Promise<string | null> {
  const stored = await readStoredZoomTokens();
  if (!stored) return null;
  if (stored.expiresAtEpoch - nowEpochSeconds() > EXPIRE_SAFETY_SECONDS) return stored.accessToken;
  const refreshed = await requestZoomTokenByRefresh(stored.refreshToken);
  const me = await fetchZoomMe(refreshed.access_token);
  const expiresAt = nowEpochSeconds() + Math.max(60, refreshed.expires_in);
  await saveZoomTokens({
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresAtEpoch: expiresAt,
    accountId: refreshed.account_id?.trim() || stored.accountId,
    email: me.email || stored.email,
  });
  return refreshed.access_token;
}

async function listMeetingsByType(accessToken: string, type: "live" | "upcoming"): Promise<ZoomMeeting[]> {
  const all: ZoomMeeting[] = [];
  let nextPageToken = "";
  for (let i = 0; i < 8; i += 1) {
    const p = new URLSearchParams({
      type,
      page_size: "300",
    });
    if (nextPageToken) p.set("next_page_token", nextPageToken);
    const res = await fetch(`${ZOOM_BASE}/users/me/meetings?${p.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) break;
    const data = (await res.json()) as {
      meetings?: Array<{
        id: string | number;
        topic?: string;
        join_url?: string;
        start_url?: string;
        status?: string;
        start_time?: string;
      }>;
      next_page_token?: string;
    };
    for (const m of data.meetings ?? []) {
      all.push({
        id: String(m.id),
        topic: String(m.topic ?? "").trim(),
        join_url: String(m.join_url ?? "").trim(),
        start_url: String(m.start_url ?? "").trim(),
        status: String(m.status ?? "").trim().toLowerCase(),
        start_time: m.start_time ? String(m.start_time) : undefined,
      });
    }
    nextPageToken = String(data.next_page_token ?? "").trim();
    if (!nextPageToken) break;
  }
  return all;
}

function selectMeetingForFormation(formation: string, meetings: ZoomMeeting[]): ZoomMeeting | null {
  const key = normalizeFormationKey(formation);
  const matched = meetings.filter((m) => normalizeFormationKey(m.topic).includes(key));
  if (matched.length === 0) return null;
  const live = matched.find((m) => m.status === "started" || m.status === "live");
  if (live) return live;
  matched.sort((a, b) => String(a.start_time ?? "").localeCompare(String(b.start_time ?? "")));
  return matched[0];
}

export async function getZoomMeetingsByFormation(
  formations: string[]
): Promise<Record<string, ZoomMeeting | null>> {
  const token = await getValidZoomAccessToken();
  if (!token) {
    const empty: Record<string, ZoomMeeting | null> = {};
    for (const f of formations) empty[f] = null;
    return empty;
  }
  const [live, upcoming] = await Promise.all([
    listMeetingsByType(token, "live"),
    listMeetingsByType(token, "upcoming"),
  ]);
  const combined = [...live, ...upcoming];
  const out: Record<string, ZoomMeeting | null> = {};
  for (const formation of formations) {
    out[formation] = selectMeetingForFormation(formation, combined);
  }
  return out;
}
