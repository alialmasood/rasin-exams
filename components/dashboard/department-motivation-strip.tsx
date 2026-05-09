"use client";

import type { DepartmentPortalMotivationLine } from "@/lib/college-activity-log";
import { useCallback, useEffect, useMemo, useState } from "react";

const AUTO_DISMISS_MS = 5 * 60 * 1000;
const STORAGE_KEY = "examsuob-dept-motivation-dismissed-v1";
const MAX_STORED_IDS = 400;

function readDismissed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function writeDismissed(ids: string[]) {
  const next = ids.slice(-MAX_STORED_IDS);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* تجاهل امتلاء التخزين */
  }
}

function MotivationNoticeCard({
  line,
  onDismiss,
}: {
  line: DepartmentPortalMotivationLine;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(line.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [line.id, onDismiss]);

  return (
    <div
      className="relative rounded-lg border border-white/12 bg-white/[0.07] px-2 py-2 ps-8 text-[11px] font-semibold leading-snug text-white/95 shadow-sm"
      role="status"
    >
      <button
        type="button"
        className="absolute start-1.5 top-1.5 flex size-6 items-center justify-center rounded-md text-[14px] font-bold leading-none text-white/70 transition hover:bg-white/15 hover:text-white"
        onClick={() => onDismiss(line.id)}
        aria-label="إغلاق الإشعار"
      >
        ×
      </button>
      <span
        className={`mb-1 block text-[9px] font-bold uppercase tracking-wide ${
          line.kind === "dean_confirmed" ? "text-amber-200/95" : "text-sky-200/95"
        }`}
      >
        {line.kind === "dean_confirmed" ? "مصادقة رفع" : "اعتماد موقف"}
      </span>
      <p className="text-right">{line.message}</p>
    </div>
  );
}

export function DepartmentMotivationStrip({ lines }: { lines: DepartmentPortalMotivationLine[] }) {
  const [dismissed, setDismissed] = useState<string[] | null>(null);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  const dismissOne = useCallback((id: string) => {
    setDismissed((prev) => {
      const base = prev ?? [];
      if (base.includes(id)) return prev;
      const next = [...base, id];
      writeDismissed(next);
      return next;
    });
  }, []);

  const visible = useMemo(() => {
    if (dismissed === null) return [];
    return lines.filter((l) => !dismissed.includes(l.id));
  }, [lines, dismissed]);

  if (!lines.length) return null;
  if (dismissed === null) return null;
  if (!visible.length) return null;

  return (
    <div
      className="mb-3 rounded-xl border border-white/15 bg-white/[0.06] px-2.5 pb-2.5 pt-2 shadow-sm"
      dir="rtl"
      role="region"
      aria-label="إنجازات حديثة في التشكيل"
    >
      <p className="mb-2 px-1 text-[10px] font-bold tracking-tight text-amber-200/95">إنجازات حديثة في التشكيل</p>
      <div className="max-h-[11rem] space-y-2 overflow-y-auto overscroll-contain [scrollbar-color:rgba(255,255,255,0.35)_transparent]">
        <div className="space-y-2" aria-live="polite">
          {visible.map((line) => (
            <MotivationNoticeCard key={line.id} line={line} onDismiss={dismissOne} />
          ))}
        </div>
      </div>
    </div>
  );
}
