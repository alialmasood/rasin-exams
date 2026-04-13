"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { COLLEGE_ACCOUNT_DEPT_SUBJECT_CREATE_PREFIX } from "@/lib/college-account-constants";
import type { AutoProvisionedDepartmentCredential, CollegeAccountRow } from "@/lib/college-accounts";
import {
  buildCollegeAccountsReportHtml,
  printCollegeAccountsReportHtml,
} from "@/lib/college-accounts-report-html";
import {
  COLLEGE_FORMATIONS,
  getFixedCollegeDepartmentNamesForFormation,
  getFixedFormationSubjectDefinitions,
} from "@/lib/college-formations";
import {
  autoProvisionDepartmentAccountsAction,
  changeCollegeAccountPasswordAction,
  createCollegeAccountAction,
  deleteCollegeAccountAction,
  fetchFormationSubjectsForCollegeAccountAction,
  toggleCollegeAccountDisabledAction,
  type FormationSubjectOption,
} from "./actions";

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

function accountKindLabel(row: CollegeAccountRow) {
  if (row.account_kind === "FOLLOWUP") return "متابعة مركزية";
  if (row.account_kind === "DEPARTMENT") return "قسم / فرع";
  return "حساب تشكيل";
}

function formationOrHolderCell(row: CollegeAccountRow) {
  if (row.account_kind === "FOLLOWUP") return row.holder_name ?? "—";
  if (row.account_kind === "DEPARTMENT") {
    const f = row.formation_name ?? "—";
    const b = row.branch_name ?? "—";
    return `${f} — ${b}`;
  }
  return row.formation_name ?? "—";
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

function AutoProvisionButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#0F766E] px-6 py-2.5 text-sm font-bold text-white shadow-md transition duration-200 hover:-translate-y-px hover:bg-[#115E59] hover:shadow-lg"
    >
      <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10m-10 6h16M16 10l4 4m0 0-4 4m4-4h-7" />
      </svg>
      تكوين حسابات الأقسام/الفروع تلقائيا
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

function AutoProvisionAccountsDialogForm({
  formId,
  dialogRef,
  onCreated,
  onError,
}: {
  formId: string;
  dialogRef: RefObject<HTMLDialogElement | null>;
  onCreated: (rows: AutoProvisionedDepartmentCredential[]) => void;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(autoProvisionDepartmentAccountsAction, null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      onCreated(state.created);
      dialogRef.current?.close();
      router.refresh();
      return;
    }
    onError(state.message);
  }, [state, dialogRef, onCreated, onError, router]);

  return (
    <form action={formAction} className="flex max-h-[min(90vh,540px)] min-h-0 flex-col">
      <div className="px-8 pb-0 pt-8">
        <h2 className="text-xl font-bold text-[#0F172A]">تكوين حسابات الأقسام/الفروع تلقائيا</h2>
        <div className="mt-3 border-b border-gray-100" aria-hidden />
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          ينشئ النظام حسابا لكل قسم/فرع غير مرتبط بحساب ضمن التشكيل المحدد، مع اسم رئيس ثابت (رئاسة قسم/رئاسة فرع) وكلمات مرور
          أولية فريدة.
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-8 py-6">
        <div className="min-w-0">
          <label htmlFor={`${formId}-formation-auto`} className="block text-sm font-bold text-[#334155]">
            اسم التشكيل
          </label>
          <select
            id={`${formId}-formation-auto`}
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
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 px-8 py-6">
        <button
          type="button"
          className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-bold text-[#64748B] transition hover:bg-[#F8FAFC]"
          onClick={() => dialogRef.current?.close()}
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-[#0F766E] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#115E59] disabled:opacity-60"
        >
          {pending ? "جاري التكوين…" : "تكوين الحسابات"}
        </button>
      </div>
    </form>
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
  const [accountType, setAccountType] = useState<"none" | "formation" | "followup" | "department">("none");
  const [formationForDept, setFormationForDept] = useState("");
  const [deptSubjects, setDeptSubjects] = useState<FormationSubjectOption[]>([]);
  const [subjectsPending, startSubjectsTransition] = useTransition();

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

  useEffect(() => {
    if (accountType !== "department") {
      setDeptSubjects([]);
      setFormationForDept("");
      return;
    }
    const fn = formationForDept.trim();
    if (!fn) {
      setDeptSubjects([]);
      return;
    }
    let cancelled = false;
    startSubjectsTransition(() => {
      void (async () => {
        const rows = await fetchFormationSubjectsForCollegeAccountAction(fn);
        if (!cancelled) setDeptSubjects(rows);
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [accountType, formationForDept]);

  const formationTrimmed = formationForDept.trim();
  const usesFixedDepartmentList =
    getFixedCollegeDepartmentNamesForFormation(formationTrimmed) !== null;

  const branchSelectRows: FormationSubjectOption[] = useMemo(() => {
    const form = formationForDept.trim();
    if (!form) return [];
    const fixedDefs = getFixedFormationSubjectDefinitions(form);
    if (fixedDefs) {
      return fixedDefs.map((def) => {
        const found = deptSubjects.find((s) => s.branch_name.trim() === def.branch_name.trim());
        if (found) return found;
        return {
          id: "",
          branch_name: def.branch_name,
          branch_type: def.branch_type,
        };
      });
    }
    return deptSubjects;
  }, [formationForDept, deptSubjects]);

  const showDepartmentBranchSelect =
    Boolean(formationTrimmed) && (usesFixedDepartmentList || deptSubjects.length > 0);
  const showDepartmentBranchFreeText =
    Boolean(formationTrimmed) &&
    !usesFixedDepartmentList &&
    !subjectsPending &&
    deptSubjects.length === 0;
  const departmentBranchListLoading =
    Boolean(formationTrimmed) && !usesFixedDepartmentList && subjectsPending;

  const branchSelectDisabled = usesFixedDepartmentList ? false : subjectsPending;

  const branchPlaceholderLabel =
    subjectsPending && !usesFixedDepartmentList
      ? "جاري التحميل…"
      : !formationTrimmed
        ? "— اختر التشكيل أولًا —"
        : "— اختر القسم أو الفرع —";

  return (
    <form action={formAction} className="flex max-h-[min(90vh,720px)] min-h-0 flex-col">
      <input
        type="hidden"
        name="account_kind"
        value={
          accountType === "formation"
            ? "FORMATION"
            : accountType === "followup"
              ? "FOLLOWUP"
              : accountType === "department"
                ? "DEPARTMENT"
                : ""
        }
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
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
                accountType === "department"
                  ? "border-blue-500 bg-blue-50/50 shadow-[0_0_0_3px_rgba(59,130,246,0.12)]"
                  : "border-[#E2E8F0] bg-[#F8FAFC] hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name={`${formId}-account-type-ui`}
                checked={accountType === "department"}
                onChange={() => setAccountType("department")}
                className="size-4 shrink-0 accent-blue-600"
              />
              <span className="text-sm font-semibold text-[#0F172A]">قسم أو فرع</span>
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
              <span className="text-sm font-semibold text-[#0F172A]">متابعة مركزية</span>
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

        {accountType === "department" ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:items-start sm:gap-4">
              <div className="min-w-0">
                <label htmlFor={`${formId}-formation-dept`} className="block text-sm font-bold text-[#334155]">
                  التشكيل التابع له القسم
                </label>
                <select
                  id={`${formId}-formation-dept`}
                  name="formation"
                  required
                  value={formationForDept}
                  onChange={(e) => setFormationForDept(e.target.value)}
                  className={`${modalFieldClass} cursor-pointer`}
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
                <p className="mt-1.5 text-[11px] leading-relaxed text-[#64748B]">
                  يشترط وجود حساب تشكيل بنفس اسم التشكيل (يُنشأ من هذه الصفحة). يُسجَّل القسم/الفرع في النظام تلقائيًا مع إنشاء الحساب إن لم يكن مسجّلاً مسبقًا.
                </p>
              </div>
              <div className="min-w-0">
                <label htmlFor={`${formId}-branch-dept`} className="block text-sm font-bold text-[#334155]">
                  القسم أو الفرع
                </label>
                {!formationTrimmed ? (
                  <select
                    id={`${formId}-branch-dept`}
                    disabled
                    className={`${modalFieldClass} cursor-not-allowed opacity-55`}
                    defaultValue=""
                  >
                    <option value="">— اختر التشكيل أولًا —</option>
                  </select>
                ) : showDepartmentBranchSelect ? (
                  <select
                    id={`${formId}-branch-dept`}
                    name="college_subject_id"
                    required
                    disabled={branchSelectDisabled}
                    className={`${modalFieldClass} cursor-pointer disabled:cursor-not-allowed disabled:opacity-55`}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      {branchPlaceholderLabel}
                    </option>
                    {branchSelectRows.map((s) => (
                      <option
                        key={s.id || s.branch_name}
                        value={
                          s.id
                            ? s.id
                            : `${COLLEGE_ACCOUNT_DEPT_SUBJECT_CREATE_PREFIX}${encodeURIComponent(JSON.stringify({ n: s.branch_name, t: s.branch_type }))}`
                        }
                      >
                        {s.branch_name}
                        {s.branch_type === "BRANCH" ? " (فرع)" : ""}
                      </option>
                    ))}
                  </select>
                ) : departmentBranchListLoading ? (
                  <select
                    id={`${formId}-branch-dept`}
                    disabled
                    className={`${modalFieldClass} cursor-not-allowed opacity-55`}
                    defaultValue=""
                  >
                    <option value="">جاري تحميل أقسام التشكيل…</option>
                  </select>
                ) : showDepartmentBranchFreeText ? (
                  <div className="space-y-3">
                    <input type="hidden" name="college_subject_id" value="" />
                    <input
                      id={`${formId}-branch-dept`}
                      name="new_branch_name"
                      required
                      minLength={2}
                      maxLength={200}
                      placeholder="مثال: قسم الكيمياء"
                      className={modalFieldClass}
                    />
                    <div>
                      <label htmlFor={`${formId}-branch-type`} className="block text-sm font-bold text-[#334155]">
                        نوع التسجيل
                      </label>
                      <select
                        id={`${formId}-branch-type`}
                        name="new_branch_type"
                        className={`${modalFieldClass} cursor-pointer`}
                        defaultValue="DEPARTMENT"
                      >
                        <option value="DEPARTMENT">قسم</option>
                        <option value="BRANCH">فرع</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <select
                    id={`${formId}-branch-dept`}
                    disabled
                    className={`${modalFieldClass} cursor-not-allowed opacity-55`}
                    defaultValue=""
                  >
                    <option value="">— لا يمكن عرض القائمة —</option>
                  </select>
                )}
              </div>
            </div>
            <div className="min-w-0">
              <label htmlFor={`${formId}-head-dept`} className="block text-sm font-bold text-[#334155]">
                اسم رئيس القسم أو الفرع
              </label>
              <input
                id={`${formId}-head-dept`}
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

function ChangePasswordDialogForm({
  formId,
  profileId,
  usernameLabel,
  dialogRef,
  onSuccess,
  onError,
}: {
  formId: string;
  profileId: string;
  usernameLabel: string;
  dialogRef: RefObject<HTMLDialogElement | null>;
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(changeCollegeAccountPasswordAction, null);

  useEffect(() => {
    if (state?.ok) {
      dialogRef.current?.close();
      onSuccess();
      router.refresh();
    }
  }, [state, dialogRef, onSuccess, router]);

  useEffect(() => {
    if (state && !state.ok) {
      onError(state.message);
    }
  }, [state, onError]);

  return (
    <form action={formAction} className="flex max-h-[min(90vh,520px)] min-h-0 flex-col">
      <input type="hidden" name="profile_id" value={profileId} />
      <div className="px-8 pb-0 pt-8">
        <h2 className="text-xl font-bold text-[#0F172A]">تغيير كلمة المرور</h2>
        <div className="mt-3 border-b border-gray-100" aria-hidden />
        <p className="mt-3 text-sm text-gray-600">
          المستخدم: <span className="font-mono font-bold text-[#1E3A8A]">{usernameLabel}</span>
        </p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          تُحدَّث كلمة المرور في قاعدة البيانات فوراً بعد الحفظ (تشفير bcrypt).
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-8 py-6">
        <div>
          <label htmlFor={`${formId}-np`} className="block text-sm font-bold text-[#334155]">
            كلمة المرور الجديدة
          </label>
          <input
            id={`${formId}-np`}
            name="new_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={modalFieldClass}
          />
        </div>
        <div>
          <label htmlFor={`${formId}-nc`} className="block text-sm font-bold text-[#334155]">
            تأكيد كلمة المرور
          </label>
          <input
            id={`${formId}-nc`}
            name="confirm_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={modalFieldClass}
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
        <SubmitButton pending={pending} />
      </div>
    </form>
  );
}

const ACTIONS_MENU_WIDTH = 228;

const menuItemClass =
  "flex w-full items-center justify-start px-4 py-2.5 text-right text-sm font-bold text-[#334155] transition hover:bg-[#F8FAFC]";
const menuItemDangerClass =
  "flex w-full items-center justify-start px-4 py-2.5 text-right text-sm font-bold text-red-700 transition hover:bg-red-50";

type ActionsMenuState = {
  rowId: string;
  rect: DOMRect;
  trigger: HTMLElement;
};

function IconDotsVertical(props: { className?: string }) {
  return (
    <svg className={props.className} width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.85" />
      <circle cx="12" cy="12" r="1.85" />
      <circle cx="12" cy="19" r="1.85" />
    </svg>
  );
}

function computeCollegeAccountStats(rows: CollegeAccountRow[]) {
  let formation = 0;
  let department = 0;
  let followup = 0;
  let active = 0;
  let disabled = 0;
  let locked = 0;
  let pending = 0;
  let otherStatus = 0;
  for (const r of rows) {
    if (r.account_kind === "FOLLOWUP") followup += 1;
    else if (r.account_kind === "DEPARTMENT") department += 1;
    else formation += 1;
    switch (r.status) {
      case "ACTIVE":
        active += 1;
        break;
      case "DISABLED":
        disabled += 1;
        break;
      case "LOCKED":
        locked += 1;
        break;
      case "PENDING":
        pending += 1;
        break;
      default:
        otherStatus += 1;
    }
  }
  const total = rows.length;
  const activeRate = total > 0 ? Math.round((active / total) * 100) : 0;
  return {
    total,
    formation,
    department,
    followup,
    active,
    disabled,
    locked,
    pending,
    unknownStatus: otherStatus,
    activeRate,
  };
}

function StatCard({
  label,
  value,
  hint,
  accentClass = "text-[#1E3A8A]",
}: {
  label: string;
  value: number | string;
  hint?: string;
  accentClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#E5ECF6] bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100/80 transition-shadow hover:shadow-md">
      <p className="text-xs font-semibold text-[#64748B]">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${accentClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-[#94A3B8]">{hint}</p> : null}
    </div>
  );
}

function CollegeAccountsStatsSection({ rows }: { rows: CollegeAccountRow[] }) {
  const s = useMemo(() => computeCollegeAccountStats(rows), [rows]);

  return (
    <section
      className="rounded-2xl border border-[#E2E8F0] bg-gradient-to-b from-white to-[#F8FAFC] p-5 shadow-sm"
      aria-label="إحصائيات حسابات التشكيلات"
    >
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-extrabold text-[#0F172A]">ملخص الحسابات</h2>
          <p className="mt-0.5 text-xs text-[#64748B]">أرقام مبنية على السجلات المعروضة في الجدول (تتحدث مع التعطيل والحذف).</p>
        </div>
        {s.total > 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-1.5">
            <span className="text-xs font-bold text-emerald-900">نسبة النشط</span>
            <span className="text-sm font-extrabold tabular-nums text-emerald-800">{s.activeRate}%</span>
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-4">
        <StatCard label="إجمالي الحسابات" value={s.total} hint="كل سجلات الكلية في القائمة" />
        <StatCard label="حسابات تشكيل" value={s.formation} accentClass="text-[#1D4ED8]" />
        <StatCard label="حسابات أقسام/فروع" value={s.department} accentClass="text-[#0F766E]" />
        <StatCard label="متابعة مركزية" value={s.followup} accentClass="text-[#6366F1]" />
        <StatCard label="نشط" value={s.active} accentClass="text-emerald-700" hint="يمكن تسجيل الدخول" />
        <StatCard label="معطل" value={s.disabled} accentClass="text-slate-600" />
        <StatCard label="مقفل" value={s.locked} accentClass="text-amber-800" />
        <StatCard label="قيد المراجعة" value={s.pending} accentClass="text-sky-800" />
        <StatCard
          label="حالة غير معيّنة"
          value={s.unknownStatus}
          hint={s.total === 0 ? undefined : "قيم حالة غير متوقعة في النظام"}
          accentClass="text-[#475569]"
        />
      </div>
    </section>
  );
}

export function CollegeAccountsPanel({ initialRows }: { initialRows: CollegeAccountRow[] }) {
  const router = useRouter();
  const formId = useId();
  const autoProvisionFormId = useId();
  const passwordFormId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const autoProvisionDialogRef = useRef<HTMLDialogElement>(null);
  const viewDialogRef = useRef<HTMLDialogElement>(null);
  const passwordDialogRef = useRef<HTMLDialogElement>(null);
  const [formInstance, setFormInstance] = useState(0);
  const [autoProvisionFormKey, setAutoProvisionFormKey] = useState(0);
  const [passwordFormKey, setPasswordFormKey] = useState(0);
  const [viewRow, setViewRow] = useState<CollegeAccountRow | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<CollegeAccountRow | null>(null);
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [mutationPending, startMutationTransition] = useTransition();
  const [rows, setRows] = useState<CollegeAccountRow[]>(initialRows);
  const [lastAutoProvisionedRows, setLastAutoProvisionedRows] = useState<AutoProvisionedDepartmentCredential[]>([]);
  const [actionsMenu, setActionsMenu] = useState<ActionsMenuState | null>(null);
  const [portalMounted, setPortalMounted] = useState(false);
  const actionsMenuPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    if (!actionsMenu) return;
    const close = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (actionsMenu.trigger.contains(t)) return;
      if (actionsMenuPanelRef.current?.contains(t)) return;
      setActionsMenu(null);
    };
    document.addEventListener("mousedown", close, true);
    document.addEventListener("touchstart", close, true);
    return () => {
      document.removeEventListener("mousedown", close, true);
      document.removeEventListener("touchstart", close, true);
    };
  }, [actionsMenu]);

  const dismissToast = useCallback(() => setToast(null), []);

  const openCreateDialog = useCallback(() => {
    setFormInstance((n) => n + 1);
    queueMicrotask(() => dialogRef.current?.showModal());
  }, []);

  const openAutoProvisionDialog = useCallback(() => {
    setAutoProvisionFormKey((n) => n + 1);
    queueMicrotask(() => autoProvisionDialogRef.current?.showModal());
  }, []);

  const openViewDialog = useCallback((row: CollegeAccountRow) => {
    setViewRow(row);
    queueMicrotask(() => viewDialogRef.current?.showModal());
  }, []);

  const openPasswordDialog = useCallback((row: CollegeAccountRow) => {
    setPasswordTarget(row);
    setPasswordFormKey((n) => n + 1);
    queueMicrotask(() => passwordDialogRef.current?.showModal());
  }, []);

  const runToggleDisabled = useCallback(
    (row: CollegeAccountRow, disabled: boolean) => {
      const msg = disabled
        ? `تعطيل حساب «${row.username}»؟ لن يتمكن من تسجيل الدخول حتى يُنشَّط مجدداً.`
        : `تنشيط حساب «${row.username}»؟`;
      if (!window.confirm(msg)) return;
      const previousStatus = row.status;
      const nextStatus = disabled ? "DISABLED" : "ACTIVE";
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: nextStatus } : r)));
      startMutationTransition(async () => {
        const res = await toggleCollegeAccountDisabledAction(row.id, disabled);
        if (!res || !res.ok) {
          setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: previousStatus } : r)));
          const message = res && !res.ok ? res.message : "تعذر تنفيذ العملية.";
          setToast({ id: Date.now(), variant: "error", message });
          return;
        }
        setToast({
          id: Date.now(),
          variant: "success",
          message: disabled ? "تم تعطيل الحساب" : "تم تنشيط الحساب",
        });
        router.refresh();
      });
    },
    [router]
  );

  const runDeleteAccount = useCallback(
    (row: CollegeAccountRow) => {
      if (
        !window.confirm(
          `حذف حساب «${row.username}» نهائياً من قاعدة البيانات؟ سيتم حذف سجل المستخدم والبيانات المرتبطة به (حسب إعدادات القاعدة). لا يمكن التراجع.`
        )
      ) {
        return;
      }
      startMutationTransition(async () => {
        const res = await deleteCollegeAccountAction(row.id);
        if (!res || !res.ok) {
          const message = res && !res.ok ? res.message : "تعذر تنفيذ العملية.";
          setToast({ id: Date.now(), variant: "error", message });
          return;
        }
        setRows((prev) => prev.filter((r) => r.id !== row.id));
        setToast({ id: Date.now(), variant: "success", message: "تم حذف الحساب من قاعدة البيانات" });
        router.refresh();
      });
    },
    [router]
  );

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

  const onAutoProvisionCreated = useCallback((createdRows: AutoProvisionedDepartmentCredential[]) => {
    setLastAutoProvisionedRows(createdRows);
    setToast({
      id: Date.now(),
      variant: "success",
      message: `تم تكوين ${createdRows.length} حساب/حسابات بنجاح.`,
    });
  }, []);

  const exportProvisionedCredentialsExcel = useCallback(async () => {
    if (lastAutoProvisionedRows.length === 0) {
      window.alert("لا توجد بيانات حسابات مولدة للتصدير.");
      return;
    }
    try {
      const xlsx = await import("xlsx");
      const data = lastAutoProvisionedRows.map((row, idx) => ({
        "#": idx + 1,
        "القسم / الفرع": row.branchName,
        النوع: row.branchType === "BRANCH" ? "فرع" : "قسم",
        "اسم رئيس القسم/الفرع": row.branchType === "BRANCH" ? "رئاسة فرع" : "رئاسة قسم",
        "اسم المستخدم": row.username,
        "كلمة المرور (أول مرة)": row.password,
      }));
      const ws = xlsx.utils.json_to_sheet(data);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "credentials");
      xlsx.writeFile(wb, "college-departments-initial-credentials.xlsx");
    } catch {
      window.alert("تعذر تصدير ملف Excel لبيانات الحسابات المولدة.");
    }
  }, [lastAutoProvisionedRows]);

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
    const html = buildCollegeAccountsReportHtml({
      rows,
      generatedLabel,
      assetsBaseUrl: typeof window !== "undefined" ? window.location.origin : "",
    });
    if (!printCollegeAccountsReportHtml(html)) {
      window.alert(
        "تعذر فتح نافذة التقرير. اسمح بالنوافذ المنبثقة لهذا الموقع، ثم اختر «حفظ كـ PDF» من نافذة الطباعة."
      );
    }
  }, [rows]);

  const exportAccountsExcel = useCallback(async () => {
    try {
      const xlsx = await import("xlsx");
      const df = new Intl.DateTimeFormat("ar-IQ", {
        timeZone: "Asia/Baghdad",
        dateStyle: "medium",
        timeStyle: "short",
      });
      const data = rows.map((row) => ({
        "نوع الحساب": accountKindLabel(row),
        "اسم التشكيل":
          row.account_kind === "FOLLOWUP" ? "— (متابعة مركزية)" : (row.formation_name ?? "—"),
        "القسم / الفرع": row.account_kind === "DEPARTMENT" ? (row.branch_name ?? "—") : "—",
        "عميد الكلية / رئيس القسم / صاحب الحساب":
          row.account_kind === "FOLLOWUP" ? (row.holder_name ?? "—") : (row.dean_name ?? "—"),
        "اسم المستخدم": row.username,
        الحالة: statusLabel(row.status),
        "تاريخ الإنشاء": df.format(new Date(row.created_at)),
        "معرّف السجل": row.id,
        "معرّف المستخدم": row.user_id,
      }));
      const ws = xlsx.utils.json_to_sheet(data);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "حسابات التشكيلات");
      xlsx.writeFile(wb, "college-accounts.xlsx");
    } catch {
      window.alert("تعذر تصدير ملف Excel. أعد المحاولة.");
    }
  }, [rows]);

  return (
    <div
      className="mx-auto w-full max-w-[1200px] space-y-10 px-8 pb-8 pt-0"
      dir="rtl"
    >
      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#1E293B]">إدارة الحسابات</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            إنشاء حسابات التشكيلات وربطها بتسجيل الدخول لبوابة الكلية.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AutoProvisionButton onClick={openAutoProvisionDialog} />
          <button
            type="button"
            onClick={exportPdfReport}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#1E3A8A]/30 bg-white px-4 py-2.5 text-sm font-bold text-[#1E3A8A] shadow-sm transition hover:bg-[#EFF6FF]"
          >
            <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z"
              />
            </svg>
            طباعة تقرير رسمي (PDF)
          </button>
          <button
            type="button"
            onClick={() => void exportAccountsExcel()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-700/25 bg-white px-4 py-2.5 text-sm font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-50"
          >
            <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
            تصدير الحسابات (Excel)
          </button>
          <CreateAccountButton onClick={openCreateDialog} />
        </div>
      </div>

      {lastAutoProvisionedRows.length > 0 ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-emerald-900">بيانات الاعتماد الأولية (عرض لمرة أولى)</h2>
              <p className="mt-1 text-xs text-emerald-800/80">
                احتفظ بهذه البيانات مباشرة. لا يمكن استرجاع كلمات المرور النصية بعد إغلاق الجلسة.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void exportProvisionedCredentialsExcel()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-700/25 bg-white px-4 py-2.5 text-sm font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-50"
            >
              تصدير الحسابات المولدة (Excel)
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-emerald-200 bg-white">
            <table className="w-full min-w-[820px] border-collapse text-right text-sm">
              <thead>
                <tr className="border-b border-emerald-100 bg-emerald-50">
                  <th className="px-4 py-3 text-xs font-bold text-emerald-900">القسم / الفرع</th>
                  <th className="px-4 py-3 text-xs font-bold text-emerald-900">النوع</th>
                  <th className="px-4 py-3 text-xs font-bold text-emerald-900">رئاسة القسم/الفرع</th>
                  <th className="px-4 py-3 text-xs font-bold text-emerald-900">اسم المستخدم</th>
                  <th className="px-4 py-3 text-xs font-bold text-emerald-900">كلمة المرور الأولى</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-100">
                {lastAutoProvisionedRows.map((row) => (
                  <tr key={`${row.branchName}-${row.username}`} className="bg-white">
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{row.branchName}</td>
                    <td className="px-4 py-2.5 text-slate-700">{row.branchType === "BRANCH" ? "فرع" : "قسم"}</td>
                    <td className="px-4 py-2.5 text-slate-700">{row.branchType === "BRANCH" ? "رئاسة فرع" : "رئاسة قسم"}</td>
                    <td className="px-4 py-2.5 font-mono text-[#1E3A8A]">{row.username}</td>
                    <td className="px-4 py-2.5 font-mono font-bold text-emerald-800">{row.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <CollegeAccountsStatsSection rows={rows} />

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-[#F8FAFC] px-5 py-3.5">
          <h2 className="text-sm font-semibold text-gray-800">سجل حسابات التشكيلات</h2>
          <p className="mt-0.5 text-xs text-gray-500">بيانات رسمية — لا تُعرض كلمات المرور.</p>
        </div>
        {rows.length === 0 ? (
          <AccountsTableEmptyState onCreateClick={openCreateDialog} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-right text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-[#F8FAFC]">
                  <th className="px-5 py-3.5 text-sm font-medium text-gray-600">التشكيل</th>
                  <th className="px-5 py-3.5 text-sm font-medium text-gray-600">عميد الكلية / صاحب الحساب</th>
                  <th className="px-5 py-3.5 text-sm font-medium text-gray-600">اسم المستخدم</th>
                  <th className="px-5 py-3.5 text-sm font-medium text-gray-600">الحالة</th>
                  <th className="px-5 py-3.5 text-sm font-medium text-gray-600">تاريخ الإنشاء</th>
                  <th className="px-5 py-3.5 text-sm font-medium text-gray-600">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, index) => (
                  <tr
                    key={row.id}
                    className="college-table-row-anim bg-white transition-colors duration-200 hover:bg-blue-50"
                    style={{ animationDelay: `${Math.min(index, 14) * 52}ms` }}
                  >
                    <td className="px-5 py-3.5 font-semibold text-[#0F172A]">
                      {row.account_kind === "FOLLOWUP" ? (
                        <span className="font-medium text-[#64748B]">متابعة مركزية</span>
                      ) : row.account_kind === "DEPARTMENT" ? (
                        <span className="block min-w-[10rem]">
                          <span className="block">{row.formation_name ?? "—"}</span>
                          <span className="mt-0.5 block text-xs font-medium text-[#64748B]">
                            {row.branch_name ?? "—"}
                          </span>
                        </span>
                      ) : (
                        row.formation_name ?? "—"
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-gray-700">
                      {row.account_kind === "FOLLOWUP" ? (row.holder_name ?? "—") : (row.dean_name ?? "—")}
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
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="inline-flex size-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
                          aria-label="قائمة الإجراءات"
                          aria-expanded={actionsMenu?.rowId === row.id}
                          aria-haspopup="menu"
                          disabled={mutationPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            const trigger =
                              e.currentTarget instanceof HTMLElement
                                ? e.currentTarget
                                : (e.target instanceof Element ? e.target.closest("button") : null);
                            if (!(trigger instanceof HTMLElement)) return;
                            const rect = trigger.getBoundingClientRect();
                            setActionsMenu((m) =>
                              m?.rowId === row.id ? null : { rowId: row.id, rect, trigger }
                            );
                          }}
                        >
                          <IconDotsVertical className="size-5" />
                        </button>
                      </div>
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

      <dialog
        ref={autoProvisionDialogRef}
        id={autoProvisionFormId}
        className="college-account-dialog fixed right-1/2 top-1/2 z-[100] max-h-[min(90vh,560px)] w-[min(100%,620px)] max-w-[620px] translate-x-1/2 -translate-y-1/2 border-none bg-transparent p-0 shadow-none open:flex open:flex-col"
        dir="rtl"
      >
        <div className="college-account-dialog__surface w-full overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-xl">
          <AutoProvisionAccountsDialogForm
            key={autoProvisionFormKey}
            formId={autoProvisionFormId}
            dialogRef={autoProvisionDialogRef}
            onCreated={onAutoProvisionCreated}
            onError={onAccountActionError}
          />
        </div>
      </dialog>

      <dialog
        ref={viewDialogRef}
        className="college-account-dialog fixed right-1/2 top-1/2 z-[100] max-h-[min(90vh,640px)] w-[min(100%,520px)] max-w-[520px] translate-x-1/2 -translate-y-1/2 border-none bg-transparent p-0 shadow-none open:flex open:flex-col"
        dir="rtl"
        onClose={() => setViewRow(null)}
      >
        <div className="college-account-dialog__surface w-full overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-xl">
          {viewRow ? (
            <div className="flex flex-col px-8 py-8">
              <h2 className="text-xl font-bold text-[#0F172A]">تفاصيل الحساب</h2>
              <div className="mt-4 space-y-3 border-t border-gray-100 pt-4 text-sm">
                <p>
                  <span className="font-bold text-[#64748B]">نوع الحساب: </span>
                  {accountKindLabel(viewRow)}
                </p>
                <p>
                  <span className="font-bold text-[#64748B]">التشكيل / الاسم: </span>
                  {formationOrHolderCell(viewRow)}
                </p>
                <p>
                  <span className="font-bold text-[#64748B]">
                    {viewRow.account_kind === "DEPARTMENT" ? "رئيس القسم أو الفرع: " : "عميد الكلية / صاحب الحساب: "}
                  </span>
                  {viewRow.account_kind === "FOLLOWUP" ? (viewRow.holder_name ?? "—") : (viewRow.dean_name ?? "—")}
                </p>
                {viewRow.account_kind === "DEPARTMENT" ? (
                  <p>
                    <span className="font-bold text-[#64748B]">اسم القسم المسجّل: </span>
                    {viewRow.branch_name ?? "—"}
                  </p>
                ) : null}
                <p>
                  <span className="font-bold text-[#64748B]">اسم المستخدم: </span>
                  <span className="font-mono font-semibold text-[#1E3A8A]">{viewRow.username}</span>
                </p>
                <p>
                  <span className="font-bold text-[#64748B]">الحالة: </span>
                  {statusLabel(viewRow.status)}
                </p>
                <p>
                  <span className="font-bold text-[#64748B]">تاريخ الإنشاء: </span>
                  {new Intl.DateTimeFormat("ar-IQ", { dateStyle: "medium", timeStyle: "short" }).format(
                    new Date(viewRow.created_at)
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  <span className="font-bold">معرّف السجل: </span>
                  {viewRow.id}
                </p>
              </div>
              <div className="mt-6 flex justify-end border-t border-gray-100 pt-4">
                <button
                  type="button"
                  className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-bold text-[#64748B] transition hover:bg-[#F8FAFC]"
                  onClick={() => viewDialogRef.current?.close()}
                >
                  إغلاق
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </dialog>

      <dialog
        ref={passwordDialogRef}
        className="college-account-dialog fixed right-1/2 top-1/2 z-[100] max-h-[min(90vh,560px)] w-[min(100%,480px)] max-w-[480px] translate-x-1/2 -translate-y-1/2 border-none bg-transparent p-0 shadow-none open:flex open:flex-col"
        dir="rtl"
        onClose={() => setPasswordTarget(null)}
      >
        <div className="college-account-dialog__surface w-full overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-xl">
          {passwordTarget ? (
            <ChangePasswordDialogForm
              key={passwordFormKey}
              formId={passwordFormId}
              profileId={passwordTarget.id}
              usernameLabel={passwordTarget.username}
              dialogRef={passwordDialogRef}
              onSuccess={() => {
                setToast({ id: Date.now(), variant: "success", message: "تم تغيير كلمة المرور" });
              }}
              onError={onAccountActionError}
            />
          ) : null}
        </div>
      </dialog>

      {portalMounted && actionsMenu
        ? createPortal(
            (() => {
              const menuRow = rows.find((r) => r.id === actionsMenu.rowId);
              if (!menuRow) return null;
              const pad = 8;
              const w = ACTIONS_MENU_WIDTH;
              let left = actionsMenu.rect.left + actionsMenu.rect.width / 2 - w / 2;
              left = Math.max(pad, Math.min(left, typeof window !== "undefined" ? window.innerWidth - w - pad : left));
              const top = actionsMenu.rect.top - pad;
              const toggleDisabled = menuRow.status !== "DISABLED";
              return (
                <div
                  ref={actionsMenuPanelRef}
                  role="menu"
                  className="fixed z-[400] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl ring-1 ring-black/5"
                  style={{
                    left,
                    top,
                    width: w,
                    transform: "translateY(-100%)",
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemClass}
                    onClick={() => {
                      setActionsMenu(null);
                      openViewDialog(menuRow);
                    }}
                  >
                    عرض
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemClass}
                    disabled={mutationPending}
                    onClick={() => {
                      setActionsMenu(null);
                      openPasswordDialog(menuRow);
                    }}
                  >
                    تغيير كلمة المرور
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemClass}
                    disabled={mutationPending}
                    onClick={() => {
                      setActionsMenu(null);
                      runToggleDisabled(menuRow, toggleDisabled);
                    }}
                  >
                    {menuRow.status === "DISABLED" ? "تنشيط" : "تعطيل"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemDangerClass}
                    disabled={mutationPending}
                    onClick={() => {
                      setActionsMenu(null);
                      runDeleteAccount(menuRow);
                    }}
                  >
                    حذف
                  </button>
                </div>
              );
            })(),
            document.body
          )
        : null}

      <ToastHost toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
