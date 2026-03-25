import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "rasin_session";

/** نص لأن PostgreSQL قد يستخدم BIGINT أو UUID كمفتاح أساسي */
export type SessionPayload = {
  uid: string;
  username: string;
  role: string;
};

function getSecret() {
  const s = process.env.AUTH_SECRET?.trim();
  if (!s || s.length < 8) {
    throw new Error("AUTH_SECRET غير مهيأ أو قصير جدًا (8 أحرف على الأقل).");
  }
  return new TextEncoder().encode(s);
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({
    uid: payload.uid,
    username: payload.username,
    role: payload.role,
  })
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
    return { uid, username, role };
  } catch {
    return null;
  }
}

export async function clearSession() {
  (await cookies()).delete(COOKIE_NAME);
}
