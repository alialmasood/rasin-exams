import Link from "next/link";
import { redirect } from "next/navigation";
import type { CentralTrackingExamRow } from "@/lib/college-exam-situations";
import { getCollegeProfileByUserId, listActiveFormationAccountNames } from "@/lib/college-accounts";
import { listCentralTrackingExamRowsForDate } from "@/lib/college-exam-situations";
import { calendarDateInTimeZone, EXAM_SITUATION_TZ } from "@/lib/exam-situation-window";
import { getSession } from "@/lib/session";
import { getZoomConnectionStatus, getZoomMeetingsByFormation, isZoomOAuthConfigured } from "@/lib/zoom";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "غرفة العمليات — مراقبة القاعات — رصين",
};

type ZoomRoomsMap = Record<string, string>;

/** وحدة مراقبة واحدة: كلية وإن لزم القسم/الفرع — لها جلسة معتمدة في تاريخ العرض */
type MonitoringUnit = {
  key: string;
  formationName: string;
  /** إن وُجد يُعرض كفصل عن الكلية؛ وإلا المراقبة على مستوى الكلية فقط */
  branchName: string | null;
  titleAr: string;
  scheduleCount: number;
};

function normalizeFormationKey(v: string): string {
  return v.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseZoomRoomsMap(raw: string | undefined): ZoomRoomsMap {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: ZoomRoomsMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k !== "string" || typeof v !== "string") continue;
      const kk = normalizeFormationKey(k);
      const vv = v.trim();
      if (!kk || !/^https?:\/\//i.test(vv)) continue;
      out[kk] = vv;
    }
    return out;
  } catch {
    return {};
  }
}

function formatDateAr(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ-u-ca-gregory", {
      timeZone: EXAM_SITUATION_TZ,
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(new Date(`${isoDate}T12:00:00`));
  } catch {
    return isoDate;
  }
}

/** يجمع صفوف اليوم إلى وحدات (كلية + قسم إن وُجد) */
function buildMonitoringUnitsFromRows(rows: CentralTrackingExamRow[]): MonitoringUnit[] {
  const counts = new Map<string, { formationName: string; branchName: string | null; titleAr: string; n: number }>();
  for (const r of rows) {
    const fn = r.collegeName.trim();
    if (!fn || fn === "—") continue;
    const deptRaw = r.department.trim();
    const hasDept = Boolean(deptRaw && deptRaw !== "—");
    const branchName = hasDept ? deptRaw : null;
    const key = hasDept ? `${fn}\t${deptRaw}` : `${fn}\t`;
    const titleAr = hasDept ? `${fn} — ${deptRaw}` : fn;
    const prev = counts.get(key);
    if (prev) prev.n += 1;
    else counts.set(key, { formationName: fn, branchName, titleAr, n: 1 });
  }
  const out: MonitoringUnit[] = [];
  for (const [key, v] of counts) {
    out.push({
      key,
      formationName: v.formationName,
      branchName: v.branchName,
      titleAr: v.titleAr,
      scheduleCount: v.n,
    });
  }
  out.sort((a, b) => a.titleAr.localeCompare(b.titleAr, "ar"));
  return out;
}

/**
 * أولوية الربط (عزل قسم = رابطه في JSON بمفتاح اسم القسم):
 * 1) مفتاح قسم/فرع → 2) مفتاح كلية → 3) المعمّم → 4) مطابقة Zoom API
 */
function resolveMonitoringJoinUrl(input: {
  formationName: string;
  branchName: string | null;
  roomsMap: ZoomRoomsMap;
  primaryJoinUrl: string;
  hasPrimary: boolean;
  zoomFormationMeetingJoinUrl: string | undefined;
}): { href: string | null; sourceLabelAr: string | null } {
  const fk = normalizeFormationKey(input.formationName);
  if (input.branchName) {
    const bk = normalizeFormationKey(input.branchName);
    const u = input.roomsMap[bk];
    if (u && /^https?:\/\//i.test(u)) {
      return { href: u, sourceLabelAr: "رابط خاص بهذا القسم/الفرع (JSON) — اجتماع منعزل" };
    }
  }
  const uf = input.roomsMap[fk];
  if (uf && /^https?:\/\//i.test(uf)) {
    return { href: uf, sourceLabelAr: "رابط خاص بالكلية (JSON)" };
  }
  if (input.hasPrimary && /^https?:\/\//i.test(input.primaryJoinUrl)) {
    return {
      href: input.primaryJoinUrl.trim(),
      sourceLabelAr: "الرابط المعمّم (جلسة مشتركة لمن لا يملك رابطًا خاصًا)",
    };
  }
  const zm = input.zoomFormationMeetingJoinUrl?.trim();
  if (zm && /^https?:\/\//i.test(zm)) {
    return { href: zm, sourceLabelAr: "مطابقة موضوع الاجتماع في Zoom (API)" };
  }
  return { href: null, sourceLabelAr: null };
}

export default async function TrackingMonitoringPage(props: {
  searchParams?: Promise<{ zoom?: string; message?: string }>;
}) {
  const sp = props.searchParams != null ? await props.searchParams : {};
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role === "ADMIN" || session.role === "SUPER_ADMIN") redirect("/dashboard");
  if (session.role !== "COLLEGE") redirect("/");

  const profile = await getCollegeProfileByUserId(session.uid);
  if (profile?.account_kind !== "FOLLOWUP") redirect("/dashboard/college");

  const examDate = calendarDateInTimeZone(new Date(), EXAM_SITUATION_TZ);
  const rows = await listCentralTrackingExamRowsForDate(examDate);
  const monitoringUnitsToday = buildMonitoringUnitsFromRows(rows);

  const formationsWithExamToday = [...new Set(rows.map((r) => r.collegeName.trim()).filter(Boolean))];
  const registeredFormationNames = await listActiveFormationAccountNames();
  const idleRegisteredFormations = registeredFormationNames.filter(
    (name) => !formationsWithExamToday.some((x) => normalizeFormationKey(x) === normalizeFormationKey(name))
  );

  const zoomOAuthReady = isZoomOAuthConfigured();
  const zoomMainUrl = process.env.ZOOM_MAIN_ACCOUNT_URL?.trim() ?? "";
  const primarySessionJoinUrl = process.env.ZOOM_PRIMARY_SESSION_JOIN_URL?.trim() ?? "";
  const primarySessionLabel =
    process.env.ZOOM_PRIMARY_SESSION_LABEL?.trim() || "الجلسة الرئيسية للمراقبة المركزية";
  const hasPrimarySession = /^https?:\/\/[^/]*zoom\.us\//i.test(primarySessionJoinUrl);
  const roomsMap = parseZoomRoomsMap(process.env.ZOOM_FORMATION_ROOMS_JSON);
  const hasMainUrl = /^https?:\/\//i.test(zoomMainUrl);
  const zoomStatus = await getZoomConnectionStatus();

  const formationsForZoomApi = [...new Set(monitoringUnitsToday.map((u) => u.formationName))];
  const zoomMeetings =
    zoomStatus.connected && formationsForZoomApi.length > 0
      ? await getZoomMeetingsByFormation(formationsForZoomApi)
      : {};

  const ownerDisplayName = profile.holder_name?.trim() || "رئاسة الجامعة — المتابعة المركزية";

  return (
    <div className="min-h-dvh bg-[#f6f4ef] text-stone-900">
      <header className="border-b border-[#1a3052]/20 bg-gradient-to-bl from-[#1a3052] via-[#1e3d5c] to-[#152a42] text-white">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-100/90 sm:text-[11px]">
              لوحة القيادة — المالك: {ownerDisplayName}
            </p>
            <h1 className="mt-0.5 text-lg font-bold leading-snug">غرفة العمليات المركزية لمراقبة القاعات</h1>
            <p className="mt-1 text-[11px] leading-relaxed text-sky-100/85 sm:text-xs">
              لكل تشكيل أو قسم أو فرع له جلسة امتحانية معتمدة في{" "}
              <span className="font-semibold text-amber-100">تاريخ اليوم المعروض</span> يظهر زر الدخول إلى غرفة المراقبة
              عبر Zoom (الرابط المعمّم أو رابط خاص من الإعدادات عند الحاجة).
            </p>
            <p className="mt-1 text-xs text-sky-100/90">تاريخ العرض: {formatDateAr(examDate)}</p>
          </div>
          <Link
            href="/tracking"
            className="rounded-md border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
          >
            العودة إلى المتابعة
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-4 py-5 sm:px-6">
        {hasPrimarySession ? (
          <section
            className="mb-5 overflow-hidden rounded-xl border-2 border-amber-400/80 bg-gradient-to-br from-[#1a3052] via-[#1e4976] to-[#152a42] p-4 text-white shadow-lg shadow-stone-400/30 sm:p-5"
            aria-label="الجلسة الرئيسية المعممة"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200/90">
                  Zoom — الجلسة المعممة للمراقبة
                </p>
                <h2 className="mt-1 text-base font-bold leading-snug sm:text-lg">{primarySessionLabel}</h2>
                <p className="mt-2 text-[11px] leading-relaxed text-sky-100/90 sm:text-xs">
                  هذا الرابط هو الافتراضي لأزرار «دخول غرفة المراقبة» أدناه ما لم يُعرَّف رابط أخصّ للقسم في{" "}
                  <span className="font-mono text-amber-100">ZOOM_FORMATION_ROOMS_JSON</span>.
                </p>
              </div>
              <a
                href={primarySessionJoinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center justify-center rounded-lg border-2 border-amber-300 bg-amber-500 px-5 py-3 text-center text-sm font-extrabold text-[#152a42] shadow-md transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a3052]"
              >
                فتح الجلسة المعممة
              </a>
            </div>
          </section>
        ) : (
          <section className="mb-5 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-[11px] font-medium text-rose-950 sm:text-xs">
            لتفعيل أزرار المراقبة لكل قسم/كلية، أضف الرابط المعمّم في البيئة:{" "}
            <code className="rounded bg-white px-1 py-0.5 font-mono text-[10px]">ZOOM_PRIMARY_SESSION_JOIN_URL</code> —
            أو عرّف روابطًا لكل وحدة في{" "}
            <code className="rounded bg-white px-1 py-0.5 font-mono text-[10px]">ZOOM_FORMATION_ROOMS_JSON</code>.
          </section>
        )}

        <section className="mb-5 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-[#1a3052]">ربط Zoom (اختياري — مطابقة الاجتماعات)</h2>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">
            إن رُبط الحساب، نعرض رابط اجتماع Zoom تلقائيًا إن وُجد موضوع يطابق اسم التشكيل، وإلا يُعتمد الرابط المعمّم
            أعلاه.
          </p>
          {sp.zoom === "ok" ? (
            <p className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
              {sp.message || "تم الربط بنجاح."}
            </p>
          ) : null}
          {sp.zoom === "error" ? (
            <p className="mt-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">
              {sp.message || "تعذر الربط."}
            </p>
          ) : null}
          {!zoomStatus.connected && !zoomOAuthReady ? (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              لم يُهيّأ OAuth على الخادم — يمكن المتابعة بالرابط المعمّم فقط.
            </p>
          ) : null}
          {!zoomStatus.connected && zoomOAuthReady ? (
            <a
              href="/tracking/monitoring/zoom/connect"
              className="mt-3 inline-flex items-center rounded-md border border-[#1a3052] bg-[#1e4976] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#1a3052]"
            >
              ربط حساب Zoom
            </a>
          ) : null}
          {zoomStatus.connected ? (
            <p className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
              الحساب المرتبط: {zoomStatus.email}
            </p>
          ) : null}
          {hasMainUrl ? (
            <a
              href={zoomMainUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center rounded-md border border-emerald-800 bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800"
            >
              فتح تسجيل الدخول إلى Zoom
            </a>
          ) : null}
        </section>

        <section className="mb-5 rounded-lg border border-teal-200 bg-teal-50/40 p-4 shadow-sm">
          <h3 className="text-xs font-bold text-teal-950">سياسة الروابط — الخطوة الأولى (بدون تضمين داخل الصفحة)</h3>
          <ul className="mt-2 list-inside list-disc space-y-1.5 text-[11px] leading-relaxed text-teal-950/95 sm:text-xs">
            <li>
              لعرض قسم <span className="font-semibold">لوحده</span> في Zoom يجب أن يكون له{" "}
              <span className="font-semibold">اجتماع ورابط انضمام خاصان</span>، وتضعهما في المتغير{" "}
              <code className="rounded bg-white/90 px-1 py-px font-mono text-[10px]">ZOOM_FORMATION_ROOMS_JSON</code> تحت{" "}
              <span className="font-semibold">مفتاح يطابق اسم القسم</span> كما يظهر في الجدول (بعد تجاهل اختلاف بسيط في
              المسافات والحالة).
            </li>
            <li>
              الرابط المعمّم <code className="font-mono text-[10px]">ZOOM_PRIMARY_SESSION_JOIN_URL</code> يُستخدم كاحتياط
              لكل من لم يُعرَّف له رابط خاص — وهو{" "}
              <span className="font-semibold">جلسة واحدة مشتركة</span> لجميع من يسقطون على هذا الخيار.
            </li>
            <li>
              يمكن جمع عشرات الأقسام في JSON نفسه؛ المفتاح = اسم القسم أو الفرع أو الكلية، والقيمة = رابط Join كامل.
            </li>
          </ul>
        </section>

        <section className="rounded-lg border-2 border-[#1a3052]/20 bg-white shadow-md shadow-stone-200/50">
          <div className="border-b border-stone-200 bg-gradient-to-l from-sky-50/90 to-stone-50 px-4 py-3 sm:px-5 sm:py-4">
            <h2 className="text-base font-extrabold text-[#1a3052]">مراقبة اليوم — وحدات لها جلسات معتمدة</h2>
            <p className="mt-1 text-xs leading-relaxed text-stone-600">
              كل بطاقة = كلية أو «كلية — قسم/فرع» حسب ما هو مسجّل في الجدول الامتحاني لهذا التاريخ. زر الدخول يفتح Zoom في
              نافذة جديدة (التضمين داخل الصفحة يُترك لمرحلة لاحقة).
            </p>
            <p className="mt-2 text-xs font-semibold text-stone-800">
              عدد الوحدات التي يمكن مراقبتها اليوم:{" "}
              <span className="tabular-nums text-[#1a3052]">{monitoringUnitsToday.length}</span>
            </p>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {monitoringUnitsToday.length === 0 ? (
              <div className="sm:col-span-2 lg:col-span-3 rounded-lg border border-stone-200 bg-stone-50 px-4 py-8 text-center">
                <p className="text-sm font-medium text-stone-700">
                  لا توجد جلسات امتحانية معتمدة لهذا اليوم في نطاق المتابعة المركزية.
                </p>
                <p className="mt-2 text-xs text-stone-500">
                  تأكد من اعتماد الجداول (حالة معتمدة) وأن التاريخ يطابق يوم العرض.
                </p>
              </div>
            ) : (
              monitoringUnitsToday.map((unit) => {
                const zoomJoin = zoomMeetings[unit.formationName]?.join_url;
                const { href, sourceLabelAr } = resolveMonitoringJoinUrl({
                  formationName: unit.formationName,
                  branchName: unit.branchName,
                  roomsMap,
                  primaryJoinUrl: primarySessionJoinUrl,
                  hasPrimary: hasPrimarySession,
                  zoomFormationMeetingJoinUrl: zoomJoin,
                });

                return (
                  <article
                    key={unit.key}
                    className="flex flex-col rounded-lg border border-stone-200 bg-white p-4 shadow-sm transition hover:border-sky-300/80 hover:shadow-md"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold leading-snug text-stone-900">{unit.titleAr}</h3>
                      <p className="mt-1 text-[11px] text-stone-500">
                        جلسات مسجّلة اليوم في الجدول:{" "}
                        <span className="font-bold tabular-nums text-stone-800">{unit.scheduleCount}</span>
                      </p>
                    </div>
                    {href ? (
                      <div className="mt-4 space-y-1.5">
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex w-full items-center justify-center rounded-lg border-2 border-[#1a3052] bg-[#1e4976] px-3 py-2.5 text-center text-xs font-extrabold text-white shadow-sm transition hover:bg-[#1a3052] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
                        >
                          دخول غرفة المراقبة (Zoom)
                        </a>
                        {sourceLabelAr ? (
                          <p className="text-center text-[10px] leading-snug text-stone-500">{sourceLabelAr}</p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] font-medium text-amber-950">
                        عرّف <span className="font-mono">ZOOM_PRIMARY_SESSION_JOIN_URL</span> أو رابطًا للوحدة في JSON.
                      </p>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </section>

        {idleRegisteredFormations.length > 0 ? (
          <section className="mt-5 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
            <h3 className="text-xs font-bold text-[#1a3052]">تشكيلات مسجّلة — بلا جلسات في الجدول لهذا اليوم</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
              للاطلاع فقط؛ عند ظهور جلسات معتمدة في التاريخ الحالي تنتقل تلقائيًا إلى القسم أعلاه.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {idleRegisteredFormations.map((name) => (
                <li
                  key={name}
                  className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[11px] font-medium text-stone-700"
                >
                  {name}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
