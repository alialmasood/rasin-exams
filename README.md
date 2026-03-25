# نظام رصين لادارة الامتحانات - جامعة البصرة

هذا المشروع مبني على Next.js، ويستخدم PostgreSQL داخل Docker.

## بيانات قاعدة البيانات

- Project Name: `rasin-exams`
- Database Type: `PostgreSQL`
- Host: `localhost`
- Port: `5447`
- Database Name: `exams`
- Database User: `exams_app`
- Database Password: `ExaaM@2026`
- Admin User: `postgres`
- Admin Password: `ExaaM@2026`
- Container Name: `rasin_exams_postgres`
- Image: `postgres:16-alpine`
- Volume: `rasin_exams_postgres_data`

## الاتصال بالتطبيق

> ملاحظة: الرمز `@` في كلمة المرور يجب ترميزه في رابط الاتصال إلى `%40`.

- Application DATABASE_URL:
`postgresql://exams_app:ExaaM%402026@localhost:5447/exams?schema=public`

- Prisma DATABASE_URL:
`postgresql://exams_app:ExaaM%402026@localhost:5447/exams`

## ملفات الإعداد

- إعداد Docker موجود في: `database/docker-compose.yml`
- سكربت التهيئة الأولية موجود في: `database/init/01-init.sql`
- نموذج المتغيرات موجود في: `.env.example`

## التشغيل السريع

1. تشغيل PostgreSQL:
   ```bash
   docker compose -f database/docker-compose.yml up -d
   ```
2. نسخ ملف البيئة:
   ```bash
   copy .env.example .env.local
   ```
3. تشغيل المشروع:
   ```bash
   npm run dev
   ```
4. فتح التطبيق على:
   `http://localhost:3000`

## ملاحظات

- سكربت `database/init/01-init.sql` ينشئ المستخدم `exams_app` ويمنحه الصلاحيات المطلوبة.
- إذا كنت ستستخدم Prisma، يمكنك الاعتماد على `PRISMA_DATABASE_URL` أو `DATABASE_URL` مباشرة حسب إعداد مشروعك.
