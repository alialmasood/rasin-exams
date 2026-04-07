-- إعدادات عامة للنظام (مفتاح/قيمة). يُنشأ تلقائياً أيضاً عبر lib/schema.ts عند تشغيل التطبيق.
CREATE TABLE IF NOT EXISTS public.app_settings (
  setting_key VARCHAR(128) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

INSERT INTO public.app_settings (setting_key, setting_value)
VALUES ('show_college_exam_situation_upload_cta', 'true')
ON CONFLICT (setting_key) DO NOTHING;
