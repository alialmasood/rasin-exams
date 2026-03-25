-- إنشاء مستخدم التطبيق
DO
$$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE rolname = 'exams_app'
   ) THEN
      CREATE ROLE exams_app LOGIN PASSWORD 'ExaaM@2026';
   END IF;
END
$$;

-- منح الصلاحيات الأساسية
ALTER ROLE exams_app SET client_encoding TO 'utf8';
ALTER ROLE exams_app SET default_transaction_isolation TO 'read committed';
ALTER ROLE exams_app SET timezone TO 'Asia/Baghdad';

-- التأكد من الاتصال بقاعدة exams
\connect exams;

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Schemas
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION postgres;

-- منح الصلاحيات على قاعدة البيانات
GRANT ALL PRIVILEGES ON DATABASE exams TO exams_app;
GRANT USAGE, CREATE ON SCHEMA public TO exams_app;
GRANT USAGE, CREATE ON SCHEMA app TO exams_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO exams_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO exams_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO exams_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON TABLES TO exams_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON SEQUENCES TO exams_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON FUNCTIONS TO exams_app;