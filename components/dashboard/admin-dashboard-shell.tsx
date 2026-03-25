"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { dashboardNavItems } from "@/components/dashboard/nav-config";
import { logoutAction } from "@/app/dashboard/actions";

type Props = {
  username: string;
  children: React.ReactNode;
};

export function AdminDashboardShell({ username, children }: Props) {
  const pathname = usePathname();
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setHeaderScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    function closeOnOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* شريط جانبي — على يمين الشاشة مع اتجاه RTL */}
      <aside className="fixed inset-y-0 right-0 z-40 flex w-64 flex-col border-l border-slate-200/80 bg-white shadow-[0_0_40px_-12px_rgba(30,58,138,0.12)]">
        <div className="flex h-16 items-center gap-3 border-b border-slate-100 px-5">
          <div className="relative size-10 overflow-hidden rounded-xl bg-[#1E3A8A]/10 ring-1 ring-[#1E3A8A]/15">
            <Image src="/uob-logo.png" alt="" width={40} height={40} className="object-contain p-1" />
          </div>
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-bold text-[#1E3A8A]">نظام رصين</p>
            <p className="truncate text-xs text-slate-500">Raseen System</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="القائمة الرئيسية">
          {dashboardNavItems.map((item) => {
            const highlighted =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  highlighted
                    ? "bg-[#3B82F6]/12 text-[#1E3A8A] shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className={highlighted ? "text-[#3B82F6]" : "text-slate-400"}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-100 p-4">
          <p className="text-center text-xs text-slate-400">جامعة البصرة</p>
        </div>
      </aside>

      <div className="mr-64 flex min-h-screen flex-col">
        <header
          className={`sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-200/60 bg-white/90 px-4 backdrop-blur-md transition-shadow duration-200 md:px-6 ${
            headerScrolled ? "shadow-md shadow-slate-900/5" : "shadow-sm shadow-slate-900/5"
          }`}
        >
          <div className="relative mx-auto flex w-full max-w-6xl items-center gap-4">
            <div className="relative min-w-0 flex-1 max-md:max-w-[min(100%,18rem)]">
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              </span>
              <input
                type="search"
                placeholder="بحث سريع…"
                className="w-full rounded-2xl border border-slate-200/80 bg-[#F8FAFC] py-2.5 pr-11 pl-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#3B82F6]/50 focus:ring-2 focus:ring-[#3B82F6]/20"
                aria-label="بحث"
              />
            </div>

            <button
              type="button"
              className="relative rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-[#1E3A8A]"
              aria-label="الإشعارات"
            >
              <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
              </svg>
              <span className="absolute top-1.5 left-1.5 size-2 rounded-full bg-[#F59E0B] ring-2 ring-white" />
            </button>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white py-1.5 pl-2 pr-3 shadow-sm transition hover:border-[#3B82F6]/30 hover:shadow"
                aria-expanded={menuOpen}
                aria-haspopup="true"
              >
                <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#1E3A8A] to-[#3B82F6] text-sm font-bold text-white">
                  {username.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden text-right text-sm font-medium text-slate-800 sm:block">{username}</span>
                <svg className="size-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {menuOpen ? (
                <div className="absolute left-0 top-full z-50 mt-2 w-52 rounded-2xl border border-slate-200/80 bg-white py-1 shadow-lg shadow-slate-900/10">
                  <div className="border-b border-slate-100 px-4 py-3 text-right">
                    <p className="text-xs text-slate-500">مسجل الدخول</p>
                    <p className="truncate text-sm font-semibold text-slate-800">{username}</p>
                    <p className="text-xs text-[#3B82F6]">مدير النظام</p>
                  </div>
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      className="w-full px-4 py-2.5 text-right text-sm text-red-600 transition hover:bg-red-50"
                    >
                      تسجيل الخروج
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6">{children}</main>

        <footer className="border-t border-slate-200/80 bg-white py-4 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} جامعة البصرة — نظام رصين لإدارة الامتحانات
        </footer>
      </div>
    </div>
  );
}
