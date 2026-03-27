"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import type { CollegeAccountRow } from "@/lib/college-accounts";
import { COLLEGE_FORMATIONS } from "@/lib/college-formations";
import { createCollegeAccountAction } from "./actions";

const modalFieldClass =
  "mt-2 h-11 w-full rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm text-[#0F172A] outline-none transition-[border-color,box-shadow] focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)]";

function statusLabel(status: string) {
  switch (status) {
    case "ACTIVE":
      return "نشط";
    case "DISABLED":
      return "معطل";
    case "LOCKED":
      return "مقفل";
    case "PENDING":
      return "قيد المراجعة";
    default:
      return status;
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500/25";
    case "DISABLED":
      return "bg-gray-100 text-gray-700 ring-1 ring-gray-300/90";
    case "LOCKED":
      return "bg-amber-50 text-amber-900 ring-1 ring-amber-400/35";
    case "PENDING":
      return "bg-sky-50 text-sky-800 ring-1 ring-sky-400/25";
    default:
      return "bg-gray-100 text-gray-600 ring-1 ring-gray-200";
  }
}

type ToastPayload = { id: number; variant: "success" | "error"; message: string };

function ToastHost({
  toast,
  onDismiss,
}: {
  toast: ToastPayload | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 4800);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const isOk = toast.variant === "success";

  return (
    <div
      className={`college-toast-host fixed bottom-6 left-1/2 z-[280] flex w-[min(calc(100vw-2rem),24rem)] -translate-x-1/2 items-start gap-3 rounded-xl px-4 py-3.5 shadow-lg ring-1 ${
        isOk
          ? "bg-white text-emerald-900 ring-emerald-200/90"
          : "bg-white text-red-900 ring-red-200/90"
      }`}
      role="alert"
      dir="rtl"
    >
      <span
        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
          isOk ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
        }`}
        aria-hidden
      >
        {isOk ? (
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        )}
      </span>
      <p className="min-w-0 flex-1 pt-1 text-sm font-semibold leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-lg p-1 text-gray-400 transition hover:bg-black/5 hover:text-gray-700"
        aria-label="إغلاق التنبيه"
      >
        <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function SubmitButton({ pending, disabled }: { pending: boolean; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="rounded-xl bg-[#1E3A8A] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#172554] disabled:opacity-60"
    >
      {pending ? "جاري الحفظ…" : "حفظ الحساب"}
    </button>
  );
}

function CreateAccountPlusIcon() {
  return (
    <svg
      className="size-5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.25}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15M4.5 12h15" />
    </svg>
  );
}

function CreateAccountButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#1E3A8A] px-6 py-2.5 text-sm font-bold text-white shadow-md transition duration-200 hover:-translate-y-px hover:bg-[#172554] hover:shadow-lg ${className}`}
    >
      <CreateAccountPlusIcon />
      إنشاء حساب
    </button>
  );
}

function AccountsTableEmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className="flex size-16 items-center justify-center rounded-2xl bg-[#EFF6FF] text-blue-400 ring-1 ring-blue-100"
        aria-hidden
      >
        <svg className="size-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <rect x="3" y="4" width="18" height="16" rx="2" strokeLinejoin="round" />
          <path strokeLinecap="round" d="M3 10h18M12 4v16" />
        </svg>
      </div>
      <p className="mt-5 max-w-sm text-base font-semibold text-gray-700">لا توجد حسابات حالياً</p>
      <p className="mt-1.5 max-w-sm text-sm text-gray-500">
        ابدأ بإضافة حساب تشكيل لربط الكلية بتسجيل الدخول وإدارة البيانات.
      </p>
      <CreateAccountButton onClick={onCreateClick} className="mt-8" />
    </div>
  );
}

function CreateCollegeAccountDialogForm({
  formId,
  dialogRef,
  onCreated,
  onActionError,
}: {
  formId: string;
  dialogRef: RefObject<HTMLDialogElement | null>;
  onCreated?: () => void;
  onActionError?: (message: string) => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createCollegeAccountAction, null);
  const [accountType, setAccountType] = useState<"none" | "formation" | "followup">("none");

  const locked = accountType === "none";

  useEffect(() => {
    if (state?.ok) {
      dialogRef.current?.close();
      onCreated?.();
      router.refresh();
    }
  }, [state, router, dialogRef, onCreated]);

  useEffect(() => {
    if (state && !state.ok) {
      onActionError?.(state.message);
    }
  }, [state, onActionError]);

  const fieldReadOnly = locked;

  return (
    <form action={formAction} className="flex max-h-[min(90vh,720px)] min-h-0 flex-col">
      <input
        type="hidden"
        name="account_kind"
        value={accountType === "formation" ? "FORMATION" : accountType === "followup" ? "FOLLOWUP" : ""}
      />
      <div className="px-8 pb-0 pt-8">
        <h2 className="text-xl font-bold text-[#0F172A]">إنشاء حساب</h2>
        <div className="mt-3 border-b border-gray-100" aria-hidden />
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          اختر نوع الحساب أولًا، ثم أكمل الحقول. يُستخدم اسم المستخدم وكلمة المرور في صفحة تسجيل الدخول.
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-8 py-6">
        <fieldset className="space-y-3 border-0 p-0">
          <legend className="mb-1 text-sm font-bold text-[#334155]">
            نوع الحساب <span className="text-red-500">*</span>
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-[10px] border px-4 py-3.5 transition ${
                accountType === "formation"
                  ? "border-blue-500 bg-blue-50/50 shadow-[0_0_0_3px_rgba(59,130,246,0.12)]"
                  : "border-[#E2E8F0] bg-[#F8FAFC] hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name={`${formId}-account-type-ui`}
                checked={accountType === "formation"}
                onChange={() => setAccountType("formation")}
                className="size-4 shrink-0 accent-blue-600"
              />
              <span className="text-sm font-semibold text-[#0F172A]">حساب تشكيل</span>
            </label>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-[10px] border px-4 py-3.5 transition ${
                accountType === "followup"
                  ? "border-blue-500 bg-blue-50/50 shadow-[0_0_0_3px_rgba(59,130,246,0.12)]"
                  : "border-[#E2E8F0] bg-[#F8FAFC] hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name={`${formId}-account-type-ui`}
                checked={accountType === "followup"}
                onChange={() => setAccountType("followup")}
                className="size-4 shrink-0 accent-blue-600"
              />
              <span className="text-sm font-semibold text-[#0F172A]">حساب متابعة</span>
            </label>
          </div>
        </fieldset>

        {accountType === "formation" ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:items-start sm:gap-4">
            <div className="min-w-0">
              <label htmlFor={`${formId}-formation`} className="block text-sm font-bold text-[#334155]">
                اسم التشكيل
              </label>
              <select
                id={`${formId}-formation`}
                name="formation"
                required
                className={`${modalFieldClass} cursor-pointer`}
                defaultValue=""
              >
                <option value="" disabled>
                  — اختر التشكيل —
                </option>
                {COLLEGE_FORMATIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor={`${formId}-dean`} className="block text-sm font-bold text-[#334155]">
                اسم عميد الكلية
              </label>
              <input
                id={`${formId}-dean`}
                name="dean_name"
                required
                minLength={2}
                maxLength={200}
                autoComplete="name"
                className={modalFieldClass}
              />
            </div>
          </div>
        ) : null}

        {accountType === "followup" ? (
          <div>
            <label htmlFor={`${formId}-holder`} className="block text-sm font-bold text-[#334155]">
              اسم صاحب الحساب
            </label>
            <input
              id={`${formId}-holder`}
              name="holder_name"
              required
              minLength={2}
              maxLength={200}
              autoComplete="name"
              className={modalFieldClass}
            />
          </div>
        ) : null}

        <div>
          <label htmlFor={`${formId}-user`} className="block text-sm font-bold text-[#334155]">
            اسم المستخدم
          </label>
          <input
            id={`${formId}-user`}
            name="username"
            required={!locked}
            minLength={locked ? undefined : 3}
            maxLength={100}
            pattern={locked ? undefined : "[a-zA-Z0-9._\\-]+"}
            title="حروف إنجليزية وأرقام و . _ -"
            autoComplete="username"
            readOnly={fieldReadOnly}
            aria-disabled={locked}
            className={`${modalFieldClass} font-mono ${locked ? "cursor-not-allowed opacity-55" : ""}`}
          />
        </div>
        <div>
          <label htmlFor={`${formId}-pass`} className="block text-sm font-bold text-[#334155]">
            كلمة المرور
          </label>
          <input
            id={`${formId}-pass`}
            name="password"
            type="password"
            required={!locked}
            minLength={locked ? undefined : 8}
            autoComplete="new-password"
            readOnly={fieldReadOnly}
            aria-disabled={locked}
            className={`${modalFieldClass} ${locked ? "cursor-not-allowed opacity-55" : ""}`}
          />
        </div>
        <div>
          <label htmlFor={`${formId}-pass2`} className="block text-sm font-bold text-[#334155]">
            تأكيد كلمة المرور
          </label>
          <input
            id={`${formId}-pass2`}
            name="confirm_password"
            type="password"
            required={!locked}
            minLength={locked ? undefined : 8}
            autoComplete="new-password"
            readOnly={fieldReadOnly}
            aria-disabled={locked}
            className={`${modalFieldClass} ${locked ? "cursor-not-allowed opacity-55" : ""}`}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 px-8 py-6">
        <button
          type="button"
          className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-bold text-[#64748B] transition hover:bg-[#F8FAFC]"
          onClick={() => dialogRef.current?.close()}
        >
          إلغاء
        </button>
        <SubmitButton pending={pending} disabled={locked} />
      </div>
    </form>
  );
}

export function CollegeAccountsPanel({ initialRows }: { initialRows: CollegeAccountRow[] }) {
  const formId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [formInstance, setFormInstance] = useState(0);
  const [toast, setToast] = useState<ToastPayload | null>(null);

  const dismissToast = useCallback(() => setToast(null), []);

  const openCreateDialog = useCallback(() => {
    setFormInstance((n) => n + 1);
    queueMicrotask(() => dialogRef.current?.showModal());
  }, []);

  const onAccountCreated = useCallback(() => {
    setToast({
      id: Date.now(),
      variant: "success",
      message: "تم إنشاء الحساب بنجاح",
    });
  }, []);

  const onAccountActionError = useCallback((message: string) => {
    setToast({ id: Date.now(), variant: "error", message });
  }, []);

  return (
    <div
      className="mx-auto w-full max-w-[1200px] space-y-10 px-8 pb-8 pt-0"
      dir="rtl"
    >
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#1E293B]">إدارة الحسابات</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            إنشاء حسابات التشكيلات وربطها بتسجيل الدخول لبوابة الكلية.
          </p>
        </div>
        <CreateAccountButton onClick={openCreateDialog} />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-[#F8FAFC] px-5 py-3.5">
          <h2 className="text-sm font-semibold text-gray-800">سجل حسابات التشكيلات</h2>
          <p className="mt-0.5 text-xs text-gray-500">بيانات رسمية — لا تُعرض كلمات المرور.</p>
        </div>
        {initialRows.length === 0 ? (
          <AccountsTableEmptyState onCreateClick={openCreateDialog} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-right text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-[#F8FAFC]">
                  <th className="px-5 py-3.5 text-sm font-medium text-gray-600">التشكيل</th>
                  <th className="px-5 py-3.5 text-sm font-medium text-gray-600">عميد الكلية / صاحب الحساب</th>
                  <th className="px-5 py-3.5 text-sm font-medium text-gray-600">اسم المستخدم</th>
                  <th className="px-5 py-3.5 text-sm font-medium text-gray-600">الحالة</th>
                  <th className="px-5 py-3.5 text-sm font-medium text-gray-600">تاريخ الإنشاء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {initialRows.map((row, index) => (
                  <tr
                    key={row.id}
                    className="college-table-row-anim bg-white transition-colors duration-200 hover:bg-blue-50"
                    style={{ animationDelay: `${Math.min(index, 14) * 52}ms` }}
                  >
                    <td className="px-5 py-3.5 font-semibold text-[#0F172A]">
                      {row.account_kind === "FOLLOWUP" ? (
                        <span className="font-medium text-[#64748B]">حساب متابعة</span>
                      ) : (
                        row.formation_name ?? "—"
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-gray-700">
                      {row.account_kind === "FOLLOWUP"
                        ? (row.holder_name ?? "—")
                        : (row.dean_name ?? "—")}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-sm text-[#1E3A8A]">{row.username}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${statusBadgeClass(row.status)}`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-gray-600">
                      {new Intl.DateTimeFormat("ar-IQ", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(row.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <dialog
        ref={dialogRef}
        id={formId}
        className="college-account-dialog fixed right-1/2 top-1/2 z-[100] max-h-[min(90vh,720px)] w-[min(100%,640px)] max-w-[640px] translate-x-1/2 -translate-y-1/2 border-none bg-transparent p-0 shadow-none open:flex open:flex-col"
        dir="rtl"
      >
        <div className="college-account-dialog__surface w-full overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-xl">
          <CreateCollegeAccountDialogForm
            key={formInstance}
            formId={formId}
            dialogRef={dialogRef}
            onCreated={onAccountCreated}
            onActionError={onAccountActionError}
          />
        </div>
      </dialog>

      <ToastHost toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
