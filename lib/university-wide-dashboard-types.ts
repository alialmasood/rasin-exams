/**
 * أنواع وثوابت لوحة التحكم الجامعية — بدون استيراد قاعدة البيانات
 * (يُستورد من مكوّنات العميل دون سحب حزمة `pg`).
 */

/** أقصى عدد صفوف تُحمَّل للوحة التحكم (تخفيف الحمل؛ الباقي من «عرض كامل») */
export const UPCOMING_EXAMS_DASHBOARD_PREVIEW_LIMIT = 120;

/** جلسة جدول قادمة لعرض معاينة في لوحة التحكم العامة */
export type DashboardUpcomingExamSessionRow = {
  scheduleId: string;
  subjectName: string;
  examDateIso: string;
  startTime: string;
  roomName: string;
  formationLabel: string;
  workflowStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
};

/** صف بطاقة «مؤشر الحضور» — نسبة الحضور من أعداد الحضور/الغياب في قاعات الجدول لذلك التشكيل */
export type FormationAttendanceIndicatorRow = {
  label: string;
  present: number;
  absent: number;
  /** 0–100 */
  attendancePct: number;
};

/** إحصائيات إجمالية لكل التشكيلات/حسابات الكلية — للوحة التحكم العامة */
export type UniversityWideDashboardStats = {
  formationAccounts: number;
  followupAccounts: number;
  /** أقسام + فروع (جدول college_subjects) */
  collegeSubjectsTotal: number;
  /** سجلات نوع «قسم» (DEPARTMENT) */
  collegeSubjectsDepartments: number;
  /** سجلات نوع «فرع» (BRANCH) */
  collegeSubjectsBranches: number;
  examRoomsTotal: number;
  /** مجموع سعات القاعات (امتحان ١ + ٢ إن وُجد) */
  examSeatsCapacityTotal: number;
  /**
   * مجموع أعداد الغياب المسجّلة في قاعات الامتحان (`absence_count` + `absence_count_2`)
   * لكل حسابات الكلية — يعكس المدخلات في «إدارة القاعات» وليس بالضرورة طلبة مميّزين.
   */
  totalStudentAbsenceAcrossFormations: number;
  studySubjectsTotal: number;
  /** عدد صفوف ربط الجدول الامتحاني بالقاعات (كل حسابات الكلية النشطة) */
  examSchedulesTotal: number;
  /** صفوف الجدول الامتحاني لحسابات التشكيل فقط (لا تشمل متابعة) */
  examSchedulesTotalAcrossFormations: number;
  examSchedulesFinal: number;
  examSchedulesSemester: number;
  /**
   * جلسات الجدول الامتحاني التي تم تأكيد رفع الموقف الامتحاني لها (`head_submitted_at` غير فارغ)
   * عبر حسابات الكلية النشطة.
   */
  examsCompletedSituationSubmittedTotal: number;
  /** جلسات جدول امتحاني بتاريخ اليوم (توقيت بغداد) — كل حسابات الكلية النشطة */
  examSessionsTodayTotal: number;
  /**
   * جلسات بتاريخ الغد التقويمي (بغداد)، مع استبعاد الجلسات التي تقع في يوم مسجّل كعطلة
   * لذات التشكيل (`college_holidays`).
   */
  examSessionsTomorrowExcludingHolidaysTotal: number;
  /**
   * جلسات الجدول الامتحاني لكل يوم من الأسبوع الحالي (سبت→جمعة بتوقيت بغداد)،
   * لحسابات التشكيل فقط — يُستخدم في مخطط «النشاط الأسبوعي».
   */
  examSessionsCurrentWeekByDaySatFirst: number[];
  /** أول يوم الأسبوع المعروض (السبت) YYYY-MM-DD بتوقيت بغداد، أو null إن تعذّر الحساب */
  examSessionsCurrentWeekStartIso: string | null;
  /**
   * حتى 4 تشكيلات لديها أكبر حجم إدخال (حاضر+غائب) في قاعات الجدول؛
   * النسبة = حاضر / (حاضر+غائب) كما في لوحة كلية «حالات الطلبة في الجلسات».
   */
  formationAttendanceIndicators: FormationAttendanceIndicatorRow[];
  /** متوسط الحضور المرجّح على مستوى كل التشكيلات التي لديها بيانات، أو null */
  aggregateExamAttendancePct: number | null;
  /** قاعات التشكيل التي لها جلسة واحدة على الأقل في الجدول الامتحاني */
  examRoomsWithScheduleFormationCount: number;
  /** قاعات التشكيل غير المرتبطة بأي جلسة في الجدول الامتحاني */
  examRoomsWithoutScheduleFormationCount: number;
  /** جلسات الجدول الامتحاني لتاريخ اليوم (بغداد) — حسابات التشكيل فقط */
  examSessionsTodayFormationTotal: number;
  /** مجموع أعداد الغياب في قاعات التشكيل (امتحان ١ + ٢) */
  totalStudentAbsenceFormationAccounts: number;
  /** معاينة جلسات الجدول من اليوم فصاعداً — حسابات التشكيل، حتى UPCOMING_EXAMS_DASHBOARD_PREVIEW_LIMIT */
  upcomingExamSessionsPreview: DashboardUpcomingExamSessionRow[];
  /** إجمالي جلسات الجدول المستقبلية (نفس شرط المعاينة) لكل التشكيلات */
  upcomingExamSessionsFutureCountFormation: number;
};
