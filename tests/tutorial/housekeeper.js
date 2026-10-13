/* فيديو الهاوس كيبر ومسؤول التعقيم ومسؤول الأشعة — طلبات الفرع ويعتمدها مدير الفرع (صوت عربي) */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { ar: 'هذا الفيديو للهاوس كيبر، ومسؤول التعقيم، ومسؤول الأشعة. ترفع طلبات فرعك من حسابك، ويعتمدها مدير الفرع بدل الطبيب.' },
  login: { ar: 'ادخل باسمك ورقمك السري. حسابك فيه صفحتان فقط: «طلب جديد» و«طلباتي»، وطلباتك لا تظهر لأحد من الممرضات.' },
  form: { ar: 'فرعك محدد مسبقًا من الإدارة ولا يتغير، ولا تختار عيادة ولا طبيبًا، لأن الطلب للفرع كله. ولا يوجد تسجيل طلبات بتاريخ سابق.' },
  type: { ar: 'اختر نوع الطلب: «شهري» للطلب المعتاد، أو «طارئ» للحاجة العاجلة فقط، مع الالتزام بقواعد الطلبات الظاهرة أعلى الصفحة.' },
  items: { ar: 'اكتب اسم الصنف واختره، ثم حدد الكمية بالزائد والناقص. أضف كل ما تحتاجه في طلب واحد.' },
  submit: { ar: 'راجع الملخص ثم اضغط «إرسال الطلب». يصل الطلب لمدير فرعك مباشرة بإشعار.' },
  mine: { ar: 'في «طلباتي» تتابع كل طلب. البطاقة تقول «بانتظار مدير الفرع» حتى يعتمده.' },
  approve: { ar: 'الآن من حساب مدير الفرع: صفحة «الاعتمادات» فيها طلبات فرعه. يفتح الطلب، ويعدّل الكمية إن لزم، ثم يضغط «اعتماد»، فيذهب الطلب للتموين للتجهيز.' },
  reject: { ar: 'وإن لم يكن الطلب مناسبًا، يكتب مدير الفرع السبب ويضغط «رفض».' },
  resubmit: { ar: 'يصلك الرفض مع السبب في بطاقة الطلب. صحّح ما يلزم، ثم اضغط «إعادة الإرسال لمدير الفرع» واكتب ملاحظتك.' },
  receive: { ar: 'بعد أن يجهز التموين الطلب ويصل للفرع، يظهر زر «استلام». راجع الكميات، ووقّع، ثم أكّد الاستلام.' },
  done: { ar: 'وهذه نفس الخطوات لمسؤول التعقيم ومسؤول الأشعة، كل في فرعه. شكرًا لك.' }
};
const steps = {
  login: { ar: 'الدخول' }, form: { ar: '١ · طلب جديد' }, follow: { ar: '٢ · المتابعة' },
  bm: { ar: '٣ · مدير الفرع' }, fix: { ar: '٤ · الرفض والتصحيح' }, recv: { ar: '٥ · الاستلام' }
};

async function flow(h) {
  const { page, scene, click, type, point, highlight, wait } = h;
  const addItem = async q => { await type('#itemSearch', q); await page.waitForSelector('#comboList .combo-opt'); await wait(400); await click('#comboList .combo-opt'); };
  const submit = async () => {
    await click('#submitBtn');
    const tt = await page.waitForFunction(() => [...document.querySelectorAll('.toast')].map(x => x.textContent).find(x => /REQ-/.test(x)) || null).then(x => x.jsonValue());
    await wait(600); return (/REQ-[\d-]+/.exec(tt) || [''])[0];
  };
  let id = '';
  await scene('intro', '', async () => { await wait(500); });
  await scene('login', 'login', async () => {
    await h.login('Reem', '1414');
    await highlight('.sidebar nav', 2600);
  });
  await scene('form', 'form', async () => {
    if (!(await page.$('#fKind'))) await h.nav('new');
    await page.waitForSelector('#fKind'); await wait(400);
    await highlight('#fKind', 2000);
    await point('#fBranch'); await highlight('#fBranch', 2200);
  });
  await scene('type', 'form', async () => {
    await click('[data-seg-name="reqType"][data-v="شهري"]'); await wait(400);
    await point('[data-seg-name="reqType"][data-v="طارئ"]');
    if (await page.$('.rule-bar')) await highlight('.rule-bar', 2200);
  });
  await scene('items', 'form', async () => {
    await addItem('gloves'); await addItem('cotton'); await page.keyboard.press('Escape');
    await click('.item-line:nth-child(1) [data-d="1"]'); await click('.item-line:nth-child(1) [data-d="1"]'); await click('.item-line:nth-child(2) [data-d="1"]');
  });
  await scene('submit', 'form', async () => { await highlight('#sumBox', 1400); id = await submit(); });
  await scene('mine', 'follow', async () => {
    await h.nav('mine');
    await page.evaluate(() => typeof loadMine === 'function' && loadMine(true));
    await page.waitForSelector(`.req:has-text("${id}")`);
    await highlight(`.req:has-text("${id}") .badge`, 2600);
  });
  // طلب ثانٍ يرفضه مدير الفرع لاحقاً
  const id2 = (await h.api('createRequest', [{ clinic: 'Housekeeper', type: 'شهري', items: [{ name: 'Sterilization pouches', qty: 12 }] }], ['Reem', '1414'])).id;
  await h.logout();
  await scene('approve', 'bm', async () => {
    await h.login('Nawaf', '7777');
    await h.nav('reviews');
    await page.waitForSelector(`#docList [data-id="${id}"]`); await wait(500);
    await highlight('#docList', 1500);
    await click(`#docList [data-id="${id}"]`);
    await page.waitForSelector('#rvItems table'); await wait(500);
    await point('.rvQty >> nth=0');
    await page.fill('.rvQty >> nth=0', '2'); await page.dispatchEvent('.rvQty >> nth=0', 'input'); await wait(500);
    await click('#rvApprove'); await wait(1200);
  });
  await scene('reject', 'bm', async () => {
    await page.waitForSelector(`#docList [data-id="${id2}"]`);
    await click(`#docList [data-id="${id2}"]`);
    await page.waitForSelector('#rvItems table'); await wait(500);
    await type('#rvReason', 'We still have pouches in the store');
    await click('#rvReject');
    await page.waitForSelector('[data-yes]'); await wait(500);
    await click('[data-yes]'); await wait(1200);
  });
  await h.logout();
  await scene('resubmit', 'fix', async () => {
    await h.login('Reem', '1414');
    await h.nav('mine');
    await page.evaluate(() => typeof loadMine === 'function' && loadMine(true));
    await page.waitForSelector(`.req:has-text("${id2}") [data-act="resubmit"]`);
    await page.locator(`.req:has-text("${id2}")`).scrollIntoViewIfNeeded();
    await highlight(`.req:has-text("${id2}")`, 1800);
    await click(`.req:has-text("${id2}") [data-act="resubmit"]`);
    await page.waitForSelector('#rsNote');
    await type('#rsNote', 'The store is empty now, please approve');
    await click('#rsOk'); await wait(1000);
  });
  // التموين يجهّز ويرسل الطلب المعتمد
  await h.api('bulkUpdateStatus', [[id], 'قيد التجهيز'], ['Ali', '3333']);
  await h.api('dispatchItems', [id, ['Gloves M', 'Cotton rolls']], ['Ali', '3333']);
  await scene('receive', 'recv', async () => {
    await h.nav('new'); await h.nav('mine');
    await page.evaluate(() => typeof loadMine === 'function' && loadMine(true));
    await page.waitForSelector(`.req:has-text("${id}") [data-act="receive"]`);
    await click(`.req:has-text("${id}") [data-act="receive"]`);
    await page.waitForSelector('.rq'); await wait(500);
    await highlight('.rq', 900);
    await h.sign(); await wait(300); await click('#rOk'); await wait(1000);
  });
  await scene('done', 'recv', async () => {
    await page.locator(`.req:has-text("${id}")`).scrollIntoViewIfNeeded().catch(() => {});
    await highlight(`.req:has-text("${id}") .badge`, 1800);
  });
}

if (require.main === module) makeTutorial({ id: 'housekeeper', voiceLang: 'ar', langs: ['ar'], noMoney: true, scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
