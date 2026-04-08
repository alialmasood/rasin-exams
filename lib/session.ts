import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "rasin_session";

/** نص لأن PostgreSQL قد يستخدم BIGINT أو UUID كمفتاح أساسي */
export type SessionPayload = {
  uid: string;
  username: string;
  role: string;
  /** للدور COLLEGE — تشكيل / قسم / متابعة مركزية */
  college_account_kind?: "FORMATION" | "FOLLOWUP" | "DEPARTMENT";
  /** صف college_subjects عند حساب القسم */
  college_subject_id?: string;
};

function getSecret() {
  const s = process.env.AUTH_SECRET?.trim();
  if (!s || s.length < 8) {
    throw new Error("AUTH_SECRET غير مهيأ أو قصير جدًا (8 أحرف على الأقل).");
  }
  return new TextEncoder().encode(s);
}

export async function createSession(payload: SessionPayload) {
  const body: Record<string, unknown> = {
    uid: payload.uid,
    username: payload.username,
    role: payload.role,
  };
  if (payload.college_account_kind) {
    body.college_account_kind = payload.college_account_kind;
  }
  if (payload.college_subject_id) {
    body.college_subject_id = payload.college_subject_id;
  }
  const token = await new SignJWT(body)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(getSecret());

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const uid = String(payload.uid ?? "").trim();
    if (!uid) return null;
    const username = String(payload.username ?? "");
    const role = String(payload.role ?? "");
    if (!username || !role) return null;
    const ck = payload.college_account_kind;
    const college_account_kind =
      ck === "FOLLOWUP"
        ? "FOLLOWUP"
        : ck === "DEPARTMENT"
          ? "DEPARTMENT"
          : ck === "FORMATION"
            ? "FORMATION"
            : undefined;
    const csid = payload.college_subject_id;
    const college_subject_id = typeof csid === "string" && csid.trim() ? csid.trim() : undefined;
    return { uid, username, role, college_account_kind, college_subject_id };
  } catch {
    return null;
  }
}

export async function clearSession() {
  (await cookies()).delete(COOKIE_NAME);
}
