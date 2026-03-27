"use client";

import { useActionState, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CollegeRoomScheduleHint } from "@/lib/college-exam-schedules";
import type { CollegeStudySubjectRow } from "@/lib/college-study-subjects";
import type { CollegeExamRoomRow } from "@/lib/college-rooms";
import { getCollegeStageLevelOptions } from "@/lib/college-stage-level";
import {
  createCollegeExamRoomAction,
  deleteCollegeExamRoomAction,
  updateCollegeExamRoomAction,
} from "./actions";
import { RoomReportModal } from "./room-report-modal";

/** نفس فواصل التخزيم في lib/college-rooms (مراقبون / أسماء غياب) */
function splitNameList(raw: string): string[] {
  return raw
    .split(/[,،;|\n\r]+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function StackedNamesCell({ value }: { value: string }) {
  const items = splitNameList(value);
  if (items.length === 0) {
    return <span className="text-[#94A3B8]">—</span>;
  }
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-1.5">
      {items.map((name, i) => (
        <span key={`${i}-${name.slice(0, 48)}`} className="block text-sm leading-snug text-[#334155]">
          <span className="ms-1 inline-block font-semibold tabular-nums text-[#64748B]">{i + 1}.</span> {name}
        </span>
      ))}
    </div>
  );
}

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#172554] disabled:opacity-60"
    >
      {pending ? "جاري الحفظ..." : label}
    </button>
  );
}

function shiftCapacityLabel(row: CollegeExamRoomRow, slot: 1 | 2) {
  if (slot === 1) {
    return `${row.capacity_total} (ص ${row.capacity_morning} + م ${row.capacity_evening})`;
  }
  if (!row.study_subject_id_2) return "—";
  return `${row.capacity_total_2} (ص ${row.capacity_morning_2} + م ${row.capacity_evening_2})`;
}

const inputNumberClass =
  "h-11 w-full appearance-none rounded-xl border border-[#E2E8F0] bg-white px-3 outline-none [appearance:textfield] focus:border-blue-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function RoomFields({
  subjects,
  stageOptions,
  defaults,
  showSerial = true,
  disableAttendanceFields = false,
}: {
  subjects: CollegeStudySubjectRow[];
  stageOptions: number[];
  defaults?: Partial<CollegeExamRoomRow>;
  showSerial?: boolean;
  disableAttendanceFields?: boolean;
}) {
  const d = defaults ?? {};
  const defaultStage1 = String(d.stage_level ?? stageOptions[0] ?? 1);
  const defaultStage2 = String(d.stage_level_2 ?? stageOptions[0] ?? 1);
  const invigilatorsFieldId = useId();
  const [dualExam, setDualExam] = useState(() => Boolean(d.study_subject_id_2));

  const id2 = d.study_subject_id_2 ?? "";

  return (
    <>
      {showSerial ? (
        <div className="max-w-[12rem]">
          <label className="mb-1 block text-sm font-semibold text-[#334155]">التسلسل</label>
          <input
            name="serial_no"
            type="number"
            min={0}
            required
            defaultValue={d.serial_no ?? 1}
            className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)_minmax(0,1.45fr)]">
        <div className="min-w-0">
          <label className="mb-1 block text-sm font-semibold text-[#334155]">اسم القاعة</label>
          <input
            name="room_name"
            required
            minLength={2}
            defaultValue={d.room_name ?? ""}
            className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
          />
        </div>
        <div className="min-w-0">
          <label className="mb-1 block text-sm font-semibold text-[#334155]">مشرف القاعة</label>
          <input
            name="supervisor_name"
            required
            minLength={2}
            defaultValue={d.supervisor_name ?? ""}
            className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={invigilatorsFieldId} className="mb-1 block text-sm text-[#334155]">
            <span className="font-semibold">المراقبون</span>
            <span className="ms-2 text-xs font-normal text-[#64748B]">
              بحد أقصى 4 أسماء، افصل بينها بفاصلة (، أو ,).
            </span>
          </label>
          <input
            id={invigilatorsFieldId}
            name="invigilators"
            placeholder="مثال: أحمد علي، محمد حسن، ..."
            defaultValue={d.invigilators ?? ""}
            className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
        <p className="text-sm font-bold text-[#0F172A]">نوع استخدام القاعة</p>
        <p className="mt-1 text-xs leading-5 text-[#64748B]">حدّد إن كانت القاعة لامتحان واحد أو لمادتين امتحانيتين في الوقت نفسه.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDualExam(false)}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
              !dualExam
                ? "border-[#1E3A8A] bg-[#EFF6FF] text-[#1E3A8A]"
                : "border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC]"
            }`}
          >
            امتحان واحد
          </button>
          <button
            type="button"
            onClick={() => setDualExam(true)}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
              dualExam
                ? "border-[#1E3A8A] bg-[#EFF6FF] text-[#1E3A8A]"
                : "border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC]"
            }`}
          >
            امتحانان (مادتان)
          </button>
        </div>
      </div>

      {!dualExam ? (
        <>
          <input type="hidden" name="study_subject_id_2" value="" />
          <input type="hidden" name="stage_level_2" value="" />
          <input type="hidden" name="capacity_morning_2" value="0" />
          <input type="hidden" name="capacity_evening_2" value="0" />
        </>
      ) : null}

      <div className="space-y-4 rounded-xl border border-[#CBD5E1] bg-white px-4 py-4 shadow-sm">
        <p className="text-base font-extrabold text-[#0F172A]">الامتحان الأول</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_minmax(0,11rem)]">
          <div className="min-w-0">
            <label className="mb-1 block text-sm font-semibold text-[#334155]">المادة الامتحانية</label>
            <select
              name="study_subject_id"
              required
              defaultValue={d.study_subject_id ?? ""}
              className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
            >
              <option value="" disabled>
                اختر المادة الدراسية
              </option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.subject_name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-sm font-semibold text-[#334155]">المرحلة الدراسية</label>
            <select
              name="stage_level"
              required
              defaultValue={defaultStage1}
              className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
            >
              {stageOptions.map((s) => (
                <option key={s} value={String(s)}>
                  المرحلة {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]/90 px-3 py-3">
          <p className="mb-2 text-sm font-bold text-[#334155]">عدد الطلبة المسموح بهم</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold leading-snug text-[#64748B]">
                <span className="block text-sm text-[#334155]">الدوام الصباحي</span>
                عدد الطلبة المسموح بهم (صباحي)
              </label>
              <input
                name="capacity_morning"
                type="number"
                min={0}
                required
                defaultValue={d.capacity_morning ?? d.capacity_total ?? 0}
                className={inputNumberClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold leading-snug text-[#64748B]">
                <span className="block text-sm text-[#334155]">الدوام المسائي</span>
                عدد الطلبة المسموح بهم (مسائي)
              </label>
              <input
                name="capacity_evening"
                type="number"
                min={0}
                required
                defaultValue={d.capacity_evening ?? 0}
                className={inputNumberClass}
              />
            </div>
          </div>

          {!disableAttendanceFields ? (
            <>
              <p className="mb-2 mt-4 text-sm font-bold text-[#334155]">الدوام الصباحي — الحضور والغياب</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#64748B]">الحضور</label>
                  <input
                    name="s1_att_m"
                    type="number"
                    min={0}
                    required
                    defaultValue={d.attendance_count ?? 0}
                    className={inputNumberClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#64748B]">الغياب</label>
                  <input
                    name="s1_abs_m"
                    type="number"
                    min={0}
                    required
                    defaultValue={d.absence_count ?? 0}
                    className={inputNumberClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#64748B]">أسماء الغياب</label>
                  <textarea
                    name="s1_names_m"
                    rows={2}
                    defaultValue={d.absence_names ?? ""}
                    className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <p className="mb-2 mt-4 text-sm font-bold text-[#92400E]">الدوام المسائي — الحضور والغياب</p>
              <div className="rounded-lg border border-[#FDE68A]/90 bg-[#FFFBEB]/80 px-2 py-2 sm:px-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#92400E]">الحضور</label>
                    <input
                      name="s1_att_e"
                      type="number"
                      min={0}
                      required
                      defaultValue={0}
                      className={inputNumberClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#92400E]">الغياب</label>
                    <input
                      name="s1_abs_e"
                      type="number"
                      min={0}
                      required
                      defaultValue={0}
                      className={inputNumberClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#92400E]">أسماء الغياب</label>
                    <textarea
                      name="s1_names_e"
                      rows={2}
                      defaultValue=""
                      className="w-full rounded-xl border border-[#FDE68A] bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {dualExam ? (
        <div className="space-y-4 rounded-xl border border-dashed border-[#93C5FD] bg-[#EFF6FF]/40 px-4 py-4">
          <p className="text-base font-extrabold text-[#1E3A8A]">الامتحان الثاني</p>
          <p className="text-xs leading-5 text-[#475569]">
            نفس <strong>مشرف القاعة</strong> و<strong>المراقبون</strong>؛ أدخل المادة الثانية والسعات وحضور كل دوام كما في الامتحان الأول.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_minmax(0,11rem)]">
            <div className="min-w-0">
              <label className="mb-1 block text-sm font-semibold text-[#334155]">المادة الامتحانية الثانية</label>
              <select
                name="study_subject_id_2"
                required
                defaultValue={id2}
                className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 outline-none focus:border-blue-500"
              >
                <option value="" disabled>
                  اختر المادة الثانية
                </option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.subject_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-sm font-semibold text-[#334155]">المرحلة الدراسية</label>
              <select
                name="stage_level_2"
                required
                defaultValue={defaultStage2}
                className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 outline-none focus:border-blue-500"
              >
                {stageOptions.map((s) => (
                  <option key={s} value={String(s)}>
                    المرحلة {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-[#BFDBFE] bg-white px-3 py-3">
            <p className="mb-2 text-sm font-bold text-[#334155]">عدد الطلبة المسموح بهم</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold leading-snug text-[#64748B]">
                  <span className="block text-sm text-[#334155]">الدوام الصباحي</span>
                  عدد الطلبة المسموح بهم (صباحي)
                </label>
                <input
                  name="capacity_morning_2"
                  type="number"
                  min={0}
                  required
                  defaultValue={d.capacity_morning_2 ?? 0}
                  className={inputNumberClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold leading-snug text-[#64748B]">
                  <span className="block text-sm text-[#334155]">الدوام المسائي</span>
                  عدد الطلبة المسموح بهم (مسائي)
                </label>
                <input
                  name="capacity_evening_2"
                  type="number"
                  min={0}
                  required
                  defaultValue={d.capacity_evening_2 ?? 0}
                  className={inputNumberClass}
                />
              </div>
            </div>

            {!disableAttendanceFields ? (
              <>
                <p className="mb-2 mt-4 text-sm font-bold text-[#334155]">الدوام الصباحي — الحضور والغياب</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#64748B]">الحضور</label>
                    <input
                      name="s2_att_m"
                      type="number"
                      min={0}
                      required
                      defaultValue={d.attendance_count_2 ?? 0}
                      className={inputNumberClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#64748B]">الغياب</label>
                    <input
                      name="s2_abs_m"
                      type="number"
                      min={0}
                      required
                      defaultValue={d.absence_count_2 ?? 0}
                      className={inputNumberClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#64748B]">أسماء الغياب</label>
                    <textarea
                      name="s2_names_m"
                      rows={2}
                      defaultValue={d.absence_names_2 ?? ""}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <p className="mb-2 mt-4 text-sm font-bold text-[#92400E]">الدوام المسائي — الحضور والغياب</p>
                <div className="rounded-lg border border-[#FDE68A]/90 bg-[#FFFBEB]/80 px-2 py-2 sm:px-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#92400E]">الحضور</label>
                      <input
                        name="s2_att_e"
                        type="number"
                        min={0}
                        required
                        defaultValue={0}
                        className={inputNumberClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#92400E]">الغياب</label>
                      <input
                        name="s2_abs_e"
                        type="number"
                        min={0}
                        required
                        defaultValue={0}
                        className={inputNumberClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#92400E]">أسماء الغياب</label>
                      <textarea
                        name="s2_names_e"
                        rows={2}
                        defaultValue=""
                        className="w-full rounded-xl border border-[#FDE68A] bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {disableAttendanceFields ? (
        <>
          <input type="hidden" name="attendance_count" value="0" />
          <input type="hidden" name="absence_count" value="0" />
          <input type="hidden" name="absence_names" value="" />
          <input type="hidden" name="attendance_count_2" value="0" />
          <input type="hidden" name="absence_count_2" value="0" />
          <input type="hidden" name="absence_names_2" value="" />
        </>
      ) : null}
    </>
  );
}

function AddRoomDialog({
  open,
  onClose,
  subjects,
  stageOptions,
}: {
  open: boolean;
  onClose: () => void;
  subjects: CollegeStudySubjectRow[];
  stageOptions: number[];
}) {
  const [state, formAction, pending] = useActionState(createCollegeExamRoomAction, null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dialogRef.current) return;
    if (open && !dialogRef.current.open) dialogRef.current.showModal();
    if (!open && dialogRef.current.open) dialogRef.current.close();
  }, [open]);
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);
  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-[100] m-auto box-border h-fit max-h-[min(90vh,100dvh)] w-[min(96vw,1180px)] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl border border-[#E2E8F0] bg-white p-0 shadow-xl"
      dir="rtl"
    >
      <form action={formAction} className="w-full space-y-4 p-6">
        <h2 className="text-xl font-bold text-[#0F172A]">إضافة قاعة جديدة</h2>
        <RoomFields subjects={subjects} stageOptions={stageOptions} showSerial={false} disableAttendanceFields />
        {state && !state.ok ? <p className="text-sm font-semibold text-red-600">{state.message}</p> : null}
        <div className="flex items-center justify-end gap-3">
          <button type="button" className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm text-[#64748B]" onClick={onClose}>
            إلغاء
          </button>
          <SubmitButton pending={pending} label="حفظ القاعة" />
        </div>
      </form>
    </dialog>
  );
}

function EditRoomDialog({
  open,
  onClose,
  subjects,
  stageOptions,
  row,
}: {
  open: boolean;
  onClose: () => void;
  subjects: CollegeStudySubjectRow[];
  stageOptions: number[];
  row: CollegeExamRoomRow | null;
}) {
  const [state, formAction, pending] = useActionState(updateCollegeExamRoomAction, null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const key = useMemo(() => `${row?.id ?? "none"}-${open ? "open" : "closed"}`, [row?.id, open]);
  useEffect(() => {
    if (!dialogRef.current) return;
    if (open && !dialogRef.current.open) dialogRef.current.showModal();
    if (!open && dialogRef.current.open) dialogRef.current.close();
  }, [open]);
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);
  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-[100] m-auto box-border h-fit max-h-[min(90vh,100dvh)] w-[min(96vw,1180px)] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl border border-[#E2E8F0] bg-white p-0 shadow-xl"
      dir="rtl"
    >
      <form key={key} action={formAction} className="w-full space-y-4 p-6">
        <h2 className="text-xl font-bold text-[#0F172A]">تعديل القاعة</h2>
        <input type="hidden" name="id" value={row?.id ?? ""} />
        <input type="hidden" name="serial_no" value={row?.serial_no ?? ""} />
        <RoomFields subjects={subjects} stageOptions={stageOptions} defaults={row ?? undefined} showSerial={false} />
        {state && !state.ok ? <p className="text-sm font-semibold text-red-600">{state.message}</p> : null}
        <div className="flex items-center justify-end gap-3">
          <button type="button" className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm text-[#64748B]" onClick={onClose}>
            إلغاء
          </button>
          <SubmitButton pending={pending} label="حفظ التعديلات" />
        </div>
      </form>
    </dialog>
  );
}

function DeleteRoomForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(deleteCollegeExamRoomAction, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="block w-full rounded-lg px-3 py-2 text-right text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-60"
      >
        حذف
      </button>
      {state && !state.ok ? <p className="mt-1 px-3 text-xs text-red-600">{state.message}</p> : null}
    </form>
  );
}

function SubjectsCell({ row }: { row: CollegeExamRoomRow }) {
  const dual = Boolean(row.study_subject_id_2);
  return (
    <div className="min-w-[10rem] space-y-1 text-sm text-[#334155]">
      <div className="font-medium text-[#0F172A]">{row.study_subject_name}</div>
      <div className="text-xs text-[#64748B]">مرحلة {row.stage_level ?? 1}</div>
      {dual && row.study_subject_name_2 ? (
        <div className="border-t border-[#E2E8F0] pt-1 text-[#475569]">
          <span>+ {row.study_subject_name_2}</span>
          {row.stage_level_2 != null ? (
            <span className="mt-0.5 block text-xs text-[#64748B]">مرحلة {row.stage_level_2}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RowDetailHint({ row, hints }: { row: CollegeExamRoomRow; hints: CollegeRoomScheduleHint[] }) {
  const dual = Boolean(row.study_subject_id_2);

  return (
    <div className="space-y-3 text-sm leading-6 text-[#334155]">
      <p>
        <span className="font-bold text-[#0F172A]">{row.room_name}</span>
        {dual ? (
          <span className="ms-2 rounded-full bg-[#DBEAFE] px-2 py-0.5 text-xs font-semibold text-[#1D4ED8]">قاعة بامتحانين</span>
        ) : null}
      </p>
      <ul className="list-disc space-y-1 pe-4">
        <li>
          الامتحان 1: <strong>{row.study_subject_name}</strong> — مرحلة {row.stage_level ?? 1} — سعة{" "}
          {shiftCapacityLabel(row, 1)}
          {row.supervisor_name ? ` — مشرف: ${row.supervisor_name}` : null}
        </li>
        {dual && row.study_subject_name_2 ? (
          <li>
            الامتحان 2: <strong>{row.study_subject_name_2}</strong>
            {row.stage_level_2 != null ? <> — مرحلة {row.stage_level_2}</> : null} — سعة {shiftCapacityLabel(row, 2)}
            {row.supervisor_name ? ` — مشرف: ${row.supervisor_name}` : null}
          </li>
        ) : null}
      </ul>
      {hints.length > 0 ? (
        <div>
          <p className="mb-1 font-semibold text-[#0F172A]">مواعيد مرتبطة بالجدول (حسب ما أُدخل في «الجداول الامتحانية»):</p>
          <ul className="space-y-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
            {hints.map((h, i) => (
              <li key={`${h.exam_date}-${h.start_time}-${i}`} className="text-xs sm:text-sm">
                {h.exam_date} — {h.start_time}–{h.end_time} — <strong>{h.study_subject_name}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-[#64748B]">لا توجد جداول امتحانية مربوطة بهذه القاعة بعد. بعد تعريف المواد، أنشئ الجدولين بنفس القاعة والتاريخ والوقت ليظهران هنا.</p>
      )}
    </div>
  );
}

export function RoomsManagementPanel({
  rows,
  studySubjects,
  scheduleHintsByRoom,
  collegeLabel,
}: {
  rows: CollegeExamRoomRow[];
  studySubjects: CollegeStudySubjectRow[];
  scheduleHintsByRoom: Record<string, CollegeRoomScheduleHint[]>;
  collegeLabel: string;
}) {
  const stageOptions = useMemo(() => getCollegeStageLevelOptions(collegeLabel), [collegeLabel]);
  const [addOpen, setAddOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuCoords, setMenuCoords] = useState<{ top: number; left: number } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const [editingRow, setEditingRow] = useState<CollegeExamRoomRow | null>(null);
  /** تفاصيل القاعة مثبتة أسفل الشاشة حتى يغلقها المستخدم */
  const [pinnedDetailRowId, setPinnedDetailRowId] = useState<string | null>(null);
  const [reportRow, setReportRow] = useState<CollegeExamRoomRow | null>(null);

  const stats = useMemo(() => {
    const totalRooms = rows.length;
    /** مواد امتحانية فعلية: معرفات فريدة مستخدمة في قاعات (الأولى أو الثانية)، لا إجمالي قائمة المواد في النظام. */
    const linkedSubjectIds = new Set<string>();
    for (const r of rows) {
      linkedSubjectIds.add(r.study_subject_id);
      if (r.study_subject_id_2) linkedSubjectIds.add(r.study_subject_id_2);
    }
    const distinctExamSubjectsInRooms = linkedSubjectIds.size;
    const totalAttendanceSeats = rows.reduce((a, r) => a + r.attendance_count + r.attendance_count_2, 0);
    const totalAbsenceSeats = rows.reduce((a, r) => a + r.absence_count + r.absence_count_2, 0);
    const singleExamRooms = rows.filter((r) => !r.study_subject_id_2).length;
    const doubleExamRooms = rows.filter((r) => Boolean(r.study_subject_id_2)).length;
    const totalCapacityFromShifts = rows.reduce((a, r) => {
      const slot1 = r.capacity_morning + r.capacity_evening;
      const slot2 = r.study_subject_id_2 ? r.capacity_morning_2 + r.capacity_evening_2 : 0;
      return a + slot1 + slot2;
    }, 0);
    return {
      totalRooms,
      distinctExamSubjectsInRooms,
      totalAttendanceSeats,
      totalAbsenceSeats,
      singleExamRooms,
      doubleExamRooms,
      totalCapacityFromShifts,
    };
  }, [rows]);

  const pinnedDetailRow = pinnedDetailRowId ? rows.find((r) => r.id === pinnedDetailRowId) : null;
  const menuRow = menuId ? rows.find((r) => r.id === menuId) : undefined;

  const closeActionsMenu = useCallback(() => {
    setMenuId(null);
    setMenuCoords(null);
  }, []);

  const refreshMenuPosition = useCallback(() => {
    const btn = menuButtonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuMinW = 192;
    const pad = 8;
    let left = rect.left;
    if (left + menuMinW > window.innerWidth - pad) left = window.innerWidth - menuMinW - pad;
    if (left < pad) left = pad;
    setMenuCoords({ top: rect.bottom + 6, left });
  }, []);

  useLayoutEffect(() => {
    if (!menuId) {
      setMenuCoords(null);
      return;
    }
    refreshMenuPosition();
    window.addEventListener("resize", refreshMenuPosition);
    window.addEventListener("scroll", refreshMenuPosition, true);
    return () => {
      window.removeEventListener("resize", refreshMenuPosition);
      window.removeEventListener("scroll", refreshMenuPosition, true);
    };
  }, [menuId, refreshMenuPosition]);

  useEffect(() => {
    if (!menuId) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuPanelRef.current?.contains(t)) return;
      if (menuButtonRef.current?.contains(t)) return;
      closeActionsMenu();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [menuId, closeActionsMenu]);

  return (
    <section className={`relative space-y-6 ${pinnedDetailRowId ? "pb-[min(13.5rem,24vh)]" : ""}`} dir="rtl">
      <header className="relative overflow-hidden rounded-[22px] border border-[#E8EEF7] bg-white px-6 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
          style={{ background: "linear-gradient(90deg, #1E3A8A 0%, #2563EB 55%, #38BDF8 100%)" }}
          aria-hidden
        />
        <h1 className="text-3xl font-extrabold text-[#0F172A]">إدارة القاعات</h1>
        <p className="mt-1.5 text-sm leading-6 text-[#64748B]">
          تعريف القاعات وربطها بمادة أو مادتين امتحانيتين في النافذة الزمنية نفسها، مع توزيع الطلبة صباحي/مسائي لكل امتحان.
        </p>
      </header>

      <div className="overflow-visible rounded-3xl border border-[#E2E8F0] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#172554]"
          >
            إضافة قاعة
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-[#E2E8F0] bg-white px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs text-[#64748B]">عدد القاعات الكلية</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.totalRooms}</p>
          </div>
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs font-semibold text-[#64748B]">عدد المواد الامتحانية</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.distinctExamSubjectsInRooms}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-[#64748B]">مادة مميزة مربوطة بقاعة (بدون تكرار بين القاعات)</p>
          </div>
          <div className="rounded-2xl border border-[#DCFCE7] bg-[#F0FDF4] px-4 py-3">
            <p className="text-xs font-semibold text-[#166534]">عدد الامتحانات المنفردة</p>
            <p className="mt-1 text-2xl font-extrabold text-[#15803D]">{stats.singleExamRooms}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-[#15803D]/85">قاعات بمادة امتحانية واحدة</p>
          </div>
          <div className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3">
            <p className="text-xs font-semibold text-[#92400E]">عدد الامتحانات المزدوجة</p>
            <p className="mt-1 text-2xl font-extrabold text-[#B45309]">{stats.doubleExamRooms}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-[#B45309]/85">قاعات بمادتين في الوقت نفسه</p>
          </div>
          <div className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 sm:col-span-2 lg:col-span-2">
            <p className="text-xs font-semibold text-[#1E40AF]">عدد المقاعد الامتحانية الكلي</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1D4ED8]">{stats.totalCapacityFromShifts}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-[#1E40AF]/85">مجموع أعمدة السعة الصباحي والمسائي لجميع القاعات والامتحانين إن وُجدا</p>
          </div>
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs text-[#64748B]">عدد المقاعد الامتحانية (حضور)</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.totalAttendanceSeats}</p>
          </div>
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs text-[#64748B]">عدد المقاعد الغياب</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.totalAbsenceSeats}</p>
          </div>
        </div>

        <p className="border-b border-[#E2E8F0] bg-[#FFFBEB] px-5 py-2 text-sm text-[#92400E]">
          <strong>تلميح:</strong> اضغط على صف في الجدول لعرض التفاصيل في الشريط السفلي الثابت؛ يمكن إغلاقها بالزر «إغلاق التفاصيل».
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] table-fixed border-collapse text-right">
            <colgroup>
              <col className="w-[3.25rem]" />
              <col className="w-[9.5rem]" />
              <col className="w-[8.5rem]" />
              <col className="w-[12rem]" />
              <col />
              <col className="w-[4.5rem]" />
              <col className="w-[11.5rem]" />
              <col className="w-[5.25rem]" />
              <col className="w-[5.25rem]" />
              <col className="w-[13rem]" />
              <col className="w-[3.25rem]" />
            </colgroup>
            <thead className="bg-[#F1F5F9]">
              <tr className="border-b border-[#E2E8F0]">
                <th
                  scope="col"
                  className="border-b border-[#E2E8F0] px-3 py-3 text-sm font-bold tabular-nums text-[#334155]"
                  title="رقم التسلسل"
                >
                  تسلسل
                </th>
                <th scope="col" className="border-b border-[#E2E8F0] px-3 py-3 text-sm font-bold text-[#334155]">
                  اسم القاعة
                </th>
                <th scope="col" className="border-b border-[#E2E8F0] px-3 py-3 text-sm font-bold text-[#334155]">
                  مشرف القاعة
                </th>
                <th scope="col" className="border-b border-[#E2E8F0] px-3 py-3 text-sm font-bold text-[#334155]">
                  المراقبون
                </th>
                <th scope="col" className="border-b border-[#E2E8F0] px-3 py-3 text-sm font-bold text-[#334155]">
                  المادة والمرحلة
                </th>
                <th scope="col" className="border-b border-[#E2E8F0] px-3 py-3 text-sm font-bold text-[#334155]">
                  الوضع
                </th>
                <th
                  scope="col"
                  className="border-b border-[#E2E8F0] px-3 py-3 text-sm font-bold leading-snug text-[#334155]"
                  title="إجمالي السعة مع تفصيل صباحي + مسائي لكل امتحان"
                >
                  السعة
                  <span className="mt-0.5 block text-xs font-semibold text-[#64748B]">صباحي / مسائي</span>
                </th>
                <th
                  scope="col"
                  className="border-b border-[#E2E8F0] px-3 py-3 text-sm font-bold tabular-nums text-[#334155]"
                  title="حضور الامتحان الأول / الثاني في القاعة المزدوجة"
                >
                  الحضور
                </th>
                <th
                  scope="col"
                  className="border-b border-[#E2E8F0] px-3 py-3 text-sm font-bold tabular-nums text-[#334155]"
                  title="غياب الامتحان الأول / الثاني في القاعة المزدوجة"
                >
                  الغياب
                </th>
                <th scope="col" className="border-b border-[#E2E8F0] px-3 py-3 text-sm font-bold text-[#334155]">
                  أسماء الغياب
                </th>
                <th scope="col" className="border-b border-[#E2E8F0] px-3 py-3 text-sm font-bold text-[#334155]">
                  <span className="sr-only">إجراءات</span>
                  <span aria-hidden className="block text-center">
                    ⋮
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] bg-white">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-[#64748B]" colSpan={11}>
                    لا توجد قاعات امتحانية بعد.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    className={`cursor-pointer transition-colors hover:bg-[#F8FAFC] ${pinnedDetailRowId === row.id ? "bg-[#EFF6FF]" : ""}`}
                    onClick={() => {
                      closeActionsMenu();
                      setPinnedDetailRowId(row.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        closeActionsMenu();
                        setPinnedDetailRowId(row.id);
                      }
                    }}
                  >
                    <td className="border-b border-[#E2E8F0] px-3 py-3 align-middle text-sm tabular-nums text-[#334155]">{row.serial_no}</td>
                    <td className="border-b border-[#E2E8F0] px-3 py-3 align-middle text-sm font-semibold text-[#0F172A]">{row.room_name}</td>
                    <td className="border-b border-[#E2E8F0] px-3 py-3 align-middle text-sm text-[#334155]">{row.supervisor_name}</td>
                    <td className="border-b border-[#E2E8F0] px-3 py-3 align-top text-[#334155]">
                      <StackedNamesCell value={row.invigilators} />
                    </td>
                    <td className="border-b border-[#E2E8F0] px-3 py-3 align-top">
                      <SubjectsCell row={row} />
                    </td>
                    <td className="border-b border-[#E2E8F0] px-3 py-3 align-middle text-center">
                      {row.study_subject_id_2 ? (
                        <span className="inline-flex rounded-lg bg-[#FEF3C7] px-2 py-1 text-xs font-bold text-[#B45309]">امتحانان</span>
                      ) : (
                        <span className="text-xs text-[#64748B]">واحد</span>
                      )}
                    </td>
                    <td className="border-b border-[#E2E8F0] px-3 py-3 align-top text-xs tabular-nums text-[#334155] sm:text-sm">
                      <div className="leading-snug">
                        <span className="font-semibold text-[#64748B]">١:</span> {shiftCapacityLabel(row, 1)}
                      </div>
                      {row.study_subject_id_2 ? (
                        <div className="mt-1 leading-snug text-[#475569]">
                          <span className="font-semibold text-[#64748B]">٢:</span> {shiftCapacityLabel(row, 2)}
                        </div>
                      ) : null}
                    </td>
                    <td className="border-b border-[#E2E8F0] px-3 py-3 align-middle text-center text-sm tabular-nums text-emerald-800">
                      {row.attendance_count}
                      {row.study_subject_id_2 ? (
                        <>
                          <span className="text-[#94A3B8]"> / </span>
                          {row.attendance_count_2}
                        </>
                      ) : null}
                    </td>
                    <td className="border-b border-[#E2E8F0] px-3 py-3 align-middle text-center text-sm tabular-nums text-red-800">
                      {row.absence_count}
                      {row.study_subject_id_2 ? (
                        <>
                          <span className="text-[#94A3B8]"> / </span>
                          {row.absence_count_2}
                        </>
                      ) : null}
                    </td>
                    <td
                      className="border-b border-[#E2E8F0] px-3 py-3 align-top text-[#334155]"
                      title={row.absence_names || undefined}
                    >
                      <StackedNamesCell value={row.absence_names} />
                      {row.study_subject_id_2 && row.absence_names_2 ? (
                        <div className="mt-2 border-t border-[#E2E8F0] pt-2">
                          <span className="text-xs font-semibold text-[#64748B]">امتحان ثانٍ:</span>
                          <StackedNamesCell value={row.absence_names_2} />
                        </div>
                      ) : null}
                    </td>
                    <td className="border-b border-[#E2E8F0] px-2 py-3 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-label="إجراءات"
                        aria-expanded={menuId === row.id}
                        className="rounded-lg p-2 text-[#64748B] transition hover:bg-[#F1F5F9]"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (menuId === row.id) {
                            closeActionsMenu();
                            return;
                          }
                          menuButtonRef.current = e.currentTarget;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const menuMinW = 192;
                          const pad = 8;
                          let left = rect.left;
                          if (left + menuMinW > window.innerWidth - pad) left = window.innerWidth - menuMinW - pad;
                          if (left < pad) left = pad;
                          setMenuCoords({ top: rect.bottom + 6, left });
                          setMenuId(row.id);
                        }}
                      >
                        <svg className="size-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <circle cx="12" cy="5" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="12" cy="19" r="2" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      </div>

      {pinnedDetailRow ? (
        <div
          className="fixed inset-x-0 bottom-0 z-[90] max-h-[min(22vh,13rem)] overflow-x-visible overflow-y-hidden border-t border-[#CBD5E1] bg-[#F8FAFC] shadow-[0_-12px_40px_rgba(15,23,42,0.12)]"
          dir="rtl"
        >
          <div className="flex max-h-[min(22vh,13rem)] w-full flex-row items-stretch overflow-x-visible overflow-y-hidden">
            {/* في rtl أولاً = اليمين؛ الصورة بارتفاع الشريط فقط وعرض طبيعي دون صندوق عرض ثابت */}
            <div className="flex shrink-0 items-stretch bg-[#F8FAFC]">
              {/* eslint-disable-next-line @next/next/no-img-element -- عرض تلقائي h-full/w-auto لا يناسب fill من next/image */}
              <img
                src="/examphoto.jpeg"
                alt="قاعة امتحانية"
                decoding="async"
                className="h-full max-h-[min(22vh,13rem)] w-auto max-w-none object-contain object-[58%_center] -translate-x-2 select-none sm:-translate-x-3"
              />
            </div>
            <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden border-s border-[#E2E8F0] bg-[#F8FAFC]">
              <div className="mx-auto w-full max-w-5xl px-4 py-3 sm:px-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="mb-2 text-xs font-bold text-[#64748B]">تفاصيل القاعة المختارة</p>
                    <RowDetailHint row={pinnedDetailRow} hints={scheduleHintsByRoom[pinnedDetailRow.id] ?? []} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPinnedDetailRowId(null)}
                    className="shrink-0 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#334155] transition hover:bg-[#F1F5F9]"
                  >
                    إغلاق التفاصيل
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {menuRow && menuCoords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuPanelRef}
              className="fixed z-[110] min-w-[12rem] rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-lg"
              style={{ top: menuCoords.top, left: menuCoords.left }}
              dir="rtl"
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                className="block w-full rounded-lg px-3 py-2 text-right text-sm text-[#0F172A] transition hover:bg-[#F8FAFC]"
                onClick={() => {
                  setEditingRow(menuRow);
                  closeActionsMenu();
                }}
              >
                تعديل
              </button>
              <button
                type="button"
                role="menuitem"
                className="block w-full rounded-lg px-3 py-2 text-right text-sm text-[#1E3A8A] transition hover:bg-[#EFF6FF]"
                onClick={() => {
                  setReportRow(menuRow);
                  closeActionsMenu();
                }}
              >
                تقرير قاعة
              </button>
              <DeleteRoomForm id={menuRow.id} />
            </div>,
            document.body,
          )
        : null}

      <AddRoomDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        subjects={studySubjects}
        stageOptions={stageOptions}
      />
      <EditRoomDialog
        open={Boolean(editingRow)}
        onClose={() => setEditingRow(null)}
        subjects={studySubjects}
        stageOptions={stageOptions}
        row={editingRow}
      />
      <RoomReportModal
        row={reportRow}
        hints={reportRow ? (scheduleHintsByRoom[reportRow.id] ?? []) : []}
        open={Boolean(reportRow)}
        onClose={() => setReportRow(null)}
      />
    </section>
  );
}
