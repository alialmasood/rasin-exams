import type { ReactNode } from "react";
import Link from "next/link";
import { DbMigrationRequiredPanel } from "@/components/db-migration-required-panel";
import { isDatabaseConfigured } from "@/lib/db";
import { tryGetSystemAdminForPage } from "@/lib/users";
import {
  changeSystemAdminPasswordAction,
  createSystemAdminAction,
  toggleSystemAdminAction,
} from "@/app/super-admin/actions";

export const dynamic = "force-dynamic";

function FieldLabel(props: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={props.htmlFor} className="block text-sm font-semibold text-slate-700">
      {props.children}
    </label>
  );
}

export default async function SuperAdminPage() {
  const dbOk = isDatabaseConfigured();

  if (!dbOk) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <section className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-8 shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">قاعدة البيانات غير مهيأة</h1>
          <p className="mt-2 text-sm text-slate-700">
            أضف <code className="rounded bg-white px-1">DATABASE_URL</code> إلى <code className="rounded bg-white px-1">.env.local</code> ثم أعد التشغيل.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm font-semibold text-blue-800 underline">
            العودة للرئيسية
          </Link>
        </section>
      </main>
    );
  }

  const ctx = await tryGetSystemAdminForPage();
  if (ctx.migrationRequired) {
    return <DbMigrationRequiredPanel message={ctx.message} />;
  }
  const admin = ctx.admin;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-white p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">نظام رصين</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">إعداد مدير النظام</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            هذه الصفحة مخصصة لمرة التأسيس وصيانة حساب <strong>مدير النظام</strong> (ADMIN) فقط. أدخل{" "}
            <strong>رمز الوصول</strong> المعرف في الخادم ثم نفّذ العملية المطلوبة. لا يوجد تسجيل دخول عام
            هنا.
          </p>
          <Link href="/" className="mt-3 inline-block text-sm text-blue-800 underline">
            الرئيسية
          </Link>
        </header>

        {!admin ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800">إنشاء حساب مدير النظام</h2>
            <p className="mt-1 text-sm text-slate-600">
              يُسمح بحساب <strong>واحد</strong> فقط من نوع مدير النظام. كلمة المرور تُخزَّن مشفرة (bcrypt)
              ولا تُعرض بعد الحفظ.
            </p>
            <form action={createSystemAdminAction} className="mt-5 grid gap-4">
              <div>
                <FieldLabel htmlFor="setupSecret">رمز الوصول للإعداد</FieldLabel>
                <input
                  id="setupSecret"
                  name="setupSecret"
                  type="password"
                  autoComplete="off"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
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
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800">حساب مدير النظام الحالي</h2>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">الاسم</dt>
                  <dd className="font-medium text-slate-900">{admin.full_name}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">اسم المستخدم</dt>
                  <dd className="font-medium text-slate-900">{admin.username}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">الحالة</dt>
                  <dd>
                    <span
                      className={
                        admin.status === "ACTIVE"
                          ? "inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800"
                          : "inline-flex rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-800"
                      }
                    >
                      {admin.status === "ACTIVE" ? "نشط" : "معطّل"}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">تاريخ الإنشاء</dt>
                  <dd className="text-slate-800">
                    {new Date(admin.created_at).toLocaleString("ar-IQ")}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-800">تغيير كلمة المرور</h3>
              <form action={changeSystemAdminPasswordAction} className="mt-4 grid gap-4">
                <input type="hidden" name="userId" value={admin.id} />
                <div>
                  <FieldLabel htmlFor="chg-setup">رمز الوصول</FieldLabel>
                  <input
                    id="chg-setup"
                    name="setupSecret"
                    type="password"
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="newPassword">كلمة المرور الجديدة</FieldLabel>
                  <input
                    id="newPassword"
                    name="newPassword"
                    type="password"
                    minLength={8}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="newConfirm">تأكيد كلمة المرور</FieldLabel>
                  <input
                    id="newConfirm"
                    name="confirmPassword"
                    type="password"
                    minLength={8}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  حفظ كلمة المرور
                </button>
              </form>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-800">تعطيل / تفعيل الحساب</h3>
              <p className="mt-1 text-sm text-slate-600">
                عند التعطيل لا يُنصح باستخدام الحساب في أي تدفق دخول لاحق ستربطه به المشروع.
              </p>
              <form action={toggleSystemAdminAction} className="mt-4 grid gap-4">
                <input type="hidden" name="userId" value={admin.id} />
                <input type="hidden" name="disabled" value={admin.status === "ACTIVE" ? "true" : "false"} />
                <div>
                  <FieldLabel htmlFor="tog-setup">رمز الوصول</FieldLabel>
                  <input
                    id="tog-setup"
                    name="setupSecret"
                    type="password"
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    autoComplete="off"
                  />
                </div>
                <button
                  type="submit"
                  className={
                    admin.status === "ACTIVE"
                      ? "rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-100"
                      : "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
                  }
                >
                  {admin.status === "ACTIVE" ? "تعطيل حساب مدير النظام" : "تفعيل حساب مدير النظام"}
                </button>
              </form>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
