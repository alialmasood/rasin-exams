-- حسابات الكليات: دور COLLEGE + جدول ملفات التشكيل
-- شغّل كـ postgres أو مالك قاعدة البيانات عند تعذّر تنفيذ ALTER من التطبيق.
--
-- مهم: نوع user_id يجب أن يطابق public.users.id بالضبط (INTEGER أو BIGINT أو UUID).
-- إن كان users.id من نوع INTEGER، استبدل BIGINT أدناه بـ INTEGER قبل التشغيل،
-- أو احذف college_account_profiles إن وُجد بنوع خاطئ ثم أعد الإنشاء.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('SUPER_ADMIN','ADMIN','MANAGER','USER','COLLEGE'));

-- استعلام للتحقق: SELECT udt_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='users' AND column_name='id';

CREATE TABLE IF NOT EXISTS public.college_account_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  formation_name VARCHAR(300) NOT NULL,
  dean_name VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id),
  UNIQUE (formation_name)
);

ALTER TABLE public.college_account_profiles
  DROP CONSTRAINT IF EXISTS college_account_profiles_user_id_fkey;

ALTER TABLE public.college_account_profiles
  ADD CONSTRAINT college_account_profiles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_college_profiles_user ON public.college_account_profiles(user_id);
