import type { AdminSituationFormSubmissionView } from "@/lib/college-situation-form-submissions";

function formatNum(n: number): string {
  try {
    return new Intl.NumberFormat("en-US").format(n);
  } catch {
    return String(n);
  }
}

function formatExamDateAr(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ-u-ca-gregory-nu-latn", {
      dateStyle: "full",
      timeZone: "Asia/Baghdad",
    }).format(new Date(`${isoDate}T12:00:00`));
  } catch {
    return isoDate;
  }
}

function formatSubmittedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ-u-ca-gregory-nu-latn", {
      timeZone: "Asia/Baghdad",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function parseIntSafe(s: string): number {
  const n = parseInt(String(s ?? "").trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function buildGroups(rows: AdminSituationFormSubmissionView[]) {
  const byDate = new Map<string, Map<string, AdminSituationFormSubmissionView[]>>();
  for (const row of rows) {
    const d = row.payload.examDate.trim() || "—";
    if (!byDate.has(d)) byDate.set(d, new Map());
    const inner = byDate.get(d)!;
    const f = row.formationLabel.trim() || "—";
    if (!inner.has(f)) inner.set(f, []);
    inner.get(f)!.push(row);
  }
  const dates = [...byDate.keys()].filter((x) => x !== "—").sort((a, b) => b.localeCompare(a));
  if (byDate.has("—")) dates.push("—");
  return { byDate, dates };
}

function computeStats(rows: AdminSituationFormSubmissionView[]) {
  const formationSet = new Set<string>();
  const daySet = new Set<string>();
  let totalStudents = 0;
  let totalAbsent = 0;
  let totalRooms = 0;
  for (const r of rows) {
    formationSet.add(r.formationLabel);
    daySet.add(r.payload.examDate);
    totalStudents += parseIntSafe(r.payload.studentCount);
    totalAbsent += parseIntSafe(r.payload.absentCount);
    totalRooms += parseIntSafe(r.payload.roomCount);
  }
  return {
    totalSubmissions: rows.length,
    distinctFormations: formationSet.size,
    distinctExamDays: daySet.size,
    totalStudents,
    totalAbsent,
    totalRooms,
  };
}

export function AdminSituationsFollowupView({ rows }: { rows: AdminSituationFormSubmissionView[] }) {
  const stats = computeStats(rows);
  const { byDate, dates } = buildGroups(rows);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6" dir="rtl">
      <header className="relative overflow-hidden rounded-2xl border border-[#E8EEF7] bg-white px-5 py-4 shadow-sm">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#1E3A8A] via-[#2563EB] to-[#38BDF8]"
          aria-hidden
        />
        <h1 className="text-2xl font-extrabold text-[#0F172A]">متابعة المواقف الامتحانية</h1>
        <p className="mt-1 text-sm text-[#64748B]">
          مواقف النموذج المُرسلة من صفحة «رفع الموقف الامتحاني» لحسابات التشكيل، مجمّعة حسب{" "}
          <strong className="font-semibold text-[#475569]">يوم الامتحان</strong> ثم{" "}
          <strong className="font-semibold text-[#475569]">التشكيل</strong>.
        </p>
      </header>

      <section aria-label="إحصائيات موجزة" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="مواقف مسجّلة" value={formatNum(stats.totalSubmissions)} hint="إجمالي الإرسالات" accent="blue" />
        <StatCard title="تشكيلات شاركت" value={formatNum(stats.distinctFormations)} hint="حسابات مالكة" accent="slate" />
        <StatCard title="أيام امتحان" value={formatNum(stats.distinctExamDays)} hint="تواريخ مميّزة" accent="slate" />
        <StatCard title="مجموع الطلبة (مدرج)" value={formatNum(stats.totalStudents)} hint="من حقول النموذج" accent="emerald" />
        <StatCard title="مجموع الغياب (مدرج)" value={formatNum(stats.totalAbsent)} hint="من حقول النموذج" accent="amber" />
        <StatCard title="مجموع القاعات (مدرج)" value={formatNum(stats.totalRooms)} hint="من حقول النموذج" accent="blue" />
      </section>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-6 py-14 text-center text-sm text-[#64748B]">
          لا توجد مواقف مُرسلة من النموذج بعد. عند تأكيد الإرسال من صفحة التشكيل تظهر هنا تلقائياً.
        </div>
      ) : (
        <div className="space-y-10">
          {dates.map((dateKey) => {
            const formationsMap = byDate.get(dateKey)!;
            const formationKeys = [...formationsMap.keys()].sort((a, b) => a.localeCompare(b, "ar"));
            return (
              <section
                key={dateKey}
                className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm"
                aria-labelledby={`day-${dateKey}`}
              >
                <div className="border-b border-[#E2E8F0] bg-[#F1F5F9] px-4 py-3">
                  <h2 id={`day-${dateKey}`} className="text-base font-extrabold text-[#0F172A]">
                    {dateKey === "—" ? "بدون تاريخ في السجل" : formatExamDateAr(dateKey)}
                  </h2>
                  <p className="mt-0.5 text-xs font-semibold text-[#64748B]">
                    {formatNum(
                      formationKeys.reduce((s, fk) => s + (formationsMap.get(fk)?.length ?? 0), 0)
                    )}{" "}
                    موقفاً في هذا اليوم
                  </p>
                </div>
                <div className="space-y-6 p-4">
                  {formationKeys.map((formationKey) => {
                    const list = formationsMap.get(formationKey)!;
                    return (
                      <div key={`${dateKey}-${formationKey}`} className="rounded-xl border border-[#E8EEF7] bg-[#FAFBFC]">
                        <div className="border-b border-[#E2E8F0] bg-white px-3 py-2">
                          <h3 className="text-sm font-extrabold text-[#1E3A8A]">{formationKey}</h3>
                          <p className="text-[11px] text-[#64748B]">
                            {formatNum(list.length)} موقفاً · المستخدم: {list[0]?.ownerUsername ?? "—"}
                          </p>
                        </div>
                        <div className="overflow-x-auto p-2">
                          <table className="w-full min-w-[720px] border-collapse text-right text-sm">
                            <thead>
                              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-bold text-[#475569]">
                                <th className="px-2 py-2">ت</th>
                                <th className="px-2 py-2">المادة</th>
                                <th className="px-2 py-2">القسم</th>
                                <th className="px-2 py-2">المرحلة</th>
                                <th className="px-2 py-2">الامتحان</th>
                                <th className="px-2 py-2">طلبة / غياب</th>
                                <th className="px-2 py-2">وقت التسجيل</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F1F5F9]">
                              {list.map((item, idx) => (
                                <tr key={item.id} className="bg-white hover:bg-[#F0F9FF]/60">
                                  <td className="px-2 py-2 font-bold tabular-nums text-[#94A3B8]" lang="en">
                                    {idx + 1}
                                  </td>
                                  <td className="px-2 py-2 font-semibold text-[#0F172A]">{item.payload.subject}</td>
                                  <td className="px-2 py-2 text-[#334155]">{item.payload.department}</td>
                                  <td className="px-2 py-2 text-xs text-[#64748B]">{item.payload.stage}</td>
                                  <td className="px-2 py-2 text-xs text-[#64748B]">{item.payload.examType}</td>
                                  <td className="px-2 py-2 font-mono tabular-nums text-xs text-[#334155]" lang="en">
                                    {item.payload.studentCount || "—"} / {item.payload.absentCount || "—"}
                                  </td>
                                  <td className="px-2 py-2 text-[11px] text-[#64748B]" lang="en" dir="ltr">
                                    {formatSubmittedAt(item.submittedAtIso)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  hint,
  accent,
}: {
  title: string;
  value: string;
  hint: string;
  accent: "blue" | "slate" | "emerald" | "amber";
}) {
  const bar =
    accent === "emerald"
      ? "from-emerald-500/90 to-emerald-700"
      : accent === "amber"
        ? "from-amber-500/90 to-amber-700"
        : accent === "blue"
          ? "from-blue-600 to-indigo-800"
          : "from-slate-600 to-slate-800";
  return (
    <div className="relative flex min-h-[92px] flex-col justify-between overflow-hidden rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-sm">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l ${bar}`} aria-hidden />
      <p className="text-[10px] font-bold leading-tight text-[#64748B]">{title}</p>
      <p className="text-2xl font-extrabold tabular-nums tracking-tight text-[#0F172A]" lang="en">
        {value}
      </p>
      <p className="text-[10px] leading-tight text-[#94A3B8]">{hint}</p>
    </div>
  );
}
