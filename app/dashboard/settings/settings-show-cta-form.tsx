"use client";

import { useActionState } from "react";
import { updateShowCollegeExamSituationCtaAction } from "./actions";

type Props = {
  initialVisible: boolean;
};

export function SettingsShowCtaForm({ initialVisible }: Props) {
  const [state, formAction, pending] = useActionState(updateShowCollegeExamSituationCtaAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-[#F8FAFC] p-4">
        <legend className="px-1 text-sm font-bold text-[#0F172A]">
          زر «رفع الموقف الامتحاني» في لوحة الكلية
        </legend>
        <p className="text-xs leading-relaxed text-slate-600">
          يتحكم بظهور الزر الأزرق الكبير في صفحة{" "}
          <span className="font-mono text-[11px] text-slate-800">/dashboard/college</span> لجميع مستخدمي حسابات
          التشكيل. لا يؤثر على عناصر القائمة الجانبية الأخرى.
        </p>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm has-[:checked]:border-[#2563EB] has-[:checked]:ring-2 has-[:checked]:ring-[#2563EB]/20">
            <input
              type="radio"
              name="show_cta"
              value="true"
              defaultChecked={initialVisible}
              className="size-4 accent-[#2563EB]"
            />
            إظهار زر تفعيل الموقف الامتحاني
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm has-[:checked]:border-[#2563EB] has-[:checked]:ring-2 has-[:checked]:ring-[#2563EB]/20">
            <input
              type="radio"
              name="show_cta"
              value="false"
              defaultChecked={!initialVisible}
              className="size-4 accent-[#2563EB]"
            />
            إخفاء زر تفعيل الموقف الامتحاني
          </label>
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-[#1E40AF] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#1E3A8A] disabled:opacity-60"
        >
          {pending ? "جاري الحفظ…" : "حفظ الإعداد"}
        </button>
        {state?.ok === true ? (
          <span className="text-sm font-semibold text-emerald-700" role="status">
            تم حفظ الإعداد.
          </span>
        ) : null}
        {state?.ok === false ? (
          <span className="text-sm font-semibold text-red-700" role="alert">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
