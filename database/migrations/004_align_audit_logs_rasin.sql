-- تكميلي بعد خطأ: column "target_user_id" does not exist (جدول audit_logs قديم).
-- شغّل كـ postgres مرة واحدة من مجلد المشروع:
--   psql -h localhost -p 5447 -U postgres -d exams -f database/migrations/004_align_audit_logs_rasin.sql

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_user_id BIGINT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_user_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_audit_target ON public.audit_logs(target_user_id);

ALTER TABLE IF EXISTS public.audit_logs OWNER TO exams_app;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'audit_logs_id_seq') THEN
    ALTER SEQUENCE public.audit_logs_id_seq OWNER TO exams_app;
  END IF;
END $$;
