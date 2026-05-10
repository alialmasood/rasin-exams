"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCollegePortalBasePath } from "@/components/dashboard/college-portal-base-path";
import type { CollegeSubjectRow } from "@/lib/college-subjects";
import {
  STAFF_REGISTRY_ALL_BRANCHES_VALUE,
  type CollegeStaffRegistryRow,
} from "@/lib/staff-registry-shared";
import {
  addCollegeStaffRegistryAction,
  deleteCollegeStaffRegistryAction,
  importCollegeStaffRegistryExcelAction,
  updateCollegeStaffRegistryAction,
} from "./actions";

const MODAL_CLASS =
  "staff-registry-modal fixed inset-0 z-[200] m-auto box-border h-max max-h-[90dvh] w-[min(92vw,480px)] overflow-y-auto rounded-2xl border border-[#E2E8F0] bg-white p-0 shadow-xl";

function SubmitAddButton({
  pending,
  label,
  disabled,
}: {
  pending: boolean;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="rounded-xl bg-[#1E3A8A] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#172554] disabled:opacity-60"
    >
      {pending ? "جاري الحفظ..." : label}
    </button>
  );
}

export function StaffRegistryPanel({
  collegeLabel,
  rows,
  branches,
  fixedCollegeSubjectId,
  isCentralAccount,
}: {
  collegeLabel: string;
  rows: CollegeStaffRegistryRow[];
  branches: CollegeSubjectRow[];
  fixedCollegeSubjectId: string | null;
  isCentralAccount: boolean;
}) {
  const portalBase = useCollegePortalBasePath();
  const [mounted, setMounted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<CollegeStaffRegistryRow | null>(null);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const [addState, addAction, addPending] = useActionState(addCollegeStaffRegistryAction, null);
  const [updateState, updateAction, updatePending] = useActionState(updateCollegeStaffRegistryAction, null);
  const [delState, delAction, delPending] = useActionState(deleteCollegeStaffRegistryAction, null);
  const [importState, importAction, importPending] = useActionState(
    importCollegeStaffRegistryExcelAction,
    null
  );
  const importFileRef = useRef<HTMLInputElement>(null);
  const formPending = addPending || updatePending;
  const [templatePending, setTemplatePending] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!addState) return;
    if (addState.ok) {
      setToast({ type: "ok", msg: addState.message });
      setModalOpen(false);
      setEditingRow(null);
    } else {
      setToast({ type: "err", msg: addState.message });
    }
  }, [addState]);

  useEffect(() => {
    if (!updateState) return;
    if (updateState.ok) {
      setToast({ type: "ok", msg: updateState.message });
      setModalOpen(false);
      setEditingRow(null);
    } else {
      setToast({ type: "err", msg: updateState.message });
    }
  }, [updateState]);

  useEffect(() => {
    if (!delState) return;
    setToast({ type: delState.ok ? "ok" : "err", msg: delState.message });
  }, [delState]);

  useEffect(() => {
    if (!importState) return;
    setToast({ type: importState.ok ? "ok" : "err", msg: importState.message });
    if (importFileRef.current) importFileRef.current.value = "";
  }, [importState]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3400);
    return () => clearTimeout(t);
  }, [toast]);

  const totalCount = rows.length;

  async function onExportExcelTemplate() {
    if (templatePending) return;
    setTemplatePending(true);
    try {
      const xlsx = await import("xlsx");
      const branchRows =
        branches.length > 0
          ? branches.map((b) => ({
              "القسم / الفرع": b.branch_name,
              "الاسم الكامل": "",
            }))
          : [
              {
                "القسم / الفرع": "",
                "الاسم الكامل": "",
              },
            ];
      const ws = xlsx.utils.json_to_sheet(branchRows);
      ws["!cols"] = [{ wch: 34 }, { wch: 34 }];
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "StaffRegistryTemplate");
      xlsx.writeFile(wb, "staff-registry-template.xlsx");
    } finally {
      setTemplatePending(false);
    }
  }

  const subjectSelectDefault = editingRow
    ? (editingRow.college_subject_id ?? STAFF_REGISTRY_ALL_BRANCHES_VALUE)
    : STAFF_REGISTRY_ALL_BRANCHES_VALUE;

  const modal =
    mounted && modalOpen
      ? createPortal(
          <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/45 p-3" dir="rtl">
            <div
              className="absolute inset-0"
              role="presentation"
              aria-hidden
              onClick={() => {
                if (!formPending) {
                  setModalOpen(false);
                  setEditingRow(null);
                }
              }}
            />
            <dialog
              open
              key={editingRow ? `edit-${editingRow.id}` : "add"}
              className={MODAL_CLASS}
              aria-labelledby="staff-registry-modal-title"
            >
              <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4">
                <h2 id="staff-registry-modal-title" className="text-lg font-extrabold text-[#0F172A]">
                  {editingRow ? "تعديل الاسم في السجل" : "إضافة اسم إلى السجل المرجعي"}
                </h2>
                <p className="mt-1 text-xs font-medium text-[#64748B]">
                  {editingRow
                    ? "عدّل الاسم أو نطاق القسم/الفرع ثم احفظ التغييرات."
                    : "سجل مرجعي للأسماء (مثل الأستاذ الجامعي) لاستخدامها في القاعات وغيرها دون تصنيف صنف هنا."}
                </p>
              </div>
              <form action={editingRow ? updateAction : addAction} className="space-y-4 px-5 py-4">
                {editingRow ? <input type="hidden" name="id" value={editingRow.id} /> : null}
                {fixedCollegeSubjectId && !isCentralAccount ? (
                  <input type="hidden" name="college_subject_id" value={fixedCollegeSubjectId} />
                ) : null}
                {isCentralAccount ? (
                  <div>
                    <label className="mb-1 block text-sm font-bold text-[#334155]">القسم / الفرع</label>
                    {branches.length === 0 ? (
                      <p className="mb-2 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2 text-xs font-medium text-[#1E3A8A]">
                        لا توجد أقسام/فروع مُعرَّفة بعد؛ يمكنك حفظ السجل لـ «كل الأقسام والفروع» فقط حتى يتم تعريف الفروع من
                        حساب التشكيل.
                      </p>
                    ) : null}
                    <select
                      name="college_subject_id"
                      required
                      className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm outline-none focus:border-[#1E3A8A]"
                      defaultValue={subjectSelectDefault}
                    >
                      <option value={STAFF_REGISTRY_ALL_BRANCHES_VALUE}>كل الأقسام والفروع</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.branch_name} ({b.branch_type === "BRANCH" ? "فرع" : "قسم"})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div>
                  <label className="mb-1 block text-sm font-bold text-[#334155]">الاسم الكامل</label>
                  <input
                    name="full_name"
                    required
                    minLength={2}
                    maxLength={200}
                    dir="rtl"
                    placeholder="كما يُعرض رسمياً"
                    defaultValue={editingRow?.full_name ?? ""}
                    className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm outline-none focus:border-[#1E3A8A]"
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-[#E2E8F0] pt-4">
                  <button
                    type="button"
                    disabled={formPending}
                    onClick={() => {
                      setModalOpen(false);
                      setEditingRow(null);
                    }}
                    className="rounded-xl border border-[#CBD5E1] px-4 py-2.5 text-sm font-bold text-[#475569] disabled:opacity-60"
                  >
                    إلغاء
                  </button>
                  <SubmitAddButton
                    pending={formPending}
                    label={editingRow ? "حفظ التعديلات" : "حفظ"}
                  />
                </div>
              </form>
            </dialog>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="min-w-0 space-y-6 p-4 sm:p-6" dir="rtl">
      <header className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-[#1E3A8A]/80">بوابة القسم</p>
        <h1 className="mt-1 text-xl font-extrabold text-[#0F172A] sm:text-2xl">إدارة المشرفين والمراقبين</h1>
        <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-[#475569]">
          <span className="font-bold text-[#0F172A]">{collegeLabel}</span> — قاعدة بيانات مرجعية للأسماء (مثل أسماء
          الأساتذة) على مستوى القسم أو الفرع، لاقتراحها عند تعبئة القاعات دون الحاجة لإعادة الكتابة. لا يُخزَّن هنا
          تصنيف مشرف/مراقب؛ التعيين الفعلي يكون في صفحات القاعات والمواقف الامتحانية.
        </p>
      </header>

      <section className="rounded-2xl border-2 border-[#1E3A8A]/20 bg-gradient-to-b from-[#F8FAFC] to-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-[#1E3A8A]">البيانات الأساسية</h2>
            <p className="mt-1 text-sm font-medium text-[#475569]">
              إجمالي الأسماء في السجل:{" "}
              <strong className="tabular-nums text-[#0F172A]">{totalCount}</strong>
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingRow(null);
                  setModalOpen(true);
                }}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[#1E3A8A] px-5 text-sm font-extrabold text-white shadow-md transition hover:bg-[#163170]"
              >
                إضافة اسم
              </button>
              <form action={importAction} className="inline">
                <input
                  ref={importFileRef}
                  type="file"
                  name="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="sr-only"
                  disabled={importPending || formPending || delPending}
                  onChange={(e) => {
                    const el = e.currentTarget;
                    if (el.files?.length) el.form?.requestSubmit();
                  }}
                />
                <button
                  type="button"
                  disabled={importPending || formPending || delPending}
                  onClick={() => importFileRef.current?.click()}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border-2 border-[#1E3A8A] bg-white px-5 text-sm font-extrabold text-[#1E3A8A] shadow-sm transition hover:bg-[#EFF6FF] disabled:opacity-60"
                >
                  {importPending ? "جاري الاستيراد…" : "استيراد أسماء من Excel"}
                </button>
              </form>
              <button
                type="button"
                disabled={templatePending || importPending || formPending || delPending}
                onClick={() => void onExportExcelTemplate()}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border-2 border-emerald-600 bg-white px-5 text-sm font-extrabold text-emerald-700 shadow-sm transition hover:bg-emerald-50 disabled:opacity-60"
              >
                {templatePending ? "جاري تجهيز القالب…" : "تصدير قالب Excel"}
              </button>
            </div>
            <p className="max-w-md text-xs font-medium leading-relaxed text-[#64748B]">
              الملف (.xlsx / .xls): الورقة الأولى فقط — عمود{" "}
              <span className="font-bold text-[#475569]">الاسم الكامل</span> (أو الاسم)
              {isCentralAccount ? (
                <>
                  {" "}
                  وعمود <span className="font-bold text-[#475569]">القسم أو الفرع</span> (اسم الفرع كما في النظام، أو
                  نص يعني «كل الأقسام والفروع»). لا حاجة لعمود صنف.
                </>
              ) : (
                <>
                  ؛ <span className="font-bold text-[#475569]">القسم</span> يُحدَّد تلقائياً من حسابك (عمود فرع في
                  الملف اختياري للمطابقة فقط).
                </>
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
        <div className="border-b border-[#1f3578] bg-[#274092] px-4 py-3 sm:px-5">
          <h3 className="text-base font-bold text-white sm:text-lg">سجل الأسماء المرجعي</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-right text-sm">
            <thead>
              <tr className="bg-[#F1F5F9] text-[#334155]">
                <th className="border-b border-[#E2E8F0] px-3 py-3 font-bold">ت.</th>
                {isCentralAccount ? (
                  <th className="border-b border-[#E2E8F0] px-3 py-3 font-bold">القسم / الفرع</th>
                ) : null}
                <th className="border-b border-[#E2E8F0] px-3 py-3 font-bold">الاسم الكامل</th>
                <th className="border-b border-[#E2E8F0] px-3 py-3 font-bold">تاريخ الإضافة</th>
                <th className="border-b border-[#E2E8F0] px-3 py-3 font-bold">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={isCentralAccount ? 5 : 4}
                    className="px-4 py-10 text-center text-sm font-medium text-[#64748B]"
                  >
                    لا توجد سجلات بعد. استخدم «إضافة اسم» لبدء السجل.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={r.id} className="transition hover:bg-[#F8FAFC]/90">
                    <td className="border-b border-[#E2E8F0] px-3 py-2.5 tabular-nums text-[#64748B]">{idx + 1}</td>
                    {isCentralAccount ? (
                      <td className="border-b border-[#E2E8F0] px-3 py-2.5 font-semibold text-[#0F172A]">
                        {r.college_subject_id == null ? (
                          <span className="text-[#1E3A8A]">كل الأقسام والفروع</span>
                        ) : (
                          <>
                            {r.branch_name}
                            <span className="mr-1 text-xs font-medium text-[#64748B]">
                              ({r.branch_type === "BRANCH" ? "فرع" : "قسم"})
                            </span>
                          </>
                        )}
                      </td>
                    ) : null}
                    <td className="border-b border-[#E2E8F0] px-3 py-2.5 font-semibold text-[#0F172A]">
                      {r.full_name}
                    </td>
                    <td className="border-b border-[#E2E8F0] px-3 py-2.5 tabular-nums text-[#475569]">
                      {new Intl.DateTimeFormat("ar-IQ", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(r.created_at))}
                    </td>
                    <td className="border-b border-[#E2E8F0] px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <button
                          type="button"
                          disabled={formPending}
                          onClick={() => {
                            setEditingRow(r);
                            setModalOpen(true);
                          }}
                          className="text-xs font-bold text-[#1E3A8A] underline decoration-[#1E3A8A]/35 underline-offset-2 hover:text-[#163170] disabled:opacity-50"
                        >
                          تعديل
                        </button>
                        <form action={delAction} className="inline">
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            type="submit"
                            disabled={delPending || formPending}
                            className="text-xs font-bold text-rose-700 underline decoration-rose-300 underline-offset-2 hover:text-rose-800 disabled:opacity-50"
                          >
                            حذف
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-center text-xs font-medium text-[#64748B]">
        <a href={`${portalBase}`} className="font-bold text-[#1E3A8A] underline-offset-2 hover:underline">
          العودة إلى لوحة القسم
        </a>
      </p>

      {modal}

      {toast ? (
        <div
          className={`fixed bottom-6 left-1/2 z-[210] max-w-[min(92vw,22rem)] -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${
            toast.type === "ok" ? "bg-[#1E3A8A] text-white" : "bg-red-700 text-white"
          }`}
        >
          {toast.msg}
        </div>
      ) : null}
    </div>
  );
}
