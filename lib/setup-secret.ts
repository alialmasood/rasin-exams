export function assertValidSetupSecret(submitted: unknown): void {
  const expected = process.env.SUPER_ADMIN_SETUP_SECRET?.trim();
  if (!expected || expected.length < 8) {
    throw new Error(
      "لم يُهيّأ SUPER_ADMIN_SETUP_SECRET في البيئة بشكل آمن (8 أحرف على الأقل)."
    );
  }
  if (String(submitted ?? "").trim() !== expected) {
    throw new Error("رمز الوصول لإعداد مدير النظام غير صحيح.");
  }
}
