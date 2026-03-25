/**
 * يُرمى عندما تحتاج قاعدة البيانات إلى ترحيل يدوي (عادةً كـ postgres)
 * ولا يملك مستخدم التطبيق صلاحية ALTER على الجداول.
 */
export class RasinDbMigrationRequiredError extends Error {
  readonly code = "RASIN_DB_MIGRATION_REQUIRED" as const;

  constructor(message: string) {
    super(message);
    this.name = "RasinDbMigrationRequiredError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isRasinDbMigrationRequiredError(
  err: unknown
): err is RasinDbMigrationRequiredError {
  return err instanceof RasinDbMigrationRequiredError;
}
