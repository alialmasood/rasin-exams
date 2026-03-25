-- شغّل هذا الملف مرة واحدة كمستخدم postgres (أو superuser) إذا أنشئت جداول users / audit_logs
-- باسم postgres بينما التطبيق يتصل بـ exams_app. يمنع خطأ "must be owner of table users"
-- عند إنشاء الفهارس من التطبيق.

ALTER TABLE IF EXISTS public.users OWNER TO exams_app;
ALTER TABLE IF EXISTS public.audit_logs OWNER TO exams_app;

-- تسلسلات BIGSERIAL (إن وُجدت بالفعل)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'users_id_seq') THEN
    ALTER SEQUENCE public.users_id_seq OWNER TO exams_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'audit_logs_id_seq') THEN
    ALTER SEQUENCE public.audit_logs_id_seq OWNER TO exams_app;
  END IF;
END $$;
