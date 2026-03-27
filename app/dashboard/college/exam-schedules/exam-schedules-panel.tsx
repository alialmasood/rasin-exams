"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CollegeSubjectRow } from "@/lib/college-subjects";
import type { CollegeStudySubjectRow } from "@/lib/college-study-subjects";
import type { CollegeExamRoomRow } from "@/lib/college-rooms";
import type { CollegeExamScheduleRow } from "@/lib/college-exam-schedules";
import type { CollegeHolidayRow } from "@/lib/college-holidays";
import { assertExamDateNotInPast, todayCalendarDateLocal } from "@/lib/exam-schedule-date";
import { getCollegeStageLevelOptions } from "@/lib/college-stage-level";
import {
  createExamScheduleAction,
  createHolidayAction,
  deleteHolidayAction,
  deleteExamScheduleAction,
  submitExamScheduleContextAction,
  updateExamScheduleAction,
} from "./actions";

type ScheduleType = "FINAL" | "SEMESTER";
type FormState = {
  id?: string;
  collegeSubjectId: string;
  scheduleType: ScheduleType;
  academicYear: string;
  termLabel: string;
  studySubjectId: string;
  stageLevel: string;
  examDate: string;
  startTime: string;
  endTime: string;
  roomId: string;
  notes: string;
};

const SCHEDULE_TYPE_LABEL: Record<ScheduleType, string> = {
  FINAL: "جدول امتحانات نهائية",
  SEMESTER: "جدول امتحانات فصلية",
};

function suggestedAcademicYear() {
  const d = new Date();
  const y = d.getFullYear();
  return d.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
const WORKFLOW_LABEL = {
  DRAFT: "مسودة",
  SUBMITTED: "مرفوع",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
} as const;

function toMin(time: string) {
  const [h, m] = time.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return h * 60 + m;
}

type Time12Parts = { hour12: string; minute: string; period: "AM" | "PM" };

function to12Parts(time24: string): Time12Parts {
  const [hRaw, mRaw] = time24.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return { hour12: "12", minute: "00", period: "AM" };
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { hour12: String(hour12), minute: String(m).padStart(2, "0"), period };
}

function to24From12(parts: Time12Parts): string {
  const hour = Number(parts.hour12);
  const minute = Number(parts.minute);
  if (!Number.isFinite(hour) || hour < 1 || hour > 12) return "";
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return "";
  const h24 = parts.period === "AM" ? (hour === 12 ? 0 : hour) : (hour === 12 ? 12 : hour + 12);
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatDuration(minutes: number) {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} ساعة و${m} دقيقة`;
  if (h > 0) return h === 1 ? "ساعة واحدة" : `${h} ساعات`;
  return `${m} دقيقة`;
}

function weekdayAr(dateIso: string) {
  if (!dateIso) return "";
  return new Intl.DateTimeFormat("ar-IQ", { weekday: "long" }).format(new Date(dateIso));
}

function timeRangeLabel(start: string, end: string) {
  return `${start || "--:--"} - ${end || "--:--"}`;
}

function sortSchedules(rows: CollegeExamScheduleRow[]) {
  return [...rows].sort((a, b) => {
    const da = `${a.exam_date} ${a.start_time}`;
    const db = `${b.exam_date} ${b.start_time}`;
    return da.localeCompare(db);
  });
}

/** اسم القاعة مع المواد الامتحانية المعرفة لها في «إدارة القاعات». */
function roomSelectOptionLabel(r: CollegeExamRoomRow): string {
  const name = r.room_name.trim() || "—";
  const s1 = r.study_subject_name?.trim();
  if (!s1) return name;
  if (r.study_subject_id_2 && r.study_subject_name_2?.trim()) {
    return `${name} — ${s1} + ${r.study_subject_name_2.trim()}`;
  }
  return `${name} — ${s1}`;
}

export function ExamSchedulesPanel({
  collegeLabel,
  subjects,
  studySubjects,
  rooms,
  initialRows,
  initialHolidays,
}: {
  collegeLabel: string;
  subjects: CollegeSubjectRow[];
  studySubjects: CollegeStudySubjectRow[];
  rooms: CollegeExamRoomRow[];
  initialRows: CollegeExamScheduleRow[];
  initialHolidays: CollegeHolidayRow[];
}) {
  const [rows, setRows] = useState<CollegeExamScheduleRow[]>(sortSchedules(initialRows));
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("ALL");
  const [filterType, setFilterType] = useState<"ALL" | ScheduleType>("ALL");
  const [filterDate, setFilterDate] = useState("");
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [generalLocked, setGeneralLocked] = useState(false);
  const [lockedGeneral, setLockedGeneral] = useState<{
    collegeSubjectId: string;
    scheduleType: ScheduleType;
    academicYear: string;
    termLabel: string;
  } | null>(null);
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [holidays, setHolidays] = useState<CollegeHolidayRow[]>(initialHolidays);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [holidaysModalOpen, setHolidaysModalOpen] = useState(false);
  const holidaysDialogRef = useRef<HTMLDialogElement>(null);

  const emptyForm: FormState = {
    collegeSubjectId: "",
    scheduleType: "FINAL",
    academicYear: suggestedAcademicYear(),
    termLabel: "",
    studySubjectId: "",
    stageLevel: "",
    examDate: "",
    startTime: "08:00",
    endTime: "09:00",
    roomId: "",
    notes: "",
  };
  const [form, setForm] = useState<FormState>(emptyForm);
  const hours12 = useMemo(() => Array.from({ length: 12 }, (_, i) => String(i + 1)), []);
  const minuteOptions = useMemo(() => Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")), []);
  const stageOptions = useMemo(() => getCollegeStageLevelOptions(collegeLabel), [collegeLabel]);
  const startParts = useMemo(() => to12Parts(form.startTime || "08:00"), [form.startTime]);
  const endParts = useMemo(() => to12Parts(form.endTime || "09:00"), [form.endTime]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const el = holidaysDialogRef.current;
    if (!el) return;
    if (holidaysModalOpen && !el.open) el.showModal();
    if (!holidaysModalOpen && el.open) el.close();
  }, [holidaysModalOpen]);

  const durationMin = useMemo(() => {
    const s = toMin(form.startTime);
    const e = toMin(form.endTime);
    if (s < 0 || e < 0 || e <= s) return 0;
    return e - s;
  }, [form.startTime, form.endTime]);

  const availableStudySubjects = useMemo(() => {
    if (!form.collegeSubjectId) return [];
    return studySubjects.filter((x) => x.college_subject_id === form.collegeSubjectId);
  }, [studySubjects, form.collegeSubjectId]);

  const mappedRows = useMemo(() => {
    return rows.map((r) => ({
      ...r,
      day_name: weekdayAr(r.exam_date),
    }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mappedRows.filter((r) => {
      const byQ =
        q.length === 0 ||
        r.study_subject_name.toLowerCase().includes(q) ||
        r.college_subject_name.toLowerCase().includes(q) ||
        r.room_name.toLowerCase().includes(q);
      const byDept = filterDepartment === "ALL" ? true : r.college_subject_id === filterDepartment;
      const byType = filterType === "ALL" ? true : r.schedule_type === filterType;
      const byDate = filterDate ? r.exam_date === filterDate : true;
      return byQ && byDept && byType && byDate;
    });
  }, [mappedRows, search, filterDepartment, filterType, filterDate]);

  const stats = useMemo(() => {
    const entries = rows.length;
    const uniqueSubjects = new Set(rows.map((r) => r.study_subject_id)).size;
    const uniqueRooms = new Set(rows.map((r) => r.room_id)).size;
    return {
      entries,
      uniqueSubjects,
      uniqueRooms,
      currentType: SCHEDULE_TYPE_LABEL[form.scheduleType],
    };
  }, [rows, form.scheduleType]);

  const contextRows = useMemo(() => {
    if (!form.collegeSubjectId) return [];
    return rows.filter(
      (r) =>
        r.college_subject_id === form.collegeSubjectId &&
        r.schedule_type === form.scheduleType &&
        (r.term_label ?? "") === (form.termLabel || "") &&
        (r.academic_year ?? "") === (form.academicYear || "").trim()
    );
  }, [rows, form.collegeSubjectId, form.scheduleType, form.termLabel, form.academicYear]);
  const contextSubmitted =
    contextRows.length > 0 && contextRows.every((r) => r.workflow_status === "SUBMITTED" || r.workflow_status === "APPROVED");

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage]);

  function resetForm() {
    if (generalLocked && lockedGeneral) {
      setForm((f) => ({
        collegeSubjectId: lockedGeneral.collegeSubjectId,
        scheduleType: lockedGeneral.scheduleType,
        academicYear: lockedGeneral.academicYear,
        termLabel: lockedGeneral.termLabel,
        studySubjectId: "",
        stageLevel: "",
        examDate: "",
        startTime: "08:00",
        endTime: "09:00",
        roomId: "",
        notes: "",
      }));
      return;
    }
    setForm(emptyForm);
  }

  function patchStartTime(partial: Partial<Time12Parts>) {
    const current = to12Parts(form.startTime || "08:00");
    const next: Time12Parts = {
      hour12: partial.hour12 ?? current.hour12,
      minute: partial.minute ?? current.minute,
      period: partial.period ?? current.period,
    };
    setForm((f) => ({ ...f, startTime: to24From12(next) }));
  }

  function patchEndTime(partial: Partial<Time12Parts>) {
    const current = to12Parts(form.endTime || "09:00");
    const next: Time12Parts = {
      hour12: partial.hour12 ?? current.hour12,
      minute: partial.minute ?? current.minute,
      period: partial.period ?? current.period,
    };
    setForm((f) => ({ ...f, endTime: to24From12(next) }));
  }

  function validateForm(): string | null {
    if (!form.collegeSubjectId) return "يرجى اختيار القسم أو الفرع";
    if (!form.scheduleType) return "يرجى اختيار نوع الجدول";
    if (!form.academicYear.trim()) return "يرجى تحديد العام الدراسي";
    if (!form.termLabel.trim()) return "يرجى اختيار الفصل الدراسي";
    if (!form.studySubjectId) return "يرجى اختيار المادة الدراسية";
    if (!form.stageLevel) return "يرجى اختيار المرحلة";
    const examDateCheck = assertExamDateNotInPast(form.examDate);
    if (!examDateCheck.ok) return examDateCheck.message;
    if (!form.startTime) return "يرجى تحديد وقت بداية الامتحان";
    if (!form.endTime) return "يرجى تحديد وقت نهاية الامتحان";
    if (!form.roomId) return "يرجى اختيار القاعة الامتحانية";
    if (toMin(form.endTime) <= toMin(form.startTime)) return "وقت نهاية الامتحان يجب أن يكون بعد وقت البداية";
    return null;
  }

  async function onSubmitForm() {
    const err = validateForm();
    if (err) {
      setToast({ type: "error", msg: err });
      return;
    }
    const fd = new FormData();
    if (form.id) fd.set("id", form.id);
    fd.set("college_subject_id", form.collegeSubjectId);
    fd.set("schedule_type", form.scheduleType);
    fd.set("academic_year", form.academicYear.trim());
    fd.set("term_label", form.termLabel);
    fd.set("study_subject_id", form.studySubjectId);
    fd.set("stage_level", form.stageLevel);
    fd.set("exam_date", form.examDate);
    fd.set("start_time", form.startTime);
    fd.set("end_time", form.endTime);
    fd.set("room_id", form.roomId);
    fd.set("notes", form.notes);
    startTransition(async () => {
      const res = form.id ? await updateExamScheduleAction(fd) : await createExamScheduleAction(fd);
      if (!res.ok) {
        setToast({ type: "error", msg: res.message });
        return;
      }
      const row = res.data as CollegeExamScheduleRow | undefined;
      if (row) {
        setRows((prev) => sortSchedules(form.id ? prev.map((x) => (x.id === row.id ? row : x)) : [...prev, row]));
      }
      if (!form.id) {
        const snapshot = {
          collegeSubjectId: form.collegeSubjectId,
          scheduleType: form.scheduleType,
          academicYear: form.academicYear.trim(),
          termLabel: form.termLabel,
        };
        setLockedGeneral(snapshot);
        setGeneralLocked(true);
        setForm({
          ...emptyForm,
          ...snapshot,
          stageLevel: "",
        });
      } else {
        resetForm();
      }
      setToast({ type: "success", msg: res.message });
    });
  }

  function onEdit(row: CollegeExamScheduleRow) {
    setForm({
      id: row.id,
      collegeSubjectId: row.college_subject_id,
      scheduleType: row.schedule_type,
      academicYear: row.academic_year ?? "",
      termLabel: row.term_label ?? "",
      studySubjectId: row.study_subject_id,
      stageLevel: String(row.stage_level),
      examDate: row.exam_date,
      startTime: row.start_time,
      endTime: row.end_time,
      roomId: row.room_id,
      notes: row.notes ?? "",
    });
  }

  async function onDeleteConfirmed() {
    if (!deleteId) return;
    const fd = new FormData();
    fd.set("id", deleteId);
    startTransition(async () => {
      const res = await deleteExamScheduleAction(fd);
      if (!res.ok) {
        setToast({ type: "error", msg: res.message });
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== deleteId));
      setDeleteId(null);
      setToast({ type: "success", msg: "تم حذف الإدخال" });
    });
  }

  async function onAddHoliday() {
    if (!holidayDate || !holidayName.trim()) {
      setToast({ type: "error", msg: "يرجى تحديد التاريخ واسم العطلة." });
      return;
    }
    const fd = new FormData();
    fd.set("holiday_date", holidayDate);
    fd.set("holiday_name", holidayName.trim());
    startTransition(async () => {
      const res = await createHolidayAction(fd);
      if (!res.ok) {
        setToast({ type: "error", msg: res.message });
        return;
      }
      const row = res.data as CollegeHolidayRow | undefined;
      if (row) setHolidays((prev) => [...prev, row].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)));
      setHolidayDate("");
      setHolidayName("");
      setToast({ type: "success", msg: res.message });
    });
  }

  async function onDeleteHoliday(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const res = await deleteHolidayAction(fd);
      if (!res.ok) {
        setToast({ type: "error", msg: res.message });
        return;
      }
      setHolidays((prev) => prev.filter((h) => h.id !== id));
      setToast({ type: "success", msg: "تم حذف العطلة." });
    });
  }

  async function onExportExcel() {
    const xlsx = await import("xlsx");
    const data = filteredRows.map((r) => ({
      "اسم الكلية / التشكيل": collegeLabel,
      "القسم / الفرع": r.college_subject_name,
      "نوع الجدول": SCHEDULE_TYPE_LABEL[r.schedule_type],
      "العام الدراسي": r.academic_year || "—",
      "الفصل الدراسي": r.term_label || "—",
      "المادة الدراسية": r.study_subject_name,
      "المرحلة": `المرحلة ${r.stage_level}`,
      "اليوم": weekdayAr(r.exam_date),
      "التاريخ": r.exam_date,
      "وقت الامتحان": timeRangeLabel(r.start_time, r.end_time),
      "مدة الامتحان": formatDuration(r.duration_minutes),
      "القاعة": r.room_name,
      "الملاحظات": r.notes || "",
      "الحالة": WORKFLOW_LABEL[r.workflow_status],
    }));
    const ws = xlsx.utils.json_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "ExamSchedules");
    xlsx.writeFile(wb, "exam-schedules.xlsx");
  }

  function onPrintPage() {
    const popup = window.open("", "_blank", "width=1200,height=900");
    if (!popup) return;
    const rowsHtml = filteredRows
      .map(
        (r, i) => `<tr>
      <td>${i + 1}</td><td>${collegeLabel}</td><td>${r.college_subject_name}</td><td>${SCHEDULE_TYPE_LABEL[r.schedule_type]}</td>
      <td>${r.study_subject_name}</td><td>المرحلة ${r.stage_level}</td><td>${weekdayAr(r.exam_date)}</td><td>${r.exam_date}</td>
      <td>${timeRangeLabel(r.start_time, r.end_time)}</td><td>${formatDuration(r.duration_minutes)}</td><td>${r.room_name}</td></tr>`
      )
      .join("");
    popup.document.write(`<html dir="rtl"><head><title>طباعة الجدول</title><style>
      body{font-family:Tahoma,Arial;padding:24px} table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #cbd5e1;padding:8px;font-size:12px;text-align:right} th{background:#f1f5f9}
      </style></head><body><h1>الجدول الامتحاني - ${collegeLabel}</h1>
      <table><thead><tr><th>#</th><th>الكلية</th><th>القسم</th><th>نوع الجدول</th><th>المادة</th><th>المرحلة</th><th>اليوم</th><th>التاريخ</th><th>الوقت</th><th>المدة</th><th>القاعة</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table></body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  async function onSubmitContext() {
    const fd = new FormData();
    fd.set("college_subject_id", form.collegeSubjectId);
    fd.set("schedule_type", form.scheduleType);
    fd.set("academic_year", form.academicYear.trim());
    fd.set("term_label", form.termLabel);
    startTransition(async () => {
      const res = await submitExamScheduleContextAction(fd);
      if (!res.ok) {
        setToast({ type: "error", msg: res.message });
        return;
      }
      const ay = form.academicYear.trim();
      setRows((prev) =>
        prev.map((r) =>
          r.college_subject_id === form.collegeSubjectId &&
          r.schedule_type === form.scheduleType &&
          (r.term_label ?? "") === (form.termLabel || "") &&
          (r.academic_year ?? "") === ay
            ? { ...r, workflow_status: "SUBMITTED" }
            : r
        )
      );
      setToast({ type: "success", msg: res.message });
    });
  }

  const calendarMeta = useMemo(() => {
    const daysInMonth = new Date(calendarCursor.year, calendarCursor.month + 1, 0).getDate();
    const firstDay = new Date(calendarCursor.year, calendarCursor.month, 1).getDay();
    const monthLabel = new Intl.DateTimeFormat("ar-IQ", { month: "long", year: "numeric" }).format(
      new Date(calendarCursor.year, calendarCursor.month, 1)
    );
    const map = new Map<string, number>();
    const submittedMap = new Map<string, number>();
    const holidayMap = new Map<string, string>();
    holidays.forEach((h) => holidayMap.set(h.holiday_date, h.holiday_name));
    rows.forEach((r) => {
      const d = new Date(r.exam_date);
      if (d.getFullYear() === calendarCursor.year && d.getMonth() === calendarCursor.month) {
        map.set(r.exam_date, (map.get(r.exam_date) ?? 0) + 1);
        if (r.workflow_status === "SUBMITTED" || r.workflow_status === "APPROVED") {
          submittedMap.set(r.exam_date, (submittedMap.get(r.exam_date) ?? 0) + 1);
        }
      }
    });
    return { daysInMonth, firstDay, monthLabel, map, submittedMap, holidayMap };
  }, [rows, holidays, calendarCursor]);

  const calendarCells = useMemo(() => {
    const cells: Array<{ iso: string | null; day: number | null }> = [];
    for (let i = 0; i < calendarMeta.firstDay; i++) cells.push({ iso: null, day: null });
    for (let d = 1; d <= calendarMeta.daysInMonth; d++) {
      const iso = `${calendarCursor.year}-${String(calendarCursor.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ iso, day: d });
    }
    return cells;
  }, [calendarMeta, calendarCursor]);

  const groupedPagedRows = useMemo(() => {
    const groups: Array<{ subjectId: string; subjectName: string; rows: typeof pagedRows }> = [];
    const map = new Map<string, number>();
    pagedRows.forEach((r) => {
      const idx = map.get(r.college_subject_id);
      if (idx == null) {
        map.set(r.college_subject_id, groups.length);
        groups.push({
          subjectId: r.college_subject_id,
          subjectName: r.college_subject_name,
          rows: [r],
        });
      } else {
        groups[idx].rows.push(r);
      }
    });
    return groups;
  }, [pagedRows]);

  return (
    <section className="space-y-6" dir="rtl">
      <header className="relative overflow-hidden rounded-[22px] border border-[#E8EEF7] bg-white px-6 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px]" style={{ background: "linear-gradient(90deg, #1E3A8A 0%, #2563EB 55%, #38BDF8 100%)" }} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold text-[#0F172A]">الجدول الامتحاني</h1>
            <p className="mt-1.5 text-sm text-[#64748B]">إدارة وتنظيم جداول الامتحانات النهائية والفصلية للأقسام والفروع</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setBuilderOpen(true);
                if (generalLocked && lockedGeneral) {
                  setForm({
                    ...emptyForm,
                    ...lockedGeneral,
                  });
                } else {
                  resetForm();
                }
              }}
              className="rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-bold text-white"
            >
              إضافة جدول امتحاني
            </button>
            <button
              type="button"
              onClick={onSubmitContext}
              disabled={mounted ? !form.collegeSubjectId || contextSubmitted || isPending : undefined}
              className="rounded-xl border border-[#1E3A8A] px-4 py-2 text-sm font-bold text-[#1E3A8A] disabled:opacity-60"
            >
              رفع الجدول إلى المتابعة
            </button>
            <button type="button" onClick={onPrintPage} className="rounded-xl border border-[#CBD5E1] px-4 py-2 text-sm">
              طباعة
            </button>
            <button type="button" onClick={onExportExcel} className="rounded-xl border border-[#CBD5E1] px-4 py-2 text-sm">
              تصدير
            </button>
            <button
              type="button"
              onClick={() => setHolidaysModalOpen(true)}
              className="rounded-xl border border-amber-300/80 bg-[#FFFBEB] px-4 py-2 text-sm font-semibold text-[#92400E] transition hover:bg-[#FEF3C7]"
            >
              إدارة العطل الجامعية
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#E5ECF6] bg-white px-4 py-3"><p className="text-xs text-[#64748B]">عدد الإدخالات الامتحانية</p><p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.entries}</p></div>
        <div className="rounded-2xl border border-[#E5ECF6] bg-white px-4 py-3"><p className="text-xs text-[#64748B]">عدد المواد المدرجة</p><p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.uniqueSubjects}</p></div>
        <div className="rounded-2xl border border-[#E5ECF6] bg-white px-4 py-3"><p className="text-xs text-[#64748B]">عدد القاعات المستخدمة</p><p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.uniqueRooms}</p></div>
        <div className="rounded-2xl border border-[#E5ECF6] bg-white px-4 py-3"><p className="text-xs text-[#64748B]">نوع الجدول الحالي</p><p className="mt-1 text-sm font-bold text-[#0F172A]">{stats.currentType}</p></div>
      </div>

      {builderOpen ? (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-[#E2E8F0] bg-white p-5 shadow-sm transition-shadow duration-200 hover:shadow-md">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#0F172A]">البيانات العامة للجدول</h2>
            {generalLocked ? (
              <button
                type="button"
                onClick={() => {
                  setGeneralLocked(false);
                  setLockedGeneral(null);
                }}
                className="rounded-lg border border-[#CBD5E1] px-3 py-1 text-xs"
              >
                تعديل البيانات العامة
              </button>
            ) : null}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-[#334155]">اسم الكلية أو التشكيل</label>
              <input readOnly value={collegeLabel} className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm text-[#475569]" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-[#334155]">اسم القسم / الفرع</label>
              <select value={form.collegeSubjectId} disabled={generalLocked} onChange={(e) => setForm((f) => ({ ...f, collegeSubjectId: e.target.value, studySubjectId: "" }))} className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm outline-none focus:border-blue-500 disabled:opacity-60">
                <option value="">اختر القسم/الفرع</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.branch_name} ({s.branch_type === "BRANCH" ? "فرع" : "قسم"})</option>)}
              </select>
            </div>
            <div className="sm:col-span-2 grid grid-cols-3 gap-2 sm:gap-4">
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-semibold text-[#334155]">نوع الجدول</label>
                <select value={form.scheduleType} disabled={generalLocked} onChange={(e) => setForm((f) => ({ ...f, scheduleType: e.target.value as ScheduleType }))} className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm outline-none focus:border-blue-500 disabled:opacity-60">
                  <option value="FINAL">جدول امتحانات نهائية</option>
                  <option value="SEMESTER">جدول امتحانات فصلية</option>
                </select>
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-semibold text-[#334155]">العام الدراسي</label>
                <input
                  value={form.academicYear}
                  disabled={generalLocked}
                  onChange={(e) => setForm((f) => ({ ...f, academicYear: e.target.value }))}
                  placeholder="مثال: 2024-2025"
                  className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm outline-none focus:border-blue-500 disabled:opacity-60"
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-semibold text-[#334155]">الفصل الدراسي</label>
                <select
                  value={form.termLabel}
                  disabled={generalLocked}
                  onChange={(e) => setForm((f) => ({ ...f, termLabel: e.target.value }))}
                  className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm outline-none focus:border-blue-500 disabled:opacity-60"
                >
                  <option value="">اختر الفصل</option>
                  <option value="الأول">الفصل الدراسي الأول</option>
                  <option value="الثاني">الفصل الدراسي الثاني</option>
                </select>
              </div>
            </div>
          </div>
          {generalLocked ? <p className="mt-3 text-xs text-emerald-700">تم تثبيت البيانات العامة. يمكنك إضافة مواد متعددة بدون إعادة تحديدها.</p> : null}
          {contextSubmitted ? <p className="mt-2 text-xs font-semibold text-amber-700">هذا الجدول مرفوع/معتمد (قراءة فقط).</p> : null}

          <h3 className="mt-6 border-t border-[#E2E8F0] pt-4 text-lg font-bold text-[#0F172A]">تفاصيل المادة الامتحانية</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-[#334155]">المادة الدراسية</label>
                <select
                  value={form.studySubjectId}
                  disabled={!form.collegeSubjectId}
                  onChange={(e) => setForm((f) => ({ ...f, studySubjectId: e.target.value }))}
                  className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm outline-none focus:border-blue-500 disabled:opacity-60"
                >
                  <option value="">{form.collegeSubjectId ? "اختر المادة الدراسية" : "اختر القسم/الفرع أولًا"}</option>
                  {availableStudySubjects.map((s) => <option key={s.id} value={s.id}>{s.subject_name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-[#334155]">المرحلة</label>
                <select
                  value={form.stageLevel}
                  onChange={(e) => setForm((f) => ({ ...f, stageLevel: e.target.value }))}
                  className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm outline-none focus:border-blue-500"
                >
                  <option value="">اختر المرحلة</option>
                  {stageOptions.map((s) => (
                    <option key={s} value={String(s)}>
                      المرحلة {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-[#334155]">تاريخ الامتحان</label>
              <input
                type="date"
                min={todayCalendarDateLocal()}
                value={form.examDate}
                onChange={(e) => setForm((f) => ({ ...f, examDate: e.target.value }))}
                className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm outline-none focus:border-blue-500"
              />
              {form.examDate ? <span className="mt-1 inline-flex rounded-full bg-[#EFF6FF] px-2 py-0.5 text-xs font-semibold text-[#1D4ED8]">{weekdayAr(form.examDate)}</span> : null}
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-[#334155]">القاعة الامتحانية</label>
              <select value={form.roomId} onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value }))} className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm outline-none focus:border-blue-500">
                <option value="">اختر القاعة</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {roomSelectOptionLabel(r)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-[#334155]">وقت الامتحان من</label>
              <div className="grid grid-cols-3 gap-2">
                <select value={startParts.hour12} onChange={(e) => patchStartTime({ hour12: e.target.value })} className="h-11 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-2 text-sm outline-none focus:border-blue-500">
                  {hours12.map((h) => <option key={`sh-${h}`} value={h}>{h}</option>)}
                </select>
                <select value={startParts.minute} onChange={(e) => patchStartTime({ minute: e.target.value })} className="h-11 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-2 text-sm outline-none focus:border-blue-500">
                  {minuteOptions.map((m) => <option key={`sm-${m}`} value={m}>{m}</option>)}
                </select>
                <select value={startParts.period} onChange={(e) => patchStartTime({ period: e.target.value as "AM" | "PM" })} className="h-11 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-2 text-sm outline-none focus:border-blue-500">
                  <option value="AM">ص</option>
                  <option value="PM">م</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-[#334155]">وقت الامتحان إلى</label>
              <div className="grid grid-cols-3 gap-2">
                <select value={endParts.hour12} onChange={(e) => patchEndTime({ hour12: e.target.value })} className="h-11 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-2 text-sm outline-none focus:border-blue-500">
                  {hours12.map((h) => <option key={`eh-${h}`} value={h}>{h}</option>)}
                </select>
                <select value={endParts.minute} onChange={(e) => patchEndTime({ minute: e.target.value })} className="h-11 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-2 text-sm outline-none focus:border-blue-500">
                  {minuteOptions.map((m) => <option key={`em-${m}`} value={m}>{m}</option>)}
                </select>
                <select value={endParts.period} onChange={(e) => patchEndTime({ period: e.target.value as "AM" | "PM" })} className="h-11 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-2 text-sm outline-none focus:border-blue-500">
                  <option value="AM">ص</option>
                  <option value="PM">م</option>
                </select>
              </div>
            </div>
            <div className="sm:col-span-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm text-[#334155]">
              مدة الامتحان: <span className="font-bold text-[#0F172A]">{formatDuration(durationMin)}</span>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-semibold text-[#334155]">ملاحظات</label>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setBuilderOpen(false);
                setForm(emptyForm);
              }}
              disabled={isPending}
              className="rounded-xl border border-[#CBD5E1] px-4 py-2 text-sm disabled:opacity-60"
            >
              إغلاق
            </button>
            <button type="button" onClick={resetForm} disabled={isPending} className="rounded-xl border border-[#CBD5E1] px-4 py-2 text-sm disabled:opacity-60">إعادة تعيين</button>
            <button type="button" onClick={onSubmitForm} disabled={isPending || contextSubmitted} className="rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
              {isPending ? "جاري المعالجة..." : form.id ? "حفظ التعديلات" : "إضافة إلى التقويم الامتحاني"}
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-[#E2E8F0] bg-white p-5 shadow-sm transition-shadow duration-200 hover:shadow-md">
          <h2 className="text-lg font-bold text-[#0F172A]">التقويم الامتحاني</h2>
          <p className="mt-1 text-xs text-[#64748B]">
            {SCHEDULE_TYPE_LABEL[form.scheduleType]} | {subjects.find((s) => s.id === form.collegeSubjectId)?.branch_name ?? "—"} | العام: {form.academicYear.trim() || "—"} | الفصل: {form.termLabel ? `الفصل ${form.termLabel}` : "—"}
          </p>
          <div className="mt-4 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() =>
                  setCalendarCursor((c) =>
                    c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }
                  )
                }
                className="rounded-lg border border-[#CBD5E1] bg-white px-2 py-1 text-xs"
              >
                السابق
              </button>
              <p className="text-sm font-bold text-[#0F172A]">{calendarMeta.monthLabel}</p>
              <button
                type="button"
                onClick={() =>
                  setCalendarCursor((c) =>
                    c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }
                  )
                }
                className="rounded-lg border border-[#CBD5E1] bg-white px-2 py-1 text-xs"
              >
                التالي
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[#64748B]">
              {["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"].map((d) => (
                <div key={d} className="py-1">{d}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {calendarCells.map((cell, idx) => {
                if (!cell.iso) return <div key={`e-${idx}`} className="h-16 rounded-lg bg-transparent" />;
                const dt = new Date(cell.iso);
                const weeklyHoliday = dt.getDay() === 5;
                const holidayName = calendarMeta.holidayMap.get(cell.iso);
                const isHoliday = weeklyHoliday || Boolean(holidayName);
                const examCount = calendarMeta.map.get(cell.iso) ?? 0;
                const submittedCount = calendarMeta.submittedMap.get(cell.iso) ?? 0;
                return (
                  <div key={cell.iso} className={`h-16 rounded-lg border px-1.5 py-1 text-right ${isHoliday ? "border-amber-200 bg-amber-50" : submittedCount > 0 ? "border-emerald-200 bg-emerald-50" : "border-[#E2E8F0] bg-white"}`}>
                    <button
                      type="button"
                      onClick={() => setSelectedCalendarDate(cell.iso)}
                      className="w-full text-right text-[11px] font-bold text-[#334155]"
                    >
                      {cell.day}
                    </button>
                    {isHoliday ? <p className="mt-0.5 text-[10px] text-amber-700">{holidayName ?? "عطلة"}</p> : null}
                    {examCount > 0 ? <p className="mt-0.5 text-[10px] font-semibold text-[#1D4ED8]">{examCount} امتحان</p> : null}
                    {submittedCount > 0 ? <p className="mt-0.5 text-[10px] font-semibold text-emerald-700">{submittedCount} مرفوع</p> : null}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {mappedRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-10 text-center">
                <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-white text-[#94A3B8] ring-1 ring-[#E2E8F0]">
                  <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3.75H15.75M9 3.75V2.25M15 3.75V2.25M4.5 8.25H19.5M5.25 5.25H18.75C19.371 5.25 19.875 5.754 19.875 6.375V18.75C19.875 19.371 19.371 19.875 18.75 19.875H5.25C4.629 19.875 4.125 19.371 4.125 18.75V6.375C4.125 5.754 4.629 5.25 5.25 5.25Z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-[#64748B]">لا توجد مواد مضافة إلى الجدول الامتحاني حتى الآن</p>
              </div>
            ) : (
              sortSchedules(rows).map((r) => (
                <article key={r.id} className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-[#0F172A]">{r.study_subject_name}</h4>
                      <p className="mt-0.5 text-xs text-[#64748B]">{weekdayAr(r.exam_date)} | {r.exam_date} | {timeRangeLabel(r.start_time, r.end_time)}</p>
                      <p className="mt-0.5 text-xs text-[#64748B]">المرحلة: {r.stage_level} | المدة: {formatDuration(r.duration_minutes)} | القاعة: {r.room_name}</p>
                      {r.notes ? <p className="mt-0.5 text-xs text-[#64748B]">ملاحظات: {r.notes}</p> : null}
                    </div>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => onEdit(r)} disabled={r.workflow_status === "SUBMITTED" || r.workflow_status === "APPROVED"} className="rounded-lg border border-[#CBD5E1] px-2 py-1 text-xs disabled:opacity-50">تعديل</button>
                      <button type="button" onClick={() => setDeleteId(r.id)} disabled={r.workflow_status === "SUBMITTED" || r.workflow_status === "APPROVED"} className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-50">حذف</button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[#CBD5E1] bg-white px-6 py-10 text-center">
          <p className="text-base font-semibold text-[#334155]">لبدء إنشاء الجدول الامتحاني اضغط على زر "إضافة جدول امتحاني".</p>
        </div>
      ) : null}

      <section className="rounded-3xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#0F172A]">التقويم الجامعي</h3>
            <p className="mt-1 text-xs text-[#64748B]">عرض عام لأيام الأسبوع والعطل وأيام الامتحانات المضافة.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setCalendarCursor((c) =>
                  c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }
                )
              }
              className="rounded-lg border border-[#CBD5E1] bg-white px-2 py-1 text-xs"
            >
              السابق
            </button>
            <p className="text-sm font-bold text-[#0F172A]">{calendarMeta.monthLabel}</p>
            <button
              type="button"
              onClick={() =>
                setCalendarCursor((c) =>
                  c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }
                )
              }
              className="rounded-lg border border-[#CBD5E1] bg-white px-2 py-1 text-xs"
            >
              التالي
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[#64748B]">
          {["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"].map((d) => (
            <div key={`global-${d}`} className="py-1">{d}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {calendarCells.map((cell, idx) => {
            if (!cell.iso) return <div key={`global-e-${idx}`} className="h-20 rounded-lg bg-transparent" />;
            const dt = new Date(cell.iso);
            const weeklyHoliday = dt.getDay() === 5;
            const holidayName = calendarMeta.holidayMap.get(cell.iso);
            const isHoliday = weeklyHoliday || Boolean(holidayName);
            const examCount = calendarMeta.map.get(cell.iso) ?? 0;
            const submittedCount = calendarMeta.submittedMap.get(cell.iso) ?? 0;
            return (
              <button key={`global-${cell.iso}`} type="button" onClick={() => setSelectedCalendarDate(cell.iso)} className={`h-20 rounded-lg border px-2 py-1.5 text-right ${isHoliday ? "border-amber-200 bg-amber-50" : submittedCount > 0 ? "border-emerald-200 bg-emerald-50" : "border-[#E2E8F0] bg-[#F8FAFC]"}`}>
                <p className="text-xs font-bold text-[#334155]">{cell.day}</p>
                {isHoliday ? <p className="mt-1 text-[11px] font-semibold text-amber-700">{holidayName ?? "عطلة"}</p> : null}
                {examCount > 0 ? <p className="mt-1 text-[11px] font-semibold text-[#1D4ED8]">{examCount} امتحان</p> : null}
                {submittedCount > 0 ? <p className="mt-1 text-[11px] font-semibold text-emerald-700">{submittedCount} مرفوع</p> : null}
              </button>
            );
          })}
        </div>
        {selectedCalendarDate ? (
          <div className="mt-4 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-bold text-[#0F172A]">امتحانات يوم {selectedCalendarDate}</h4>
              <button type="button" onClick={() => setSelectedCalendarDate(null)} className="rounded-lg border border-[#CBD5E1] px-2 py-1 text-xs">إغلاق</button>
            </div>
            <div className="space-y-2">
              {rows.filter((r) => r.exam_date === selectedCalendarDate).length === 0 ? (
                <p className="text-xs text-[#64748B]">لا توجد امتحانات في هذا اليوم.</p>
              ) : (
                rows
                  .filter((r) => r.exam_date === selectedCalendarDate)
                  .map((r) => (
                    <div key={`day-${r.id}`} className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs">
                      <p className="font-bold text-[#0F172A]">{r.study_subject_name}</p>
                      <p className="text-[#64748B]">{r.college_subject_name} | {r.room_name} | {timeRangeLabel(r.start_time, r.end_time)}</p>
                      <p className="text-[#64748B]">الحالة: {WORKFLOW_LABEL[r.workflow_status]}</p>
                    </div>
                  ))
              )}
            </div>
          </div>
        ) : null}
      </section>

      <dialog
        ref={holidaysDialogRef}
        className="fixed inset-0 z-[100] m-auto box-border h-fit max-h-[min(90vh,100dvh)] w-[min(96vw,520px)] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl border border-[#E2E8F0] bg-white p-0 shadow-xl [&::backdrop]:bg-black/40"
        dir="rtl"
        aria-labelledby="holidays-modal-title"
        onClose={() => setHolidaysModalOpen(false)}
      >
        <div className="border-b border-[#E2E8F0] bg-[#FFFBEB] px-5 py-4">
          <h3 id="holidays-modal-title" className="text-lg font-bold text-[#0F172A]">إدارة العطل الجامعية</h3>
          <p className="mt-1 text-xs text-[#64748B]">تظهر العطل المضافة في التقويم الجامعي وبناء الجدول الامتحاني.</p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#64748B]">تاريخ العطلة</label>
              <input
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                className="h-10 w-full rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#64748B]">اسم العطلة</label>
              <input
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
                placeholder="مثال: عيد الأضحى"
                className="h-10 w-full rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={onAddHoliday}
                disabled={isPending}
                className="h-10 w-full rounded-xl bg-[#1E3A8A] px-4 text-sm font-bold text-white disabled:opacity-60 sm:w-auto"
              >
                إضافة عطلة
              </button>
            </div>
          </div>
          <div className="max-h-[min(40vh,16rem)] space-y-2 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            {holidays.length === 0 ? (
              <p className="py-4 text-center text-sm text-[#64748B]">لا توجد عطلات مضافة.</p>
            ) : (
              holidays.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2">
                  <p className="min-w-0 text-sm text-[#334155]">
                    <span className="tabular-nums font-semibold text-[#0F172A]">{h.holiday_date}</span>
                    <span className="mx-2 text-[#CBD5E1]">|</span>
                    {h.holiday_name}
                  </p>
                  <button
                    type="button"
                    onClick={() => onDeleteHoliday(h.id)}
                    className="shrink-0 rounded-lg border border-red-200 px-2 py-1 text-xs text-red-700"
                  >
                    حذف
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="flex justify-end border-t border-[#E2E8F0] pt-4">
            <button
              type="button"
              onClick={() => setHolidaysModalOpen(false)}
              className="rounded-xl border border-[#CBD5E1] bg-white px-4 py-2 text-sm font-semibold text-[#334155] transition hover:bg-[#F8FAFC]"
            >
              إغلاق
            </button>
          </div>
        </div>
      </dialog>

      <section className="overflow-visible rounded-3xl border border-[#E2E8F0] bg-white shadow-sm">
        <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4">
          <h3 className="text-lg font-bold text-[#0F172A]">الجداول الامتحانية المضافة</h3>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث..." className="h-10 rounded-xl border border-[#CBD5E1] px-3 text-sm" />
            <select value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)} className="h-10 rounded-xl border border-[#CBD5E1] px-3 text-sm">
              <option value="ALL">فلتر القسم/الفرع</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.branch_name}</option>)}
            </select>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as "ALL" | ScheduleType)} className="h-10 rounded-xl border border-[#CBD5E1] px-3 text-sm">
              <option value="ALL">فلتر نوع الجدول</option>
              <option value="FINAL">نهائية</option>
              <option value="SEMESTER">فصلية</option>
            </select>
            <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="h-10 rounded-xl border border-[#CBD5E1] px-3 text-sm" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] border-collapse text-right">
            <thead className="sticky top-0 z-10 bg-[#F1F5F9]">
              <tr className="border-b border-[#E2E8F0]">
                <th className="px-3 py-3 text-xs font-bold text-[#334155]">التسلسل</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155]">اسم الكلية / التشكيل</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155]">القسم / الفرع</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155]">نوع الجدول</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155]">المادة الدراسية</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155]">المرحلة</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155]">اليوم</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155]">التاريخ</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155]">وقت الامتحان</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155]">مدة الامتحان</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155]">القاعة</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155]">الملاحظات</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155]">الحالة</th>
                <th className="px-3 py-3 text-xs font-bold text-[#334155]">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] bg-white">
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-12 text-center text-sm text-[#64748B]">
                    لا توجد بيانات مطابقة.
                  </td>
                </tr>
              ) : (
                groupedPagedRows.map((g) => (
                  <Fragment key={`wrap-${g.subjectId}`}>
                    <tr key={`g-${g.subjectId}`} className="bg-[#EEF2FF]">
                      <td colSpan={14} className="px-3 py-2 text-xs font-bold text-[#1E3A8A]">
                        جدول: {g.subjectName}
                      </td>
                    </tr>
                    {g.rows.map((r, i) => (
                      <tr key={r.id} className="hover:bg-[#F8FAFC]">
                        <td className="px-3 py-3 text-sm">{(safePage - 1) * pageSize + i + 1}</td>
                        <td className="px-3 py-3 text-sm">{collegeLabel}</td>
                        <td className="px-3 py-3 text-sm">{r.college_subject_name}</td>
                        <td className="px-3 py-3 text-sm">{SCHEDULE_TYPE_LABEL[r.schedule_type]}</td>
                    <td className="px-3 py-3 text-sm font-semibold text-[#0F172A]">{r.study_subject_name}</td>
                    <td className="px-3 py-3 text-sm">المرحلة {r.stage_level}</td>
                        <td className="px-3 py-3 text-sm">{weekdayAr(r.exam_date)}</td>
                        <td className="px-3 py-3 text-sm">{r.exam_date}</td>
                        <td className="px-3 py-3 text-sm">{timeRangeLabel(r.start_time, r.end_time)}</td>
                        <td className="px-3 py-3 text-sm">{formatDuration(r.duration_minutes)}</td>
                        <td className="px-3 py-3 text-sm">{r.room_name}</td>
                        <td className="max-w-[180px] truncate px-3 py-3 text-sm" title={r.notes ?? ""}>{r.notes || "—"}</td>
                    <td className="px-3 py-3 text-sm">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                        r.workflow_status === "APPROVED"
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300/50"
                          : r.workflow_status === "SUBMITTED"
                            ? "bg-sky-50 text-sky-700 ring-1 ring-sky-300/50"
                            : r.workflow_status === "REJECTED"
                              ? "bg-rose-50 text-rose-700 ring-1 ring-rose-300/50"
                              : "bg-amber-50 text-amber-700 ring-1 ring-amber-300/50"
                      }`}>
                        {WORKFLOW_LABEL[r.workflow_status]}
                      </span>
                    </td>
                        <td className="px-3 py-3 text-sm">
                          <div className="flex gap-1">
                            <button type="button" className="rounded-lg border border-[#CBD5E1] px-2 py-1 text-xs">عرض</button>
                            <button type="button" onClick={() => onEdit(r)} disabled={r.workflow_status === "SUBMITTED" || r.workflow_status === "APPROVED"} className="rounded-lg border border-[#CBD5E1] px-2 py-1 text-xs disabled:opacity-50">تعديل</button>
                            <button type="button" onClick={() => setDeleteId(r.id)} disabled={r.workflow_status === "SUBMITTED" || r.workflow_status === "APPROVED"} className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-50">حذف</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3">
          <p className="text-xs text-[#64748B]">عرض {(safePage - 1) * pageSize + (pagedRows.length ? 1 : 0)} - {(safePage - 1) * pageSize + pagedRows.length} من {filteredRows.length}</p>
          <div className="flex gap-1">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs disabled:opacity-50">السابق</button>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs disabled:opacity-50">التالي</button>
          </div>
        </div>
      </section>

      {deleteId ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-right">
            <h4 className="text-lg font-bold text-[#0F172A]">تأكيد الحذف</h4>
            <p className="mt-2 text-sm text-[#64748B]">هل أنت متأكد من حذف هذا الإدخال من الجدول الامتحاني؟</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteId(null)} disabled={isPending} className="rounded-xl border border-[#CBD5E1] px-4 py-2 text-sm disabled:opacity-60">إلغاء</button>
              <button type="button" onClick={onDeleteConfirmed} disabled={isPending} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                {isPending ? "جاري الحذف..." : "حذف"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className={`fixed bottom-6 left-1/2 z-[320] -translate-x-1/2 rounded-xl px-4 py-2 text-sm font-semibold shadow-lg ${toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      ) : null}
    </section>
  );
}
