import { NextResponse } from "next/server";
import { listChatRecipientsForCollege } from "@/lib/dashboard-chat";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "غير مصرّح." }, { status: 401 });
  }
  if (session.role !== "COLLEGE") {
    return NextResponse.json({ ok: false, message: "هذه المحادثة متاحة لحسابات الكليات فقط." }, { status: 403 });
  }
  const users = await listChatRecipientsForCollege(session.uid);
  return NextResponse.json({ ok: true, users });
}
