import { NextResponse } from "next/server";
import { markPrivateConversationRead } from "@/lib/dashboard-chat";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "غير مصرّح." }, { status: 401 });
  }
  if (session.role !== "COLLEGE") {
    return NextResponse.json({ ok: false, message: "هذه المحادثة متاحة لحسابات الكليات فقط." }, { status: 403 });
  }
  let body: { peerUserId?: unknown; upToMessageId?: unknown } = {};
  try {
    body = (await req.json()) as { peerUserId?: unknown; upToMessageId?: unknown };
  } catch {
    return NextResponse.json({ ok: false, message: "بيانات الطلب غير صالحة." }, { status: 400 });
  }
  const peerUserId = typeof body.peerUserId === "string" ? body.peerUserId : "";
  const upToMessageId = typeof body.upToMessageId === "string" ? body.upToMessageId : null;
  await markPrivateConversationRead({
    selfUserId: session.uid,
    peerUserId,
    upToMessageId,
  });
  return NextResponse.json({ ok: true });
}
