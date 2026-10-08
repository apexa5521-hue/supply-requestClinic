/* فيديو الأدمن — صوت إنجليزي + ترجمة عربية */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { ar: "هذا الفيديو لمدير النظام: المستخدمون، والأدوار والصلاحيات، والنسخ الاحتياطي، وتجهيز النظام." },
  list: { ar: "كل الحسابات: الدور والفرع والقسم. وتنبيه بالأطباء الذين بلا حساب، لأن طلباتهم تتخطى اعتماد الطبيب." },
  nurse: { ar: "اكتب الاسم والرقم السري، واختر الدور «ممرضة»، ثم عياداتها." },
  fields: { ar: "الطبيب له الطبيب المرتبط، والتموين له قسم (أسنان أو جلدية)، ومدير الفرع له فرع. اضغط «حفظ» ويعمل الحساب فورًا." },
  roles: { ar: "لكل دور إداري اضغط «تعديل» وعلّم الصلاحيات: التقارير، المتابعة، البلاغات، الاستبيان." },
  backup: { ar: "نسخة كاملة من الشيت كل ليلة تلقائيًا، واضغط الزر قبل أي تعديل كبير." },
  setup: { ar: "يعمل بعد كل تحديث ويعرض نتيجة كل خطوة، والخطوة الفاشلة تُعاد بضغطة. شكرًا لك." }
};
const steps = {
  login: { en: 'Sign in', ar: 'تسجيل الدخول' }, users: { en: 'Users', ar: 'المستخدمون' }, roles: { en: 'Roles & permissions', ar: 'الأدوار والصلاحيات' },
  backup: { en: 'Backups', ar: 'النسخ الاحتياطية' }, setup: { en: 'System setup', ar: 'تجهيز النظام' }
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
  await scene('roles', 'roles', async () => {
    await page.$eval('#rTable', el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await wait(800);
    await click('#rTable [data-act="roleEdit"][data-name="Quality"]');
    await page.waitForSelector('#rPerms'); await wait(600);
    await highlight('#rPerms', 2500);
    await page.keyboard.press('Escape'); await wait(400);
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
