"use client";

import { useId, useState } from "react";

/** قيم نشاط 0–100 (الأعلى = أعلى على الرسم) */
const activityValues = [42, 65, 58, 72, 48, 81, 35];
const days = ["سبت", "أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة"];

const attendanceRows = [
  { label: "كلية التربية", pct: 92 },
  { label: "كلية الإدارة", pct: 84 },
  { label: "كلية العلوم", pct: 78 },
  { label: "كلية الآداب", pct: 67 },
];

const upcomingExams = [
  {
    subject: "هندسة البرمجيات",
    date: "2026/04/02",
    hall: "قاعة 112",
    college: "الهندسة",
    status: "مجدول" as const,
  },
  {
    subject: "قواعد البيانات",
    date: "2026/04/03",
    hall: "معمل 3",
    college: "علوم الحاسوب",
    status: "مجدول" as const,
  },
  {
    subject: "الشبكات",
    date: "2026/04/04",
    hall: "قاعة ب",
    college: "تقنية المعلومات",
    status: "مؤكد" as const,
  },
  {
    subject: "الذكاء الاصطناعي",
    date: "2026/04/05",
    hall: "قاعة 18",
    college: "علوم الحاسوب",
    status: "مجدول" as const,
  },
  {
    subject: "تحليل النظم",
    date: "2026/04/07",
    hall: "قاعة 2ج",
    college: "الإدارة والاقتصاد",
    status: "معلق" as const,
  },
];

function StatusBadge({ status }: { status: "مؤكد" | "معلق" | "مجدول" }) {
  const styles =
    status === "مؤكد"
      ? "bg-green-100 text-green-700"
      : status === "معلق"
        ? "bg-yellow-100 text-yellow-700"
        : "bg-blue-100 text-blue-700";
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold tracking-wide ${styles}`}>
      {status}
    </span>
  );
}

function WeeklyActivityChart() {
  const uid = useId().replace(/:/g, "");
  const fillGradId = `chart-fill-${uid}`;
  const lineGradId = `chart-line-${uid}`;

  const [hovered, setHovered] = useState<number | null>(null);

  const w = 560;
  const h = 220;
  const pad = { t: 16, r: 12, b: 36, l: 12 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const maxV = 100;
  const coords = activityValues.map((v, i) => {
    const x = pad.l + (i / (activityValues.length - 1)) * innerW;
    const y = pad.t + innerH - (v / maxV) * innerH;
    return { x, y };
  });
  const lineD = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaD = `${lineD} L ${coords[coords.length - 1].x} ${pad.t + innerH} L ${coords[0].x} ${pad.t + innerH} Z`;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => pad.t + t * innerH);

  const tooltipLeftPct = hovered !== null ? (coords[hovered].x / w) * 100 : 0;
  const tooltipTopPct = hovered !== null ? (coords[hovered].y / h) * 100 : 0;

  return (
    <div className="relative w-full overflow-hidden rounded-3xl" dir="ltr">
      <div className="relative">
        {hovered !== null ? (
          <div
            className="pointer-events-none absolute z-20 min-w-[7.5rem] -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-center shadow-[0_12px_40px_rgba(15,23,42,0.14),0_4px_12px_rgba(37,99,235,0.12)] ring-1 ring-[#2563EB]/10"
            style={{ left: `${tooltipLeftPct}%`, top: `${tooltipTopPct}%` }}
            role="tooltip"
          >
            <p className="text-[11px] font-bold text-[#64748B]">{days[hovered]}</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-[#1E3A8A]">{activityValues[hovered]}</p>
            <p className="text-[10px] font-semibold text-[#94A3B8]">مؤشر النشاط</p>
            <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-[#E2E8F0] bg-white" />
          </div>
        ) : null}

        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="h-auto w-full"
          preserveAspectRatio="xMidYMid meet"
          onMouseLeave={() => setHovered(null)}
        >
          <defs>
            <linearGradient id={fillGradId} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
              <stop offset="0%" stopColor="rgb(37, 99, 235)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="rgb(37, 99, 235)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={lineGradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#1E3A8A" />
              <stop offset="100%" stopColor="#2563EB" />
            </linearGradient>
          </defs>
          {gridLines.map((gy, i) => (
            <line
              key={i}
              x1={pad.l}
              y1={gy}
              x2={w - pad.r}
              y2={gy}
              stroke="#E2E8F0"
              strokeWidth={1}
              strokeDasharray="4 6"
            />
          ))}
          <path d={areaD} fill={`url(#${fillGradId})`} />
          <path
            d={lineD}
            fill="none"
            stroke={`url(#${lineGradId})`}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {coords.map((c, i) => {
            const active = hovered === i;
            return (
              <g key={i}>
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={20}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered(i)}
                />
                {active ? (
                  <circle cx={c.x} cy={c.y} r={16} fill="none" stroke="#2563EB" strokeOpacity={0.18} strokeWidth={1.5} />
                ) : null}
                <g
                  className="pointer-events-none"
                  style={{
                    transform: `translate(${c.x}px, ${c.y}px) scale(${active ? 1.38 : 1})`,
                    transformOrigin: "0 0",
                    transition: "transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                >
                  <circle cx={0} cy={0} r={4} fill="#FFFFFF" stroke="#2563EB" strokeWidth={active ? 2.75 : 2} />
                </g>
              </g>
            );
          })}
        </svg>
      </div>
      <div
        className="flex justify-between border-t border-[#E2E8F0] px-2 pb-1 pt-3 text-[11px] font-semibold text-[#64748B] sm:text-xs"
        dir="rtl"
      >
        {days.map((d) => (
          <span key={d} className="flex-1 text-center">
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DashboardOverview() {
  return (
    <div className="space-y-8" dir="rtl">
      {/* ترحيب + إجراءات */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl min-w-0 space-y-3 lg:max-w-none lg:flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-[#0F172A] md:text-4xl">لوحة التحكم</h1>
          <p className="text-base leading-relaxed text-[#64748B] md:text-lg lg:whitespace-nowrap lg:text-[clamp(0.8125rem,0.55vw+0.65rem,1.125rem)] lg:leading-snug xl:text-lg">
            متابعة شاملة لحالة الامتحانات، أعداد الطلبة، المؤشرات اليومية، والعمليات الإدارية في واجهة حديثة ومريحة بصريًا.
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-3">
          <button
            type="button"
            className="rounded-2xl border border-[#E2E8F0] bg-white px-5 py-2.5 text-sm font-bold text-[#1E3A8A] shadow-sm transition hover:border-[#2563EB]/30 hover:shadow-md"
          >
            تصدير التقارير
          </button>
          <button
            type="button"
            className="rounded-2xl bg-gradient-to-br from-[#F59E0B] to-[#D97706] px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-amber-500/25 transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            إجراء إداري سريع
          </button>
        </div>
      </div>

      {/* بطاقات الإحصائيات */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div
          className="group relative isolate overflow-hidden rounded-3xl p-6 text-white ring-1 ring-white/20 transition-all duration-300 ease-out will-change-transform hover:-translate-y-[4px] hover:shadow-[0_18px_48px_rgba(37,99,235,0.38)]"
          style={{
            background: "linear-gradient(135deg, #1E3A8A, #2563EB)",
            boxShadow: "0 10px 30px rgba(37, 99, 235, 0.25)",
          }}
        >
          <div
            className="pointer-events-none absolute -left-12 -top-12 size-44 rounded-full bg-white/[0.12] blur-2xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-20 -right-8 size-56 rounded-full bg-sky-300/30 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-white/35 to-transparent"
            aria-hidden
          />
          <div className="relative">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="min-w-0 text-sm font-semibold text-white/90">إجمالي الامتحانات</p>
              <span className="inline-flex shrink-0 rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-white ring-1 ring-white/30 backdrop-blur-[2px]">
                مباشر
              </span>
            </div>
            <p className="mt-2 text-4xl font-bold tracking-tight text-white drop-shadow-sm md:text-5xl">128</p>
            <p className="mt-2 text-sm text-white/80">جميع الفصول الدراسية</p>
          </div>
        </div>

        {(
          [
            {
              title: "الطلاب المسجلون",
              value: "4,392",
              sub: "نشطون هذا العام",
              accent: "#10B981",
              badgeClass: "bg-emerald-50 text-emerald-800 ring-emerald-500/20",
              titleClass: "text-emerald-900/80",
              hoverShadow: "hover:shadow-[0_12px_28px_rgba(16,185,129,0.14)]",
            },
            {
              title: "امتحانات اليوم",
              value: "14",
              sub: "في 6 كليات",
              accent: "#F59E0B",
              badgeClass: "bg-amber-50 text-amber-900 ring-amber-500/25",
              titleClass: "text-amber-900/75",
              hoverShadow: "hover:shadow-[0_12px_28px_rgba(245,158,11,0.18)]",
            },
            {
              title: "تنبيهات",
              value: "3",
              sub: "تتطلب متابعة",
              warn: true,
              accent: "#EF4444",
              badgeClass: "bg-red-50 text-red-800 ring-red-500/20",
              titleClass: "text-red-900/75",
              hoverShadow: "hover:shadow-[0_12px_28px_rgba(239,68,68,0.16)]",
            },
          ] as const
        ).map((card) => (
          <div
            key={card.title}
            className={`group rounded-3xl border border-[#E2E8F0] border-t-4 bg-white p-6 shadow-sm shadow-[#0F172A]/[0.04] transition duration-300 hover:-translate-y-1 hover:shadow-md ${card.hoverShadow}`}
            style={{ borderTopColor: card.accent }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className={`min-w-0 text-sm font-semibold ${card.titleClass}`}>{card.title}</p>
              <span
                className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 ${card.badgeClass}`}
              >
                مباشر
              </span>
            </div>
            <p
              className={`mt-2 text-4xl font-bold tracking-tight ${"warn" in card && card.warn ? "text-[#EF4444]" : "text-[#0F172A]"}`}
            >
              {card.value}
            </p>
            <p className="mt-2 text-sm text-[#64748B]">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* رسوم ومؤشرات */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-sm transition hover:shadow-md">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#0F172A]">النشاط الأسبوعي</h2>
                <p className="mt-1 text-sm text-[#64748B]">اتجاه الحركة اليومية للأنشطة الامتحانية والإدارية.</p>
              </div>
              <button
                type="button"
                className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-xs font-bold text-[#1E3A8A] transition hover:border-[#2563EB]/25"
              >
                هذا الأسبوع
              </button>
            </div>
            <div className="rounded-2xl bg-gradient-to-b from-[#EFF6FF] to-white p-4 ring-1 ring-[#E2E8F0]/80">
              <WeeklyActivityChart />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-sm transition hover:shadow-md">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-[#0F172A]">مؤشر الحضور</h2>
                <p className="text-xs text-[#64748B]">نسب تقديرية حسب الكليات</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-[#10B981] ring-1 ring-emerald-500/20">
                +8.2%
              </span>
            </div>
            <ul className="space-y-4">
              {attendanceRows.map((row) => (
                <li key={row.label}>
                  <div className="mb-1.5 flex justify-between text-xs font-semibold">
                    <span className="text-[#0F172A]">{row.label}</span>
                    <span className="text-[#64748B]">{row.pct}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-[#F1F5F9]">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-[#1E3A8A] to-[#2563EB] transition-all duration-500"
                      style={{ width: `${row.pct}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-sm transition hover:shadow-md">
            <h2 className="mb-4 text-lg font-bold text-[#0F172A]">ملخص سريع</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "القاعات الفعالة", value: "26" },
                { label: "الطلبات الجديدة", value: "12" },
                { label: "مراقبات اليوم", value: "48" },
                { label: "الحالات الحرجة", value: "2", danger: true },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC]/80 p-4 text-right transition hover:border-[#2563EB]/20"
                >
                  <p className="text-xs font-semibold text-[#64748B]">{item.label}</p>
                  <p className={`mt-1 text-2xl font-bold ${item.danger ? "text-[#EF4444]" : "text-[#0F172A]"}`}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* جدول الامتحانات */}
      <div className="overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white shadow-sm transition hover:shadow-md">
        <div className="flex flex-col gap-4 border-b border-[#E2E8F0] bg-[#F8FAFC]/50 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#0F172A]">الامتحانات القادمة</h2>
            <p className="mt-1 text-sm text-[#64748B]">عرض منظم للمواد المجدولة والقاعات والحالات.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-bold text-[#64748B] shadow-sm transition hover:text-[#1E3A8A]"
            >
              فلترة
            </button>
            <button
              type="button"
              className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-bold text-[#1E3A8A] shadow-sm transition hover:border-[#2563EB]/30"
            >
              عرض كامل
            </button>
          </div>
        </div>
        <div className="px-1 pb-1">
          <table className="w-full border-separate border-spacing-0 text-right text-sm">
            <thead>
              <tr className="border-b-2 border-[#E2E8F0] bg-[#F1F5F9]">
                <th className="px-7 py-5 text-sm font-extrabold uppercase tracking-wider text-[#475569] first:rounded-tr-2xl">
                  المادة
                </th>
                <th className="px-7 py-5 text-sm font-extrabold uppercase tracking-wider text-[#475569]">التاريخ</th>
                <th className="px-7 py-5 text-sm font-extrabold uppercase tracking-wider text-[#475569]">القاعة</th>
                <th className="px-7 py-5 text-sm font-extrabold uppercase tracking-wider text-[#475569]">الكلية</th>
                <th className="px-7 py-5 text-sm font-extrabold uppercase tracking-wider text-[#475569] last:rounded-tl-2xl">
                  الحالة
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {upcomingExams.map((row) => (
                <tr
                  key={row.subject}
                  className="origin-center transition-all duration-200 ease-out hover:z-[1] hover:bg-[#F1F5F9] hover:[transform:scale(1.01)] hover:shadow-sm"
                >
                  <td className="px-7 py-4.5 font-semibold text-[#0F172A]">{row.subject}</td>
                  <td className="px-7 py-4.5 text-[#64748B]">{row.date}</td>
                  <td className="px-7 py-4.5 text-[#64748B]">{row.hall}</td>
                  <td className="px-7 py-4.5 text-[#64748B]">{row.college}</td>
                  <td className="px-7 py-4.5">
                    <StatusBadge status={row.status} />
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
