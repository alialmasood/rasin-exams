import { NextResponse } from "next/server";
import { listPrivateConversationSummaries } from "@/lib/dashboard-chat";
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
  const items = await listPrivateConversationSummaries(session.uid);
  return NextResponse.json({ ok: true, items });
}
