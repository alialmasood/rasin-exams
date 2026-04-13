"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCollegeQuickActionsRegister, useCollegeQuickUrlTrigger } from "../college-quick-actions";
import { createPortal } from "react-dom";
import { useCollegePortalBasePath } from "@/components/dashboard/college-portal-base-path";
import type { CollegeSubjectRow } from "@/lib/college-subjects";
import { getCollegeStageLevelOptions } from "@/lib/college-stage-level";
import type { CollegeStudySubjectRow, StudyType } from "@/lib/college-study-subjects";
import {
  formatCollegeStudyLevelTierLabel,
  formatCollegeStudyStageLabel,
  isPostgraduateStudyStageLevel,
  POSTGRAD_STUDY_STAGE_DIPLOMA,
  POSTGRAD_STUDY_STAGE_DOCTOR,
  POSTGRAD_STUDY_STAGE_MASTER,
} from "@/lib/college-study-stage-display";
import {
  createCollegeStudySubjectAction,
  deleteCollegeStudySubjectAction,
  updateCollegeStudySubjectAction,
} from "./actions";

const STUDY_TYPE_LABEL: Record<StudyType, string> = {
  ANNUAL: "سنوي",
  SEMESTER: "فصلي",
  COURSES: "مقررات",
  BOLOGNA: "بولونيا",
  INTEGRATIVE: "تكاملي",
};

function studyTypeDisplayByStage(studyType: StudyType, studyStageLevel: number): string {
  // في الدراسات العليا لا يُعرض نوع الدراسة.
  if (isPostgraduateStudyStageLevel(studyStageLevel)) return "";
  return STUDY_TYPE_LABEL[studyType];
}

/** تمركز بصري: inset-0 + margin:auto + ارتفاع المحتوى؛ يُعرض عبر portal على body لتفادي سياق الـ RTL/التخطيط */
const STUDY_SUBJECT_MODAL_DIALOG_CLASS =
  "study-subject-modal-dialog fixed inset-0 z-[200] m-auto box-border h-max max-h-[90dvh] w-[min(92vw,560px)] overflow-y-auto rounded-2xl border border-[#E2E8F0] p-0 shadow-xl";

function useClientMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
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

type StudyTierUi = "UNDERGRAD" | "POSTGRAD";

function SubjectFormFields({
  branches,
  stageOptions,
  defaults,
  lockedCollegeSubjectId,
}: {
  branches: CollegeSubjectRow[];
  stageOptions: number[];
  defaults?: {
    collegeSubjectId?: string;
    subjectName?: string;
    instructorName?: string;
    studyType?: StudyType;
    studyStageLevel?: number;
  };
  /** بوابة القسم: القسم ثابت ولا يُختار من القائمة */
  lockedCollegeSubjectId?: string;
}) {
  const rawStage = defaults?.studyStageLevel ?? stageOptions[0] ?? 1;
  const initialTier: StudyTierUi =
    rawStage >= POSTGRAD_STUDY_STAGE_DIPLOMA && rawStage <= POSTGRAD_STUDY_STAGE_DOCTOR ? "POSTGRAD" : "UNDERGRAD";
  const initialUndergrad =
    initialTier === "UNDERGRAD" && stageOptions.includes(rawStage)
      ? String(rawStage)
      : String(stageOptions[0] ?? 1);
  const initialPostgrad =
    rawStage === POSTGRAD_STUDY_STAGE_DIPLOMA ||
    rawStage === POSTGRAD_STUDY_STAGE_MASTER ||
    rawStage === POSTGRAD_STUDY_STAGE_DOCTOR
      ? String(rawStage)
      : String(POSTGRAD_STUDY_STAGE_DIPLOMA);

  const [tier, setTier] = useState<StudyTierUi>(initialTier);
  const [undergradStage, setUndergradStage] = useState(initialUndergrad);
  const [postgradStage, setPostgradStage] = useState(initialPostgrad);
  const [studyType, setStudyType] = useState<StudyType>(defaults?.studyType ?? "ANNUAL");

  const hiddenStageValue = tier === "POSTGRAD" ? postgradStage : undergradStage;

  const lockedBranchMeta = lockedCollegeSubjectId
    ? branches.find((b) => b.id === lockedCollegeSubjectId)
    : undefined;

  return (
    <>
      <div>
        <label className="mb-1 block text-sm font-semibold text-[#334155]">القسم أو الفرع</label>
        {lockedCollegeSubjectId ? (
          <>
            <input type="hidden" name="college_subject_id" value={lockedCollegeSubjectId} />
            <div
              className="flex min-h-11 w-full items-center rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] px-3 text-sm text-[#334155]"
              aria-readonly
            >
              {lockedBranchMeta ? (
                <>
                  {lockedBranchMeta.branch_name}{" "}
                  <span className="text-[#64748B]">
                    ({lockedBranchMeta.branch_type === "BRANCH" ? "فرع" : "قسم"})
                  </span>
                </>
              ) : (
                <span className="text-[#64748B]">قسم حسابك الحالي</span>
              )}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[#64748B]">
              مرتبط بحساب القسم ضمن التشكيل؛ لا يُغيَّر من هذه الصفحة.
            </p>
          </>
        ) : (
          <select
            name="college_subject_id"
            required
            defaultValue={defaults?.collegeSubjectId ?? ""}
            className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
          >
            <option value="" disabled>
              اختر القسم/الفرع
            </option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.branch_name} ({b.branch_type === "BRANCH" ? "فرع" : "قسم"})
              </option>
            ))}
          </select>
        )}
      </div>

      <fieldset className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/80 px-3 py-3 sm:px-4">
        <legend className="px-1 text-sm font-semibold text-[#334155]">مستوى الدراسة</legend>
        <div className="mt-1 flex flex-wrap gap-4 sm:gap-6">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[#0F172A]">
            <input
              type="radio"
              className="size-4 accent-[#1E3A8A]"
              checked={tier === "UNDERGRAD"}
              onChange={() => {
                setTier("UNDERGRAD");
                const first = String(stageOptions[0] ?? 1);
                setUndergradStage((prev) => (stageOptions.includes(Number(prev)) ? prev : first));
              }}
            />
            الدراسة الأولية
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[#0F172A]">
            <input
              type="radio"
              className="size-4 accent-[#1E3A8A]"
              checked={tier === "POSTGRAD"}
              onChange={() => setTier("POSTGRAD")}
            />
            الدراسات العليا
          </label>
        </div>
      </fieldset>

      <input type="hidden" name="study_stage_level" value={hiddenStageValue} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        <div>
          <label className="mb-1 block text-sm font-semibold text-[#334155]">اسم المادة الدراسية</label>
          <input
            name="subject_name"
            required
            minLength={2}
            maxLength={220}
            defaultValue={defaults?.subjectName ?? ""}
            className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
          />
        </div>
        {tier === "UNDERGRAD" ? (
          <div>
            <label className="mb-1 block text-sm font-semibold text-[#334155]">المرحلة الدراسية</label>
            <select
              required
              value={undergradStage}
              onChange={(e) => setUndergradStage(e.target.value)}
              className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
            >
              {stageOptions.map((s) => (
                <option key={s} value={String(s)}>
                  المرحلة {s}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-sm font-semibold text-[#334155]">المرحلة الدراسية</label>
            <select
              required
              value={postgradStage}
              onChange={(e) => setPostgradStage(e.target.value)}
              className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
            >
              <option value={String(POSTGRAD_STUDY_STAGE_DIPLOMA)}>دبلوم</option>
              <option value={String(POSTGRAD_STUDY_STAGE_MASTER)}>ماجستير</option>
              <option value={String(POSTGRAD_STUDY_STAGE_DOCTOR)}>دكتوراه</option>
            </select>
          </div>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold text-[#334155]">اسم التدريسي</label>
        <input
          name="instructor_name"
          maxLength={200}
          defaultValue={defaults?.instructorName ?? ""}
          placeholder="يمكن تركه فارغًا"
          className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
        />
      </div>
      <input type="hidden" name="study_type" value={studyType} />
      {tier === "UNDERGRAD" ? (
        <div>
          <label className="mb-1 block text-sm font-semibold text-[#334155]">نوع الدراسة</label>
          <select
            value={studyType}
            onChange={(e) => setStudyType(e.target.value as StudyType)}
            className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
          >
            <option value="ANNUAL">سنوي</option>
            <option value="SEMESTER">فصلي</option>
            <option value="COURSES">مقررات</option>
            <option value="BOLOGNA">بولونيا</option>
            <option value="INTEGRATIVE">تكاملي</option>
          </select>
        </div>
      ) : null}
    </>
  );
}

function AddStudySubjectDialog({
  open,
  onClose,
  branches,
  stageOptions,
  lockedCollegeSubjectId,
}: {
  open: boolean;
  onClose: () => void;
  branches: CollegeSubjectRow[];
  stageOptions: number[];
  lockedCollegeSubjectId?: string;
}) {
  const [state, formAction, pending] = useActionState(createCollegeStudySubjectAction, null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const successHandledRef = useRef(false);
  const mounted = useClientMounted();

  useEffect(() => {
    if (!mounted || !dialogRef.current) return;
    if (open && !dialogRef.current.open) dialogRef.current.showModal();
    if (!open && dialogRef.current.open) dialogRef.current.close();
  }, [open, mounted]);

  useEffect(() => {
    if (!state?.ok || successHandledRef.current) return;
    successHandledRef.current = true;
    onClose();
  }, [state, onClose]);

  if (!mounted) return null;

  return createPortal(
    <dialog ref={dialogRef} className={STUDY_SUBJECT_MODAL_DIALOG_CLASS} dir="rtl">
      <form action={formAction} className="w-full space-y-4 p-6">
        <h2 className="text-xl font-bold text-[#0F172A]">إضافة مادة دراسية</h2>
        <SubjectFormFields
          branches={branches}
          stageOptions={stageOptions}
          lockedCollegeSubjectId={lockedCollegeSubjectId}
        />
        {state && !state.ok ? <p className="text-sm font-semibold text-red-600">{state.message}</p> : null}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button type="button" className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm text-[#64748B]" onClick={onClose}>
            إلغاء
          </button>
          <SubmitButton pending={pending} label="حفظ المادة" />
        </div>
      </form>
    </dialog>,
    document.body
  );
}

function EditStudySubjectDialog({
  row,
  open,
  onClose,
  branches,
  stageOptions,
  lockedCollegeSubjectId,
}: {
  row: CollegeStudySubjectRow | null;
  open: boolean;
  onClose: () => void;
  branches: CollegeSubjectRow[];
  stageOptions: number[];
  lockedCollegeSubjectId?: string;
}) {
  const [state, formAction, pending] = useActionState(updateCollegeStudySubjectAction, null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const successHandledRef = useRef(false);
  const key = useMemo(() => `${row?.id ?? "none"}-${open ? "open" : "closed"}`, [row?.id, open]);
  const mounted = useClientMounted();

  useEffect(() => {
    if (!mounted || !dialogRef.current) return;
    if (open && !dialogRef.current.open) dialogRef.current.showModal();
    if (!open && dialogRef.current.open) dialogRef.current.close();
  }, [open, mounted]);

  useEffect(() => {
    if (!state?.ok || successHandledRef.current) return;
    successHandledRef.current = true;
    onClose();
  }, [state, onClose]);

  if (!mounted) return null;

  return createPortal(
    <dialog ref={dialogRef} className={STUDY_SUBJECT_MODAL_DIALOG_CLASS} dir="rtl">
      <form key={key} action={formAction} className="w-full space-y-4 p-6">
        <h2 className="text-xl font-bold text-[#0F172A]">تعديل مادة دراسية</h2>
        <input type="hidden" name="id" value={row?.id ?? ""} />
        <SubjectFormFields
          branches={branches}
          stageOptions={stageOptions}
          lockedCollegeSubjectId={lockedCollegeSubjectId}
          defaults={{
            collegeSubjectId: row?.college_subject_id,
            subjectName: row?.subject_name,
            instructorName: row?.instructor_name,
            studyType: row?.study_type,
            studyStageLevel: row?.study_stage_level,
          }}
        />
        {state && !state.ok ? <p className="text-sm font-semibold text-red-600">{state.message}</p> : null}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button type="button" className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm text-[#64748B]" onClick={onClose}>
            إلغاء
          </button>
          <SubmitButton pending={pending} label="حفظ التعديلات" />
        </div>
      </form>
    </dialog>,
    document.body
  );
}

function DeleteStudySubjectForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(deleteCollegeStudySubjectAction, null);
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

export function StudySubjectsPanel({
  collegeLabel,
  branches,
  rows,
  /** عند `/department/...` يُثبَّت القسم ويُخفى اختيار قسم آخر */
  fixedCollegeSubjectId = null,
}: {
  collegeLabel: string;
  branches: CollegeSubjectRow[];
  rows: CollegeStudySubjectRow[];
  fixedCollegeSubjectId?: string | null;
}) {
  const portalBase = useCollegePortalBasePath();
  const hideAddStudySubjectButton = portalBase === "/dashboard/college";
  const hideActionsColumn = portalBase === "/dashboard/college";
  const departmentSubjectsScope = Boolean(fixedCollegeSubjectId?.trim());
  const stageOptions = useMemo(() => getCollegeStageLevelOptions(collegeLabel), [collegeLabel]);
  const [addOpen, setAddOpen] = useState(false);
  const [addDialogNonce, setAddDialogNonce] = useState(0);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<CollegeStudySubjectRow | null>(null);
  const editStageOptions = useMemo(() => {
    const lv = editingRow?.study_stage_level;
    if (lv == null) return stageOptions;
    if (stageOptions.includes(lv)) return stageOptions;
    return [...stageOptions, lv].sort((a, b) => a - b);
  }, [editingRow?.study_stage_level, stageOptions]);
  const [query, setQuery] = useState("");
  const [filterStudyType, setFilterStudyType] = useState<"ALL" | StudyType>("ALL");
  const [filterBranch, setFilterBranch] = useState<"ALL" | "DEPARTMENT" | "BRANCH">("ALL");
  /** عرض مواد قسم/فرع محدد */
  const [filterCollegeSubjectId, setFilterCollegeSubjectId] = useState<"ALL" | string>(() =>
    fixedCollegeSubjectId?.trim() ? fixedCollegeSubjectId.trim() : "ALL"
  );
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const byQuery =
        normalizedQuery.length === 0
          ? true
          : row.subject_name.toLowerCase().includes(normalizedQuery) ||
            row.linked_branch_name.toLowerCase().includes(normalizedQuery);
      const byStudyType = filterStudyType === "ALL" ? true : row.study_type === filterStudyType;
      const byBranchType = filterBranch === "ALL" ? true : row.linked_branch_type === filterBranch;
      const byCollegeSubject =
        filterCollegeSubjectId === "ALL" ? true : row.college_subject_id === filterCollegeSubjectId;
      return byQuery && byStudyType && byBranchType && byCollegeSubject;
    });
  }, [rows, normalizedQuery, filterStudyType, filterBranch, filterCollegeSubjectId]);

  useEffect(() => {
    setPage(1);
  }, [query, filterStudyType, filterBranch, filterCollegeSubjectId]);

  useEffect(() => {
    const fid = fixedCollegeSubjectId?.trim();
    if (fid) {
      setFilterCollegeSubjectId(fid);
      setFilterBranch("ALL");
      return;
    }
    if (filterCollegeSubjectId === "ALL") return;
    if (!branches.some((b) => b.id === filterCollegeSubjectId)) {
      setFilterCollegeSubjectId("ALL");
    }
  }, [branches, filterCollegeSubjectId, fixedCollegeSubjectId]);

  const branchesSortedForFilter = useMemo(
    () => [...branches].sort((a, b) => a.branch_name.localeCompare(b.branch_name, "ar")),
    [branches]
  );

  const closeAddDialog = useCallback(() => setAddOpen(false), []);
  const closeEditDialog = useCallback(() => setEditingRow(null), []);

  const openAddStudySubjectFromFab = useCallback(() => {
    setAddDialogNonce((n) => n + 1);
    setAddOpen(true);
  }, []);
  useCollegeQuickActionsRegister({ openAddStudySubject: openAddStudySubjectFromFab }, [openAddStudySubjectFromFab]);
  useCollegeQuickUrlTrigger("study-subject", openAddStudySubjectFromFab);

  const stats = useMemo(() => {
    const totalSubjects = rows.length;
    const annual = rows.filter((r) => r.study_type === "ANNUAL").length;
    const semester = rows.filter((r) => r.study_type === "SEMESTER").length;
    const courses = rows.filter((r) => r.study_type === "COURSES").length;
    const bologna = rows.filter((r) => r.study_type === "BOLOGNA").length;
    const integrative = rows.filter((r) => r.study_type === "INTEGRATIVE").length;
    const latest = rows
      .map((r) => new Date(r.created_at))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return { totalSubjects, annual, semester, courses, bologna, integrative, latest };
  }, [rows]);

  const tierStats = useMemo(() => {
    let undergradCount = 0;
    let postgradTotal = 0;
    let diploma = 0;
    let master = 0;
    let doctor = 0;
    for (const r of rows) {
      const lv = r.study_stage_level;
      if (isPostgraduateStudyStageLevel(lv)) {
        postgradTotal += 1;
        if (lv === POSTGRAD_STUDY_STAGE_DIPLOMA) diploma += 1;
        else if (lv === POSTGRAD_STUDY_STAGE_MASTER) master += 1;
        else if (lv === POSTGRAD_STUDY_STAGE_DOCTOR) doctor += 1;
      } else {
        undergradCount += 1;
      }
    }
    return { undergradCount, postgradTotal, diploma, master, doctor };
  }, [rows]);

  const latestAddedText = useMemo(() => {
    if (!stats.latest) return "—";
    return new Intl.DateTimeFormat("ar-IQ", { dateStyle: "medium", timeStyle: "short" }).format(stats.latest);
  }, [stats.latest]);

  const exportCsv = () => {
    const header = [
      "المادة الدراسية",
      "القسم/الفرع",
      "اسم التدريسي",
      "المستوى الدراسي",
      "نوع الدراسة",
      "المرحلة الدراسية",
      "تاريخ الإضافة",
    ];
    const lines = filteredRows.map((row) => [
      row.subject_name,
      `${row.linked_branch_name} (${row.linked_branch_type === "BRANCH" ? "فرع" : "قسم"})`,
      row.instructor_name || "—",
      formatCollegeStudyLevelTierLabel(row.study_stage_level),
      studyTypeDisplayByStage(row.study_type, row.study_stage_level),
      formatCollegeStudyStageLabel(row.study_stage_level),
      new Intl.DateTimeFormat("ar-IQ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.created_at)),
    ]);
    const csv = [header, ...lines]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "college-study-subjects.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage]);

  /** عدد المواد الدراسية لكل قسم/فرع (حسب كل السجلات وليس المصفاة) */
  const studyCountByCollegeSubjectId = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      m.set(r.college_subject_id, (m.get(r.college_subject_id) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  const branchSummaryRows = useMemo(() => {
    return [...branches]
      .sort((a, b) => a.branch_name.localeCompare(b.branch_name, "ar"))
      .map((b) => ({
        id: b.id,
        branchName: b.branch_name,
        branchType: b.branch_type,
        count: studyCountByCollegeSubjectId.get(b.id) ?? 0,
      }));
  }, [branches, studyCountByCollegeSubjectId]);

  return (
    <section className="space-y-6" dir="rtl">
      <header className="relative overflow-hidden rounded-[22px] border border-[#E8EEF7] bg-white px-6 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
          style={{ background: "linear-gradient(90deg, #1E3A8A 0%, #2563EB 55%, #38BDF8 100%)" }}
          aria-hidden
        />
        <h1 className="text-3xl font-extrabold text-[#0F172A]">المواد الدراسية</h1>
        <p className="mt-1.5 text-sm leading-6 text-[#64748B]">
          إدارة المواد الدراسية وربط كل مادة بالقسم أو الفرع مع تحديد نوع الدراسة ومستواها (الدراسة الأولية أو الدراسات
          العليا).
        </p>
      </header>

      <div className="overflow-visible rounded-3xl border border-[#E2E8F0] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1f3578] bg-[#274092] px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {!hideAddStudySubjectButton ? (
              <button
                type="button"
                onClick={openAddStudySubjectFromFab}
                className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#274092] shadow-sm ring-1 ring-white/60 transition hover:bg-white/95"
              >
                إضافة مادة دراسية
              </button>
            ) : null}
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-xl border border-white/45 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-[2px] transition hover:border-white/60 hover:bg-white/20"
            >
              تصدير
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                departmentSubjectsScope
                  ? "ابحث باسم المادة أو التدريسي"
                  : "ابحث باسم المادة أو القسم أو التدريسي"
              }
              className="h-10 w-[250px] rounded-xl border border-white/25 bg-white/95 px-3 text-sm text-[#0F172A] outline-none placeholder:text-[#64748B] focus:border-amber-400/90 focus:ring-2 focus:ring-amber-400/25"
            />
            <select
              value={filterStudyType}
              onChange={(e) => setFilterStudyType(e.target.value as "ALL" | StudyType)}
              className="h-10 rounded-xl border border-white/25 bg-white/95 px-3 text-sm text-[#0F172A] outline-none focus:border-amber-400/90 focus:ring-2 focus:ring-amber-400/25"
            >
              <option value="ALL">كل أنواع الدراسة</option>
              <option value="ANNUAL">سنوي</option>
              <option value="SEMESTER">فصلي</option>
              <option value="COURSES">مقررات</option>
              <option value="BOLOGNA">بولونيا</option>
              <option value="INTEGRATIVE">تكاملي</option>
            </select>
            {departmentSubjectsScope ? null : (
              <select
                value={filterBranch}
                onChange={(e) => setFilterBranch(e.target.value as "ALL" | "DEPARTMENT" | "BRANCH")}
                className="h-10 rounded-xl border border-white/25 bg-white/95 px-3 text-sm text-[#0F172A] outline-none focus:border-amber-400/90 focus:ring-2 focus:ring-amber-400/25"
              >
                <option value="ALL">الكل</option>
                <option value="DEPARTMENT">الأقسام</option>
                <option value="BRANCH">الفروع</option>
              </select>
            )}
            {departmentSubjectsScope ? null : (
              <select
                value={filterCollegeSubjectId}
                onChange={(e) => setFilterCollegeSubjectId(e.target.value === "ALL" ? "ALL" : e.target.value)}
                aria-label="العرض حسب القسم أو الفرع"
                className="h-10 min-w-[12rem] max-w-[min(280px,42vw)] rounded-xl border border-white/25 bg-white/95 px-3 text-sm text-[#0F172A] outline-none focus:border-amber-400/90 focus:ring-2 focus:ring-amber-400/25"
              >
                <option value="ALL">العرض حسب القسم — الكل</option>
                {branchesSortedForFilter.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.branch_name} ({b.branch_type === "BRANCH" ? "فرع" : "قسم"})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-[#E2E8F0] bg-white px-5 py-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs text-[#64748B]">إجمالي المواد</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.totalSubjects}</p>
          </div>
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs text-[#64748B]">مواد سنوية</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.annual}</p>
          </div>
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs text-[#64748B]">مواد فصلية</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.semester}</p>
          </div>
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs text-[#64748B]">مقررات</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.courses}</p>
          </div>
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs text-[#64748B]">بولونيا</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.bologna}</p>
          </div>
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs text-[#64748B]">تكاملي</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.integrative}</p>
          </div>
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs text-[#64748B]">آخر إضافة</p>
            <p className="mt-1 text-sm font-bold text-[#0F172A]">{latestAddedText}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-[#E2E8F0] bg-gradient-to-l from-[#F0FDFA]/90 to-white px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl border border-[#99F6E4]/80 bg-white/90 px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold text-[#0F766E]">الدراسة الأولية</p>
            <p className="mt-1 text-2xl font-extrabold text-[#0D9488]">{tierStats.undergradCount}</p>
            <p className="mt-0.5 text-[11px] text-[#64748B]">مواد مرحلة رقمية (1–10)</p>
          </div>
          <div className="rounded-2xl border border-[#A5B4FC]/90 bg-white/90 px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold text-[#3730A3]">الدراسات العليا (الإجمالي)</p>
            <p className="mt-1 text-2xl font-extrabold text-[#4338CA]">{tierStats.postgradTotal}</p>
            <p className="mt-0.5 text-[11px] text-[#64748B]">دبلوم + ماجستير + دكتوراه</p>
          </div>
          <div className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold text-[#B45309]">عليا — دبلوم</p>
            <p className="mt-1 text-2xl font-extrabold text-[#D97706]">{tierStats.diploma}</p>
          </div>
          <div className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold text-[#1E40AF]">عليا — ماجستير</p>
            <p className="mt-1 text-2xl font-extrabold text-[#2563EB]">{tierStats.master}</p>
          </div>
          <div className="rounded-2xl border border-[#E9D5FF] bg-[#FAF5FF] px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold text-[#6B21A8]">عليا — دكتوراه</p>
            <p className="mt-1 text-2xl font-extrabold text-[#7C3AED]">{tierStats.doctor}</p>
          </div>
        </div>

        <table className="w-full border-collapse text-right">
          <thead className="bg-[#F1F5F9]">
            <tr className="border-b border-[#E2E8F0]">
              <th className="px-4 py-3 text-sm font-bold text-[#334155]">#</th>
              <th className="px-4 py-3 text-sm font-bold text-[#334155]">المادة الدراسية</th>
              {departmentSubjectsScope ? null : (
                <th className="px-4 py-3 text-sm font-bold text-[#334155]">القسم/الفرع</th>
              )}
              <th className="px-4 py-3 text-sm font-bold text-[#334155]">اسم التدريسي</th>
              <th className="px-4 py-3 text-sm font-bold text-[#334155]">المستوى الدراسي</th>
              <th className="px-4 py-3 text-sm font-bold text-[#334155]">نوع الدراسة</th>
              <th className="px-4 py-3 text-sm font-bold text-[#334155]">المرحلة الدراسية</th>
              <th className="px-4 py-3 text-sm font-bold text-[#334155]">تاريخ الإضافة</th>
              {!hideActionsColumn ? (
                <th className="px-4 py-3 text-sm font-bold text-[#334155]">إجراءات</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0] bg-white">
            {pagedRows.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-10 text-center text-sm text-[#64748B]"
                  colSpan={departmentSubjectsScope ? 8 : hideActionsColumn ? 8 : 9}
                >
                  لا توجد مواد دراسية بعد.
                </td>
              </tr>
            ) : (
              pagedRows.map((row, index) => (
                <tr key={row.id} className="hover:bg-[#F8FAFC]">
                  <td className="px-4 py-3 text-sm text-[#334155]">{(safePage - 1) * pageSize + index + 1}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-[#0F172A]">{row.subject_name}</td>
                  {departmentSubjectsScope ? null : (
                    <td className="px-4 py-3 text-sm text-[#334155]">
                      {row.linked_branch_name} ({row.linked_branch_type === "BRANCH" ? "فرع" : "قسم"})
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm text-[#334155]">{row.instructor_name.trim() ? row.instructor_name : "—"}</td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        isPostgraduateStudyStageLevel(row.study_stage_level)
                          ? "bg-[#EEF2FF] text-[#4338CA] ring-1 ring-[#A5B4FC]/60"
                          : "bg-[#F0FDFA] text-[#0F766E] ring-1 ring-[#99F6E4]/80"
                      }`}
                    >
                      {formatCollegeStudyLevelTierLabel(row.study_stage_level)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#334155]">
                    {studyTypeDisplayByStage(row.study_type, row.study_stage_level)}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#334155]">
                    {formatCollegeStudyStageLabel(row.study_stage_level)}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#64748B]">
                    {new Intl.DateTimeFormat("ar-IQ", { dateStyle: "medium", timeStyle: "short" }).format(
                      new Date(row.created_at)
                    )}
                  </td>
                  {!hideActionsColumn ? (
                    <td className="relative px-4 py-3 text-left">
                      <button
                        type="button"
                        aria-label="إجراءات"
                        className="rounded-lg p-2 text-[#64748B] transition hover:bg-[#F1F5F9]"
                        onClick={() => setMenuId((s) => (s === row.id ? null : row.id))}
                      >
                        <svg className="size-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <circle cx="12" cy="5" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="12" cy="19" r="2" />
                        </svg>
                      </button>
                      {menuId === row.id ? (
                        <div className="absolute left-4 top-12 z-30 w-40 rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-lg">
                          <button
                            type="button"
                            className="block w-full rounded-lg px-3 py-2 text-right text-sm text-[#0F172A] transition hover:bg-[#F8FAFC]"
                            onClick={() => {
                              setEditingRow(row);
                              setMenuId(null);
                            }}
                          >
                            تعديل
                          </button>
                          <DeleteStudySubjectForm id={row.id} />
                        </div>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3.5">
          <p className="text-xs font-medium text-[#64748B]">
            عرض {(safePage - 1) * pageSize + (pagedRows.length > 0 ? 1 : 0)} - {(safePage - 1) * pageSize + pagedRows.length} من{" "}
            {filteredRows.length}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-1.5 text-sm text-[#334155] disabled:opacity-50"
            >
              السابق
            </button>
            {Array.from({ length: totalPages }).slice(0, 6).map((_, i) => {
              const n = i + 1;
              const active = n === safePage;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                    active
                      ? "bg-[#1E3A8A] text-white"
                      : "border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F1F5F9]"
                  }`}
                >
                  {n}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-1.5 text-sm text-[#334155] disabled:opacity-50"
            >
              التالي
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-visible rounded-3xl border border-[#E2E8F0] bg-white shadow-sm">
        <div className="border-b border-[#1f3578] bg-[#274092] px-5 py-4">
          <h2 className="text-base font-bold text-white">
            {departmentSubjectsScope
              ? "عدد المواد المضافة في القسم او الفرع"
              : "عدد المواد المضافة حسب القسم أو الفرع"}
          </h2>
        </div>
        <table className="w-full border-collapse text-right">
          <thead className="bg-[#F1F5F9]">
            <tr className="border-b border-[#E2E8F0]">
              {departmentSubjectsScope ? (
                <th className="px-4 py-3 text-sm font-bold text-[#334155]">عدد المواد المضافة</th>
              ) : (
                <>
                  <th className="px-4 py-3 text-sm font-bold text-[#334155]">#</th>
                  <th className="px-4 py-3 text-sm font-bold text-[#334155]">اسم القسم أو الفرع</th>
                  <th className="px-4 py-3 text-sm font-bold text-[#334155]">عدد المواد المضافة</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0] bg-white">
            {branchSummaryRows.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-10 text-center text-sm text-[#64748B]"
                  colSpan={departmentSubjectsScope ? 1 : 3}
                >
                  لا توجد أقسام أو فروع معرّفة. أضف أقساماً من صفحة «الأقسام والفروع» أولاً.
                </td>
              </tr>
            ) : departmentSubjectsScope ? (
              <tr className="hover:bg-[#F8FAFC]">
                <td className="px-4 py-6 text-center text-3xl font-extrabold tabular-nums text-[#1E3A8A]">
                  {stats.totalSubjects}
                </td>
              </tr>
            ) : (
              branchSummaryRows.map((b, index) => (
                <tr key={b.id} className="hover:bg-[#F8FAFC]">
                  <td className="px-4 py-3 text-sm text-[#334155]">{index + 1}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-[#0F172A]">
                    {b.branchName}{" "}
                    <span className="font-normal text-[#64748B]">
                      ({b.branchType === "BRANCH" ? "فرع" : "قسم"})
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums text-[#334155]">{b.count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {addOpen ? (
        <AddStudySubjectDialog
          key={addDialogNonce}
          open
          onClose={closeAddDialog}
          branches={branches}
          stageOptions={stageOptions}
          lockedCollegeSubjectId={fixedCollegeSubjectId?.trim() || undefined}
        />
      ) : null}
      {editingRow ? (
        <EditStudySubjectDialog
          key={editingRow.id}
          row={editingRow}
          open
          onClose={closeEditDialog}
          branches={branches}
          stageOptions={editStageOptions}
          lockedCollegeSubjectId={fixedCollegeSubjectId?.trim() || undefined}
        />
      ) : null}
    </section>
  );
}
