"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type CollegeQuickActionKey =
  | "openAddBranch"
  | "openAddStudySubject"
  | "openAddRoom"
  | "openAddExamSchedule";

type CollegeQuickActionHandlers = Partial<Record<CollegeQuickActionKey, () => void>>;

type CollegeQuickActionsContextValue = {
  register: (handlers: CollegeQuickActionHandlers) => () => void;
  handlersRef: React.MutableRefObject<CollegeQuickActionHandlers>;
};

const CollegeQuickActionsContext = createContext<CollegeQuickActionsContextValue | null>(null);

export function CollegeQuickActionsProvider({ children }: { children: React.ReactNode }) {
  const handlersRef = useRef<CollegeQuickActionHandlers>({});

  const register = useCallback((handlers: CollegeQuickActionHandlers) => {
    const prev: CollegeQuickActionHandlers = {};
    for (const k of Object.keys(handlers) as CollegeQuickActionKey[]) {
      prev[k] = handlersRef.current[k];
      const fn = handlers[k];
      if (fn) handlersRef.current[k] = fn;
      else delete handlersRef.current[k];
    }
    return () => {
      for (const k of Object.keys(handlers) as CollegeQuickActionKey[]) {
        const was = prev[k];
        if (was) handlersRef.current[k] = was;
        else delete handlersRef.current[k];
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      register,
      handlersRef,
    }),
    [register]
  );

  return (
    <CollegeQuickActionsContext.Provider value={value}>
      {children}
      <CollegeFloatingQuickActions />
    </CollegeQuickActionsContext.Provider>
  );
}

export function useCollegeQuickActionsRegister(
  handlers: CollegeQuickActionHandlers,
  deps: React.DependencyList
) {
  const ctx = useContext(CollegeQuickActionsContext);
  useEffect(() => {
    if (!ctx) return;
    return ctx.register(handlers);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- المتصل يحدد التبعيات
  }, [ctx, ...deps]);
}

const QUICK_ROUTES: Record<CollegeQuickActionKey, { path: string; param: string }> = {
  openAddBranch: { path: "/dashboard/college/subjects", param: "branch" },
  openAddStudySubject: { path: "/dashboard/college/study-subjects", param: "study-subject" },
  openAddRoom: { path: "/dashboard/college/rooms-management", param: "room" },
  openAddExamSchedule: { path: "/dashboard/college/exam-schedules", param: "exam-schedule" },
};

const ACTION_ITEMS: Array<{
  key: CollegeQuickActionKey;
  label: string;
}> = [
  { key: "openAddBranch", label: "إضافة قسم أو فرع" },
  { key: "openAddStudySubject", label: "إضافة مادة دراسية" },
  { key: "openAddRoom", label: "إضافة قاعة" },
  { key: "openAddExamSchedule", label: "إضافة جدول امتحاني" },
];

function CollegeFloatingQuickActions() {
  const ctx = useContext(CollegeQuickActionsContext);
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!ctx) return null;

  const run = (key: CollegeQuickActionKey) => {
    const fn = ctx.handlersRef.current[key];
    if (typeof fn === "function") {
      fn();
    } else {
      const { path, param } = QUICK_ROUTES[key];
      router.push(`${path}?quick=${encodeURIComponent(param)}`);
    }
    setOpen(false);
  };

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="إغلاق القائمة"
          className="fixed inset-0 z-[85] bg-black/25 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
        />
      ) : null}

      {/* أسفل مودالات الأقسام/المواد (z-200) ومودال القاعة (z-100) وأعلى محتوى الصفحة */}
      <div className="fixed bottom-6 end-6 z-[88] flex flex-col items-start gap-2" dir="rtl">
        {open ? (
          <ul
            className="mb-1 flex max-w-[min(100vw-3rem,20rem)] flex-col gap-2 rounded-2xl border border-[#E2E8F0] bg-white p-2 shadow-xl shadow-slate-900/10"
            role="menu"
            aria-label="إجراءات سريعة"
          >
            {ACTION_ITEMS.map(({ key, label }) => (
              <li key={key}>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded-xl px-4 py-3 text-right text-sm font-semibold text-[#0F172A] transition hover:bg-[#EFF6FF] hover:text-[#1E3A8A]"
                  onClick={() => run(key)}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={open ? "إغلاق الإجراءات السريعة" : "فتح الإجراءات السريعة"}
          onClick={() => setOpen((v) => !v)}
          className="flex size-14 items-center justify-center rounded-full bg-[#1E3A8A] text-white shadow-lg shadow-[#1E3A8A]/35 ring-4 ring-white transition hover:bg-[#172554] focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/50"
        >
          {open ? (
            <svg className="size-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="size-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          )}
        </button>
      </div>
    </>
  );
}

/** بعد التوجيه من الزر العائم (?quick=) يفتح نفس المودال/الباني ويُزال الباراميتر من العنوان */
export function useCollegeQuickUrlTrigger(param: string, onMatch: () => void) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("quick") !== param) return;
    onMatch();
    const p = new URLSearchParams(searchParams.toString());
    p.delete("quick");
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [param, pathname, router, searchParams, onMatch]);
}
