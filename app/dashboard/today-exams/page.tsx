import { redirect } from "next/navigation";
import type { UserRole } from "@/lib/authz";
import { isAdminRole } from "@/lib/authz";
import { aggregateSchedulesForTodayExams, baghdadIsoDateToday } from "@/lib/admin-today-exams";
import { listAllCollegeExamSchedulesForAdminByDate } from "@/lib/college-exam-schedules";
import { formatCollegeStudyStageLabel } from "@/lib/college-study-stage-display";
import { formatExamMealSlotLabel } from "@/lib/exam-meal-slot";
import { getSession } from "@/lib/session";
import { STUDY_TYPE_LABEL_AR } from "@/lib/study-type-labels-ar";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "امتحانات اليوم — لوحة الإدارة",
};

function weekdayAr(dateIso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return "";
  return new Intl.DateTimeFormat("ar-IQ", { weekday: "long", timeZone: "Asia/Baghdad" }).format(new Date(`${dateIso}T12:00:00`));
}

export default async function TodayExamsPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role === "COLLEGE") {
    redirect("/dashboard/college/exam-schedules");
  }
  if (!isAdminRole(session.role as UserRole)) {
    redirect("/dashboard");
  }

  const sp = searchParams ? await searchParams : undefined;
  const rawDate = String(sp?.date ?? "").trim();
  const examDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : baghdadIsoDateToday();
  const scheduleRows = await listAllCollegeExamSchedulesForAdminByDate(examDate);
  const aggregated = aggregateSchedulesForTodayExams(scheduleRows);
  const formationCount = new Set(scheduleRows.map((r) => r.owner_user_id)).size;
  const pdfHref = `/dashboard/today-exams/pdf?date=${encodeURIComponent(examDate)}`;

  return (
    <section className="mx-auto max-w-[1200px] space-y-6 px-4 py-8" dir="rtl">
      <header className="space-y-1 border-b border-[#E2E8F0] pb-4">
        <h1 className="text-2xl font-black text-[#0F172A]">امتحانات اليوم</h1>
        <p className="text-sm leading-relaxed text-[#64748B]">
          عرض التشكيلات التي لديها جلسات امتحانية مجدولة في التاريخ المحدد، مع تجميع السعة الكلية في القاعات لكل مادة ووجبة.
        </p>
      </header>

      <form
        action="/dashboard/today-exams"
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm"
      >
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="exam-day" className="mb-1 block text-xs font-bold text-[#475569]">
            اختر يوم الامتحان
          </label>
          <input
            id="exam-day"
            type="date"
            name="date"
            defaultValue={examDate}
            className="h-11 w-full max-w-xs rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-3 text-sm outline-none focus:border-[#2563EB]"
          />
        </div>
        <button
          type="submit"
          className="h-11 rounded-xl bg-[#1E3A8A] px-5 text-sm font-bold text-white transition hover:bg-[#172554]"
        >
          عرض
        </button>
        <a
          href={pdfHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center rounded-xl border-2 border-[#B91C1C] bg-white px-5 text-sm font-bold text-[#B91C1C] shadow-sm transition hover:bg-red-50"
        >
          تصدير PDF
        </a>
      </form>

      <p className="text-[11px] leading-relaxed text-[#64748B]">
        يفتح «تصدير PDF» صفحة جاهزة للطباعة بحجم A4؛ من نافذة الطباعة اختر حفظ PDF أو Microsoft Print to PDF. إن أردت تقريرًا
        ليوم آخر غيّر التاريخ ثم اضغط «عرض» قبل التصدير، أو عدّل التاريخ في شريط عنوان التبويب بعد الفتح.
      </p>

      <div className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF]/60 px-4 py-3 text-sm text-[#1E3A8A]">
        <span className="font-bold tabular-nums">{examDate}</span>
        {weekdayAr(examDate) ? (
          <span className="ms-2 text-[#334155]">({weekdayAr(examDate)})</span>
        ) : null}
        <span className="mx-2 text-[#94A3B8]">|</span>
        <span>
          تشكيلات بامتحان مجدول: <span className="font-black tabular-nums">{formationCount}</span>
        </span>
        <span className="mx-2 text-[#94A3B8]">|</span>
        <span>
          صفوف مجمّعة (مادة + فرع + وجبة + مرحلة): <span className="font-black tabular-nums">{aggregated.length}</span>
        </span>
      </div>

      {aggregated.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-6 py-12 text-center text-[#64748B]">
          لا توجد جداول امتحانية مسجّلة لهذا التاريخ في أي تشكيل.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-right text-sm">
              <thead className="bg-[#F1F5F9] text-[#0F172A]">
                <tr className="border-b border-[#CBD5E1]">
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-bold">م</th>
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-bold">التشكيل</th>
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-bold">القسم / الفرع</th>
                  <th className="min-w-[10rem] px-3 py-3 text-xs font-bold">المادة الامتحانية</th>
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-bold">المرحلة</th>
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-bold">نوع الدراسة</th>
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-bold">الوجبة</th>
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-bold">جلسات القاعات</th>
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-bold">إجمالي الطلبة في القاعات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-[#334155]">
                {aggregated.map((row, idx) => (
                  <tr key={`${row.formation_label}-${row.college_subject_name}-${row.study_subject_name}-${row.meal_slot}-${row.stage_level}-${idx}`} className="hover:bg-[#F8FAFC]">
                    <td className="px-3 py-2.5 text-center text-xs tabular-nums text-[#64748B]">{idx + 1}</td>
                    <td className="max-w-[12rem] truncate px-3 py-2.5 text-xs font-semibold">{row.formation_label}</td>
                    <td className="max-w-[11rem] truncate px-3 py-2.5 text-xs">{row.college_subject_name}</td>
                    <td className="px-3 py-2.5 text-sm font-medium">{row.study_subject_name}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs">{formatCollegeStudyStageLabel(row.stage_level)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs">{STUDY_TYPE_LABEL_AR[row.study_type]}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-[#1E3A8A]">
                      {formatExamMealSlotLabel(row.meal_slot)}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-xs font-bold">{row.room_sessions}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-sm font-black text-[#0F172A]">
                      {row.total_students_in_rooms}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
