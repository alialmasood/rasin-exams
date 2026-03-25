"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import {
  confirmSuperAdminGatePin,
  createAdminViaGateAction,
  type CreateAdminViaGateFormState,
} from "@/app/super_admin_setup_secret/actions";

function FieldLabel(props: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={props.htmlFor} className="block text-sm font-semibold text-slate-700">
      {props.children}
    </label>
  );
}

export function GateSetupClient() {
  const [pin, setPin] = useState("");
  const [gateError, setGateError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [checking, startCheck] = useTransition();

  const [createState, createFormAction] = useActionState<
    CreateAdminViaGateFormState | null,
    FormData
  >(createAdminViaGateAction, null);

  function tryUnlock(e: React.FormEvent) {
    e.preventDefault();
    setGateError(null);
    startCheck(async () => {
      const r = await confirmSuperAdminGatePin(pin.trim());
      if (r.ok) {
        setUnlocked(true);
      } else {
        setGateError("الرمز غير صحيح.");
      }
    });
  }

  if (createState?.status === "success") {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-emerald-900">تم إنشاء حساب مدير النظام</h2>
        <p className="mt-2 text-sm text-emerald-800">
          يمكنك الآن تسجيل الدخول من الصفحة الرئيسية باستخدام اسم المستخدم وكلمة المرور التي اخترتها.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          العودة للرئيسية
        </Link>
      </section>
    );
  }

  if (!unlocked) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">رمز الدخول</h2>
        <p className="mt-1 text-sm text-slate-600">أدخل الرمز المكوّن من أربعة أرقام للمتابعة.</p>
        <form onSubmit={tryUnlock} className="mt-5 grid gap-4">
          <div>
            <FieldLabel htmlFor="gatePinInput">الرمز</FieldLabel>
            <input
              id="gatePinInput"
              name="pin"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={12}
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest"
              placeholder="••••"
              aria-invalid={Boolean(gateError)}
            />
            {gateError ? (
              <p className="mt-1 text-sm text-red-700" role="alert">
                {gateError}
              </p>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={checking || !pin.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white enabled:hover:bg-slate-800 disabled:opacity-50"
          >
            {checking ? "جاري التحقق…" : "متابعة"}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">إنشاء حساب مدير النظام</h2>
      <p className="mt-1 text-sm text-slate-600">
        يُسمح بحساب <strong>واحد</strong> فقط. كلمة المرور تُخزَّن مشفرة ولا تُعرض لاحقًا.
      </p>
      {createState?.status === "error" ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {createState.message}
        </p>
      ) : null}
      <form action={createFormAction} className="mt-5 grid gap-4">
        <input type="hidden" name="gatePin" value={pin.trim()} />
        <div>
          <FieldLabel htmlFor="fullName">الاسم الكامل</FieldLabel>
          <input
            id="fullName"
            name="fullName"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <FieldLabel htmlFor="username">اسم المستخدم</FieldLabel>
          <input
            id="username"
            name="username"
            required
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <FieldLabel htmlFor="password">كلمة المرور</FieldLabel>
          <input
            id="password"
            name="password"
            type="password"
            minLength={8}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <FieldLabel htmlFor="confirmPassword">تأكيد كلمة المرور</FieldLabel>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            minLength={8}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          إنشاء مدير النظام
        </button>
      </form>
    </section>
  );
}
