import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "rasin_session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(COOKIE)?.value;
  if (!token) {
    return NextResponse.next();
  }

  const secretRaw = process.env.AUTH_SECRET?.trim();
  if (!secretRaw || secretRaw.length < 8) {
    return NextResponse.next();
  }

  try {
    const secret = new TextEncoder().encode(secretRaw);
    const { payload } = await jwtVerify(token, secret);
    const role = String(payload.role ?? "");
    const collegeKind = String(payload.college_account_kind ?? "FORMATION");

    /** المتابعة المركزية ليست ضمن لوحة الإدارة */
    if (pathname.startsWith("/tracking")) {
      if (role === "ADMIN" || role === "SUPER_ADMIN") {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      return NextResponse.next();
    }

    /** بوابة القسم — خارج /dashboard */
    if (pathname.startsWith("/department")) {
      if (role !== "COLLEGE" || collegeKind !== "DEPARTMENT") {
        if (role === "COLLEGE" && collegeKind === "FOLLOWUP") {
          return NextResponse.redirect(new URL("/tracking", request.url));
        }
        if (role === "COLLEGE") {
          return NextResponse.redirect(new URL("/dashboard/college", request.url));
        }
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      return NextResponse.next();
    }

    if (!pathname.startsWith("/dashboard")) {
      return NextResponse.next();
    }

    /** حساب المتابعة المركزية (FOLLOWUP): يدخل فقط `/tracking` وليس `/dashboard` */
    if (role === "COLLEGE" && collegeKind === "FOLLOWUP") {
      if (pathname.startsWith("/dashboard")) {
        return NextResponse.redirect(new URL("/tracking", request.url));
      }
    } else if (role === "COLLEGE" && collegeKind === "DEPARTMENT") {
      if (pathname.startsWith("/dashboard")) {
        return NextResponse.redirect(new URL("/department", request.url));
      }
    } else if (role === "COLLEGE") {
      const allowed =
        pathname === "/dashboard/college" || pathname.startsWith("/dashboard/college/");
      if (!allowed) {
        return NextResponse.redirect(new URL("/dashboard/college", request.url));
      }
    }
  } catch {
    /* JWT غير صالح — يترك التخطيط يعيد التوجيه عند الحاجة */
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/tracking", "/department", "/department/:path*"],
};
