/** تلميحات زر «حفظ الموقف» لكل يوم امتحان — تُحسب على الخادم. */
export type FollowupDaySaveHint = {
  hasArchivedRow: boolean;
  /** يُفعّل الزر: أول حفظ، أو وُجدت جلسات بتاريخ أحدث لتأكيد الرفع من آخر لقطة محفوظة */
  allowMergeSave: boolean;
};
