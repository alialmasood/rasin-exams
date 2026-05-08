import { NextRequest, NextResponse } from "next/server";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { getSession } from "@/lib/session";
import { buildZoomAuthorizeUrl, createZoomOAuthState, isZoomOAuthConfigured } from "@/lib/zoom";

function monitoringWithMessage(origin: string, zoom: "ok" | "error", message: string) {
  const u = new URL("/tracking/monitoring", origin);
  u.searchParams.set("zoom", zoom);
  u.searchParams.set("message", message);
  return u.toString();
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") {
    return NextResponse.redirect(new URL("/", origin));
  }
  const profile = await getCollegeProfileByUserId(session.uid);
  if (profile?.account_kind !== "FOLLOWUP") {
    return NextResponse.redirect(new URL("/dashboard/college", origin));
  }
  if (!isZoomOAuthConfigured()) {
    return NextResponse.redirect(
      monitoringWithMessage(
        origin,
        "error",
        "لم يُهيّأ ربط Zoom على الخادم. أضف ZOOM_CLIENT_ID و ZOOM_CLIENT_SECRET و ZOOM_REDIRECT_URI في ملف البيئة ثم أعد التشغيل."
      )
    );
  }
  const state = createZoomOAuthState(session.uid);
  const url = buildZoomAuthorizeUrl(state);
  return NextResponse.redirect(url);
}
