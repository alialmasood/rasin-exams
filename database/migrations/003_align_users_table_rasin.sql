-- توحيد جدول public.users مع نموذج نظام رصين عند وجود جدول قديم بأعمدة ناقصة.
-- شغّل كمستخدم postgres (أو superuser) مرة واحدة.
-- بعدها يُفضّل تشغيل 002_exams_app_own_core_tables.sql إن كان المالك لا يزال postgres.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name VARCHAR(200);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email VARCHAR(180);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone VARCHAR(40);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role VARCHAR(30);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status VARCHAR(20);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_by BIGINT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_by BIGINT;

-- نسخ من عمود قديم password إن وُجد (لا يُحلّل المرجع إلا داخل EXECUTE)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password'
  ) THEN
    EXECUTE $sql$
      UPDATE public.users
      SET password_hash = password
      WHERE password_hash IS NULL AND password IS NOT NULL
    $sql$;
  END IF;
END $$;

UPDATE public.users
SET full_name = COALESCE(NULLIF(TRIM(full_name), ''), username, 'مستخدم')
WHERE full_name IS NULL;

UPDATE public.users SET role = 'USER' WHERE role IS NULL;
UPDATE public.users SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE public.users SET must_change_password = FALSE WHERE must_change_password IS NULL;
UPDATE public.users SET failed_login_attempts = 0 WHERE failed_login_attempts IS NULL;
UPDATE public.users SET created_at = NOW() WHERE created_at IS NULL;
UPDATE public.users SET updated_at = NOW() WHERE updated_at IS NULL;

ALTER TABLE public.users ALTER COLUMN full_name SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN password_hash SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN role SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN must_change_password SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN failed_login_attempts SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON public.users(deleted_at);

-- سجل التدقيق إن وُجد الجدول
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT,
  action VARCHAR(100) NOT NULL,
  target_user_id BIGINT,
  metadata JSONB,
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- إن وُجد audit_logs قديماً، CREATE TABLE أعلاه لا يضيف أعمدة ناقصة
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_user_id BIGINT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action VARCHAR(100);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_user_id BIGINT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

UPDATE public.audit_logs SET action = 'legacy' WHERE action IS NULL;
ALTER TABLE public.audit_logs ALTER COLUMN action SET NOT NULL;

UPDATE public.audit_logs SET created_at = NOW() WHERE created_at IS NULL;
ALTER TABLE public.audit_logs ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.audit_logs ALTER COLUMN created_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_audit_target ON public.audit_logs(target_user_id);

ALTER TABLE IF EXISTS public.users OWNER TO exams_app;
ALTER TABLE IF EXISTS public.audit_logs OWNER TO exams_app;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'users_id_seq') THEN
    ALTER SEQUENCE public.users_id_seq OWNER TO exams_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'audit_logs_id_seq') THEN
    ALTER SEQUENCE public.audit_logs_id_seq OWNER TO exams_app;
  END IF;
END $$;
