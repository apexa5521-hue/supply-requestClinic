/* فيديو الأدمن — صوت إنجليزي + ترجمة عربية */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { en: 'This video is for the system admin. You will learn how to add users, set roles and permissions, take backups, and check the system setup.',
    ar: 'هذا الفيديو لمدير النظام: كيف تضيف المستخدمين، وتحدد الأدوار والصلاحيات، وتأخذ نسخة احتياطية، وتتابع تجهيز النظام.' },
  login: { en: 'Sign in with the admin account, and open Users.',
    ar: 'سجّل الدخول بحساب الأدمن، وافتح «المستخدمون».' },
  list: { en: 'This list shows every account: the role, the branch, the department, and for doctors, the linked doctor and price access. A warning shows doctors without an account, because their requests skip the doctor approval.',
    ar: 'هذه القائمة تعرض كل الحسابات: الدور والفرع والقسم، وللأطباء الطبيب المرتبط وصلاحية الأسعار. ويظهر تنبيه بالأطباء الذين بلا حساب، لأن طلباتهم تتخطى اعتماد الطبيب.' },
  nurse: { en: 'To add a nurse: tap New user, write the name and password, choose the role Nurse, and tap her clinics. She will see these clinics in her requests.',
    ar: 'لإضافة ممرضة: اضغط «مستخدم جديد»، واكتب الاسم والرقم السري، واختر الدور «ممرضة»، ثم اضغط على عياداتها، فتظهر لها في طلباتها.' },
  fields: { en: 'Each role has its own fields. A doctor has the linked doctor name and price access, which is off by default. Procurement has a department: dental or dermatology. A branch manager has a branch.',
    ar: 'لكل دور حقوله: الطبيب له الطبيب المرتبط وصلاحية الأسعار، وهي مغلقة افتراضيًا. والتموين له قسم: أسنان أو جلدية. ومدير الفرع له فرع.' },
  save: { en: 'Tap Save. The account works right away. Passwords are saved encrypted, and every user can change their own password later.',
    ar: 'اضغط «حفظ» ويعمل الحساب فورًا. الأرقام السرية تُحفظ مشفّرة، وكل مستخدم يستطيع تغيير رقمه لاحقًا.' },
  roles: { en: 'Roles and screens: for each management role, tap Edit and tick the permissions it gets. For example: reports, follow-up, finance, doctor prices, or the survey. The server checks these permissions on every action.',
    ar: 'الأدوار والشاشات: لكل دور إداري اضغط «تعديل» وعلّم الصلاحيات التي يحصل عليها، مثل التقارير، والمتابعة، والمالية، وأسعار الأطباء، والاستبيان. والخادم يتحقق منها في كل عملية.' },
  backup: { en: 'Backups: a full copy of the sheet is taken every night automatically. Tap Backup now before any big change.',
    ar: 'النسخ الاحتياطية: نسخة كاملة من الشيت تُؤخذ كل ليلة تلقائيًا، واضغط «نسخة احتياطية الآن» قبل أي تعديل كبير.' },
  setup: { en: 'System setup runs by itself after every update, and shows the result of each step. If a step fails, you see why, and you can run it again.',
    ar: 'تجهيز النظام يعمل تلقائيًا بعد كل تحديث، ويعرض نتيجة كل خطوة. وإذا فشلت خطوة ترى السبب، ويمكنك تشغيلها مرة أخرى.' },
  done: { en: 'That\'s it. Keep only active accounts, and give each role only what it needs. Thank you!',
    ar: 'هذا كل شيء. أبقِ الحسابات الفعّالة فقط، وأعطِ كل دور ما يحتاجه فقط. شكرًا لك!' }
};
const steps = {
  login: { en: 'Sign in', ar: 'تسجيل الدخول' }, users: { en: 'Users', ar: 'المستخدمون' }, roles: { en: 'Roles & permissions', ar: 'الأدوار والصلاحيات' },
  backup: { en: 'Backups', ar: 'النسخ الاحتياطية' }, setup: { en: 'System setup', ar: 'تجهيز النظام' }
};

async function flow(h) {
  const { page, scene, click, type, point, highlight, wait } = h;
  await scene('intro', '', async () => { await wait(500); });
  await scene('login', 'login', async () => { await h.login('Admin', '9999'); await h.nav('users'); await page.waitForSelector('#uTable table'); });
  await scene('list', 'users', async () => {
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
  });
  await scene('save', 'users', async () => { await click('#uSave'); await wait(1400); });
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
  });
  await scene('done', '', async () => { await h.scroll(0); });
}

if (require.main === module) makeTutorial({ id: 'admin', langs: ['ar'], scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
