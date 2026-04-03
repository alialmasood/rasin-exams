"use client";

import { useActionState, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCollegeQuickActionsRegister, useCollegeQuickUrlTrigger } from "../college-quick-actions";
import { createPortal } from "react-dom";
import type { CollegeRoomScheduleHint } from "@/lib/college-exam-schedules";
import type { CollegeStudySubjectRow } from "@/lib/college-study-subjects";
import {
  formatCollegeStudyLevelTierLabel,
  formatCollegeStudyStageLabel,
  isPostgraduateStudyStageLevel,
  POSTGRAD_STUDY_STAGE_DIPLOMA,
  POSTGRAD_STUDY_STAGE_DOCTOR,
  POSTGRAD_STUDY_STAGE_MASTER,
} from "@/lib/college-study-stage-display";
import type { CollegeExamRoomRow } from "@/lib/college-rooms";
import { getCollegeStageLevelOptions } from "@/lib/college-stage-level";
import {
  buildCollegeExamRoomsReportHtml,
  printCollegeExamRoomsReportHtml,
} from "@/lib/college-rooms-report-html";
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
    return <span className="text-[11px] text-[#94A3B8]">—</span>;
  }
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-1 break-words">
      {items.map((name, i) => (
        <span key={`${i}-${name.slice(0, 48)}`} className="block break-words text-[11px] leading-snug text-[#334155]">
          <span className="ms-1 inline-block font-semibold tabular-nums text-[10px] text-[#64748B]">{i + 1}.</span> {name}
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

/** تجميع عندما تتكرر نفس المادة (الفتحة 1 أو 2) في أكثر من قاعة — لإظهار الإجمالي للمستخدم. */
type SubjectMultiRoomAggregate = {
  subjectId: string;
  subjectName: string;
  roomCount: number;
  totalCapacity: number;
  totalMorning: number;
  totalEvening: number;
  totalAttendance: number;
  totalAbsence: number;
  /** ترتيب معرفات القاعات حسب التسلسل المعروض */
  roomOrderIds: string[];
};

function buildSubjectMultiRoomAggregates(rows: CollegeExamRoomRow[], slot: 1 | 2): Map<string, SubjectMultiRoomAggregate> {
  const bySubject = new Map<string, CollegeExamRoomRow[]>();
  for (const r of rows) {
    const sid = slot === 1 ? r.study_subject_id : r.study_subject_id_2;
    if (!sid) continue;
    if (!bySubject.has(sid)) bySubject.set(sid, []);
    bySubject.get(sid)!.push(r);
  }
  const out = new Map<string, SubjectMultiRoomAggregate>();
  for (const [sid, list] of bySubject) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => {
      if (a.serial_no !== b.serial_no) return a.serial_no - b.serial_no;
      return String(a.id).localeCompare(String(b.id));
    });
    const name =
      slot === 1
        ? sorted[0]!.study_subject_name
        : (sorted[0]!.study_subject_name_2 ?? sorted[0]!.study_subject_name);
    let totalCapacity = 0;
    let totalMorning = 0;
    let totalEvening = 0;
    let totalAttendance = 0;
    let totalAbsence = 0;
    for (const r of sorted) {
      if (slot === 1) {
        totalCapacity += r.capacity_total;
        totalMorning += r.capacity_morning;
        totalEvening += r.capacity_evening;
        totalAttendance += r.attendance_count;
        totalAbsence += r.absence_count;
      } else {
        totalCapacity += r.capacity_total_2;
        totalMorning += r.capacity_morning_2;
        totalEvening += r.capacity_evening_2;
        totalAttendance += r.attendance_count_2;
        totalAbsence += r.absence_count_2;
      }
    }
    out.set(sid, {
      subjectId: sid,
      subjectName: name,
      roomCount: sorted.length,
      totalCapacity,
      totalMorning,
      totalEvening,
      totalAttendance,
      totalAbsence,
      roomOrderIds: sorted.map((x) => x.id),
    });
  }
  return out;
}

function roomIndexInSubjectDistribution(agg: SubjectMultiRoomAggregate, roomId: string): number {
  const i = agg.roomOrderIds.indexOf(roomId);
  return i >= 0 ? i + 1 : 1;
}

const inputNumberClass =
  "h-11 w-full appearance-none rounded-xl border border-[#E2E8F0] bg-white px-3 outline-none [appearance:textfield] focus:border-blue-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

type StudyTierUi = "UNDERGRAD" | "POSTGRAD";

function tierFromLevel(lv: number): StudyTierUi {
  return isPostgraduateStudyStageLevel(lv) ? "POSTGRAD" : "UNDERGRAD";
}

/** عرض المستوى والمرحلة في جدول القاعات (مثل صفحة المواد الدراسية) */
function RoomStageTableLines({ level }: { level: number }) {
  const lv = Number(level);
  return (
    <div className="space-y-0.5">
      <span
        className={`inline-flex max-w-full rounded-full px-2 py-0.5 text-[9px] font-bold break-words ${
          isPostgraduateStudyStageLevel(lv)
            ? "bg-[#EEF2FF] text-[#4338CA] ring-1 ring-[#A5B4FC]/50"
            : "bg-[#F0FDFA] text-[#0F766E] ring-1 ring-[#99F6E4]/70"
        }`}
      >
        {formatCollegeStudyLevelTierLabel(lv)}
      </span>
      {!isPostgraduateStudyStageLevel(lv) ? (
        <div className="text-[10px] text-[#64748B]">{formatCollegeStudyStageLabel(lv)}</div>
      ) : null}
    </div>
  );
}

/** نص موحّد لتصدير Excel / عرض نصي للمرحلة */
function roomStageExportLabel(level: number): string {
  const lv = Number(level);
  if (isPostgraduateStudyStageLevel(lv)) return formatCollegeStudyLevelTierLabel(lv);
  return `${formatCollegeStudyLevelTierLabel(lv)} — ${formatCollegeStudyStageLabel(lv)}`;
}

function RoomFields({
  subjects,
  collegeLabel,
  defaults,
  showSerial = true,
  disableAttendanceFields = false,
}: {
  subjects: CollegeStudySubjectRow[];
  collegeLabel: string;
  defaults?: Partial<CollegeExamRoomRow>;
  showSerial?: boolean;
  disableAttendanceFields?: boolean;
}) {
  const d = defaults ?? {};
  const undergradStageOptions = useMemo(() => getCollegeStageLevelOptions(collegeLabel), [collegeLabel]);
  const firstUndergrad = undergradStageOptions[0] ?? 1;
  const raw1 = Number(d.stage_level ?? firstUndergrad);
  const raw2Parsed = d.stage_level_2 != null ? Number(d.stage_level_2) : firstUndergrad;
  const raw2 = Number.isFinite(raw2Parsed) ? raw2Parsed : firstUndergrad;

  const [tier1, setTier1] = useState<StudyTierUi>(() => tierFromLevel(raw1));
  const [undergradStage1, setUndergradStage1] = useState(() => {
    if (tierFromLevel(raw1) === "UNDERGRAD" && undergradStageOptions.includes(raw1)) return String(raw1);
    return String(firstUndergrad);
  });
  const [postgradStage1, setPostgradStage1] = useState(() =>
    tierFromLevel(raw1) === "POSTGRAD" && isPostgraduateStudyStageLevel(raw1)
      ? String(raw1)
      : String(POSTGRAD_STUDY_STAGE_DIPLOMA)
  );

  const [tier2, setTier2] = useState<StudyTierUi>(() => tierFromLevel(raw2));
  const [undergradStage2, setUndergradStage2] = useState(() => {
    if (tierFromLevel(raw2) === "UNDERGRAD" && undergradStageOptions.includes(raw2)) return String(raw2);
    return String(firstUndergrad);
  });
  const [postgradStage2, setPostgradStage2] = useState(() =>
    tierFromLevel(raw2) === "POSTGRAD" && isPostgraduateStudyStageLevel(raw2)
      ? String(raw2)
      : String(POSTGRAD_STUDY_STAGE_DIPLOMA)
  );

  const invigilatorsFieldId = useId();
  const [dualExam, setDualExam] = useState(() => Boolean(d.study_subject_id_2));

  const id2 = d.study_subject_id_2 ?? "";
  const hiddenStage1 = tier1 === "POSTGRAD" ? postgradStage1 : undergradStage1;
  const hiddenStage2 = tier2 === "POSTGRAD" ? postgradStage2 : undergradStage2;

  const stageSelectClass =
    "h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500";

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

        <fieldset className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]/80 px-3 py-3 sm:px-4">
          <legend className="px-1 text-sm font-semibold text-[#334155]">مستوى الدراسة (الامتحان الأول)</legend>
          <div className="mt-1 flex flex-wrap gap-4 sm:gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[#0F172A]">
              <input
                type="radio"
                className="size-4 accent-[#1E3A8A]"
                checked={tier1 === "UNDERGRAD"}
                onChange={() => {
                  setTier1("UNDERGRAD");
                  setUndergradStage1((prev) =>
                    undergradStageOptions.includes(Number(prev)) ? prev : String(firstUndergrad),
                  );
                }}
              />
              الدراسة الأولية
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[#0F172A]">
              <input
                type="radio"
                className="size-4 accent-[#1E3A8A]"
                checked={tier1 === "POSTGRAD"}
                onChange={() => setTier1("POSTGRAD")}
              />
              الدراسات العليا
            </label>
          </div>
        </fieldset>

        <input type="hidden" name="stage_level" value={hiddenStage1} />

        <div className="min-w-0">
          <label className="mb-1 block text-sm font-semibold text-[#334155]">المرحلة الدراسية</label>
          {tier1 === "UNDERGRAD" ? (
            <select required value={undergradStage1} onChange={(e) => setUndergradStage1(e.target.value)} className={stageSelectClass}>
              {undergradStageOptions.map((s) => (
                <option key={s} value={String(s)}>
                  المرحلة {s}
                </option>
              ))}
            </select>
          ) : (
            <select required value={postgradStage1} onChange={(e) => setPostgradStage1(e.target.value)} className={stageSelectClass}>
              <option value={String(POSTGRAD_STUDY_STAGE_DIPLOMA)}>دبلوم</option>
              <option value={String(POSTGRAD_STUDY_STAGE_MASTER)}>ماجستير</option>
              <option value={String(POSTGRAD_STUDY_STAGE_DOCTOR)}>دكتوراه</option>
            </select>
          )}
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

          <fieldset className="rounded-lg border border-[#BFDBFE] bg-white/90 px-3 py-3 sm:px-4">
            <legend className="px-1 text-sm font-semibold text-[#334155]">مستوى الدراسة (الامتحان الثاني)</legend>
            <div className="mt-1 flex flex-wrap gap-4 sm:gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[#0F172A]">
                <input
                  type="radio"
                  className="size-4 accent-[#1E3A8A]"
                  checked={tier2 === "UNDERGRAD"}
                  onChange={() => {
                    setTier2("UNDERGRAD");
                    setUndergradStage2((prev) =>
                      undergradStageOptions.includes(Number(prev)) ? prev : String(firstUndergrad),
                    );
                  }}
                />
                الدراسة الأولية
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[#0F172A]">
                <input type="radio" className="size-4 accent-[#1E3A8A]" checked={tier2 === "POSTGRAD"} onChange={() => setTier2("POSTGRAD")} />
                الدراسات العليا
              </label>
            </div>
          </fieldset>

          <input type="hidden" name="stage_level_2" value={hiddenStage2} />

          <div className="min-w-0">
            <label className="mb-1 block text-sm font-semibold text-[#334155]">المرحلة الدراسية</label>
            {tier2 === "UNDERGRAD" ? (
              <select required value={undergradStage2} onChange={(e) => setUndergradStage2(e.target.value)} className={stageSelectClass}>
                {undergradStageOptions.map((s) => (
                  <option key={s} value={String(s)}>
                    المرحلة {s}
                  </option>
                ))}
              </select>
            ) : (
              <select required value={postgradStage2} onChange={(e) => setPostgradStage2(e.target.value)} className={stageSelectClass}>
                <option value={String(POSTGRAD_STUDY_STAGE_DIPLOMA)}>دبلوم</option>
                <option value={String(POSTGRAD_STUDY_STAGE_MASTER)}>ماجستير</option>
                <option value={String(POSTGRAD_STUDY_STAGE_DOCTOR)}>دكتوراه</option>
              </select>
            )}
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
          <input type="hidden" name="attendance_count" value={String(d.attendance_count ?? 0)} />
          <input type="hidden" name="absence_count" value={String(d.absence_count ?? 0)} />
          <input type="hidden" name="absence_names" value={d.absence_names ?? ""} />
          <input type="hidden" name="attendance_count_2" value={String(d.attendance_count_2 ?? 0)} />
          <input type="hidden" name="absence_count_2" value={String(d.absence_count_2 ?? 0)} />
          <input type="hidden" name="absence_names_2" value={d.absence_names_2 ?? ""} />
        </>
      ) : null}
    </>
  );
}

function AddRoomDialog({
  open,
  onClose,
  subjects,
  collegeLabel,
}: {
  open: boolean;
  onClose: () => void;
  subjects: CollegeStudySubjectRow[];
  collegeLabel: string;
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
        <RoomFields subjects={subjects} collegeLabel={collegeLabel} showSerial={false} disableAttendanceFields />
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
  collegeLabel,
  row,
}: {
  open: boolean;
  onClose: () => void;
  subjects: CollegeStudySubjectRow[];
  collegeLabel: string;
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
        <RoomFields
          subjects={subjects}
          collegeLabel={collegeLabel}
          defaults={row ?? undefined}
          showSerial={false}
          disableAttendanceFields
        />
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

function MultiRoomSubjectHint({
  slotLabel,
  agg,
  roomIndex,
}: {
  slotLabel: "الامتحان الأول" | "الامتحان الثاني";
  agg: SubjectMultiRoomAggregate;
  roomIndex: number;
}) {
  return (
    <div className="mt-1.5 rounded-lg border border-[#A5B4FC] bg-[#EEF2FF] px-2 py-1.5 text-[10px] leading-relaxed text-[#312E81]">
      <p className="font-bold text-[#1E1B4B]">
        توزيع {slotLabel} على عدة قاعات — القاعة {roomIndex} من {agg.roomCount}
      </p>
      <p className="mt-1 text-[#4338CA]">
        جميع هذه القاعات لمادة واحدة؛ الأعداد أدناه هي <span className="font-semibold">حصة هذه القاعة فقط</span>، أما{" "}
        <span className="font-semibold">المجموع الكلي للمادة</span> عند جمع القاعات: سعة إجمالية{" "}
        <strong className="tabular-nums">{agg.totalCapacity}</strong> (صباحي {agg.totalMorning} + مسائي {agg.totalEvening})،
        حضور <strong className="tabular-nums">{agg.totalAttendance}</strong>، غياب{" "}
        <strong className="tabular-nums">{agg.totalAbsence}</strong>.
      </p>
    </div>
  );
}

function SubjectsCell({
  row,
  aggregateSlot1,
  aggregateSlot2,
}: {
  row: CollegeExamRoomRow;
  aggregateSlot1?: SubjectMultiRoomAggregate;
  aggregateSlot2?: SubjectMultiRoomAggregate;
}) {
  const dual = Boolean(row.study_subject_id_2);
  const idx1 = aggregateSlot1 ? roomIndexInSubjectDistribution(aggregateSlot1, row.id) : 0;
  const idx2 = aggregateSlot2 ? roomIndexInSubjectDistribution(aggregateSlot2, row.id) : 0;
  return (
    <div className="min-w-0 space-y-0.5 break-words text-[11px] leading-snug text-[#334155]">
      <div className="flex flex-wrap items-center gap-1">
        <div className="font-semibold text-[#0F172A]">{row.study_subject_name}</div>
        {aggregateSlot1 ? (
          <span className="inline-flex shrink-0 rounded-full bg-[#4F46E5] px-1.5 py-0.5 text-[9px] font-bold text-white">
            جزء من توزيع ({idx1}/{aggregateSlot1.roomCount})
          </span>
        ) : null}
      </div>
      <RoomStageTableLines level={row.stage_level ?? 1} />
      {aggregateSlot1 ? <MultiRoomSubjectHint slotLabel="الامتحان الأول" agg={aggregateSlot1} roomIndex={idx1} /> : null}
      {dual && row.study_subject_name_2 ? (
        <div className="border-t border-[#E2E8F0] pt-1.5">
          <div className="flex flex-wrap items-center gap-1">
            <div className="font-semibold text-[#0F172A]">{row.study_subject_name_2}</div>
            {aggregateSlot2 ? (
              <span className="inline-flex shrink-0 rounded-full bg-[#4F46E5] px-1.5 py-0.5 text-[9px] font-bold text-white">
                جزء من توزيع ({idx2}/{aggregateSlot2.roomCount})
              </span>
            ) : null}
          </div>
          <RoomStageTableLines level={row.stage_level_2 ?? 1} />
          {aggregateSlot2 ? <MultiRoomSubjectHint slotLabel="الامتحان الثاني" agg={aggregateSlot2} roomIndex={idx2} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function RowDetailHint({
  row,
  hints,
  aggregateSlot1,
  aggregateSlot2,
}: {
  row: CollegeExamRoomRow;
  hints: CollegeRoomScheduleHint[];
  aggregateSlot1?: SubjectMultiRoomAggregate;
  aggregateSlot2?: SubjectMultiRoomAggregate;
}) {
  const dual = Boolean(row.study_subject_id_2);
  const idx1 = aggregateSlot1 ? roomIndexInSubjectDistribution(aggregateSlot1, row.id) : 0;
  const idx2 = aggregateSlot2 ? roomIndexInSubjectDistribution(aggregateSlot2, row.id) : 0;

  return (
    <div className="space-y-3 text-sm leading-6 text-[#334155]">
      <p>
        <span className="font-bold text-[#0F172A]">{row.room_name}</span>
        {dual ? (
          <span className="ms-2 rounded-full bg-[#DBEAFE] px-2 py-0.5 text-xs font-semibold text-[#1D4ED8]">قاعة بامتحانين</span>
        ) : null}
      </p>
      {aggregateSlot1 ? (
        <p className="rounded-lg border border-[#A5B4FC] bg-[#EEF2FF] px-3 py-2 text-xs leading-relaxed text-[#312E81]">
          <strong>توزيع المادة على عدة قاعات:</strong> هذه القاعة {idx1} من {aggregateSlot1.roomCount} لمادة «
          {aggregateSlot1.subjectName}». المجموع الكلي للمادة على كل القاعات: سعة {aggregateSlot1.totalCapacity} (ص{" "}
          {aggregateSlot1.totalMorning} + م {aggregateSlot1.totalEvening})، حضور {aggregateSlot1.totalAttendance}، غياب{" "}
          {aggregateSlot1.totalAbsence}.
        </p>
      ) : null}
      <ul className="list-disc space-y-1 pe-4">
        <li>
          الامتحان 1: <strong>{row.study_subject_name}</strong> —{" "}
          {isPostgraduateStudyStageLevel(row.stage_level ?? 1)
            ? formatCollegeStudyLevelTierLabel(row.stage_level ?? 1)
            : `${formatCollegeStudyLevelTierLabel(row.stage_level ?? 1)}، ${formatCollegeStudyStageLabel(row.stage_level ?? 1)}`}{" "}
          — سعة {shiftCapacityLabel(row, 1)}
          {row.supervisor_name ? ` — مشرف: ${row.supervisor_name}` : null}
        </li>
        {dual && row.study_subject_name_2 ? (
          <li>
            الامتحان 2: <strong>{row.study_subject_name_2}</strong>
            {" — "}
            {isPostgraduateStudyStageLevel(row.stage_level_2 ?? 1)
              ? formatCollegeStudyLevelTierLabel(row.stage_level_2 ?? 1)
              : `${formatCollegeStudyLevelTierLabel(row.stage_level_2 ?? 1)}، ${formatCollegeStudyStageLabel(row.stage_level_2 ?? 1)}`}{" "}
            — سعة {shiftCapacityLabel(row, 2)}
            {row.supervisor_name ? ` — مشرف: ${row.supervisor_name}` : null}
          </li>
        ) : null}
      </ul>
      {aggregateSlot2 ? (
        <p className="rounded-lg border border-[#C4B5FD] bg-[#F5F3FF] px-3 py-2 text-xs leading-relaxed text-[#4C1D95]">
          <strong>توزيع الامتحان الثاني على عدة قاعات:</strong> هذه القاعة {idx2} من {aggregateSlot2.roomCount}. المجموع الكلي
          على كل القاعات: سعة {aggregateSlot2.totalCapacity} (ص {aggregateSlot2.totalMorning} + م{" "}
          {aggregateSlot2.totalEvening})، حضور {aggregateSlot2.totalAttendance}، غياب {aggregateSlot2.totalAbsence}.
        </p>
      ) : null}
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
  const [addOpen, setAddOpen] = useState(false);
  /** إعادة تركيب مودال الإضافة عند كل فتح حتى تُصفَّر حالة useActionState ولا يبقى ok: true من الجلسة السابقة */
  const [addDialogKey, setAddDialogKey] = useState(0);
  const [editDialogKey, setEditDialogKey] = useState(0);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuCoords, setMenuCoords] = useState<{ top: number; left: number } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const [editingRow, setEditingRow] = useState<CollegeExamRoomRow | null>(null);
  const closeAddDialog = useCallback(() => setAddOpen(false), []);
  const closeEditDialog = useCallback(() => setEditingRow(null), []);
  const openAddDialog = useCallback(() => {
    setAddDialogKey((k) => k + 1);
    setAddOpen(true);
  }, []);
  useCollegeQuickActionsRegister({ openAddRoom: openAddDialog }, [openAddDialog]);
  useCollegeQuickUrlTrigger("room", openAddDialog);
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
    const subjectIdRoomSlots = new Map<string, number>();
    for (const r of rows) {
      const bump = (sid: string) => subjectIdRoomSlots.set(sid, (subjectIdRoomSlots.get(sid) ?? 0) + 1);
      bump(r.study_subject_id);
      if (r.study_subject_id_2) bump(r.study_subject_id_2);
    }
    const subjectsSpreadAcrossMultipleRooms = [...subjectIdRoomSlots.values()].filter((c) => c > 1).length;
    return {
      totalRooms,
      distinctExamSubjectsInRooms,
      totalAttendanceSeats,
      totalAbsenceSeats,
      singleExamRooms,
      doubleExamRooms,
      totalCapacityFromShifts,
      subjectsSpreadAcrossMultipleRooms,
    };
  }, [rows]);

  const multiRoomAggSlot1 = useMemo(() => buildSubjectMultiRoomAggregates(rows, 1), [rows]);
  const multiRoomAggSlot2 = useMemo(() => buildSubjectMultiRoomAggregates(rows, 2), [rows]);

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

  const exportPdfReport = useCallback(() => {
    let generatedLabel: string;
    try {
      generatedLabel = new Date().toLocaleString("ar-IQ", {
        timeZone: "Asia/Baghdad",
        dateStyle: "full",
        timeStyle: "short",
      });
    } catch {
      generatedLabel = new Date().toISOString();
    }
    const html = buildCollegeExamRoomsReportHtml({
      rows,
      stats,
      scheduleHintsByRoom,
      collegeLabel,
      generatedLabel,
    });
    if (!printCollegeExamRoomsReportHtml(html)) {
      window.alert(
        "تعذر فتح نافذة التقرير. اسمح بالنوافذ المنبثقة لهذا الموقع، ثم اختر «حفظ كـ PDF» من نافذة الطباعة."
      );
    }
  }, [rows, stats, scheduleHintsByRoom, collegeLabel]);

  const exportExcel = useCallback(async () => {
    try {
      const xlsx = await import("xlsx");
      const sorted = [...rows].sort((a, b) => {
        if (a.serial_no !== b.serial_no) return a.serial_no - b.serial_no;
        return String(a.id).localeCompare(String(b.id));
      });
      const df = new Intl.DateTimeFormat("ar-IQ", {
        timeZone: "Asia/Baghdad",
        dateStyle: "medium",
        timeStyle: "short",
      });
      const data = sorted.map((r) => {
        const dual = Boolean(r.study_subject_id_2);
        const hints = scheduleHintsByRoom[r.id] ?? [];
        const hintsText =
          hints.length === 0
            ? ""
            : hints.map((h) => `${h.exam_date} ${h.start_time}-${h.end_time} (${h.study_subject_name})`).join("؛ ");
        return {
          الكلية: collegeLabel,
          التسلسل: r.serial_no,
          "اسم القاعة": r.room_name,
          "مشرف القاعة": r.supervisor_name,
          المراقبون: r.invigilators,
          "المادة الامتحانية الأولى": r.study_subject_name,
          "المرحلة (الامتحان الأول)": roomStageExportLabel(r.stage_level ?? 1),
          "المادة الامتحانية الثانية": r.study_subject_name_2 || "",
          "المرحلة (الامتحان الثاني)": dual ? roomStageExportLabel(Number(r.stage_level_2 ?? 1)) : "",
          "نوع القاعة": dual ? "مزدوجة" : "منفردة",
          "سعة الامتحان الأول (ملخص)": shiftCapacityLabel(r, 1),
          "صباحي 1": r.capacity_morning,
          "مسائي 1": r.capacity_evening,
          "إجمالي سعة 1": r.capacity_total,
          "صباحي 2": dual ? r.capacity_morning_2 : "",
          "مسائي 2": dual ? r.capacity_evening_2 : "",
          "إجمالي سعة 2": dual ? r.capacity_total_2 : "",
          "حضور (امتحان 1)": r.attendance_count,
          "حضور (امتحان 2)": r.attendance_count_2,
          "غياب (امتحان 1)": r.absence_count,
          "غياب (امتحان 2)": r.absence_count_2,
          "أسماء الغياب 1": r.absence_names,
          "أسماء الغياب 2": r.absence_names_2,
          "مواعيد الجداول المرتبطة": hintsText,
          "تاريخ الإضافة": df.format(new Date(r.created_at)),
          "آخر تحديث": df.format(new Date(r.updated_at)),
        };
      });
      const ws = xlsx.utils.json_to_sheet(data);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "القاعات");
      xlsx.writeFile(wb, "college-exam-rooms.xlsx");
    } catch {
      window.alert("تعذر تصدير ملف Excel. أعد المحاولة.");
    }
  }, [rows, collegeLabel, scheduleHintsByRoom]);

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
          تعريف القاعات وربطها بمادة أو مادتين امتحانيتين في النافذة الزمنية نفسها، مع توزيع الطلبة صباحي/مسائي لكل امتحان. يمكنك
          إضافة أكثر من قاعة لنفس المادة الدراسية لتوزيع الطلبة بينها؛ يُحسب الحضور والغياب لكل قاعة ثم يُجمَع في التقارير.
        </p>
      </header>

      <div className="min-w-0 overflow-x-hidden rounded-3xl border border-[#E2E8F0] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1f3578] bg-[#274092] px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openAddDialog}
              className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#274092] shadow-sm ring-1 ring-white/60 transition hover:bg-white/95"
            >
              إضافة قاعة
            </button>
            <button
              type="button"
              onClick={() => void exportExcel()}
              className="rounded-xl border border-white/45 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-[2px] transition hover:border-white/60 hover:bg-white/20"
            >
              تصدير Excel
            </button>
            <button
              type="button"
              onClick={exportPdfReport}
              className="rounded-xl border border-white/45 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-[2px] transition hover:border-white/60 hover:bg-white/20"
            >
              تقرير PDF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-[#E2E8F0] bg-white px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs text-[#64748B]">عدد القاعات الكلية</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.totalRooms}</p>
          </div>
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs font-semibold text-[#64748B]">عدد المواد الامتحانية</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.distinctExamSubjectsInRooms}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-[#64748B]">معرّفات مواد فريدة ظاهرة في القاعات (قد تتكرر المادة على عدة قاعات)</p>
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
          <div className="rounded-2xl border border-[#C7D2FE] bg-[#EEF2FF] px-4 py-3">
            <p className="text-xs font-semibold text-[#3730A3]">مواد موزّعة على عدة قاعات</p>
            <p className="mt-1 text-2xl font-extrabold text-[#4338CA]">{stats.subjectsSpreadAcrossMultipleRooms}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-[#3730A3]/85">عدد المواد التي لها أكثر من قاعة بنفس التعريف</p>
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
          <strong>تلميح:</strong> اضغط على صف في الجدول لعرض التفاصيل في الشريط السفلي الثابت؛ يمكن إغلاقها بالزر «إغلاق التفاصيل». عندما تُعرَّف{" "}
          <strong>أكثر من قاعة لنفس المادة الامتحانية</strong>، يظهر في عمود «المادة والمرحلة» إجمالي السعة والحضور والغياب لجميع القاعات
          المرتبطة بتلك المادة، مع توضيح أن أعمدة السعة والحضور في الصف تمثّل <strong>هذه القاعة فقط</strong>.
        </p>

        <div className="w-full min-w-0 overflow-x-hidden">
          <table className="w-full table-fixed border-collapse text-right">
            <colgroup>
              <col style={{ width: "4%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "19%" }} />
              <col style={{ width: "4%" }} />
            </colgroup>
            <thead className="bg-[#F1F5F9]">
              <tr className="border-b border-[#E2E8F0]">
                <th
                  scope="col"
                  className="border-b border-[#E2E8F0] px-2 py-2.5 align-middle text-center text-xs font-bold tabular-nums text-[#334155] sm:text-sm"
                  title="رقم التسلسل"
                >
                  تسلسل
                </th>
                <th
                  scope="col"
                  className="max-w-0 border-b border-[#E2E8F0] px-2 py-2.5 align-middle text-right text-xs font-bold break-words text-[#334155] sm:text-sm"
                >
                  اسم القاعة
                </th>
                <th
                  scope="col"
                  className="max-w-0 border-b border-[#E2E8F0] px-2 py-2.5 align-middle text-right text-xs font-bold break-words text-[#334155] sm:text-sm"
                >
                  مشرف القاعة
                </th>
                <th
                  scope="col"
                  className="max-w-0 border-b border-[#E2E8F0] px-2 py-2.5 align-top text-right text-xs font-bold break-words text-[#334155] sm:text-sm"
                >
                  المراقبون
                </th>
                <th
                  scope="col"
                  className="max-w-0 border-b border-[#E2E8F0] px-2 py-2.5 align-middle text-right text-xs font-bold break-words text-[#334155] sm:text-sm"
                >
                  المادة والمرحلة
                </th>
                <th
                  scope="col"
                  className="border-b border-[#E2E8F0] px-2 py-2.5 align-middle text-center text-xs font-bold text-[#334155] sm:text-sm"
                >
                  الوضع
                </th>
                <th
                  scope="col"
                  className="max-w-0 border-b border-[#E2E8F0] px-2 py-2.5 align-middle text-right text-xs font-bold leading-tight break-words text-[#334155] sm:text-sm"
                  title="إجمالي السعة مع تفصيل صباحي + مسائي لكل امتحان"
                >
                  السعة
                  <span className="mt-0.5 block text-[9px] font-semibold leading-tight text-[#64748B] sm:text-[10px]">صباحي / مسائي</span>
                </th>
                <th
                  scope="col"
                  className="border-b border-[#E2E8F0] px-2 py-2.5 align-middle text-center text-xs font-bold tabular-nums text-[#334155] sm:text-sm"
                  title="حضور الامتحان الأول / الثاني في القاعة المزدوجة"
                >
                  الحضور
                </th>
                <th
                  scope="col"
                  className="border-b border-[#E2E8F0] px-2 py-2.5 align-middle text-center text-xs font-bold tabular-nums text-[#334155] sm:text-sm"
                  title="غياب الامتحان الأول / الثاني في القاعة المزدوجة"
                >
                  الغياب
                </th>
                <th
                  scope="col"
                  className="max-w-0 border-b border-[#E2E8F0] px-2 py-2.5 align-top text-right text-xs font-bold break-words text-[#334155] sm:text-sm"
                >
                  أسماء الغياب
                </th>
                <th
                  scope="col"
                  className="border-b border-[#E2E8F0] px-1 py-2.5 align-middle text-center text-xs font-bold text-[#334155] sm:text-sm"
                >
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
                  <td className="px-4 py-10 text-center text-[11px] text-[#64748B]" colSpan={11}>
                    لا توجد قاعات امتحانية بعد.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isMultiDistributed =
                    multiRoomAggSlot1.has(row.study_subject_id) ||
                    (Boolean(row.study_subject_id_2) && multiRoomAggSlot2.has(row.study_subject_id_2!));
                  return (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    className={`cursor-pointer border-s-[3px] border-transparent transition-colors hover:bg-[#F8FAFC] ${
                      isMultiDistributed ? "border-s-indigo-400 bg-indigo-50/25" : ""
                    } ${pinnedDetailRowId === row.id ? "bg-[#EFF6FF]" : ""}`}
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
                    <td className="border-b border-[#E2E8F0] px-2 py-2 align-middle text-center text-[11px] leading-none tabular-nums text-[#334155]">
                      {row.serial_no}
                    </td>
                    <td className="max-w-0 border-b border-[#E2E8F0] px-2 py-2 align-middle break-words text-right text-[11px] leading-snug font-semibold text-[#0F172A]">
                      {row.room_name}
                    </td>
                    <td className="max-w-0 border-b border-[#E2E8F0] px-2 py-2 align-middle break-words text-right text-[11px] leading-snug text-[#334155]">
                      {row.supervisor_name}
                    </td>
                    <td className="max-w-0 border-b border-[#E2E8F0] px-2 py-2 align-top break-words text-right text-[#334155]">
                      <StackedNamesCell value={row.invigilators} />
                    </td>
                    <td className="max-w-0 border-b border-[#E2E8F0] px-2 py-2 align-middle text-right">
                      <SubjectsCell
                        row={row}
                        aggregateSlot1={multiRoomAggSlot1.get(row.study_subject_id)}
                        aggregateSlot2={
                          row.study_subject_id_2 ? multiRoomAggSlot2.get(row.study_subject_id_2) : undefined
                        }
                      />
                    </td>
                    <td className="border-b border-[#E2E8F0] px-2 py-2 align-middle text-center">
                      <div className="flex min-h-[1.75rem] items-center justify-center">
                        {row.study_subject_id_2 ? (
                          <span className="inline-flex max-w-full rounded-md bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-bold break-words text-[#B45309]">
                            امتحانان
                          </span>
                        ) : (
                          <span className="text-[10px] leading-none text-[#64748B]">واحد</span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-0 border-b border-[#E2E8F0] px-2 py-2 align-middle break-words text-right text-[11px] leading-snug tabular-nums text-[#334155]">
                      <div className="leading-snug">
                        <span className="font-semibold text-[#64748B]">١:</span> {shiftCapacityLabel(row, 1)}
                      </div>
                      {row.study_subject_id_2 ? (
                        <div className="mt-0.5 leading-snug break-words text-[#475569]">
                          <span className="font-semibold text-[#64748B]">٢:</span> {shiftCapacityLabel(row, 2)}
                        </div>
                      ) : null}
                    </td>
                    <td className="border-b border-[#E2E8F0] px-2 py-2 align-middle text-center text-[11px] leading-snug tabular-nums text-emerald-800">
                      {row.attendance_count}
                      {row.study_subject_id_2 ? (
                        <>
                          <span className="text-[#94A3B8]"> / </span>
                          {row.attendance_count_2}
                        </>
                      ) : null}
                    </td>
                    <td className="border-b border-[#E2E8F0] px-2 py-2 align-middle text-center text-[11px] leading-snug tabular-nums text-red-800">
                      {row.absence_count}
                      {row.study_subject_id_2 ? (
                        <>
                          <span className="text-[#94A3B8]"> / </span>
                          {row.absence_count_2}
                        </>
                      ) : null}
                    </td>
                    <td
                      className="max-w-0 border-b border-[#E2E8F0] px-2 py-2 align-top break-words text-right text-[11px] leading-snug text-[#334155]"
                      title={row.absence_names || undefined}
                    >
                      <StackedNamesCell value={row.absence_names} />
                      {row.study_subject_id_2 && row.absence_names_2 ? (
                        <div className="mt-1.5 border-t border-[#E2E8F0] pt-1.5">
                          <span className="mb-0.5 block text-[10px] font-semibold text-[#64748B]">امتحان ثانٍ:</span>
                          <StackedNamesCell value={row.absence_names_2} />
                        </div>
                      ) : null}
                    </td>
                    <td className="border-b border-[#E2E8F0] px-1 py-2 text-center align-middle whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-label="إجراءات"
                        aria-expanded={menuId === row.id}
                        className="rounded-lg p-1.5 text-[#64748B] transition hover:bg-[#F1F5F9]"
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
                        <svg className="size-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <circle cx="12" cy="5" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="12" cy="19" r="2" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                  );
                })
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
                    <RowDetailHint
                      row={pinnedDetailRow}
                      hints={scheduleHintsByRoom[pinnedDetailRow.id] ?? []}
                      aggregateSlot1={multiRoomAggSlot1.get(pinnedDetailRow.study_subject_id)}
                      aggregateSlot2={
                        pinnedDetailRow.study_subject_id_2
                          ? multiRoomAggSlot2.get(pinnedDetailRow.study_subject_id_2)
                          : undefined
                      }
                    />
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
                  setEditDialogKey((k) => k + 1);
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
        key={`add-room-${addDialogKey}`}
        open={addOpen}
        onClose={closeAddDialog}
        subjects={studySubjects}
        collegeLabel={collegeLabel}
      />
      <EditRoomDialog
        key={`edit-room-${editDialogKey}`}
        open={Boolean(editingRow)}
        onClose={closeEditDialog}
        subjects={studySubjects}
        collegeLabel={collegeLabel}
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
