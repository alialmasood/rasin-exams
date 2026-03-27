"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CollegeRoomScheduleHint } from "@/lib/college-exam-schedules";
import type { CollegeExamRoomRow } from "@/lib/college-rooms";
import { buildCollegeRoomReportHtml } from "@/lib/college-room-report-html";

function generatedAtLabel() {
  try {
    return new Date().toLocaleString("ar-IQ", {
      timeZone: "Asia/Baghdad",
      dateStyle: "full",
      timeStyle: "short",
    });
  } catch {
    return new Date().toISOString();
  }
}

function openPrintWindow(html: string): boolean {
  /** بدون noopener لأن المتصفحات الحديثة قد تُرجع null مع noopener ولا يمكن استدعاء print(). */
  const w = window.open("", "_blank");
  if (!w) return false;
  try {
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    const runPrint = () => {
      try {
        w.print();
      } catch {
        window.alert("تعذر بدء الطباعة. جرّب متصفحاً آخر أو أعد المحاولة.");
      }
    };
    if (w.document.readyState === "complete") {
      window.setTimeout(runPrint, 100);
    } else {
      w.addEventListener("load", () => window.setTimeout(runPrint, 100), { once: true });
    }
    return true;
  } catch {
    try {
      w.close();
    } catch {
      /* ignore */
    }
    return false;
  }
}

export function RoomReportModal({
  row,
  hints,
  open,
  onClose,
}: {
  row: CollegeExamRoomRow | null;
  hints: CollegeRoomScheduleHint[];
  open: boolean;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const htmlDoc = useMemo(() => {
    if (!row) return "";
    return buildCollegeRoomReportHtml(row, hints, generatedAtLabel());
  }, [row, hints]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handlePrint = useCallback(() => {
    const tryIframe = () => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return false;
      try {
        win.focus();
        win.print();
        return true;
      } catch {
        return false;
      }
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (tryIframe()) return;
        if (!htmlDoc) {
          window.alert("لا يوجد محتوى للطباعة.");
          return;
        }
        if (!openPrintWindow(htmlDoc)) {
          window.alert(
            "تعذر الطباعة. تأكد من السماح بالنوافذ المنبثقة لهذا الموقع، ثم أعد المحاولة."
          );
        }
      });
    });
  }, [htmlDoc]);

  if (!mounted || !open || !row) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black/45 backdrop-blur-[2px]"
      dir="rtl"
      role="dialog"
      aria-modal
      aria-labelledby="room-report-title"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#E2E8F0] bg-white px-4 py-3 shadow-sm print:hidden">
        <h2 id="room-report-title" className="text-base font-bold text-[#0F172A]">
          تقرير قاعة: {row.room_name}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#172554]"
          >
            طباعة / حفظ PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#64748B] transition hover:bg-[#F8FAFC]"
          >
            إغلاق
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-[#E2E8F0] p-3 sm:p-4 print:hidden">
        <iframe
          ref={iframeRef}
          title="معاينة التقرير"
          srcDoc={htmlDoc}
          className="h-full min-h-[60vh] w-full rounded-xl border border-[#CBD5E1] bg-white shadow-inner"
        />
      </div>
      <p className="shrink-0 bg-[#F1F5F9] px-4 py-2 text-center text-xs text-[#64748B] print:hidden">
        للحفظ كـ PDF: اختر «طباعة / حفظ PDF» ثم في نافذة الطباعة اختر الطابعة «Save as PDF» أو «Microsoft Print to PDF».
      </p>
    </div>
  );
}
