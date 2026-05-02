"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type OnlineUser = {
  userId: string;
  username: string;
  role: string;
  collegeAccountKind: string | null;
  displayLabel: string;
  lastSeenAtIso: string;
};

function roleKindLabelAr(role: string, collegeKind: string | null): string {
  if (role === "COLLEGE") {
    if (collegeKind === "FORMATION") return "عميد تشكيل";
    if (collegeKind === "DEPARTMENT") return "رئيس قسم / فرع";
    if (collegeKind === "FOLLOWUP") return "متابعة مركزية";
    return "حساب كلية";
  }
  if (role === "SUPER_ADMIN") return "سوبر أدمن";
  if (role === "ADMIN") return "إدارة";
  if (role === "MANAGER") return "مدير";
  if (role === "USER") return "مستخدم";
  return role;
}

function secondsAgoAr(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 5) return "الآن";
  if (s < 60) return `منذ ${s} ث`;
  const m = Math.floor(s / 60);
  if (m < 60) return `منذ ${m} د`;
  return `منذ ${Math.floor(m / 60)} س`;
}

const HEARTBEAT_MS = 40_000;
const POLL_ONLINE_MS = 25_000;

export function DashboardOnlinePresence({
  userId,
  displayLabel,
}: {
  userId: string;
  displayLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [dbUnavailable, setDbUnavailable] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const sendHeartbeat = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    try {
      const res = await fetch("/api/presence/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ displayLabel }),
      });
      if (res.status === 503) setDbUnavailable(true);
      else if (res.ok) setDbUnavailable(false);
    } catch {
      /* تجاهل أخطاء الشبكة المؤقتة */
    }
  }, [displayLabel]);

  const fetchOnline = useCallback(async () => {
    try {
      const res = await fetch("/api/presence/online", { credentials: "same-origin" });
      if (res.status === 401) return;
      if (res.status === 503) {
        setDbUnavailable(true);
        setOnline([]);
        return;
      }
      const data = (await res.json()) as { ok?: boolean; users?: OnlineUser[] };
      if (data.ok && Array.isArray(data.users)) {
        setDbUnavailable(false);
        setOnline(data.users);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void sendHeartbeat();
    void fetchOnline();
    const hb = window.setInterval(() => void sendHeartbeat(), HEARTBEAT_MS);
    const pol = window.setInterval(() => void fetchOnline(), POLL_ONLINE_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void sendHeartbeat();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(hb);
      window.clearInterval(pol);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [sendHeartbeat, fetchOnline]);

  useEffect(() => {
    if (!open) return;
    void fetchOnline();
  }, [open, fetchOnline]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const el = wrapRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const count = online.length;
  const showBadge = count > 0 && !dbUnavailable;

  return (
    <div className="relative shrink-0" ref={wrapRef} dir="rtl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex rounded-xl p-2.5 text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-[#1E3A8A]"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="المتصلون بالنظام الآن"
        title="من يعمل على النظام في هذه اللحظة (نافذة مفتوحة ونشطة)"
      >
        <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
        {showBadge ? (
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-emerald-500 ring-2 ring-white" />
        ) : null}
        {showBadge && count > 1 ? (
          <span className="absolute -left-0.5 -top-0.5 flex min-w-[1.125rem] items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute start-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-[#E2E8F0] bg-white py-2 shadow-xl shadow-[#0F172A]/12"
          role="dialog"
          aria-label="قائمة المتصلين"
        >
          <div className="border-b border-[#E2E8F0] px-4 py-2.5">
            <p className="text-sm font-extrabold text-[#0F172A]">يعمل على النظام الآن</p>
            <p className="mt-0.5 text-[11px] leading-snug text-[#64748B]">
              من لديهم الصفحة مفتوحة ويُرسل النظام نبضات نشاط خلال آخر دقيقتين (ليس مجرد «حساب نشط» في
              القائمة).
            </p>
          </div>
          {dbUnavailable ? (
            <p className="px-4 py-6 text-center text-sm text-[#64748B]">تعذر تحميل قائمة المتصلين (قاعدة البيانات).</p>
          ) : online.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[#64748B]">لا يوجد مستخدمون ظاهرون كمتصلين الآن.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {online.map((u) => {
                const self = u.userId === userId;
                return (
                  <li
                    key={u.userId}
                    className={`flex items-start gap-2.5 px-4 py-2.5 text-right ${self ? "bg-emerald-50/80" : ""}`}
                  >
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald-500"
                      title="متصل"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[#0F172A]">
                        {u.displayLabel}
                        {self ? (
                          <span className="mr-1.5 rounded-md bg-emerald-200/80 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-950">
                            أنت
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#64748B]">
                        {roleKindLabelAr(u.role, u.collegeAccountKind)}
                        <span className="mx-1 text-[#CBD5E1]">·</span>
                        <span className="font-mono text-[#94A3B8]">{u.username}</span>
                        <span className="mx-1 text-[#CBD5E1]">·</span>
                        {secondsAgoAr(u.lastSeenAtIso)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
