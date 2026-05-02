import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { upsertDashboardUserPresence } from "@/lib/user-presence";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "غير مصرّح." }, { status: 401 });
  }

  let displayLabel = "";
  try {
    const j = (await req.json()) as { displayLabel?: unknown };
    if (typeof j.displayLabel === "string") displayLabel = j.displayLabel;
  } catch {
    /* جسم الطلب اختياري */
  }

  const fallback = `${session.username} — ${session.role}`;
  const r = await upsertDashboardUserPresence({
    userId: session.uid,
    username: session.username,
    role: session.role,
    collegeAccountKind: session.college_account_kind ?? null,
    displayLabel: displayLabel.trim() || fallback,
  });

  if (!r.ok) {
    return NextResponse.json(
      { ok: false, message: "قاعدة البيانات غير مهيأة أو تعذر حفظ النبض." },
      { status: 503 }
    );
  }
  return NextResponse.json({ ok: true });
}
