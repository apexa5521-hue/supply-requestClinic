/* فيديو المعمل — صوت إنجليزي + ترجمة عربية */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { en: 'This video is for the lab team. You will learn how to receive cases from the clinics, move each work through its stages, use an external lab, and send the work back.',
    ar: 'هذا الفيديو لفريق المعمل: كيف تستلم الإرساليات من العيادات، وتنقل كل عمل بين مراحله، وتستخدم معملًا خارجيًا، ثم ترجع العمل للعيادة.' },
  login: { en: 'Sign in with your name and password. You land on the Lab board.',
    ar: 'سجّل الدخول باسمك ورقمك السري، وتفتح لك «لوحة المعمل».' },
  board: { en: 'Every case from the nurses appears here. The chips filter by stage: new, in work, at an external lab, ready to send, and overdue.',
    ar: 'كل إرسالية من الممرضات تظهر هنا. الأزرار بالأعلى تفلتر حسب المرحلة: جديد، قيد العمل، عند معمل خارجي، جاهز للإرسال، والمتأخر.' },
  card: { en: 'Each card shows the file number, the doctor, the clinic, the scan date and the due date, and every work with its own status.',
    ar: 'كل بطاقة تعرض رقم الملف والطبيب والعيادة وتاريخ السكان وموعد التسليم، وكل عمل بحالته.' },
  receive: { en: 'When the case reaches you, tap Receive. Then tap Start work when you begin.',
    ar: 'عند وصول الإرسالية اضغط «استلام»، ثم «بدء العمل» عندما تبدأ.' },
  external: { en: 'If the work goes to an outside lab, tap External lab. Choose the lab, the expected return date, and the cost if you know it.',
    ar: 'إذا كان العمل سيذهب لمعمل خارجي اضغط «معمل خارجي»، واختر المعمل وموعد الرجوع المتوقع، والتكلفة إن عرفتها.' },
  ready: { en: 'When the work is finished, tap Ready. The nurse and the doctor are notified right away.',
    ar: 'عند انتهاء العمل اضغط «جاهز»، وتصل رسالة للممرضة والطبيب مباشرة.' },
  send: { en: 'Then tap Send to clinic. The nurse confirms receipt from her page.',
    ar: 'ثم اضغط «إرسال للعيادة»، والممرضة تؤكد الاستلام من صفحتها.' },
  itero: { en: 'iTero cases have their own tag with the iTero case number, so you can match the scan quickly.',
    ar: 'حالات iTero لها علامة خاصة برقم حالة الآيتيرو، حتى تطابق السكان بسرعة.' },
  details: { en: 'Tap Details to see the full timeline of a case: who did each step, and when. You can also write a note here.',
    ar: 'اضغط «التفاصيل» لترى مراحل الإرسالية كاملة: من نفّذ كل خطوة ومتى، ويمكنك كتابة ملاحظة.' },
  search: { en: 'To find a case, type the patient file number or the case number in the search box.',
    ar: 'للبحث عن إرسالية اكتب رقم ملف المريض أو رقم الإرسالية في خانة البحث.' },
  kpi: { en: 'Lab KPIs show the average turnaround, on-time rate, redo rate, external work and its cost, and the overdue work.',
    ar: 'صفحة «مؤشرات المعمل» تعرض متوسط زمن الإنجاز، ونسبة الالتزام بالموعد، ونسبة الإعادات، والأعمال الخارجية وتكلفتها، والمتأخر.' },
  done: { en: 'That\'s it. Update every case as soon as it moves, so the clinics always know where their work is. Thank you!',
    ar: 'هذا كل شيء. حدّث كل إرسالية أول ما تتحرك، حتى تعرف العيادات دائمًا أين وصل عملها. شكرًا لك!' }
};
const steps = {
  login: { en: 'Sign in', ar: 'تسجيل الدخول' }, board: { en: 'Lab board', ar: 'لوحة المعمل' }, work: { en: 'Stages', ar: 'المراحل' },
  ext: { en: 'External lab', ar: 'المعمل الخارجي' }, back: { en: 'Back to clinic', ar: 'الإرجاع للعيادة' }, find: { en: 'Find a case', ar: 'البحث' }, kpi: { en: 'KPIs', ar: 'المؤشرات' }
};

async function flow(h) {
  const { page, scene, click, type, point, highlight, wait } = h;
  const day = n => { const d = new Date(Date.now() - n * 864e5); return d.toISOString().slice(0, 10); };
  const L1 = (await h.api('createLabCase', [{ branch: 'Buraydah', doctor: 'Dr. Khalid', fileNo: '20981', scanDate: day(1), lines: [{ lab: 'Internal Lab', workType: 'Crown', details: 'Tooth 36, A2' }] }], ['Sara', '1111'])).id;
  await h.api('createLabCase', [{ branch: 'Buraydah', doctor: 'Dr. Khalid', fileNo: '21044', scanDate: day(0), itero: '88213457' }], ['Sara', '1111']);
  const btn = a => `[data-act="labDo"][data-a="${a}"][data-case="${L1}"]`;
  const card = `#labList .lab-card:has([data-act="labOpen"][data-id="${L1}"])`;
  const focus = async () => { await page.$eval(card, el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await wait(700); };

  await scene('intro', '', async () => { await wait(500); });
  await scene('login', 'login', async () => { await h.login('Lab Tech', '8888'); await page.waitForSelector('#labList .lab-card'); });
  await scene('board', 'board', async () => {
    for (const g of ['new', 'work', 'external', 'ready', 'late']) await highlight('#labChips .chip[data-g="' + g + '"]', 1100);
  });
  await scene('card', 'board', async () => {
    await focus();
    await highlight(card + ' .req-sub', 1800);
    await highlight(card + ' .lab-items', 1400);
  });
  await scene('receive', 'work', async () => {
    await focus();
    await click(btn('receive')); await wait(1300);
    await click(btn('start')); await wait(1300);
  });
  await scene('external', 'ext', async () => {
    await click(btn('external'));
    await page.waitForSelector('.modal #laLab'); await wait(500);
    await point('.modal #laLab'); await wait(400);
    await page.fill('.modal #laExp', day(-5)); await wait(400);
    await type('.modal #laCost', '350');
    await click('.modal #laOk'); await wait(1400);
  });
  await scene('ready', 'back', async () => { await focus(); await click(btn('ready')); await wait(1400); });
  await scene('send', 'back', async () => { await focus(); await click(btn('send')); await wait(1400); });
  await scene('itero', 'board', async () => {
    await page.$eval('#labList .tag.itero', el => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await wait(700); await highlight('#labList .tag.itero', 2000);
  });
  await scene('details', 'board', async () => {
    await focus();
    await click(card + ' .req-actions [data-act="labOpen"]');
    await page.waitForSelector('.modal #lcBody'); await wait(1500);
    await h.scroll(600, '.modal-body'); await wait(800);
    await page.keyboard.press('Escape');
  });
  await scene('search', 'find', async () => {
    await h.scroll(0);
    await type('[data-input="labQ"]', '20981'); await wait(1500);
    await highlight('#labList .lab-card', 1200);
    await page.fill('[data-input="labQ"]', ''); await page.dispatchEvent('[data-input="labQ"]', 'input');
  });
  await scene('kpi', 'kpi', async () => {
    await h.nav('labkpi');
    await page.waitForSelector('#lkBody .rp-tile'); await wait(800);
    await highlight('#lkBody', 1500);
    await h.scroll(500); await wait(1200);
  });
  await scene('done', '', async () => { await h.scroll(0); });
}

if (require.main === module) makeTutorial({ id: 'lab', langs: ['ar'], scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
