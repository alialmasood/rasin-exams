/** الرمز الافتراضي 6464؛ يمكن تجاوزه عبر SUPER_ADMIN_GATE_PIN في البيئة (الخادم فقط). */
const DEFAULT_GATE_PIN = "6464";

export function assertValidSuperAdminGatePin(submitted: unknown): void {
  const expected = (process.env.SUPER_ADMIN_GATE_PIN ?? DEFAULT_GATE_PIN).trim();
  const got = String(submitted ?? "").trim();
  if (!expected || got !== expected) {
    throw new Error("رمز الدخول غير صحيح.");
  }
}
