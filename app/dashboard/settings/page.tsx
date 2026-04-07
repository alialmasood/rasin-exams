import { redirect } from "next/navigation";
import { isAdminRole, type UserRole } from "@/lib/authz";
import { getShowCollegeExamSituationUploadCta } from "@/lib/app-settings";
import { getSession } from "@/lib/session";
import { SettingsShowCtaForm } from "./settings-show-cta-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!isAdminRole(session.role as UserRole)) {
    redirect("/dashboard");
  }

  const showCta = await getShowCollegeExamSituationUploadCta();

  return (
    <div className="space-y-6" dir="rtl">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-[#1E3A8A]">الإعدادات</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          إعدادات عامة للنظام. التعديلات هنا تؤثر على جميع المستخدمين حسب نوع الإعداد.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm" aria-labelledby="settings-cta-heading">
        <h2 id="settings-cta-heading" className="sr-only">
          إظهار أو إخفاء زر الموقف الامتحاني في لوحة الكلية
        </h2>
        <SettingsShowCtaForm initialVisible={showCta} />
      </section>
    </div>
  );
}
