/**
 * تعريفات أقسام التقرير الشامل — آمن للاستيراد من العميل (بدون pg/db).
 */

export type ComprehensiveSectionMeta = {
  id: string;
  labelAr: string;
  groupAr: string;
};

export const COMPREHENSIVE_REPORT_SECTIONS: ComprehensiveSectionMeta[] = [
  { id: "summary_totals", labelAr: "ملخص عام (إجماليات سريعة)", groupAr: "عام" },

  { id: "colleges_list", labelAr: "قائمة الكليات (التشكيلات)", groupAr: "هيكل أكاديمي" },
  { id: "departments_list", labelAr: "قائمة الأقسام والفروع", groupAr: "هيكل أكاديمي" },
  { id: "dept_count_per_college", labelAr: "عدد الأقسام في كل كلية", groupAr: "هيكل أكاديمي" },

  { id: "study_subjects_list", labelAr: "قائمة المواد الدراسية (تفصيل)", groupAr: "مواد" },
  { id: "subject_count_by_dept", labelAr: "عدد المواد الدراسية لكل قسم", groupAr: "مواد" },
  { id: "subject_count_by_college", labelAr: "عدد المواد الدراسية لكل كلية", groupAr: "مواد" },
  { id: "stages_reference", labelAr: "المراحل الدراسية (مرجع من المواد والجداول)", groupAr: "مواد" },
  { id: "subject_count_by_stage", labelAr: "عدد المواد الدراسية لكل مرحلة", groupAr: "مواد" },
  {
    id: "postgrad_subject_counts",
    labelAr: "مواد الدراسات العليا (إجمالي + لكل كلية)",
    groupAr: "مواد",
  },

  { id: "rooms_count_by_college", labelAr: "عدد القاعات لكل كلية", groupAr: "قاعات" },
  { id: "rooms_count_by_dept", labelAr: "عدد القاعات لكل قسم", groupAr: "قاعات" },
  { id: "seats_morning_by_college", labelAr: "مقاعد صباحية (سعة) لكل كلية", groupAr: "قاعات" },
  { id: "seats_morning_by_dept", labelAr: "مقاعد صباحية (سعة) لكل قسم", groupAr: "قاعات" },
  { id: "seats_morning_by_stage", labelAr: "مقاعد صباحية (سعة) لكل مرحلة (حسب مادة القاعة)", groupAr: "قاعات" },
  { id: "seats_morning_postgrad", labelAr: "مقاعد صباحية للدراسات العليا", groupAr: "قاعات" },
  { id: "seats_evening_by_college", labelAr: "مقاعد مسائية (سعة) لكل كلية", groupAr: "قاعات" },
  { id: "seats_evening_by_dept", labelAr: "مقاعد مسائية (سعة) لكل قسم", groupAr: "قاعات" },
  { id: "seats_evening_by_stage", labelAr: "مقاعد مسائية (سعة) لكل مرحلة", groupAr: "قاعات" },
  { id: "seats_evening_postgrad", labelAr: "مقاعد مسائية لجلسات الدراسات العليا", groupAr: "قاعات" },

  { id: "schedules_by_college", labelAr: "عدد الجداول الامتحانية (جلسات) لكل كلية", groupAr: "جداول ومواقف" },
  { id: "schedules_by_dept", labelAr: "عدد الجداول الامتحانية لكل قسم", groupAr: "جداول ومواقف" },
  { id: "schedules_by_stage", labelAr: "عدد الجداول الامتحانية لكل مرحلة", groupAr: "جداول ومواقف" },
  { id: "schedules_postgrad", labelAr: "عدد الجداول الامتحانية للدراسات العليا", groupAr: "جداول ومواقف" },

  { id: "exam_days_by_college", labelAr: "عدد أيام الامتحانات (فريدة) لكل كلية", groupAr: "جداول ومواقف" },
  { id: "exam_days_by_dept", labelAr: "عدد أيام الامتحانات لكل قسم", groupAr: "جداول ومواقف" },
  { id: "exam_days_by_stage", labelAr: "عدد أيام الامتحانات لكل مرحلة", groupAr: "جداول ومواقف" },
  { id: "exam_days_postgrad", labelAr: "عدد أيام الامتحانات للدراسات العليا", groupAr: "جداول ومواقف" },

  { id: "attendance_morning_total", labelAr: "إجمالي حضور صباحي (من جلسات الجدول)", groupAr: "حضور وغياب" },
  { id: "absence_morning_total", labelAr: "إجمالي غياب صباحي", groupAr: "حضور وغياب" },
  { id: "attendance_evening_total", labelAr: "إجمالي حضور مسائي", groupAr: "حضور وغياب" },
  { id: "absence_evening_total", labelAr: "إجمالي غياب مسائي", groupAr: "حضور وغياب" },
  { id: "attendance_morning_by_college", labelAr: "حضور صباحي لكل كلية", groupAr: "حضور وغياب" },
  { id: "absence_morning_by_college", labelAr: "غياب صباحي لكل كلية", groupAr: "حضور وغياب" },
  { id: "attendance_morning_by_dept", labelAr: "حضور صباحي لكل قسم", groupAr: "حضور وغياب" },
  { id: "absence_morning_by_dept", labelAr: "غياب صباحي لكل قسم", groupAr: "حضور وغياب" },
  { id: "attendance_evening_by_college", labelAr: "حضور مسائي لكل كلية", groupAr: "حضور وغياب" },
  { id: "absence_evening_by_college", labelAr: "غياب مسائي لكل كلية", groupAr: "حضور وغياب" },
  { id: "attendance_evening_by_dept", labelAr: "حضور مسائي لكل قسم", groupAr: "حضور وغياب" },
  { id: "absence_evening_by_dept", labelAr: "غياب مسائي لكل قسم", groupAr: "حضور وغياب" },

  { id: "uploads_by_college", labelAr: "عدد المواقف الامتحانية المرفوعة لكل كلية", groupAr: "جداول ومواقف" },
];

export const COMPREHENSIVE_SECTION_ID_SET = new Set(COMPREHENSIVE_REPORT_SECTIONS.map((s) => s.id));

export function sanitizeComprehensiveSectionIds(raw: string[]): string[] {
  const out: string[] = [];
  for (const id of raw) {
    const t = String(id ?? "").trim();
    if (COMPREHENSIVE_SECTION_ID_SET.has(t) && !out.includes(t)) out.push(t);
  }
  return out;
}
