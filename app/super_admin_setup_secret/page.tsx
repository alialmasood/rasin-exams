import Link from "next/link";
import { DbMigrationRequiredPanel } from "@/components/db-migration-required-panel";
import { isDatabaseConfigured } from "@/lib/db";
import { tryGetSystemAdminForPage } from "@/lib/users";
import { GateSetupClient } from "@/app/super_admin_setup_secret/gate-setup-client";

export const dynamic = "force-dynamic";

export default async function SuperAdminSetupSecretPage() {
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

  if (admin) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-100 to-white p-6">
        <div className="mx-auto max-w-xl space-y-6">
          <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">تأسيس مدير النظام</h1>
            <p className="mt-2 text-sm text-slate-600">
              يوجد بالفعل حساب مدير نظام في النظام (<strong>{admin.username}</strong>). هذه الصفحة (<code className="rounded bg-slate-100 px-1 text-xs">/super_admin_setup_secret</code>)
              مخصّصة <strong>لمرة التأسيس فقط</strong>، لذلك لن يُعرض نموذج إنشاء حساب ثانٍ هنا.
            </p>
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/80 p-4 text-sm text-slate-700">
              <p className="font-semibold text-[#1E3A8A]">إدارة حساب الأدمن</p>
              <p className="mt-2 leading-relaxed">
                لعرض الحساب، <strong>تغيير كلمة المرور</strong>، أو <strong>تعطيل/تفعيل</strong> الحساب، افتح صفحة{" "}
                <Link href="/super-admin" className="font-semibold text-blue-800 underline">
                  إعداد مدير النظام (/super-admin)
                </Link>
                وأدخل <strong>رمز الوصول</strong> المعرف في الخادم (<code className="rounded bg-white px-1">SUPER_ADMIN_SETUP_SECRET</code> في ملف{" "}
                <code className="rounded bg-white px-1">.env.local</code>).
              </p>
              <p className="mt-2 text-xs text-slate-600">
                الدخول اليومي للوحة التحكم يتم من الصفحة الرئيسية باسم المستخدم وكلمة المرور بعد تفعيل الحساب.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-4">
              <Link href="/super-admin" className="text-sm font-semibold text-blue-800 underline">
                فتح صفحة الإدارة
              </Link>
              <Link href="/" className="text-sm font-semibold text-blue-800 underline">
                الرئيسية
              </Link>
            </div>
          </header>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-white p-6">
      <div className="mx-auto max-w-xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">نظام رصين</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">إعداد مدير النظام</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            هذه الصفحة مخصّصة <strong>فقط</strong> لإنشاء أول حساب بصلاحية مدير النظام (ADMIN). ابدأ بإدخال رمز الدخول، ثم املأ بيانات الحساب.
          </p>
          <Link href="/" className="mt-3 inline-block text-sm text-blue-800 underline">
            الرئيسية
          </Link>
        </header>

        <GateSetupClient />
      </div>
    </main>
  );
}
