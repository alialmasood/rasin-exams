import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listDashboardOnlineUsers } from "@/lib/user-presence";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "غير مصرّح." }, { status: 401 });
  }

  const r = await listDashboardOnlineUsers();
  if (!r.ok) {
    return NextResponse.json(
      { ok: false, users: [] as const, message: "قاعدة البيانات غير مهيأة." },
      { status: 503 }
    );
  }
  return NextResponse.json({ ok: true, users: r.users });
}
