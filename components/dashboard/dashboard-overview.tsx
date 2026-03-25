"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const activityData = [
  { name: "سبت", نشاط: 42 },
  { name: "أحد", نشاط: 65 },
  { name: "إثنين", نشاط: 58 },
  { name: "ثلاثاء", نشاط: 72 },
  { name: "أربعاء", نشاط: 48 },
  { name: "خميس", نشاط: 81 },
  { name: "جمعة", نشاط: 35 },
];

const attendanceData = [
  { name: "كلية الهندسة", حضور: 88 },
  { name: "كلية العلوم", حضور: 76 },
  { name: "كلية الإدارة", حضور: 82 },
  { name: "كلية التربية", حضور: 91 },
  { name: "كلية الآداب", حضور: 69 },
];

const upcomingExams = [
  { subject: "هندسة البرمجيات", date: "2025/04/02", hall: "قاعة 12أ", status: "مجدول" },
  { subject: "قواعد البيانات", date: "2025/04/03", hall: "معمل 3", status: "مجدول" },
  { subject: "الشبكات", date: "2025/04/04", hall: "قاعة 5ب", status: "تأكيد" },
  { subject: "الذكاء الاصطناعي", date: "2025/04/05", hall: "قاعة 8أ", status: "مجدول" },
  { subject: "تحليل النظم", date: "2025/04/07", hall: "قاعة 2ج", status: "معلّق" },
];

const tooltipStyle = {
  backgroundColor: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  fontSize: "12px",
};

function StatCard(props: {
  title: string;
  value: string;
  hint: string;
  accent?: "blue" | "amber" | "emerald" | "rose";
}) {
  const ring =
    props.accent === "amber"
      ? "from-[#F59E0B]/20 to-transparent"
      : props.accent === "emerald"
        ? "from-emerald-500/15 to-transparent"
        : props.accent === "rose"
          ? "from-rose-500/15 to-transparent"
          : "from-[#3B82F6]/15 to-transparent";
  return (
    <div className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition duration-300 hover:border-[#3B82F6]/25 hover:shadow-md">
      <div className={`mb-3 inline-flex rounded-xl bg-gradient-to-br ${ring} p-2.5 ring-1 ring-slate-100`}>
        <span className="text-xs font-semibold text-slate-500">{props.title}</span>
      </div>
      <p className="text-2xl font-bold tracking-tight text-[#1E3A8A] md:text-3xl">{props.value}</p>
      <p className="mt-1 text-xs text-slate-500">{props.hint}</p>
    </div>
  );
}

export function DashboardOverview() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">لوحة التحكم</h1>
        <p className="mt-1 text-sm text-slate-600">نظرة عامة على الامتحانات والأنشطة اليومية — بيانات تجريبية للعرض.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="إجمالي الامتحانات" value="128" hint="جميع الفصول الدراسية" accent="blue" />
        <StatCard title="الطلاب المسجّلون" value="4,392" hint="نشطون هذا العام" accent="emerald" />
        <StatCard title="امتحانات اليوم" value="14" hint="في 6 كليات" accent="amber" />
        <StatCard title="تنبيهات" value="3" hint="تتطلب متابعة" accent="rose" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:shadow-md">
          <h2 className="mb-4 text-sm font-bold text-slate-800">النشاط الأسبوعي</h2>
          <div className="h-72 w-full min-h-[240px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activityData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="نشاط" stroke="#3B82F6" strokeWidth={2.5} dot={{ fill: "#1E3A8A", r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:shadow-md">
          <h2 className="mb-4 text-sm font-bold text-slate-800">مؤشر الحضور (نسب تجريبية)</h2>
          <div className="h-72 w-full min-h-[240px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attendanceData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" domain={[0, 100]} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="حضور" fill="#1E3A8A" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition hover:shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800">الامتحانات القادمة</h2>
          <span className="rounded-full bg-[#F59E0B]/15 px-3 py-1 text-xs font-semibold text-amber-800">عرض توضيحي</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-right text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-[#F8FAFC]/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">المادة</th>
                <th className="px-5 py-3">التاريخ</th>
                <th className="px-5 py-3">القاعة</th>
                <th className="px-5 py-3">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {upcomingExams.map((row, i) => (
                <tr key={i} className="transition hover:bg-slate-50/80">
                  <td className="px-5 py-3.5 font-medium text-slate-800">{row.subject}</td>
                  <td className="px-5 py-3.5 text-slate-600">{row.date}</td>
                  <td className="px-5 py-3.5 text-slate-600">{row.hall}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        row.status === "تأكيد"
                          ? "bg-emerald-100 text-emerald-800"
                          : row.status === "معلّق"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
