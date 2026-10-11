/* فيديو دورة الطلب كاملة — صوت عربي وواجهة عربية: الممرضة ← الطبيب ← التموين ← السائق ← استلام العيادة */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { ar: 'هذا الفيديو يوضح دورة الطلب كاملة في مسار: من رفع الممرضة للطلب، إلى اعتماد الطبيب، ثم تجهيز التموين وإرساله، وتوصيل السائق، وأخيرًا استلام العيادة.' },
  nurse: { ar: 'تبدأ الدورة عند الممرضة: تسجّل الدخول، وتختار العيادة والطبيب والفرع ونوع الطلب.' },
  items: { ar: 'ثم تضيف الأصناف من الكتالوج وتحدد كمياتها. وإن لم تجد صنفًا، تكتبه كصنف حر.' },
  submit: { ar: 'تضغط «إرسال الطلب»، فيصل للطبيب للمراجعة، ويظهر لها في «طلباتي» بمرحلته.' },
  doctor: { ar: 'الطبيب يفتح الطلب، ويعدّل الكميات إن لزم، ثم يعتمده. ولو رفضه، يكتب السبب ويرجع للممرضة.' },
  proc: { ar: 'بعد الاعتماد يصل الطلب للتموين بالكميات التي اعتمدها الطبيب. وإن لم يتوفر صنف، يقترح التموين بديلًا يرجع للطبيب ليوافق عليه.' },
  ship: { ar: 'يحدد التموين الأصناف وكمية الشحنة، ويحمّلها في بوكس الطبيب ويرسلها. ويمكن إرسال جزء الآن والباقي لاحقًا.' },
  driver: { ar: 'السائق يفتح البوكس من رمزه، ويختار مكان التسليم، ويصوّر البوكس، فيصل الطلب للفرع.' },
  receive: { ar: 'تستلم الممرضة الشحنة: تتأكد من الكميات وتوقّع، فيكتمل الطلب.' },
  done: { ar: 'وفي كل مرحلة يرى الجميع أين يقف الطلب ومتى، حتى يكتمل. شكرًا لك.' }
};
const steps = {
  nurse: { ar: '١ · الممرضة ترفع الطلب' },
  doctor: { ar: '٢ · الطبيب يعتمد' },
  proc: { ar: '٣ · التموين يجهّز ويرسل' },
  driver: { ar: '٤ · السائق يوصّل' },
  receive: { ar: '٥ · العيادة تستلم' }
};

async function flow(h) {
  const { page, scene, click, type, point, highlight, wait } = h;
  const addItem = async q => { await type('#itemSearch', q); await page.waitForSelector('#comboList .combo-opt[data-i]'); await wait(400); await click('#comboList .combo-opt[data-i]'); };
  const relogin = async (name, pass) => { await h.logout(); await h.login(name, pass); };
  await page.evaluate(() => { window.print = () => {}; });
  let reqId = '';

  await scene('intro', '', async () => { await wait(500); });
  await scene('nurse', 'nurse', async () => {
    await h.login('Sara', '1111');
    await page.waitForSelector('[data-seg-name="reqKind"]');
    await click('[data-seg-name="reqKind"][data-v="doctor"]');
    await page.waitForSelector('#fDocClinic');
    await h.select('#fDocClinic', el => [...el.options].find(o => /Dental Clinic 1/.test(o.textContent)).value);
    await page.waitForSelector('#fDoctor option[value="Dr. Khalid"]', { state: 'attached' });
    await h.select('#fDoctor', 'Dr. Khalid');
    await highlight('#fBranch', 1000);
    await click('[data-seg-name="reqType"][data-v="شهري"]'); await wait(400);
  });
  await scene('items', 'nurse', async () => {
    await addItem('prophy'); await addItem('floss'); await page.keyboard.press('Escape');
    await click('.item-line:nth-child(1) [data-d="1"]'); await click('.item-line:nth-child(2) [data-d="1"]');
    await highlight('#itemsList', 1200);
  });
  await scene('submit', 'nurse', async () => {
    await highlight('#sumBox', 1000);
    await click('#submitBtn');
    const tt = await (await page.waitForSelector('.toast:last-child')).textContent();
    reqId = (/REQ-[\d-]+/.exec(tt) || [''])[0];
    await wait(600);
    await h.nav('mine');
    await page.waitForSelector(`.req:has-text("${reqId}")`);
    await highlight(`.req:has-text("${reqId}") .badge`, 1500);
  });
  await scene('doctor', 'doctor', async () => {
    await relogin('Dr. Khalid', '4444');
    await page.waitForSelector(`#docList [data-id="${reqId}"]`);
    await click(`#docList [data-id="${reqId}"]`);
    await page.waitForSelector('#rvItems table'); await wait(600);
    await highlight('#rvItems table', 1600);
    await click('#rvApprove'); await wait(1200);
  });
  const row = `.req[data-rid="${reqId}"]`, exp = `#exp-${reqId}`;
  await scene('proc', 'proc', async () => {
    await relogin('Ali', '3333');
    await click('.chip[data-g="all"]'); await page.waitForSelector(row);
    await page.locator(row).scrollIntoViewIfNeeded();
    await click(row + ' .req-actions [data-act="procToggle"]');
    await page.waitForSelector(exp + ' .dsp-table'); await wait(500);
    await highlight(exp + ' .dsp-table', 1300);
    await point(exp + ' [data-act="subItem"] >> nth=0'); await wait(600);
  });
  await scene('ship', 'proc', async () => {
    await click(exp + ' [data-change="dspAll"]'); await wait(500);
    await click(exp + ' [data-act="dispatch"]'); await page.waitForSelector('.modal #bxpOk'); await wait(700);
    await highlight('.modal .bxp-owner', 900);
    await click('.modal #bxpOk'); await wait(1300);
  });
  // السائق: بوكس الطبيب المحمَّل بهذا الطلب
  const info = await h.api('getBoxes', [], ['Ali', '3333']);
  const box = info.boxes.find(b => (b.loads || []).some(l => String(l.request || l.id || l).indexOf(reqId) !== -1)) || info.boxes.find(b => b.owner === 'Dr. Khalid' && b.loads && b.loads.length);
  const k = await page.evaluate(id => { const d = __gas.dump('Boxes'); const i = d[0].indexOf('BoxID'), j = d[0].indexOf('Token'); return d.find(r => r[i] === id)[j]; }, box.id);
  await scene('driver', 'driver', async () => {
    await page.evaluate(([id, kk]) => showDriverBox(id, kk, true), [box.id, k]);
    await page.waitForSelector('#drvPlaces'); await wait(900);
    await highlight('#drvPlaces', 1000);
    await page.setInputFiles('#drvFile', { name: 'box.png', mimeType: 'image/png', buffer: h.png });
    await wait(600);
    await type('#drvName', 'Hamad');
    await click('#drvGo'); await page.waitForSelector('.drv-done').catch(() => {}); await wait(1200);
  });
  await scene('receive', 'receive', async () => {
    // العودة من شاشة السواق إلى التطبيق (البيانات التجريبية داخل الصفحة: لا إعادة تحميل)
    await page.evaluate(() => { const v = document.getElementById('driverView'); if (v) v.remove(); document.getElementById('appShell').classList.remove('hidden'); });
    await relogin('Sara', '1111');
    await h.nav('mine');
    await page.waitForSelector(`.req:has-text("${reqId}") [data-act="receive"]`);
    await click(`.req:has-text("${reqId}") [data-act="receive"]`);
    await page.waitForSelector('.rq'); await wait(500);
    await highlight('.rq', 900);
    await h.sign(); await wait(300); await click('#rOk'); await wait(1000);
  });
  await scene('done', 'receive', async () => {
    await click(`.req:has-text("${reqId}") [data-act="detail"]`).catch(() => {});
    await page.waitForSelector('.modal .stepper').catch(() => {}); await wait(800);
    await highlight('.modal .stepper', 2200).catch(() => {});
  });
}

if (require.main === module) makeTutorial({ id: 'cycle', voiceLang: 'ar', langs: ['ar'], noMoney: true, scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
