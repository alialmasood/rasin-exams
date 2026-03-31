"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { AdminCollegeExamRoomRow } from "@/lib/college-rooms";
import {
  adminRoomsExcelFilename,
  adminRoomsRowsToExcelRecords,
  buildAdminRoomsReportHtml,
  printAdminRoomsReportHtml,
} from "@/lib/admin-rooms-report-html";
import { fetchAdminCollegeExamRoomsAction } from "./actions";

const REFRESH_MS = 20_000;

function shiftCapacityLabel(row: AdminCollegeExamRoomRow, slot: 1 | 2) {
  if (slot === 1) {
    return `${row.capacity_total} (ص ${row.capacity_morning} + م ${row.capacity_evening})`;
  }
  if (!row.study_subject_id_2) return "—";
  return `${row.capacity_total_2} (ص ${row.capacity_morning_2} + م ${row.capacity_evening_2})`;
}

function subjectLine(name: string, stage: number) {
  return `${name} — مرحلة ${stage}`;
}

function truncate(s: string, max: number) {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatTime(v: Date | string) {
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-IQ", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(d);
}

type FormationGroup = {
  ownerId: string;
  formationLabel: string;
  ownerUsername: string;
  rooms: AdminCollegeExamRoomRow[];
};

/** يحافظ على ترتيب الظهور كما في الاستعلام (تشكيل ثم مستخدم ثم تسلسل). */
function groupRowsByOwnerOrdered(rows: AdminCollegeExamRoomRow[]): FormationGroup[] {
  const order: string[] = [];
  const map = new Map<string, AdminCollegeExamRoomRow[]>();
  for (const r of rows) {
    if (!map.has(r.owner_user_id)) {
      order.push(r.owner_user_id);
      map.set(r.owner_user_id, []);
    }
    map.get(r.owner_user_id)!.push(r);
  }
  return order.map((ownerId) => {
    const rooms = map.get(ownerId)!;
    const first = rooms[0];
    return {
      ownerId,
      formationLabel: first.formation_label,
      ownerUsername: first.owner_username,
      rooms,
    };
  });
}

function groupCapacity(rooms: AdminCollegeExamRoomRow[]) {
  let cap = 0;
  for (const r of rooms) {
    cap += r.capacity_total;
    if (r.study_subject_id_2) cap += r.capacity_total_2;
  }
  return cap;
}

function FormationRoomsTable({ rows }: { rows: AdminCollegeExamRoomRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-[#64748B]">لا توجد قاعات لهذا الحساب.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] table-fixed border-collapse text-right">
        <colgroup>
          <col style={{ width: "5%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "9%" }} />
        </colgroup>
        <thead className="bg-[#F1F5F9]">
          <tr className="border-b border-[#E2E8F0]">
            <th className="border-b border-[#E2E8F0] px-2 py-2.5 text-center text-xs font-bold text-[#334155] sm:text-sm">تسلسل</th>
            <th className="border-b border-[#E2E8F0] px-2 py-2.5 text-xs font-bold text-[#334155] sm:text-sm">اسم القاعة</th>
            <th className="border-b border-[#E2E8F0] px-2 py-2.5 text-xs font-bold text-[#334155] sm:text-sm">مشرف القاعة</th>
            <th className="border-b border-[#E2E8F0] px-2 py-2.5 text-xs font-bold text-[#334155] sm:text-sm">المادة والمرحلة</th>
            <th className="border-b border-[#E2E8F0] px-2 py-2.5 text-center text-xs font-bold text-[#334155] sm:text-sm">الوضع</th>
            <th className="border-b border-[#E2E8F0] px-2 py-2.5 text-xs font-bold text-[#334155] sm:text-sm">السعة</th>
            <th className="border-b border-[#E2E8F0] px-2 py-2.5 text-center text-xs font-bold text-[#334155] sm:text-sm">الحضور</th>
            <th className="border-b border-[#E2E8F0] px-2 py-2.5 text-center text-xs font-bold text-[#334155] sm:text-sm">الغياب</th>
            <th className="border-b border-[#E2E8F0] px-2 py-2.5 text-xs font-bold text-[#334155] sm:text-sm">المراقبون</th>
            <th className="border-b border-[#E2E8F0] px-2 py-2.5 text-xs font-bold text-[#334155] sm:text-sm">تعديل السجل</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E2E8F0] bg-white">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-[#F8FAFC]">
              <td className="border-b border-[#E2E8F0] px-2 py-2 text-center text-[11px] tabular-nums text-[#334155]">{row.serial_no}</td>
              <td className="max-w-0 border-b border-[#E2E8F0] px-2 py-2 break-words text-[11px] font-semibold text-[#0F172A]">{row.room_name}</td>
              <td className="max-w-0 border-b border-[#E2E8F0] px-2 py-2 break-words text-[11px] text-[#334155]">{row.supervisor_name}</td>
              <td className="max-w-0 border-b border-[#E2E8F0] px-2 py-2 align-top break-words text-[11px] text-[#334155]">
                <div>{subjectLine(row.study_subject_name, row.stage_level)}</div>
                {row.study_subject_id_2 && row.study_subject_name_2 != null && row.stage_level_2 != null ? (
                  <div className="mt-0.5 text-[#475569]">{subjectLine(row.study_subject_name_2, row.stage_level_2)}</div>
                ) : null}
              </td>
              <td className="border-b border-[#E2E8F0] px-2 py-2 text-center">
                {row.study_subject_id_2 ? (
                  <span className="inline-flex rounded-md bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-bold text-[#B45309]">امتحانان</span>
                ) : (
                  <span className="text-[10px] text-[#64748B]">واحد</span>
                )}
              </td>
              <td className="max-w-0 border-b border-[#E2E8F0] px-2 py-2 break-words text-[11px] tabular-nums text-[#334155]">
                <div>
                  <span className="font-semibold text-[#64748B]">١:</span> {shiftCapacityLabel(row, 1)}
                </div>
                {row.study_subject_id_2 ? (
                  <div className="mt-0.5">
                    <span className="font-semibold text-[#64748B]">٢:</span> {shiftCapacityLabel(row, 2)}
                  </div>
                ) : null}
              </td>
              <td className="border-b border-[#E2E8F0] px-2 py-2 text-center text-[11px] tabular-nums text-emerald-800">
                {row.attendance_count}
                {row.study_subject_id_2 ? (
                  <>
                    <span className="text-[#94A3B8]"> / </span>
                    {row.attendance_count_2}
                  </>
                ) : null}
              </td>
              <td className="border-b border-[#E2E8F0] px-2 py-2 text-center text-[11px] tabular-nums text-[#B45309]">
                {row.absence_count}
                {row.study_subject_id_2 ? (
                  <>
                    <span className="text-[#94A3B8]"> / </span>
                    {row.absence_count_2}
                  </>
                ) : null}
              </td>
              <td className="max-w-0 border-b border-[#E2E8F0] px-2 py-2 break-words text-[10px] leading-snug text-[#475569]">
                {truncate(row.invigilators, 80)}
              </td>
              <td className="max-w-0 border-b border-[#E2E8F0] px-2 py-2 break-words text-[10px] text-[#64748B]">{formatTime(row.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Props = {
  initialRows: AdminCollegeExamRoomRow[];
};

export function AdminRoomsPanel({ initialRows }: Props) {
  const [rows, setRows] = useState<AdminCollegeExamRoomRow[]>(initialRows);
  const [lastClientRefresh, setLastClientRefresh] = useState<Date>(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [openOwners, setOpenOwners] = useState<Set<string>>(() => new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    startTransition(async () => {
      const res = await fetchAdminCollegeExamRoomsAction();
      if (!res.ok) {
        setError(res.error ?? "تعذّر التحديث");
        return;
      }
      setError(null);
      setRows(res.rows);
      setLastClientRefresh(new Date());
    });
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      refresh();
    }, REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  const groups = useMemo(() => groupRowsByOwnerOrdered(rows), [rows]);

  const stats = useMemo(() => {
    const owners = new Set(rows.map((r) => r.owner_user_id));
    let cap = 0;
    for (const r of rows) {
      cap += r.capacity_total;
      if (r.study_subject_id_2) cap += r.capacity_total_2;
    }
    return { roomCount: rows.length, formationCount: owners.size, totalCapacity: cap };
  }, [rows]);

  const toggleCard = useCallback((ownerId: string) => {
    setOpenOwners((prev) => {
      const next = new Set(prev);
      if (next.has(ownerId)) next.delete(ownerId);
      else next.add(ownerId);
      return next;
    });
  }, []);

  const generatedReportLabel = useCallback(() => {
    try {
      return new Date().toLocaleString("ar-IQ", {
        timeZone: "Asia/Baghdad",
        dateStyle: "full",
        timeStyle: "short",
      });
    } catch {
      return new Date().toISOString();
    }
  }, []);

  const exportAllPdf = useCallback(() => {
    const html = buildAdminRoomsReportHtml({
      rows,
      generatedLabel: generatedReportLabel(),
      assetsBaseUrl: typeof window !== "undefined" ? window.location.origin : "",
    });
    if (!printAdminRoomsReportHtml(html)) {
      window.alert(
        "تعذر فتح نافذة التقرير. اسمح بالنوافذ المنبثقة، ثم اختر «حفظ كـ PDF» من نافذة الطباعة."
      );
    }
  }, [rows, generatedReportLabel]);

  const exportAllExcel = useCallback(async () => {
    try {
      const xlsx = await import("xlsx");
      const data = adminRoomsRowsToExcelRecords(rows);
      const ws = xlsx.utils.json_to_sheet(data);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "كل التشكيلات");
      xlsx.writeFile(wb, adminRoomsExcelFilename(rows));
    } catch {
      window.alert("تعذر تصدير Excel. أعد المحاولة.");
    }
  }, [rows]);

  const exportFormationPdf = useCallback(
    (g: FormationGroup) => {
      const html = buildAdminRoomsReportHtml({
        rows: g.rooms,
        generatedLabel: generatedReportLabel(),
        assetsBaseUrl: typeof window !== "undefined" ? window.location.origin : "",
        singleFormation: {
          formationLabel: g.formationLabel,
          ownerUsername: g.ownerUsername,
        },
      });
      if (!printAdminRoomsReportHtml(html)) {
        window.alert(
          "تعذر فتح نافذة التقرير. اسمح بالنوافذ المنبثقة، ثم اختر «حفظ كـ PDF» من نافذة الطباعة."
        );
      }
    },
    [generatedReportLabel]
  );

  const exportFormationExcel = useCallback(async (g: FormationGroup) => {
    try {
      const xlsx = await import("xlsx");
      const data = adminRoomsRowsToExcelRecords(g.rooms);
      const ws = xlsx.utils.json_to_sheet(data);
      const wb = xlsx.utils.book_new();
      let sheetName = g.formationLabel.replace(/[\[\]*\/\\?:]/g, "").trim().slice(0, 31);
      if (!sheetName) sheetName = "Sheet1";
      xlsx.utils.book_append_sheet(wb, ws, sheetName);
      xlsx.writeFile(wb, adminRoomsExcelFilename(g.rooms, g.formationLabel));
    } catch {
      window.alert("تعذر تصدير Excel. أعد المحاولة.");
    }
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">قاعات التشكيلات والكليات</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            كل تشكيل في بطاقة منفصلة؛ اضغط على البطاقة لعرض جدول قاعاته. يُحدَّث تلقائياً كل {REFRESH_MS / 1000} ثانية دون إعادة تحميل الصفحة.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#64748B]">
            آخر جلب: {formatTime(lastClientRefresh)}
            {pending ? " — جاري التحديث…" : ""}
          </span>
          <button
            type="button"
            onClick={exportAllPdf}
            className="rounded-xl border border-[#1E3A8A]/30 bg-white px-4 py-2 text-sm font-bold text-[#1E3A8A] shadow-sm transition hover:bg-[#EFF6FF]"
          >
            تقرير PDF رسمي (الكل)
          </button>
          <button
            type="button"
            onClick={() => void exportAllExcel()}
            className="rounded-xl border border-emerald-700/25 bg-white px-4 py-2 text-sm font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-50"
          >
            تصدير Excel (الكل)
          </button>
          <button
            type="button"
            onClick={() => refresh()}
            disabled={pending}
            className="rounded-xl border border-[#CBD5E1] bg-white px-4 py-2 text-sm font-semibold text-[#0F172A] shadow-sm transition hover:bg-[#F8FAFC] disabled:opacity-60"
          >
            تحديث الآن
          </button>
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
          <p className="text-xs font-semibold text-[#475569]">عدد القاعات</p>
          <p className="mt-1 text-2xl font-extrabold text-[#0F172A]">{stats.roomCount}</p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
          <p className="text-xs font-semibold text-[#475569]">التشكيلات / الحسابات</p>
          <p className="mt-1 text-2xl font-extrabold text-[#0F172A]">{stats.formationCount}</p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 sm:col-span-2 lg:col-span-1">
          <p className="text-xs font-semibold text-[#475569]">مجموع السعة (امتحان ١ + ٢ إن وُجد)</p>
          <p className="mt-1 text-2xl font-extrabold text-[#0F172A]">{stats.totalCapacity}</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-12 text-center text-sm text-[#64748B] shadow-sm">
          لا توجد قاعات مسجّلة من حسابات الكلية بعد.
        </div>
      ) : (
        <ul className="flex list-none flex-col gap-3 p-0">
          {groups.map((g) => {
            const expanded = openOwners.has(g.ownerId);
            const cap = groupCapacity(g.rooms);
            return (
              <li key={g.ownerId} className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
                <div className="flex w-full items-stretch bg-[#F8FAFC]">
                  <button
                    type="button"
                    onClick={() => toggleCard(g.ownerId)}
                    aria-expanded={expanded}
                    className="flex min-w-0 flex-1 items-start gap-3 border-0 bg-transparent px-4 py-4 text-right transition hover:bg-[#F1F5F9]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#3B82F6]"
                  >
                    <span
                      className={`mt-0.5 inline-flex shrink-0 text-[#64748B] transition-transform ${expanded ? "rotate-180" : ""}`}
                      aria-hidden
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-bold text-[#0F172A]">{g.formationLabel}</span>
                      <span className="mt-0.5 block text-xs text-[#64748B]">@{g.ownerUsername}</span>
                      <span className="mt-2 flex flex-wrap gap-2">
                        <span className="inline-flex rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-[#334155] ring-1 ring-[#E2E8F0]">
                          {g.rooms.length} قاعة
                        </span>
                        <span className="inline-flex rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-[#334155] ring-1 ring-[#E2E8F0]">
                          سعة إجمالية: {cap}
                        </span>
                      </span>
                    </span>
                  </button>
                  <div
                    role="group"
                    aria-label={`تصدير تقرير رسمي — ${g.formationLabel}`}
                    className="flex shrink-0 flex-col justify-center gap-1.5 border-s border-[#E2E8F0] bg-white px-2 py-2 sm:flex-row sm:items-center sm:px-3"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      title="تقرير PDF رسمي لهذا التشكيل"
                      onClick={() => exportFormationPdf(g)}
                      className="whitespace-nowrap rounded-lg border border-[#1E3A8A]/35 bg-[#EFF6FF] px-2.5 py-1.5 text-[11px] font-bold text-[#1E3A8A] transition hover:bg-[#DBEAFE]"
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      title="تصدير Excel — تفاصيل قاعات هذا التشكيل"
                      onClick={() => void exportFormationExcel(g)}
                      className="whitespace-nowrap rounded-lg border border-emerald-700/30 bg-emerald-50/90 px-2.5 py-1.5 text-[11px] font-bold text-emerald-900 transition hover:bg-emerald-100"
                    >
                      Excel
                    </button>
                  </div>
                </div>
                {expanded ? (
                  <div className="border-t border-[#E2E8F0] bg-white px-2 pb-4 pt-3">
                    <FormationRoomsTable rows={g.rooms} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
