"use client";

import { useMemo, useState, useTransition } from "react";
import { COMPREHENSIVE_REPORT_SECTIONS } from "@/lib/comprehensive-report-sections";
import { exportComprehensiveReportAction } from "./actions";

function downloadBase64Xlsx(base64: string, filename: string) {
  try {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    window.alert("تعذر تنزيل الملف. جرّب متصفحاً آخر.");
  }
}

function openHtmlPrintWindow(html: string): boolean {
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
        window.alert("تعذر بدء الطباعة.");
      }
    };
    if (w.document.readyState === "complete") {
      window.setTimeout(runPrint, 200);
    } else {
      w.addEventListener("load", () => window.setTimeout(runPrint, 200), { once: true });
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

export function ComprehensiveReportPanel() {
  const allIds = useMemo(() => COMPREHENSIVE_REPORT_SECTIONS.map((s) => s.id), []);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allIds));
  const [isPending, startTransition] = useTransition();

  const byGroup = useMemo(() => {
    const m = new Map<string, typeof COMPREHENSIVE_REPORT_SECTIONS>();
    for (const s of COMPREHENSIVE_REPORT_SECTIONS) {
      if (!m.has(s.groupAr)) m.set(s.groupAr, []);
      m.get(s.groupAr)!.push(s);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "ar"));
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selectAll() {
    setSelected(new Set(allIds));
  }

  function clearAll() {
    setSelected(new Set());
  }

  function runExport(format: "xlsx" | "print") {
    const ids = [...selected];
    if (ids.length === 0) {
      window.alert("اختر وسماً واحداً على الأقل.");
      return;
    }
    startTransition(async () => {
      const res = await exportComprehensiveReportAction(ids, format);
      if (!res.ok) {
        window.alert(res.message);
        return;
      }
      if (res.kind === "xlsx") {
        downloadBase64Xlsx(res.base64, res.filename);
        return;
      }
      if (res.kind === "html" && !openHtmlPrintWindow(res.html)) {
        window.alert("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة.");
      }
    });
  }

  return (
    <section
      className="rounded-2xl border-2 border-[#C7D2FE] bg-gradient-to-br from-[#EEF2FF] to-white p-6 shadow-sm sm:p-8"
      aria-labelledby="comprehensive-report-heading"
    >
      <h2 id="comprehensive-report-heading" className="text-lg font-extrabold text-[#312E81] sm:text-xl">
        التقرير الشامل (وسوم + Excel / PDF)
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#475569]">
        حدّد الأقسام التي تريد تضمينها في الملف. التصدير إلى{" "}
        <strong className="font-semibold text-[#1E3A8A]">Excel</strong> يولّد عدة أوراق حسب اختيارك.{" "}
        <strong className="font-semibold text-[#1E3A8A]">PDF</strong> عبر الطباعة: نفس المحتوى كجداول جاهزة
        للحفظ كـ PDF من المتصفح.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={selectAll}
          className="rounded-lg border border-[#6366F1] bg-white px-3 py-1.5 text-xs font-bold text-[#4338CA] hover:bg-[#EEF2FF] disabled:opacity-50"
        >
          تحديد الكل
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={clearAll}
          className="rounded-lg border border-[#94A3B8] bg-white px-3 py-1.5 text-xs font-bold text-[#475569] hover:bg-slate-50 disabled:opacity-50"
        >
          إلغاء الكل
        </button>
      </div>

      <div className="mt-6 max-h-[min(420px,55vh)] space-y-6 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white/80 p-4">
        {byGroup.map(([group, items]) => (
          <div key={group}>
            <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[#64748B]">{group}</h3>
            <ul className="flex flex-col gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-transparent px-2 py-1 hover:border-[#C7D2FE] hover:bg-[#F8FAFC]">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggle(item.id)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#4F46E5] focus:ring-[#6366F1]"
                    />
                    <span className="text-sm leading-snug text-[#0F172A]">{item.labelAr}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={() => runExport("xlsx")}
          className="rounded-xl border-2 border-[#059669] bg-[#059669] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#047857] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
        >
          {isPending ? "جاري التصدير…" : "تصدير Excel"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => runExport("print")}
          className="rounded-xl border-2 border-[#1E3A8A] bg-white px-5 py-2.5 text-sm font-bold text-[#1E3A8A] shadow-sm transition hover:bg-[#EEF2FF] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
        >
          طباعة / PDF
        </button>
      </div>
      <p className="mt-3 text-xs text-[#64748B]">
        المقاعد والحضور والغياب الصباحي/المسائي تُحسب من جلسات الجدول الامتحاني وربطها بالقاعة (نفس منطق رفع
        الموقف). عدد القاعات = عدد سجول <span className="font-mono">college_exam_rooms</span> لكل قسم/كلية.
      </p>
    </section>
  );
}
