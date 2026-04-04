"use client";

import { useTransition } from "react";
import {
  getAccountsUsersReportHtmlAction,
  getCollegeBranchesReportHtmlAction,
  getExamRoomsReportHtmlAction,
  getExamSystemAggregatesReportHtmlAction,
  getFormationsReportHtmlAction,
  getStudySubjectsReportHtmlAction,
} from "./actions";
import { ComprehensiveReportPanel } from "./comprehensive-report-panel";

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
        window.alert("تعذر بدء الطباعة. جرّب متصفحاً آخر أو أعد المحاولة.");
      }
    };
    if (w.document.readyState === "complete") {
      window.setTimeout(runPrint, 120);
    } else {
      w.addEventListener("load", () => window.setTimeout(runPrint, 120), { once: true });
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

export function ReportsHubPanel() {
  const [isPending, startTransition] = useTransition();

  function runReport(
    fetchHtml: () => Promise<{ ok: true; html: string } | { ok: false; message: string }>
  ) {
    startTransition(async () => {
      const res = await fetchHtml();
      if (!res.ok) {
        window.alert(res.message);
        return;
      }
      if (!openHtmlPrintWindow(res.html)) {
        window.alert("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع.");
      }
    });
  }

  return (
    <div className="space-y-8" dir="rtl">
      <header className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-extrabold text-[#1E3A8A]">التقارير</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#64748B]">
          مركز تقارير الإدارة: تصدير وطباعة ملخصات النظام للمراجعة والأرشفة (حسابات، تشكيلات، أقسام، مواد،
          قاعات، إحصائيات الجداول والمواقف، …).
        </p>
      </header>

      <ComprehensiveReportPanel />

      <section
        className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8"
        aria-labelledby="report-exam-aggregates-heading"
      >
        <h2 id="report-exam-aggregates-heading" className="text-lg font-extrabold text-[#0F172A] sm:text-xl">
          تقرير إحصائيات الجداول والمواقف (كل التشكيلات)
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#64748B]">
          ملخص: عدد جلسات الجدول الامتحاني، الأيام الفريدة، المقاعد والحضور والغياب، المواقف المرفوعة،
          الدراسات العليا، ثم تفصيل حسب المرحلة والتشكيل والقسم/الفرع. المصدر:{" "}
          <span className="font-mono text-xs">college_exam_schedules</span>، القاعات، و
          <span className="font-mono text-xs"> college_exam_situation_reports</span>.
        </p>
        <div className="mt-6">
          <button
            type="button"
            disabled={isPending}
            onClick={() => runReport(getExamSystemAggregatesReportHtmlAction)}
            className="rounded-xl border-2 border-[#1E3A8A] bg-[#1E3A8A] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#163170] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
          >
            {isPending ? "جاري تجهيز التقرير…" : "إصدار التقرير (طباعة / PDF)"}
          </button>
        </div>
      </section>

      <section
        className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8"
        aria-labelledby="report-accounts-users-heading"
      >
        <h2 id="report-accounts-users-heading" className="text-lg font-extrabold text-[#0F172A] sm:text-xl">
          تقرير الحسابات والمستخدمين
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#64748B]">
          قائمة بجميع مستخدمي النظام غير المحذوفين: الاسم، اسم المستخدم، الدور، الحالة، بيانات الاتصال، وإن وُجد
          ملف كلية (نوع الحساب، اسم التشكيل أو وحدة المتابعة، عميد/معاون)، مع تواريخ الإنشاء وآخر دخول. المصدر:
          جداول <span className="font-mono text-xs">users</span> و{" "}
          <span className="font-mono text-xs">college_account_profiles</span>.
        </p>
        <p className="mt-2 text-xs font-semibold text-amber-900/90">
          لا يُدرَج أي كلمة مرور في التقرير. يُفضّل حفظ PDF من نافذة الطباعة للأرشفة.
        </p>
        <div className="mt-6">
          <button
            type="button"
            disabled={isPending}
            onClick={() => runReport(getAccountsUsersReportHtmlAction)}
            className="rounded-xl border-2 border-[#1E3A8A] bg-[#1E3A8A] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#163170] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
          >
            {isPending ? "جاري تجهيز التقرير…" : "إصدار التقرير (طباعة / PDF)"}
          </button>
        </div>
      </section>

      <section
        className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8"
        aria-labelledby="report-formations-heading"
      >
        <h2 id="report-formations-heading" className="text-lg font-extrabold text-[#0F172A] sm:text-xl">
          تقرير التشكيلات
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#64748B]">
          حسابات الكلية ذات الدور «تشكيل» غير المحذوفة وملفها في{" "}
          <span className="font-mono text-xs">college_account_profiles</span>: نوع الحساب، اسم التشكيل أو وحدة
          المتابعة، عميد/معاون، وحالة الحساب.
        </p>
        <div className="mt-6">
          <button
            type="button"
            disabled={isPending}
            onClick={() => runReport(getFormationsReportHtmlAction)}
            className="rounded-xl border-2 border-[#1E3A8A] bg-[#1E3A8A] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#163170] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
          >
            {isPending ? "جاري تجهيز التقرير…" : "إصدار التقرير (طباعة / PDF)"}
          </button>
        </div>
      </section>

      <section
        className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8"
        aria-labelledby="report-branches-heading"
      >
        <h2 id="report-branches-heading" className="text-lg font-extrabold text-[#0F172A] sm:text-xl">
          تقرير الأقسام والفروع
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#64748B]">
          الأقسام والفروع المسجّلة لكل تشكيل: اسم القسم/الفرع، رئيس القسم، والتشكيل التابع له. المصدر: جدول{" "}
          <span className="font-mono text-xs">college_subjects</span>.
        </p>
        <div className="mt-6">
          <button
            type="button"
            disabled={isPending}
            onClick={() => runReport(getCollegeBranchesReportHtmlAction)}
            className="rounded-xl border-2 border-[#1E3A8A] bg-[#1E3A8A] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#163170] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
          >
            {isPending ? "جاري تجهيز التقرير…" : "إصدار التقرير (طباعة / PDF)"}
          </button>
        </div>
      </section>

      <section
        className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8"
        aria-labelledby="report-study-subjects-heading"
      >
        <h2 id="report-study-subjects-heading" className="text-lg font-extrabold text-[#0F172A] sm:text-xl">
          تقرير المواد الدراسية
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#64748B]">
          المواد المرتبطة بأقسام التشكيلات: اسم المادة، التدريسي، نوع الدراسة، المرحلة، والتشكيل. المصدر:{" "}
          <span className="font-mono text-xs">college_study_subjects</span>.
        </p>
        <div className="mt-6">
          <button
            type="button"
            disabled={isPending}
            onClick={() => runReport(getStudySubjectsReportHtmlAction)}
            className="rounded-xl border-2 border-[#1E3A8A] bg-[#1E3A8A] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#163170] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
          >
            {isPending ? "جاري تجهيز التقرير…" : "إصدار التقرير (طباعة / PDF)"}
          </button>
        </div>
      </section>

      <section
        className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8"
        aria-labelledby="report-exam-rooms-heading"
      >
        <h2 id="report-exam-rooms-heading" className="text-lg font-extrabold text-[#0F172A] sm:text-xl">
          تقرير القاعات الامتحانية
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#64748B]">
          القاعات المعرّفة في النظام لكل تشكيل: التسلسل، المادة (أو مادتان في القاعة الواحدة عند الاقتضاء)،
          المراقب، السعة، والمرحلة. المصدر: <span className="font-mono text-xs">college_exam_rooms</span>.
        </p>
        <div className="mt-6">
          <button
            type="button"
            disabled={isPending}
            onClick={() => runReport(getExamRoomsReportHtmlAction)}
            className="rounded-xl border-2 border-[#1E3A8A] bg-[#1E3A8A] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#163170] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
          >
            {isPending ? "جاري تجهيز التقرير…" : "إصدار التقرير (طباعة / PDF)"}
          </button>
        </div>
      </section>
    </div>
  );
}
