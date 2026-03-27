import { redirect } from "next/navigation";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CollegePortalPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "COLLEGE") {
    redirect("/dashboard");
  }

  const profile = await getCollegeProfileByUserId(session.uid);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="rounded-3xl border border-[#E2E8F0] bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-[#0F172A]">لوحة الكلية</h1>
        <p className="mt-2 text-[#64748B]">
          مرحبًا بك في بوابة التشكيل. يمكنك متابعة الامتحانات والإجراءات الخاصة بكليتك من هنا عند تفعيل
          الوحدات لاحقًا.
        </p>
        {profile ? (
          <dl className="mt-8 grid gap-4 border-t border-[#E2E8F0] pt-6 sm:grid-cols-2">
            {profile.account_kind === "FOLLOWUP" ? (
              <div className="sm:col-span-2">
                <dt className="text-xs font-bold uppercase tracking-wide text-[#94A3B8]">صاحب الحساب</dt>
                <dd className="mt-1 text-lg font-semibold text-[#0F172A]">
                  {profile.holder_name ?? "—"}
                </dd>
              </div>
            ) : (
              <>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-[#94A3B8]">التشكيل</dt>
                  <dd className="mt-1 text-lg font-semibold text-[#0F172A]">
                    {profile.formation_name ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-[#94A3B8]">عميد الكلية</dt>
                  <dd className="mt-1 text-lg font-semibold text-[#0F172A]">
                    {profile.dean_name ?? "—"}
                  </dd>
                </div>
              </>
            )}
            <div className="sm:col-span-2">
              <dt className="text-xs font-bold uppercase tracking-wide text-[#94A3B8]">اسم المستخدم</dt>
              <dd className="mt-1 font-mono text-base text-[#1E3A8A]">{session.username}</dd>
            </div>
          </dl>
        ) : null}
      </div>
    </div>
  );
}
