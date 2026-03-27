"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CollegeSubjectRow } from "@/lib/college-subjects";
import {
  createCollegeSubjectAction,
  deleteCollegeSubjectAction,
  updateCollegeSubjectAction,
} from "./actions";

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

  useEffect(() => {
    if (!dialogRef.current) return;
    if (open && !dialogRef.current.open) dialogRef.current.showModal();
    if (!open && dialogRef.current.open) dialogRef.current.close();
  }, [open]);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);

  return (
    <dialog ref={dialogRef} className="rounded-2xl border border-[#E2E8F0] p-0 shadow-xl" dir="rtl">
      <form action={formAction} className="w-[min(92vw,520px)] space-y-4 p-6">
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
    </dialog>
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
  const key = useMemo(() => `${row?.id ?? "none"}-${open ? "open" : "closed"}`, [row?.id, open]);

  useEffect(() => {
    if (!dialogRef.current) return;
    if (open && !dialogRef.current.open) dialogRef.current.showModal();
    if (!open && dialogRef.current.open) dialogRef.current.close();
  }, [open]);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);

  return (
    <dialog ref={dialogRef} className="rounded-2xl border border-[#E2E8F0] p-0 shadow-xl" dir="rtl">
      <form key={key} action={formAction} className="w-[min(92vw,520px)] space-y-4 p-6">
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
    </dialog>
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

export function SubjectsPanel({ rows }: { rows: CollegeSubjectRow[] }) {
  const [addOpen, setAddOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
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
  useEffect(() => {
    setPage(1);
  }, [query, filter]);

  const stats = useMemo(() => {
    const departments = rows.filter((r) => r.branch_type === "DEPARTMENT").length;
    const branches = rows.filter((r) => r.branch_type === "BRANCH").length;
    const latest = rows
      .map((r) => new Date(r.updated_at))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return { departments, branches, latest };
  }, [rows]);

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
              إدارة الأقسام العلمية والفروع وربطها برئاسة القسم داخل الكلية.
            </p>
          </div>
        </div>
      </header>

      <div className="overflow-visible rounded-3xl border border-[#E2E8F0] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#172554]"
            >
              إضافة قسم أو فرع
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-xl border border-[#CBD5E1] bg-white px-4 py-2 text-sm font-semibold text-[#334155] transition hover:bg-[#F8FAFC]"
            >
              تصدير
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث باسم القسم أو رئيس القسم"
              className="h-10 w-[260px] rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm outline-none focus:border-blue-500"
            />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as "ALL" | "DEPARTMENT" | "BRANCH")}
              className="h-10 rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm outline-none focus:border-blue-500"
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
                      <div className="absolute left-4 top-12 z-20 w-40 rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-lg">
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
      </div>

      <AddBranchDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <EditBranchDialog row={editingRow} open={Boolean(editingRow)} onClose={() => setEditingRow(null)} />
    </section>
  );
}
