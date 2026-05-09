/**
 * ثوابت وأنواع سجل المشرفين/المراقبين — بدون استيراد `pg` أو `lib/db`
 * حتى يمكن استخدامها من مكوّنات العميل دون سحب حزمة Node إلى المتصفح.
 */

/** قيمة النموذج للحساب المركزي: سجل يخص التشكيل كاملاً وليس فرعاً محدداً */
export const STAFF_REGISTRY_ALL_BRANCHES_VALUE = "__ALL_BRANCHES__";

export type StaffRegistryRoleKind = "SUPERVISOR" | "INVIGILATOR";

/** أسماء مُجمّعة من السجل لاقتراحها في حقول القاعات (مشرف / مراقبون) */
export type StaffRegistryNamePicklist = {
  supervisors: string[];
  invigilators: string[];
};

export type CollegeStaffRegistryRow = {
  id: string;
  owner_user_id: string;
  /** فارغ عندما يكون السجل لجميع الأقسام/الفروع */
  college_subject_id: string | null;
  branch_name: string;
  branch_type: "DEPARTMENT" | "BRANCH";
  full_name: string;
  /** قديم — اختياري في قاعدة البيانات؛ الواجهة لا تعتمد التصنيف */
  role_kind: StaffRegistryRoleKind | null;
  created_at: Date;
  updated_at: Date;
};
