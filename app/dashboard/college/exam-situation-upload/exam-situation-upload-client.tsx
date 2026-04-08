"use client";

import { useCollegePortalBasePath } from "@/components/dashboard/college-portal-base-path";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition } from "react";
import { SituationFormA4Preview } from "@/components/situation-form/situation-form-a4-preview";
import { SITUATION_FORM_PAYLOAD_VERSION, validateSituationFormPayload } from "@/lib/situation-form-payload";
import type { SituationFormPayloadV1 } from "@/lib/situation-form-payload";
import { submitSituationFormAction } from "./actions";

const inputCls =
  "h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-[14px] text-[#0F172A] shadow-sm outline-none transition focus:border-[#2563EB]/50 focus:ring-2 focus:ring-[#2563EB]/15";
/** أرقام لاتينية في الحقول الرقمية وتاريخ */
const inputLatinNumsCls = `${inputCls} font-mono tabular-nums text-left`;
const labelCls = "mb-0.5 block text-[12px] font-bold text-[#475569]";
const textareaCls =
  "min-h-[60px] w-full resize-y rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-2 text-[14px] text-[#0F172A] shadow-sm outline-none transition focus:border-[#2563EB]/50 focus:ring-2 focus:ring-[#2563EB]/15";

const WEEKDAYS = [
  { value: "", label: "—" },
  { value: "الأحد", label: "الأحد" },
  { value: "الإثنين", label: "الإثنين" },
  { value: "الثلاثاء", label: "الثلاثاء" },
  { value: "الأربعاء", label: "الأربعاء" },
  { value: "الخميس", label: "الخميس" },
  { value: "الجمعة", label: "الجمعة" },
  { value: "السبت", label: "السبت" },
];

type StudyCategory = "UNDERGRAD" | "POSTGRAD";
type AbsentRow = { id: number; name: string; reason: string };
type InvigilatorRow = { id: number; name: string };

function minDateIsoInBaghdad(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Baghdad" });
}

export function ExamSituationUploadClient({ collegeLabel }: { collegeLabel: string }) {
  const portalBase = useCollegePortalBasePath();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const formId = useId();
  const [step, setStep] = useState<"edit" | "preview">("edit");
  const [previewPayload, setPreviewPayload] = useState<SituationFormPayloadV1 | null>(null);
  const [studyCategory, setStudyCategory] = useState<StudyCategory>("UNDERGRAD");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const minExamDate = minDateIsoInBaghdad();
  const absentIdRef = useRef(0);
  const [absentRows, setAbsentRows] = useState<AbsentRow[]>([{ id: 0, name: "", reason: "" }]);
  const invigilatorIdRef = useRef(0);
  const [invigilatorRows, setInvigilatorRows] = useState<InvigilatorRow[]>([{ id: 0, name: "" }]);
  const [invigilatorNote, setInvigilatorNote] = useState("");

  function updateAbsentRow(id: number, field: "name" | "reason", value: string) {
    setAbsentRows((rows) =>
      rows.map((r) => {
        if (r.id !== id) return r;
        if (field === "name") {
          return { ...r, name: value, reason: value.trim() ? r.reason : "" };
        }
        return { ...r, reason: value };
      })
    );
  }

  function addAbsentRow() {
    absentIdRef.current += 1;
    setAbsentRows((rows) => [...rows, { id: absentIdRef.current, name: "", reason: "" }]);
  }

  function removeAbsentRow(id: number) {
    setAbsentRows((rows) => {
      if (rows.length <= 1) return rows;
      return rows.filter((r) => r.id !== id);
    });
  }

  function updateInvigilatorName(id: number, value: string) {
    setInvigilatorRows((rows) => rows.map((r) => (r.id === id ? { ...r, name: value } : r)));
  }

  function addInvigilatorRow() {
    invigilatorIdRef.current += 1;
    setInvigilatorRows((rows) => [...rows, { id: invigilatorIdRef.current, name: "" }]);
  }

  function removeInvigilatorRow(id: number) {
    setInvigilatorRows((rows) => {
      if (rows.length <= 1) return rows;
      return rows.filter((r) => r.id !== id);
    });
  }

  const stageOptions = useMemo(() => {
    if (studyCategory === "POSTGRAD") {
      return [
        { value: "", label: "اختر المرحلة" },
        { value: "دكتوراه", label: "دكتوراه" },
        { value: "ماجستير", label: "ماجستير" },
        { value: "دبلوم", label: "دبلوم" },
      ];
    }
    return [
      { value: "", label: "اختر المرحلة" },
      { value: "الأولى", label: "الأولى" },
      { value: "الثانية", label: "الثانية" },
      { value: "الثالثة", label: "الثالثة" },
      { value: "الرابعة", label: "الرابعة" },
      { value: "الخامسة", label: "الخامسة" },
      { value: "السادسة", label: "السادسة" },
    ];
  }, [studyCategory]);

  function buildPayloadFromForm(): SituationFormPayloadV1 | null {
    const form = formRef.current;
    if (!form) return null;
    const fd = new FormData(form);
    const get = (k: string) => String(fd.get(k) ?? "").trim();
    const absents = absentRows
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name.trim(), reason: r.reason.trim() }));
    const invigilators = invigilatorRows.map((r) => r.name.trim()).filter(Boolean);
    return {
      version: SITUATION_FORM_PAYLOAD_VERSION,
      collegeLabel,
      department: get("department"),
      weekday: get("weekday"),
      examDate: get("examDate"),
      term: get("term"),
      examType: get("examType"),
      studyCategory,
      stage: get("stage"),
      subject: get("subject"),
      teacherName: get("teacherName"),
      studySystem: get("studySystem"),
      studyShift: get("studyShift"),
      roomCount: get("roomCount"),
      studentCount: get("studentCount"),
      absentCount: get("absentCount"),
      absents,
      invigilatorCount: get("invigilatorCount"),
      invigilators,
      invigilatorNote: invigilatorNote.trim(),
    };
  }

  function goToPreview() {
    setNotice(null);
    const raw = buildPayloadFromForm();
    if (!raw) return;
    const v = validateSituationFormPayload(raw, { forSubmit: true });
    if (!v.ok) {
      setNotice({ kind: "error", text: v.message });
      window.setTimeout(() => setNotice(null), 8000);
      return;
    }
    setPreviewPayload(v.data);
    setStep("preview");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function backToEdit() {
    setStep("edit");
    setPreviewPayload(null);
  }

  function sendFinal() {
    if (!previewPayload) return;
    setNotice(null);
    startTransition(async () => {
      const res = await submitSituationFormAction(previewPayload);
      if (!res.ok) {
        setNotice({ kind: "error", text: res.message });
        window.setTimeout(() => setNotice(null), 8000);
        return;
      }
      router.push(`${portalBase}/status-followup`);
    });
  }

  return (
    <article
      className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_6px_24px_rgba(15,23,42,0.06)]"
      lang="ar"
    >
      <div
        className="h-1 bg-gradient-to-l from-[#1E3A8A] via-[#2563EB] to-[#38BDF8]"
        aria-hidden
      />
      <header className="border-b border-[#F1F5F9] px-4 py-3 sm:px-5">
        <h1 className="text-xl font-bold text-[#0F172A] sm:text-2xl">رفع الموقف الامتحاني</h1>
        {step === "preview" ? (
          <p className="mt-1 text-[12px] font-semibold text-[#2563EB]">معاينة قبل الإرسال — تحقق من البيانات ثم أرسل</p>
        ) : null}
      </header>

      {notice ? (
        <div className="px-4 pt-4 sm:px-5">
          <p
            role="status"
            className={
              notice.kind === "success"
                ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-900"
                : "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-950"
            }
          >
            {notice.text}
          </p>
        </div>
      ) : null}

      {step === "preview" && previewPayload ? (
        <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
          <SituationFormA4Preview payload={previewPayload} />
          <div className="flex flex-col-reverse gap-2 border-t border-[#F1F5F9] pt-4 sm:flex-row sm:justify-between">
            <button
              type="button"
              disabled={isPending}
              onClick={backToEdit}
              className="min-h-[44px] rounded-xl border border-[#CBD5E1] bg-white px-4 text-[14px] font-bold text-[#334155] shadow-sm transition hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              العودة للتعديل
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={sendFinal}
              className="min-h-[44px] rounded-xl bg-[#059669] px-5 text-[14px] font-bold text-white shadow-sm transition hover:bg-[#047857] disabled:opacity-50"
            >
              {isPending ? "جاري الإرسال…" : "إرسال الموقف الامتحاني"}
            </button>
          </div>
        </div>
      ) : (
        <form ref={formRef} id={formId} className="space-y-4 px-4 py-4 sm:px-5 sm:py-5" onSubmit={(e) => e.preventDefault()}>
          <div className="rounded-xl border border-[#BFDBFE] bg-[#F8FAFC] px-3 py-2.5">
            <p className={labelCls}>الكلية</p>
            <p className="text-[15px] font-bold text-[#0F172A]">{collegeLabel}</p>
            <p className="mt-0.5 text-[11px] text-[#64748B]">بيان من حساب التشكيل</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor={`${formId}-dept`}>
                القسم
              </label>
              <input id={`${formId}-dept`} name="department" className={inputCls} autoComplete="off" />
            </div>
            <div>
              <label className={labelCls} htmlFor={`${formId}-day`}>
                اليوم
              </label>
              <select id={`${formId}-day`} name="weekday" className={inputCls}>
                {WEEKDAYS.map((d) => (
                  <option key={d.value || "empty"} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor={`${formId}-date`}>
                التاريخ
              </label>
            <input
              id={`${formId}-date`}
              name="examDate"
              type="date"
              min={minExamDate}
              className={inputLatinNumsCls}
              lang="en"
              dir="ltr"
            />
            </div>
            <div>
              <label className={labelCls} htmlFor={`${formId}-term`}>
                الفصل أو الدور
              </label>
              <select id={`${formId}-term`} name="term" className={inputCls}>
                <option value="">—</option>
                <option value="الأول">الأول</option>
                <option value="الثاني">الثاني</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor={`${formId}-examType`}>
                الامتحان
              </label>
              <select id={`${formId}-examType`} name="examType" className={inputCls}>
                <option value="">—</option>
                <option value="النهائي">النهائي</option>
                <option value="نصف السنة">نصف السنة</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="min-w-0 space-y-1.5 rounded-xl border border-[#E2E8F0] p-3">
              <legend className="px-1 text-[12px] font-bold text-[#475569]">الدراسة</legend>
              <div className="flex flex-wrap gap-3 text-[14px] font-semibold text-[#0F172A]">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="studyCategoryUi"
                    checked={studyCategory === "UNDERGRAD"}
                    onChange={() => setStudyCategory("UNDERGRAD")}
                    className="size-4 accent-[#2563EB]"
                  />
                  أولية
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="studyCategoryUi"
                    checked={studyCategory === "POSTGRAD"}
                    onChange={() => setStudyCategory("POSTGRAD")}
                    className="size-4 accent-[#2563EB]"
                  />
                  عليا
                </label>
              </div>
            </fieldset>
            <div>
              <label className={labelCls} htmlFor={`${formId}-stage`}>
                المرحلة الدراسية
              </label>
              <select id={`${formId}-stage`} key={studyCategory} name="stage" className={inputCls}>
                {stageOptions.map((o) => (
                  <option key={o.value || "x"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor={`${formId}-subject`}>
                المادة الدراسية
              </label>
              <input id={`${formId}-subject`} name="subject" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor={`${formId}-teacher`}>
                اسم التدريسي
              </label>
              <input id={`${formId}-teacher`} name="teacherName" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor={`${formId}-sys`}>
                نظام الدراسة
              </label>
              <select id={`${formId}-sys`} name="studySystem" className={inputCls}>
                <option value="">—</option>
                <option value="سنوي">سنوي</option>
                <option value="فصلي">فصلي</option>
                <option value="مقررات">مقررات</option>
                <option value="بولونيا">بولونيا</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor={`${formId}-shift`}>
                نوع الدراسة
              </label>
              <select id={`${formId}-shift`} name="studyShift" className={inputCls}>
                <option value="">—</option>
                <option value="صباحي">صباحي</option>
                <option value="مسائي">مسائي</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls} htmlFor={`${formId}-rooms`}>
                عدد القاعات الامتحانية
              </label>
              <input
                id={`${formId}-rooms`}
                name="roomCount"
                type="number"
                min={0}
                className={inputLatinNumsCls}
                lang="en"
                dir="ltr"
                defaultValue=""
              />
            </div>
            <div>
              <label className={labelCls} htmlFor={`${formId}-students`}>
                عدد الطلبة
              </label>
              <input
                id={`${formId}-students`}
                name="studentCount"
                type="number"
                min={0}
                className={inputLatinNumsCls}
                lang="en"
                dir="ltr"
                defaultValue=""
              />
            </div>
            <div>
              <label className={labelCls} htmlFor={`${formId}-absentN`}>
                عدد الغياب
              </label>
              <input
                id={`${formId}-absentN`}
                name="absentCount"
                type="number"
                min={0}
                className={inputLatinNumsCls}
                lang="en"
                dir="ltr"
                defaultValue=""
              />
            </div>
          </div>

          <div className="space-y-3">
            <p className={labelCls}>أسماء الغياب</p>
            <p className="-mt-1 text-[12px] leading-snug text-[#64748B]">
              بعد كتابة الاسم يظهر حقل سبب الغياب؛ استخدم الزر أدناه لإضافة طالب آخر.
            </p>
            <div className="space-y-3">
              {absentRows.map((row, index) => (
                <div key={row.id} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <label className={labelCls} htmlFor={`${formId}-absent-name-${row.id}`}>
                        اسم الطالب الغائب
                        {absentRows.length > 1 ? ` (${index + 1})` : ""}
                      </label>
                      <input
                        id={`${formId}-absent-name-${row.id}`}
                        value={row.name}
                        onChange={(e) => updateAbsentRow(row.id, "name", e.target.value)}
                        className={inputCls}
                        placeholder="اكتب الاسم الكامل"
                        autoComplete="off"
                      />
                    </div>
                    {absentRows.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeAbsentRow(row.id)}
                        className="h-10 shrink-0 rounded-lg border border-rose-200 bg-white px-3 text-[13px] font-bold text-rose-700 shadow-sm transition hover:bg-rose-50"
                      >
                        حذف
                      </button>
                    ) : null}
                  </div>
                  {row.name.trim() ? (
                    <div className="mt-3">
                      <label className={labelCls} htmlFor={`${formId}-absent-reason-${row.id}`}>
                        سبب الغياب
                      </label>
                      <textarea
                        id={`${formId}-absent-reason-${row.id}`}
                        value={row.reason}
                        onChange={(e) => updateAbsentRow(row.id, "reason", e.target.value)}
                        className={textareaCls}
                        rows={2}
                        placeholder="اذكر السبب"
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addAbsentRow}
              className="w-full rounded-xl border border-dashed border-[#93C5FD] bg-[#EFF6FF] px-3 py-2.5 text-[13px] font-bold text-[#1D4ED8] transition hover:bg-[#DBEAFE] sm:w-auto"
            >
              + إضافة طالب غائب
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor={`${formId}-invN`}>
                عدد المراقبين
              </label>
              <input
                id={`${formId}-invN`}
                name="invigilatorCount"
                type="number"
                min={0}
                className={inputLatinNumsCls}
                lang="en"
                dir="ltr"
                defaultValue=""
              />
            </div>
          </div>

          <div className="space-y-3">
            <p className={labelCls}>أسماء المراقبين</p>
            <p className="-mt-1 text-[12px] leading-snug text-[#64748B]">
              أدخل اسم كل مراقب، ثم استخدم «إضافة مراقب» لإضافة آخر. ملاحظات موحّدة في الحقل أسفل الزر.
            </p>
            <div className="space-y-3">
              {invigilatorRows.map((row, index) => (
                <div key={row.id} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <label className={labelCls} htmlFor={`${formId}-inv-name-${row.id}`}>
                        اسم المراقب
                        {invigilatorRows.length > 1 ? ` (${index + 1})` : ""}
                      </label>
                      <input
                        id={`${formId}-inv-name-${row.id}`}
                        value={row.name}
                        onChange={(e) => updateInvigilatorName(row.id, e.target.value)}
                        className={inputCls}
                        placeholder="اكتب الاسم الكامل"
                        autoComplete="off"
                      />
                    </div>
                    {invigilatorRows.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeInvigilatorRow(row.id)}
                        className="h-10 shrink-0 rounded-lg border border-rose-200 bg-white px-3 text-[13px] font-bold text-rose-700 shadow-sm transition hover:bg-rose-50"
                      >
                        حذف
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addInvigilatorRow}
              className="w-full rounded-xl border border-dashed border-[#86EFAC] bg-emerald-50/80 px-3 py-2.5 text-[13px] font-bold text-emerald-800 transition hover:bg-emerald-100/80 sm:w-auto"
            >
              + إضافة مراقب
            </button>
            <div>
              <label className={labelCls} htmlFor={`${formId}-inv-note`}>
                ملاحظات المراقب / السبب
              </label>
              <textarea
                id={`${formId}-inv-note`}
                name="invigilatorNote"
                value={invigilatorNote}
                onChange={(e) => setInvigilatorNote(e.target.value)}
                className={textareaCls}
                rows={3}
                placeholder="ملاحظات أو سبب موحّد لجميع المراقبين إن وُجد"
              />
            </div>
          </div>

          <aside
            className="rounded-xl border border-amber-200/90 bg-amber-50/80 px-3 py-2.5 text-[13px] leading-relaxed text-amber-950"
            aria-label="مواعيد رفع الموقف"
          >
            <p className="font-bold text-amber-900">رفع الموقف</p>
            <ul className="mt-1 list-disc pr-4 marker:text-amber-700">
              <li>الساعة العاشرة صباحًا للوجبة الأولى</li>
              <li>الساعة الواحدة ظهرًا للوجبة الثانية</li>
            </ul>
          </aside>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#F1F5F9] pt-4">
            <button
              type="button"
              onClick={goToPreview}
              className="min-h-[44px] min-w-[160px] rounded-xl bg-[#1E40AF] px-4 text-[14px] font-bold text-white shadow-sm transition hover:bg-[#1E3A8A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
            >
              تأكيد وإرسال
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
