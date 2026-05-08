import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { completeZoomOAuth, verifyZoomOAuthState } from "@/lib/zoom";

function withStatus(origin: string, status: "ok" | "error", message: string): string {
  const u = new URL("/tracking/monitoring", origin);
  u.searchParams.set("zoom", status);
  u.searchParams.set("message", message);
  return u.toString();
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") {
    return NextResponse.redirect(new URL("/", origin));
  }
  const code = req.nextUrl.searchParams.get("code")?.trim() ?? "";
  const state = req.nextUrl.searchParams.get("state")?.trim() ?? "";
  const err = req.nextUrl.searchParams.get("error")?.trim() ?? "";
  if (err) {
    return NextResponse.redirect(withStatus(origin, "error", "تم إلغاء التفويض من Zoom أو فشل الطلب."));
  }
  if (!code || !state || !verifyZoomOAuthState(state, session.uid)) {
    return NextResponse.redirect(withStatus(origin, "error", "بيانات التفويض غير صالحة أو منتهية."));
  }
  try {
    await completeZoomOAuth(code);
    return NextResponse.redirect(withStatus(origin, "ok", "تم ربط حساب Zoom بنجاح."));
  } catch {
    return NextResponse.redirect(withStatus(origin, "error", "تعذر إكمال الربط مع Zoom."));
  }
}
