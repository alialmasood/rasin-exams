import Link from "next/link";

/** نص ودّي عندما يحتاج الجدول إلى ترحيل SQL كمستخدم postgres */
export function DbMigrationRequiredPanel(props: { message: string }) {
  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <section className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-8 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">مطلوب ترحيل قاعدة البيانات</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-800">{props.message}</p>
        <p className="mt-4 text-sm text-slate-600">
          نفّذ الأوامر أعلاه <strong>مرة واحدة</strong> كمستخدم لديه صلاحيات كافية (مثل{" "}
          <code className="rounded bg-white px-1 py-0.5 text-xs">postgres</code>)، ثم أعد تحميل الصفحة.
        </p>
        <Link href="/" className="mt-5 inline-block text-sm font-semibold text-blue-800 underline">
          العودة للرئيسية
        </Link>
      </section>
    </main>
  );
}
