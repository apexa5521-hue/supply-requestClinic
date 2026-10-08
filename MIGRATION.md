# نقل SupplyFlow من Google Apps Script إلى Node.js + PostgreSQL

## الخطوات

### 1. Supabase (قاعدة البيانات)

اذهب إلى https://supabase.com

1. Sign Up with GitHub
2. New Project
   - Organization: "ApexCare"
   - Project name: "Masar" أو "ApexCare-Production"
   - Password: كلمة سر قوية (احفظها)
   - Region: Singapore أو Europe
3. انتظر 2-3 دقائق
4. احصل على Connection String:
   - Database → Connection Pooling
   - اختر "nodejs"
   - انسخ الرابط: `postgresql://[user]:[password]@[host]/[database]`

### 2. هذا الـ Repository

1. Clone repo (إذا لم تكن عنده)
2. Checkout branch `production-postgresql`
3. انسخ `.env.example` إلى `.env`
4. اضبط المتغيرات في `.env`:
   ```
   DATABASE_URL=postgresql://... (من Supabase)
   NODE_ENV=production
   JWT_SECRET=كلمة-سر-قوية-جداً
   ```

### 3. Render (الخادم)

اذهب إلى https://render.com

1. Sign Up with GitHub
2. New → Web Service
3. اختر الـ repo من GitHub
4. الإعدادات:
   - Name: "masar-app"
   - Region: Singapore (نفس Supabase)
   - Branch: `production-postgresql`
   - Build: `npm install`
   - Start: `npm start`
5. Environment Variables:
   - DATABASE_URL (من الخطوة 1)
   - NODE_ENV = production
   - JWT_SECRET (نفس الخطوة 2)
6. Deploy

### 4. اختبر

```bash
curl https://masar-app.onrender.com/health
```

يجب أن ترد: `{"status":"ok"}`

## التقدم

- [ ] Supabase: إنشاء قاعدة البيانات والجداول
- [ ] Render: نشر الكود
- [ ] API: نقل كل الدوال من Code.gs
- [ ] البيانات: نقل من Google Sheets
- [ ] الاختبار: تشغيل على staging
- [ ] الإطلاق: تبديل الواجهة الأمامية

