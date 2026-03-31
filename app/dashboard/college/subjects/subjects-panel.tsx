"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCollegeQuickActionsRegister, useCollegeQuickUrlTrigger } from "../college-quick-actions";
import { createPortal } from "react-dom";
import type { CollegeSubjectRow, CollegeSubjectUsageRow } from "@/lib/college-subjects";
import {
  buildCollegeSubjectsReportHtml,
  printCollegeSubjectsReportHtml,
} from "@/lib/college-subjects-report-html";
import {
  createCollegeSubjectAction,
  deleteCollegeSubjectAction,
  updateCollegeSubjectAction,
} from "./actions";

const COLLEGE_BRANCH_MODAL_DIALOG_CLASS =
  "college-branch-modal-dialog fixed inset-0 z-[200] m-auto box-border h-max max-h-[90dvh] w-[min(92vw,520px)] overflow-y-auto rounded-2xl border border-[#E2E8F0] p-0 shadow-xl";

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

function AddBranchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createCollegeSubjectAction, null);
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
    router.refresh();
  }, [state, onClose, router]);

  if (!mounted) return null;

  return createPortal(
    <dialog ref={dialogRef} className={COLLEGE_BRANCH_MODAL_DIALOG_CLASS} dir="rtl">
      <form action={formAction} className="w-full space-y-4 p-6">
        <h2 className="text-xl font-bold text-[#0F172A]">ادخال القسم او الفرع</h2>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[#334155]">النوع</label>
          <select
            name="branch_type"
            defaultValue="DEPARTMENT"
            className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
          >
            <option value="DEPARTMENT">قسم</option>
            <option value="BRANCH">فرع</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[#334155]">اسم القسم او الفرع</label>
          <input
            name="branch_name"
            required
            minLength={2}
            maxLength={200}
            className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[#334155]">اسم رئيس القسم</label>
          <input
            name="branch_head_name"
            required
            minLength={2}
            maxLength={200}
            className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
          />
        </div>
        {state && !state.ok ? <p className="text-sm font-semibold text-red-600">{state.message}</p> : null}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm font-semibold text-[#64748B]"
            onClick={onClose}
          >
            إلغاء
          </button>
          <SubmitButton pending={pending} label="حفظ" />
        </div>
      </form>
    </dialog>,
    document.body
  );
}

function EditBranchDialog({
  row,
  open,
  onClose,
}: {
  row: CollegeSubjectRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateCollegeSubjectAction, null);
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
    router.refresh();
  }, [state, onClose, router]);

  if (!mounted) return null;

  return createPortal(
    <dialog ref={dialogRef} className={COLLEGE_BRANCH_MODAL_DIALOG_CLASS} dir="rtl">
      <form key={key} action={formAction} className="w-full space-y-4 p-6">
        <h2 className="text-xl font-bold text-[#0F172A]">تعديل القسم او الفرع</h2>
        <input type="hidden" name="id" value={row?.id ?? ""} />
        <div>
          <label className="mb-1 block text-sm font-semibold text-[#334155]">النوع</label>
          <select
            name="branch_type"
            defaultValue={row?.branch_type ?? "DEPARTMENT"}
            className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
          >
            <option value="DEPARTMENT">قسم</option>
            <option value="BRANCH">فرع</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[#334155]">اسم القسم او الفرع</label>
          <input
            name="branch_name"
            required
            minLength={2}
            maxLength={200}
            defaultValue={row?.branch_name ?? ""}
            className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[#334155]">اسم رئيس القسم</label>
          <input
            name="branch_head_name"
            required
            minLength={2}
            maxLength={200}
            defaultValue={row?.branch_head_name ?? ""}
            className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
          />
        </div>
        {state && !state.ok ? <p className="text-sm font-semibold text-red-600">{state.message}</p> : null}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm font-semibold text-[#64748B]"
            onClick={onClose}
          >
            إلغاء
          </button>
          <SubmitButton pending={pending} label="حفظ التعديلات" />
        </div>
      </form>
    </dialog>,
    document.body
  );
}

function DeleteBranchForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(deleteCollegeSubjectAction, null);
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

export function SubjectsPanel({
  rows,
  usageRows = [],
  collegeLabel,
}: {
  rows: CollegeSubjectRow[];
  usageRows?: CollegeSubjectUsageRow[];
  collegeLabel: string;
}) {
  const [addOpen, setAddOpen] = useState(false);
  /** يزيد عند كل فتح لمودال الإضافة لإعادة ضبط useActionState وتفادي إعادة تشغيل نجاح قديم */
  const [addDialogNonce, setAddDialogNonce] = useState(0);
  const [menuId, setMenuId] = useState<string | null>(null);
  const openActionsRef = useRef<HTMLDivElement | null>(null);
  const [editingRow, setEditingRow] = useState<CollegeSubjectRow | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | "DEPARTMENT" | "BRANCH">("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const byType = filter === "ALL" ? true : row.branch_type === filter;
      const byQuery =
        normalizedQuery.length === 0
          ? true
          : row.branch_name.toLowerCase().includes(normalizedQuery) ||
            row.branch_head_name.toLowerCase().includes(normalizedQuery);
      return byType && byQuery;
    });
  }, [rows, filter, normalizedQuery]);

  const usageMap = useMemo(() => {
    const m = new Map<string, { study_subjects_count: number; exam_schedules_count: number }>();
    for (const u of usageRows) {
      m.set(u.college_subject_id, {
        study_subjects_count: u.study_subjects_count,
        exam_schedules_count: u.exam_schedules_count,
      });
    }
    return m;
  }, [usageRows]);

  const filteredUsageTotals = useMemo(() => {
    let study = 0;
    let exams = 0;
    for (const row of filteredRows) {
      const u = usageMap.get(row.id);
      if (u) {
        study += u.study_subjects_count;
        exams += u.exam_schedules_count;
      }
    }
    return { study, exams };
  }, [filteredRows, usageMap]);

  const closeAddDialog = useCallback(() => setAddOpen(false), []);
  const closeEditDialog = useCallback(() => setEditingRow(null), []);

  const openAddBranchFromFab = useCallback(() => {
    setAddDialogNonce((n) => n + 1);
    setAddOpen(true);
  }, []);
  useCollegeQuickActionsRegister({ openAddBranch: openAddBranchFromFab }, [openAddBranchFromFab]);
  useCollegeQuickUrlTrigger("branch", openAddBranchFromFab);

  useEffect(() => {
    setPage(1);
  }, [query, filter]);

  useEffect(() => {
    if (menuId === null) return;
    function closeOnOutside(e: MouseEvent) {
      const el = openActionsRef.current;
      if (el && !el.contains(e.target as Node)) {
        setMenuId(null);
      }
    }
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [menuId]);

  const stats = useMemo(() => {
    const departments = rows.filter((r) => r.branch_type === "DEPARTMENT").length;
    const branches = rows.filter((r) => r.branch_type === "BRANCH").length;
    const latest = rows
      .map((r) => new Date(r.updated_at))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return { departments, branches, latest };
  }, [rows]);

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
    const html = buildCollegeSubjectsReportHtml({
      rows,
      usageRows,
      generatedLabel,
      collegeLabel,
      assetsBaseUrl: typeof window !== "undefined" ? window.location.origin : "",
    });
    if (!printCollegeSubjectsReportHtml(html)) {
      window.alert(
        "تعذر فتح نافذة التقرير. اسمح بالنوافذ المنبثقة لهذا الموقع، ثم اختر «حفظ كـ PDF» من نافذة الطباعة."
      );
    }
  }, [rows, usageRows, collegeLabel]);

  const exportCsv = () => {
    const header = ["النوع", "اسم القسم او الفرع", "اسم رئيس القسم", "تاريخ الاضافة"];
    const lines = filteredRows.map((row) => [
      row.branch_type === "BRANCH" ? "فرع" : "قسم",
      row.branch_name,
      row.branch_head_name,
      new Intl.DateTimeFormat("ar-IQ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.created_at)),
    ]);
    const csv = [header, ...lines]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "college-subjects.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage]);

  const latestAddedText = useMemo(() => {
    if (rows.length === 0) return "—";
    return new Intl.DateTimeFormat("ar-IQ", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(rows[0].created_at)
    );
  }, [rows]);

  return (
    <section className="space-y-6" dir="rtl">
      <header className="relative overflow-hidden rounded-[22px] border border-[#E8EEF7] bg-white px-6 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
          style={{ background: "linear-gradient(90deg, #1E3A8A 0%, #2563EB 55%, #38BDF8 100%)" }}
          aria-hidden
        />
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-extrabold text-[#0F172A]">الأقسام والفروع</h1>
            <p className="mt-1.5 text-sm leading-6 text-[#64748B]">
              إدارة الأقسام العلمية أو الإنسانية والفروع وربطها برئاسة القسم داخل الكلية.
            </p>
          </div>
        </div>
      </header>

      <div className="overflow-visible rounded-3xl border border-[#E2E8F0] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1f3578] bg-[#274092] px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openAddBranchFromFab}
              className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#274092] shadow-sm ring-1 ring-white/60 transition hover:bg-white/95"
            >
              إضافة قسم أو فرع
            </button>
            <button
              type="button"
              onClick={exportPdfReport}
              className="rounded-xl border border-white/45 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-[2px] transition hover:border-white/60 hover:bg-white/20"
            >
              تصدير تقرير PDF
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-xl border border-white/45 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-[2px] transition hover:border-white/60 hover:bg-white/20"
            >
              تصدير CSV
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث باسم القسم أو رئيس القسم"
              className="h-10 w-[260px] rounded-xl border border-white/25 bg-white/95 px-3 text-sm text-[#0F172A] outline-none placeholder:text-[#64748B] focus:border-amber-400/90 focus:ring-2 focus:ring-amber-400/25"
            />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as "ALL" | "DEPARTMENT" | "BRANCH")}
              className="h-10 rounded-xl border border-white/25 bg-white/95 px-3 text-sm text-[#0F172A] outline-none focus:border-amber-400/90 focus:ring-2 focus:ring-amber-400/25"
            >
              <option value="ALL">الكل</option>
              <option value="DEPARTMENT">الأقسام</option>
              <option value="BRANCH">الفروع</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-[#E2E8F0] bg-white px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs text-[#64748B]">إجمالي الأقسام</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.departments}</p>
          </div>
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs text-[#64748B]">إجمالي الفروع</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.branches}</p>
          </div>
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs text-[#64748B]">الأقسام النشطة</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.departments + stats.branches}</p>
          </div>
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs text-[#64748B]">آخر إضافة</p>
            <p className="mt-1 text-sm font-bold text-[#0F172A]">{latestAddedText}</p>
          </div>
        </div>

        <table className="w-full border-collapse text-right">
          <thead className="bg-[#F1F5F9]">
            <tr className="border-b border-[#E2E8F0]">
              <th className="px-4 py-3 text-sm font-bold text-[#334155]">#</th>
              <th className="px-4 py-3 text-sm font-bold text-[#334155]">النوع</th>
              <th className="px-4 py-3 text-sm font-bold text-[#334155]">اسم القسم أو الفرع</th>
              <th className="px-4 py-3 text-sm font-bold text-[#334155]">رئيس القسم</th>
              <th className="px-4 py-3 text-sm font-bold text-[#334155]">تاريخ الإضافة</th>
              <th className="px-4 py-3 text-sm font-bold text-[#334155]">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0] bg-white">
            {pagedRows.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-[#64748B]" colSpan={6}>
                  لا توجد نتائج مطابقة.
                </td>
              </tr>
            ) : (
              pagedRows.map((row, index) => (
                <tr key={row.id} className="hover:bg-[#F8FAFC]">
                  <td className="px-4 py-3 text-sm text-[#334155]">{(safePage - 1) * pageSize + index + 1}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                        row.branch_type === "BRANCH"
                          ? "bg-sky-50 text-sky-800 ring-1 ring-sky-300/40"
                          : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300/40"
                      }`}
                    >
                      {row.branch_type === "BRANCH" ? "فرع" : "قسم"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-[#0F172A]">{row.branch_name}</td>
                  <td className="px-4 py-3 text-sm text-[#334155]">{row.branch_head_name}</td>
                  <td className="px-4 py-3 text-sm text-[#64748B]">
                    {new Intl.DateTimeFormat("ar-IQ", { dateStyle: "medium", timeStyle: "short" }).format(
                      new Date(row.created_at)
                    )}
                  </td>
                  <td className="relative px-4 py-3 text-left">
                    <div
                      ref={menuId === row.id ? openActionsRef : null}
                      className="relative inline-block text-left"
                    >
                      <button
                        type="button"
                        aria-label="إجراءات"
                        aria-expanded={menuId === row.id}
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
                        <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-lg">
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
                          <DeleteBranchForm id={row.id} />
                        </div>
                      ) : null}
                    </div>
                  </td>
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

        <div className="border-t border-[#E2E8F0] bg-gradient-to-b from-[#F8FAFC] to-white px-5 py-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-base font-bold text-[#0F172A]">ربط المواد والامتحانات بالأقسام</h2>
              <p className="mt-1 text-xs leading-relaxed text-[#64748B]">
                لكل قسم أو فرع: عدد المواد الدراسية المسجّلة تحته، وعدد جداول الامتحانات المرتبطة به. الأرقام
                تتبع نفس التصفية والبحث أعلاه.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 shadow-sm">
                <p className="text-[11px] font-semibold text-[#64748B]">مجموع المواد (المعروضة)</p>
                <p className="text-lg font-extrabold tabular-nums text-[#1E3A8A]">{filteredUsageTotals.study}</p>
              </div>
              <div className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 shadow-sm">
                <p className="text-[11px] font-semibold text-[#64748B]">مجموع جداول الامتحانات (المعروضة)</p>
                <p className="text-lg font-extrabold tabular-nums text-[#1E3A8A]">{filteredUsageTotals.exams}</p>
              </div>
            </div>
          </div>
          {filteredRows.length === 0 ? (
            <p className="text-center text-sm text-[#64748B]">لا توجد أقسام ضمن التصفية الحالية.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredRows.map((row) => {
                const u = usageMap.get(row.id) ?? { study_subjects_count: 0, exam_schedules_count: 0 };
                return (
                  <div
                    key={`usage-${row.id}`}
                    className="rounded-2xl border border-[#E5ECF6] bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.04)]"
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-[#F1F5F9] pb-2">
                      <p className="min-w-0 flex-1 text-right text-sm font-bold text-[#0F172A]">{row.branch_name}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          row.branch_type === "BRANCH"
                            ? "bg-sky-50 text-sky-800 ring-1 ring-sky-200/60"
                            : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/60"
                        }`}
                      >
                        {row.branch_type === "BRANCH" ? "فرع" : "قسم"}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-[#EFF6FF] px-3 py-2.5 text-center">
                        <p className="text-[10px] font-bold text-[#64748B]">المواد الدراسية</p>
                        <p className="mt-0.5 text-xl font-extrabold tabular-nums text-[#1D4ED8]">
                          {u.study_subjects_count}
                        </p>
                      </div>
                      <div className="rounded-xl bg-[#FFF7ED] px-3 py-2.5 text-center">
                        <p className="text-[10px] font-bold text-[#64748B]">جداول الامتحانات</p>
                        <p className="mt-0.5 text-xl font-extrabold tabular-nums text-[#C2410C]">
                          {u.exam_schedules_count}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {addOpen ? (
        <AddBranchDialog key={addDialogNonce} open onClose={closeAddDialog} />
      ) : null}
      {editingRow ? (
        <EditBranchDialog key={editingRow.id} row={editingRow} open onClose={closeEditDialog} />
      ) : null}
    </section>
  );
}
