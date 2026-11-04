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


## الخطة أ والخطة ب (بعد النقل)

- **الخطة أ:** رابط Render وقاعدة Supabase، وهي الأساسية بعد النقل.
- **الخطة ب:** رابط GitHub مع Apps Script وGoogle Sheet، وهي البديلة وقت التعطل.

التحديثات تصل للاثنتين تلقائياً: كل دمج في `main` يُدمج في فرع `production-postgresql`، وRender يعيد النشر منه.

### قبل يوم النقل (الآن)
- المزامنة **متوقفة**: `SYNC_ENABLED` غير مضبوط، فلا يُكتب شيء على الشيت.
- الموظفون يعملون على الشيت عبر رابط GitHub كالمعتاد.
- Supabase نسخة تجريبية منفصلة، وما يُكتب فيها لا يصل للشيت.

### يوم النقل (بالترتيب)
1. من الشيت: **File ← Download ← Microsoft Excel**، ثم ارفع الملف في `/admin/import` على Render.
2. في Render ← Environment:
   - `SHEET_SYNC_ID` = رقم الشيت الحالي، وهو الجزء الطويل في رابطه بين `/d/` و`/edit`.
   - `SYNC_ENABLED` = `yes`.
3. شارك الشيت مع حساب الخدمة (`masar-sync@…`) بصلاحية **Editor**.
4. أعطِ الموظفين رابط Render.

من هذه اللحظة يُنسخ Supabase إلى الشيت كل 15 دقيقة (أو كل 5 دقائق إن غيّرت pg_cron).

### إذا تعطلت الخطة أ
- الموظفون يفتحون رابط GitHub ويكملون العمل على الشيت.
- أول حفظ هناك يُسجَّل في `_SYNC!B3`.
- المزامنة بعدها **ترفض الكتابة** فوق الشيت (409 PLAN_B_ACTIVE) حتى لو رجع Render.

### لما ترجع الخطة أ
1. نزّل الشيت Excel وارفعه في `/admin/import`.
2. المزامنة تعود تلقائياً، والموظفون يرجعون لرابط Render.

## صفحة الأدمن `/admin`

- **تنزيل Excel:** يحمّل كل التبويبات الحالية من قاعدة البيانات كملف .xlsx على جهازك. ما يُحفظ شيء في Drive، فلا تتراكم الملفات.
- **استيراد Excel:** يستبدل كل البيانات الحالية بمحتوى الملف (تحذير قبل التنفيذ).
- **المفتاح:** متغير `ADMIN_KEY` في Render (أو `IMPORT_KEY` القديم إذا ما أضفت الجديد). لازم 8 أحرف على الأقل.
- التواريخ بتوقيت الرياض في الملف، والتصدير والاستيراد متطابقان.
- اختبار: `npm run test:server`.

## الإشعارات: الإيميل + إشعارات الجوال

### الإيميل (SMTP) — يحتاج إعداد مرة واحدة
بدون هذه المتغيرات الإيميل يُكتب في سجل Render فقط ولا يُرسل.
1. من حساب Gmail اللي بيرسل: myaccount.google.com ← الأمان ← فعّل «التحقق بخطوتين» ← «كلمات مرور التطبيقات» ← أنشئ واحدة باسم Masar (16 حرفاً).
2. في Render ← Environment أضف:
   - `SMTP_USER` = الإيميل نفسه
   - `SMTP_PASS` = كلمة مرور التطبيق (المسافات لا تهم)
   - اختياري: `SMTP_HOST` / `SMTP_PORT` لغير Gmail (الافتراضي `smtp.gmail.com` و 465)، و`MAIL_FROM` لاسم مرسل مختلف.
3. Save → Render يعيد التشغيل. تأكد من `/health` ← `"notify": { "email": true }`.
- حد Gmail تقريباً 500 مستلم في اليوم. الإيميل لأكثر من شخص يُرسل مخفياً (BCC) فلا يرى أحد عناوين الآخرين.

### إشعارات الجوال (Web Push) — بدون إعداد
- مفاتيح VAPID تُنشأ تلقائياً أول تشغيل وتُحفظ في قاعدة البيانات (`gas_kv` ← `meta/vapid`). لا تحذفها: حذفها يوقف إشعارات كل الأجهزة المفعّلة حتى يعيد كل موظف التفعيل.
- اختياري: `VAPID_PUBLIC_KEY` و`VAPID_PRIVATE_KEY` في Render بدل المحفوظة.
- الأجهزة في تبويب `PushSubs` (جهاز لكل سطر، ويتبع آخر من سجّل دخوله منه). الجهاز اللي ألغى الإشعارات يُحذف تلقائياً.
- الآيفون: لازم «إضافة إلى الشاشة الرئيسية» من Safari ثم الفتح من الأيقونة (iOS 16.4+). الموقع يعرض الخطوات للموظف تلقائياً.
- اختبار: `npm run test:server`.
