import Link from "next/link";
import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import { collegePortalDisplayLabel } from "@/lib/college-portal-scope";
import { ExamSituationUploadClient } from "@/app/dashboard/college/exam-situation-upload/exam-situation-upload-client";
import { requireDepartmentPortalWorkspace } from "../dept-workspace";

export const dynamic = "force-dynamic";

const BAGHDAD_TZ = "Asia/Baghdad";

function formatTodayInBaghdad(): { dayName: string; dateLabel: string } {
  const now = new Date();
  const dayName = new Intl.DateTimeFormat("ar-IQ-u-ca-gregory", {
    timeZone: BAGHDAD_TZ,
    weekday: "long",
  }).format(now);
  const dateLabel = new Intl.DateTimeFormat("ar-IQ-u-ca-gregory-nu-latn", {
    timeZone: BAGHDAD_TZ,
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
  return { dayName, dateLabel };
}

export default async function DepartmentExamSituationUploadPage() {
  const { ws } = await requireDepartmentPortalWorkspace();
  const profile = await getCollegeProfileByUserId(ws.sessionUserId);
  const collegeLabel = profile ? collegePortalDisplayLabel(profile) : ws.collegeLabel;

  const { dayName, dateLabel } = formatTodayInBaghdad();

  return (
    <div className="mx-auto max-w-5xl px-3 pb-10 pt-4 sm:px-4" dir="rtl">
      <nav
        className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold text-[#64748B]"
        aria-label="مسار الصفحة والتاريخ"
      >
        <span className="flex flex-wrap items-center gap-x-1.5">
          <Link href="/department" className="text-[#2563EB] hover:underline">
            لوحة القسم
          </Link>
          <span className="text-[#CBD5E1]" aria-hidden>
            /
          </span>
          <span className="text-[#0F172A]">رفع الموقف الامتحاني</span>
        </span>
        <span className="hidden text-[#CBD5E1] sm:inline" aria-hidden>
          |
        </span>
        <span className="text-[12px] font-bold text-[#475569] sm:text-[13px]" dir="rtl">
          <span className="text-[#64748B]">اليوم:</span>{" "}
          <span className="text-[#0F172A]">{dayName}</span>
          <span className="mx-1.5 text-[#CBD5E1]">·</span>
          <span className="text-[#64748B]">التاريخ:</span>{" "}
          <span lang="en" className="inline-block font-mono tabular-nums text-[#0F172A]" dir="ltr">
            {dateLabel}
          </span>
        </span>
      </nav>

      <ExamSituationUploadClient collegeLabel={collegeLabel} />
    </div>
  );
}
