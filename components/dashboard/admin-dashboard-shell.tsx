"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getDashboardNavForRole } from "@/components/dashboard/nav-config";
import { logoutAction } from "@/app/dashboard/actions";

const C = {
  primary: "#1E3A8A",
  secondary: "#2563EB",
  accent: "#F59E0B",
  bg: "#F8FAFC",
  card: "#FFFFFF",
  border: "#E2E8F0",
  text: "#0F172A",
  textMuted: "#64748B",
} as const;

type Props = {
  username: string;
  /** دور الجلسة: يحدد عناصر القائمة الجانبية */
  role: string;
  /** اسم يظهر في رأس الصفحة والبطاقة الجانبية (مثل admin أو اسم المستخدم) */
  displayName: string;
  /** سطر فرعي في بطاقة الحساب بالشريط الجانبي */
  sidebarTagline: string;
  /** وصف الدور (مدير النظام / اسم التشكيل) */
  roleDescription: string;
  children: React.ReactNode;
};

export function AdminDashboardShell({
  username,
  role,
  displayName,
  sidebarTagline,
  roleDescription,
  children,
}: Props) {
  const pathname = usePathname();
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const navItems = getDashboardNavForRole(role);

  useEffect(() => {
    const onScroll = () => setHeaderScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    function closeOnOutside(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const sidebarBody = (
    <>
      <div className="flex h-[4.5rem] shrink-0 items-center gap-3 border-b px-5" style={{ borderColor: C.border }}>
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-md ring-2 ring-white/20"
          style={{
            background: `linear-gradient(145deg, ${C.secondary} 0%, ${C.primary} 100%)`,
          }}
          aria-hidden
        >
          ر
        </div>
        <div className="min-w-0 text-right">
          <p className="truncate text-sm font-bold" style={{ color: C.primary }}>
            نظام رصين
          </p>
          <p className="truncate text-xs font-medium" style={{ color: C.textMuted }}>
            Raseen System
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="القائمة الرئيسية">
        {navItems.map((item) => {
          const highlighted =
            item.href === "/dashboard" || item.href === "/dashboard/college"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-3 rounded-xl py-2.5 pr-3 text-sm font-semibold transition-all duration-200 ${
                highlighted
                  ? "pl-3.5 text-white shadow-md ring-1 ring-white/20 before:pointer-events-none before:absolute before:left-0 before:top-1/2 before:h-9 before:w-[3px] before:-translate-y-1/2 before:rounded-r-md before:bg-sky-300 before:shadow-[0_0_12px_rgba(56,189,248,0.75)] before:content-['']"
                  : "cursor-pointer pl-3 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
              }`}
              style={
                highlighted
                  ? {
                      background: "linear-gradient(135deg, #2563EB 0%, #4338CA 100%)",
                    }
                  : undefined
              }
            >
              <span
                className={`shrink-0 transition-colors [&_svg]:stroke-current ${
                  highlighted ? "text-white" : "text-[#94A3B8] group-hover:text-[#475569]"
                }`}
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t p-4" style={{ borderColor: C.border }}>
        <div
          className="rounded-2xl p-4 text-white shadow-lg ring-1 ring-white/10"
          style={{
            background: `linear-gradient(145deg, ${C.secondary} 0%, ${C.primary} 55%, #172554 100%)`,
          }}
        >
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-sm font-bold ring-1 ring-white/25">
              A
            </span>
            <div className="min-w-0 flex-1 text-right">
              <p className="truncate text-sm font-bold">{sidebarTagline}</p>
              <p className="truncate text-xs text-white/80">{roleDescription}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen" dir="rtl" style={{ backgroundColor: C.bg }}>
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-[#0F172A]/40 backdrop-blur-[2px] transition-opacity lg:hidden"
          aria-label="إغلاق القائمة"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        id="dashboard-sidebar"
        className={`fixed inset-y-0 right-0 z-50 flex w-[17.5rem] flex-col border-l bg-white shadow-[0_0_60px_-15px_rgba(30,58,138,0.18)] transition-transform duration-300 ease-out lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ borderColor: C.border }}
      >
        {sidebarBody}
      </aside>

      <div className="flex min-h-screen flex-col lg:mr-[17.5rem]">
        <header
          className="sticky top-0 z-30 border-b border-[rgba(226,232,240,0.45)] transition-[box-shadow] duration-300"
          style={{
            background: "rgba(255, 255, 255, 0.7)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            boxShadow: headerScrolled
              ? "0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 12px rgba(0, 0, 0, 0.04)"
              : "0 4px 20px rgba(0, 0, 0, 0.05)",
          }}
        >
          <div className="mx-auto flex min-h-[4.5rem] w-full max-w-[90rem] items-center gap-3 px-4 py-2.5 md:gap-4 md:px-6 md:py-3">
            <button
              type="button"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border transition hover:bg-[#F8FAFC] lg:hidden"
              style={{ borderColor: C.border, color: C.primary }}
              aria-expanded={sidebarOpen}
              aria-controls="dashboard-sidebar"
              onClick={() => setSidebarOpen((v) => !v)}
            >
              <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
              </svg>
            </button>

            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#94A3B8]">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                  />
                </svg>
              </span>
              <input
                type="search"
                placeholder="بحث سريع عن الامتحانات، الطلاب، القاعات..."
                className="w-full rounded-2xl border py-2.5 pr-11 pl-4 text-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#2563EB]/40 focus:ring-2 focus:ring-[#2563EB]/15"
                style={{
                  borderColor: C.border,
                  backgroundColor: C.bg,
                  color: C.text,
                }}
                aria-label="بحث"
              />
            </div>

            <button
              type="button"
              className="relative flex shrink-0 rounded-xl p-2.5 text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-[#1E3A8A]"
              aria-label="الإشعارات"
            >
              <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
                />
              </svg>
              <span
                className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white"
                style={{ backgroundColor: C.accent }}
              >
                3
              </span>
            </button>

            <div className="relative shrink-0" ref={accountMenuRef}>
              <button
                type="button"
                onClick={() => setAccountMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-2xl border bg-white py-1.5 pl-2 pr-3 shadow-sm transition hover:border-[#2563EB]/25 hover:shadow-md"
                style={{ borderColor: C.border }}
                aria-expanded={accountMenuOpen}
                aria-haspopup="true"
              >
                <span
                  className="flex size-9 items-center justify-center rounded-xl text-sm font-bold text-white"
                  style={{
                    background: `linear-gradient(145deg, ${C.secondary}, ${C.primary})`,
                  }}
                >
                  A
                </span>
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold" style={{ color: C.text }}>
                    {displayName}
                  </p>
                  <p className="text-xs" style={{ color: C.textMuted }}>
                    {roleDescription}
                  </p>
                </div>
                <svg className="size-4 text-[#94A3B8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {accountMenuOpen ? (
                <div
                  className="absolute left-0 top-full z-50 mt-2 w-56 rounded-2xl border bg-white py-1 shadow-xl shadow-[#0F172A]/10"
                  style={{ borderColor: C.border }}
                >
                  <div className="border-b px-4 py-3 text-right" style={{ borderColor: C.border }}>
                    <p className="text-xs" style={{ color: C.textMuted }}>
                      مسجل الدخول
                    </p>
                    <p className="truncate text-sm font-semibold" style={{ color: C.text }}>
                      {username}
                    </p>
                    <p className="text-xs font-medium" style={{ color: C.secondary }}>
                      {roleDescription}
                    </p>
                  </div>
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      className="w-full px-4 py-2.5 text-right text-sm text-[#EF4444] transition hover:bg-red-50"
                    >
                      تسجيل الخروج
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-8 md:px-6">{children}</main>

        <footer
          className="border-t bg-white/90 py-4 text-center text-xs backdrop-blur-sm"
          style={{ borderColor: C.border, color: C.textMuted }}
        >
          © 2026 جامعة البصرة - نظام رصين لإدارة الامتحانات
        </footer>
      </div>
    </div>
  );
}
