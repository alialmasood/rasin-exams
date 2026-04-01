"use client";

import type { SituationFormPayloadV1 } from "@/lib/situation-form-payload";

const studyCatLabel = (c: SituationFormPayloadV1["studyCategory"]) => (c === "POSTGRAD" ? "عليا" : "أولية");

function Row({ label, value, latinNums }: { label: string; value: string; latinNums?: boolean }) {
  return (
    <tr className="border-b border-slate-200">
      <th className="w-[32%] bg-slate-50 px-2 py-1 text-right text-[10px] font-bold text-slate-700">{label}</th>
      <td
        {...(latinNums ? { lang: "en" as const, dir: "ltr" as const } : { dir: "rtl" as const })}
        className={
          latinNums
            ? "px-2 py-1 text-left text-[10px] font-semibold text-slate-900 font-mono tabular-nums"
            : "px-2 py-1 text-right text-[10px] font-semibold text-slate-900"
        }
      >
        {value || "—"}
      </td>
    </tr>
  );
}

export function SituationFormA4Preview({
  payload,
  submittedAtLabel,
}: {
  payload: SituationFormPayloadV1;
  /** عند العرض بعد الحفظ */
  submittedAtLabel?: string;
}) {
  const absentsBlock =
    payload.absents.length === 0
      ? "—"
      : payload.absents.map((a, i) => `${i + 1}) ${a.name.trim()} — ${a.reason.trim()}`).join("؛ ");

  const invBlock =
    payload.invigilators.length === 0
      ? "—"
      : payload.invigilators.map((n, i) => `${i + 1}) ${n}`).join("، ");

  return (
    <div
      className="mx-auto box-border w-full max-w-[210mm] overflow-hidden rounded-lg border-2 border-slate-800 bg-white shadow-md print:border print:shadow-none"
      dir="rtl"
    >
      <div className="border-b-2 border-slate-800 bg-slate-100 px-3 py-2 text-center">
        <p className="text-[11px] font-black text-slate-900">الموقف الامتحاني — معاينة رسمية</p>
        {submittedAtLabel ? (
          <p className="mt-0.5 text-[9px] font-semibold text-slate-600">
            تاريخ الإرسال:{" "}
            <span lang="en" dir="ltr" className="inline-block font-mono tabular-nums">
              {submittedAtLabel}
            </span>
          </p>
        ) : null}
      </div>
      <div className="max-h-[min(72vh,297mm)] overflow-y-auto p-3 print:max-h-none print:overflow-visible">
        <table className="w-full border-collapse border border-slate-300 text-right">
          <tbody>
            <Row label="الكلية" value={payload.collegeLabel} />
            <Row label="القسم" value={payload.department} />
            <Row label="اليوم" value={payload.weekday} />
            <Row label="التاريخ" value={payload.examDate} latinNums />
            <Row label="الفصل أو الدور" value={payload.term} />
            <Row label="الامتحان" value={payload.examType} />
            <Row label="الدراسة" value={studyCatLabel(payload.studyCategory)} />
            <Row label="المرحلة الدراسية" value={payload.stage} />
            <Row label="المادة الدراسية" value={payload.subject} />
            <Row label="اسم التدريسي" value={payload.teacherName} />
            <Row label="نظام الدراسة" value={payload.studySystem} />
            <Row label="نوع الدراسة" value={payload.studyShift} />
            <Row label="عدد القاعات الامتحانية" value={payload.roomCount} latinNums />
            <Row label="عدد الطلبة" value={payload.studentCount} latinNums />
            <Row label="عدد الغياب" value={payload.absentCount} latinNums />
            <tr className="border-b border-slate-200 align-top">
              <th className="bg-slate-50 px-2 py-1 text-right text-[10px] font-bold text-slate-700">
                أسماء الغياب والأسباب
              </th>
              <td className="px-2 py-1 text-right text-[9px] leading-snug text-slate-900" dir="rtl">
                {absentsBlock}
              </td>
            </tr>
            <Row label="عدد المراقبين" value={payload.invigilatorCount} latinNums />
            <tr className="border-b border-slate-200 align-top">
              <th className="bg-slate-50 px-2 py-1 text-right text-[10px] font-bold text-slate-700">أسماء المراقبين</th>
              <td className="px-2 py-1 text-right text-[9px] leading-snug text-slate-900" dir="rtl">
                {invBlock}
              </td>
            </tr>
            <tr className="align-top">
              <th className="bg-slate-50 px-2 py-1 text-right text-[10px] font-bold text-slate-700">
                ملاحظات المراقب / السبب
              </th>
              <td className="px-2 py-1 text-right text-[9px] leading-snug text-slate-900" dir="rtl">
                {payload.invigilatorNote || "—"}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 border-t border-dashed border-slate-300 pt-2 text-[8px] leading-tight text-slate-600">
          رفع الموقف: الساعة العاشرة صباحًا للوجبة الأولى — الساعة الواحدة ظهرًا للوجبة الثانية.
        </p>
      </div>
    </div>
  );
}
