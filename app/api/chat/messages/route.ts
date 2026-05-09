import { NextResponse } from "next/server";
import {
  listPrivateChatMessages,
  listPublicChatMessages,
  sendPrivateChatMessage,
  sendPublicChatMessage,
  type ChatScope,
} from "@/lib/dashboard-chat";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function normalizeScope(v: string | null): ChatScope {
  return String(v ?? "").trim().toUpperCase() === "PRIVATE" ? "PRIVATE" : "PUBLIC";
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "غير مصرّح." }, { status: 401 });
  }
  if (session.role !== "COLLEGE") {
    return NextResponse.json({ ok: false, message: "هذه المحادثة متاحة لحسابات الكليات فقط." }, { status: 403 });
  }
  const url = new URL(req.url);
  const scope = normalizeScope(url.searchParams.get("scope"));
  const sinceId = url.searchParams.get("sinceId")?.trim();
  if (scope === "PUBLIC") {
    const messages = await listPublicChatMessages({ sinceId, limit: 80 });
    return NextResponse.json({ ok: true, messages });
  }
  const peerUserId = url.searchParams.get("peerUserId")?.trim() ?? "";
  const messages = await listPrivateChatMessages({
    selfUserId: session.uid,
    peerUserId,
    sinceId,
    limit: 80,
  });
  return NextResponse.json({ ok: true, messages });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "غير مصرّح." }, { status: 401 });
  }
  if (session.role !== "COLLEGE") {
    return NextResponse.json({ ok: false, message: "هذه المحادثة متاحة لحسابات الكليات فقط." }, { status: 403 });
  }
  let body: { scope?: unknown; peerUserId?: unknown; text?: unknown } = {};
  try {
    body = (await req.json()) as { scope?: unknown; peerUserId?: unknown; text?: unknown };
  } catch {
    return NextResponse.json({ ok: false, message: "بيانات الطلب غير صالحة." }, { status: 400 });
  }
  const scope = normalizeScope(typeof body.scope === "string" ? body.scope : null);
  const text = typeof body.text === "string" ? body.text : "";
  if (scope === "PUBLIC") {
    const r = await sendPublicChatMessage({ senderUserId: session.uid, body: text });
    if (!r.ok) return NextResponse.json(r, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  const peerUserId = typeof body.peerUserId === "string" ? body.peerUserId : "";
  const r = await sendPrivateChatMessage({
    senderUserId: session.uid,
    recipientUserId: peerUserId,
    body: text,
  });
  if (!r.ok) return NextResponse.json(r, { status: 400 });
  return NextResponse.json({ ok: true });
}
