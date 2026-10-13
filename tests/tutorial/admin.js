/* فيديو الأدمن — صوت إنجليزي + ترجمة عربية */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { ar: "هذا الفيديو لمدير النظام: المستخدمون، والأطباء، والأدوار والصلاحيات، والنسخ الاحتياطي، وتجهيز النظام." },
  list: { ar: "كل الحسابات: الدور والفرع والقسم. وتنبيه بالأطباء الذين بلا حساب، لأن طلباتهم تتخطى اعتماد الطبيب." },
  nurse: { ar: "اكتب الاسم والرقم السري، واختر الدور «ممرضة»، ثم عياداتها." },
  fields: { ar: "الطبيب له الطبيب المرتبط، والتموين له قسم (أسنان أو جلدية)، ومدير الفرع له فرع. اضغط «حفظ» ويعمل الحساب فورًا." },
  hk: { ar: "حساب الهاوس كيبر أو مسؤول التعقيم أو مسؤول الأشعة: اختر الدور، ثم حدّد فرعه. طلباته تكون لهذا الفرع، ويعتمدها مدير الفرع." },
  doctors: { ar: "تبويب «الأطباء» لك أنت فقط، والتموين لا يراه: أضف الطبيب، واكتب تخصصه وتخصصه الدقيق، وعلّم عياداته. وبدون أي عيادة يظهر الطبيب في كل العيادات." },
  doclogin: { ar: "في «حساب الدخول» اكتب اسم مستخدم ورقمًا سريًا، فيُنشأ له حساب طبيب ويدخل فورًا. أو اكتب اسم حساب طبيب موجود ليرتبط به. وتغيير اسم الطبيب ينتقل لطلباته وحسابه تلقائيًا." },
  roles: { ar: "لكل دور إداري اضغط «تعديل» وعلّم الصلاحيات: التقارير، المتابعة، البلاغات، الاستبيان." },
  settings: { ar: "«الإعدادات» بدل الشيت: بريد السائق، وآخر تاريخ للطلبات السابقة، ومعمل iTero، ومدة إنجاز المعمل، ثم «حفظ»." },
  clinics: { ar: "وتضيف العيادات وتعدّلها بفرعها ونوعها، والمعامل وأنواع الأعمال والمواد، وأسئلة استبيان الأطباء، وكل شيء يُطبَّق فورًا." },
  backup: { ar: "نسخة كاملة من الشيت كل ليلة تلقائيًا، واضغط الزر قبل أي تعديل كبير." },
  setup: { ar: "يعمل بعد كل تحديث ويعرض نتيجة كل خطوة، والخطوة الفاشلة تُعاد بضغطة. شكرًا لك." }
};
const steps = {
  login: { en: 'Sign in', ar: 'تسجيل الدخول' }, users: { en: 'Users', ar: 'المستخدمون' }, doctors: { en: 'Doctors', ar: 'الأطباء' }, roles: { en: 'Roles & permissions', ar: 'الأدوار والصلاحيات' },
  settings: { en: 'Settings', ar: 'الإعدادات' }, backup: { en: 'Backups', ar: 'النسخ الاحتياطية' }, setup: { en: 'System setup', ar: 'تجهيز النظام' }
};

async function flow(h) {
  const { page, scene, click, type, point, highlight, wait } = h;
  await scene('intro', '', async () => {
    await wait(500);
  });
  await scene('list', 'users', async () => {
    await h.login('Admin', '9999'); await h.nav('users'); await page.waitForSelector('#uTable table');
    await highlight('#uTable', 2400);
    if (await page.isVisible('#uLinks')) await highlight('#uLinks', 1600);
  });
  await scene('nurse', 'users', async () => {
    await click('[data-act="userNew"]');
    await page.waitForSelector('#uName'); await wait(400);
    await type('#uName', 'Reem'); await type('#uPass', '2468');
    await h.select('#uRole', 'Nurse'); await wait(500);
    await click('#uClinics .chip >> nth=2'); await wait(400);
    await highlight('#uClinics', 1200);
  });
  await scene('fields', 'users', async () => {
    await h.select('#uRole', 'Doctor'); await wait(500);
    await highlight('#uPvWrap', 1500); await highlight('#uDocWrap', 1200);
    await h.select('#uRole', 'Procurement'); await wait(500); await highlight('#uDeptWrap', 1200);
    await h.select('#uRole', 'Branch manager'); await wait(500); await highlight('#uBranchWrap', 1200);
    await h.select('#uRole', 'Nurse'); await wait(300);
    await click('#uClinics .chip >> nth=2');
    await click('#uSave'); await wait(1400);
  });
  await scene('hk', 'users', async () => {
    await click('[data-act="userNew"]');
    await page.waitForSelector('#uName'); await wait(400);
    await type('#uName', 'Latifa'); await type('#uPass', '1357');
    await h.select('#uRole', 'Housekeeper'); await wait(600);
    await highlight('#uBranchWrap', 1400);
    await h.select('#uBranch', 'Unayzah').catch(() => {});
    await click('#uSave'); await wait(1400);
  });
  await scene('doctors', 'doctors', async () => {
    // القائمة الجانبية طويلة للأدمن: تتمرر حتى زر «الأطباء»
    await page.locator('.sidebar [data-view="docadmin"]').first().scrollIntoViewIfNeeded();
    await h.nav('docadmin');
    await page.waitForSelector('#daList .da-row'); await wait(500);
    await highlight('#daList .da-row >> nth=0', 1300);
    await click('.card-head [data-act="daEdit"]');
    await page.waitForSelector('.modal #daN'); await wait(400);
    await type('.modal #daN', 'Dr. Nasser');
    await type('.modal #daS', 'Dentistry');
    await type('.modal #daSub', 'Endodontics');
    await click('.modal .da-cl[value="Dental Clinic 2"]'); await wait(400);
  });
  await scene('doclogin', 'doctors', async () => {
    await type('.modal #daL', 'Dr.Nasser');
    await type('.modal #daPw', '2468');
    await highlight('.modal #daL', 900);
    await click('.modal #daOk'); await wait(1200);
    await page.waitForSelector('#daList .da-row:has-text("Dr. Nasser")');
    await page.locator('#daList .da-row:has-text("Dr. Nasser")').scrollIntoViewIfNeeded();
    await highlight('#daList .da-row:has-text("Dr. Nasser")', 1800);
    await page.evaluate(() => go('users')); await page.waitForSelector('#rTable'); await wait(600);
  });
  await scene('roles', 'roles', async () => {
    await page.$eval('#rTable', el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await wait(800);
    await click('#rTable [data-act="roleEdit"][data-name="Quality"]');
    await page.waitForSelector('#rPerms'); await wait(600);
    await highlight('#rPerms', 2500);
    await page.keyboard.press('Escape'); await wait(400);
  });
  await scene('settings', 'settings', async () => {
    await page.locator('.sidebar [data-view="settings"]').first().scrollIntoViewIfNeeded();
    await h.nav('settings');
    await page.waitForSelector('#stk_DriverEmail'); await wait(500);
    await highlight('#stBox section >> nth=0', 2400);
    await type('#stk_DriverEmail', 'driver@clinic.sa');
    await click('[data-act="stSaveKeys"]'); await wait(1200);
  });
  await scene('clinics', 'settings', async () => {
    await click('[data-act="stClinic"]:not([data-i])');
    await page.waitForSelector('.modal #scN'); await wait(400);
    await type('.modal #scN', 'Dental Clinic 3'); await type('.modal #scB', 'Unayzah'); await type('.modal #scT', 'Dentistry');
    await click('.modal #stmOk'); await wait(1200);
    await page.$eval('[data-act="stLab"]', el => el.scrollIntoView({ block: 'start', behavior: 'smooth' })); await wait(1300);
    await page.$eval('[data-act="stQ"]', el => el.scrollIntoView({ block: 'start', behavior: 'smooth' })); await wait(1300);
    await page.evaluate(() => go('users')); await page.waitForSelector('#bkBox'); await wait(500);
  });
  await scene('backup', 'backup', async () => {
    await page.$eval('#bkBox', el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await wait(700);
    await click('[data-act="backupNow"]'); await wait(1500);
    await highlight('#bkBox', 1200);
  });
  await scene('setup', 'setup', async () => {
    await page.$eval('#suBox', el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await wait(800);
    await highlight('#suBox', 2500);
    await h.scroll(0);
  });
}

if (require.main === module) makeTutorial({ id: 'admin', voiceLang: 'ar', noMoney: true, langs: ['ar'], scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
