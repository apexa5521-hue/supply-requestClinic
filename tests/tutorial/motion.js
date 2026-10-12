/* فيديو تعريفي بمسار (موشن من الواجهة الحقيقية): دورة طلب ناجحة، إرسال جزئي، بديل بموافقة الطبيب،
   طلب يرجع للطبيب ويُعاد، قواعد الطارئ، ثم لقطات سريعة للمزايا — صوت عربي وواجهة عربية بلا أسعار */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { ar: 'مسار: نظام واحد يربط التمريض والأطباء والتموين والإدارة. كل طلب له طريق واضح، من أول ضغطة إلى آخر توقيع.' },
  nurse: { ar: 'تبدأ الممرضة من صفحة طلب جديد. أعلى الصفحة شريط يخبرها هل هي داخل نافذة الطلب الشهري، وكم طلبًا طارئًا بقي لها.' },
  items: { ar: 'تختار العيادة والطبيب، وتبحث عن الصنف وتحدد الكمية، ثم تضغط إرسال الطلب.' },
  doctor: { ar: 'يصل الطلب للطبيب. يراجع الأصناف، ويعدّل الكمية إن لزم، ثم يعتمد.' },
  proc: { ar: 'التموين يرى الكميات المعتمدة. صنف غير متوفر بالكامل؟ يرسل المتوفر الآن، والباقي يبقى مفتوحًا للشحنة القادمة.' },
  driver: { ar: 'السائق يفتح البوكس من رمزه، ويختار مكان التسليم، ويصوّر البوكس، ثم يضغط تم التوصيل.' },
  receive: { ar: 'الممرضة ترى مكان البوكس وصورته. تستلم الشحنة الأولى وتوقّع، والطلب يبقى مفتوحًا لباقي الأصناف.' },
  sub: { ar: 'صنف ناقص عند التموين؟ يقترح مستهلكًا بديلًا تحت الصنف نفسه.' },
  subok: { ar: 'والطبيب يوافق على البديل أو يرفضه قبل أن يُرسل شيء.' },
  reject: { ar: 'وإذا لم يقتنع الطبيب بطلب، يرفضه ويكتب السبب، فيرجع للممرضة.' },
  resubmit: { ar: 'الممرضة تقرأ السبب، وتعدّل، وتعيد الإرسال للطبيب. وكل خطوة مسجلة.' },
  emergency: { ar: 'الطلب الطارئ له قواعد تحددها الإدارة: عدد في الشهر، وحد لعدد الأصناف. وإذا تجاوزته الممرضة، يظهر لها السبب بوضوح.' },
  rules: { ar: 'هذه القواعد يضبطها التموين والإدارة من صفحة قواعد الطلبات، وتطبَّق فورًا.' },
  custody: { ar: 'العهدة مثل الهاندبيس تُصرف على الطبيب، وتظهر تحت عيادته مع ما عليه.' },
  settings: { ar: 'وكل الإعدادات من داخل النظام: العيادات، والمعامل، والاستبيان، ورابط السائق، بدون الرجوع للشيت.' },
  outro: { ar: 'مسار. كل طلب يعرف طريقه.' }
};
const steps = {
  nurse: { ar: '١ · الممرضة ترفع الطلب' },
  doctor: { ar: '٢ · الطبيب يعتمد' },
  proc: { ar: '٣ · إرسال جزئي' },
  driver: { ar: '٤ · السائق يوصّل' },
  receive: { ar: '٥ · العيادة تستلم' },
  sub: { ar: 'بديل بموافقة الطبيب' },
  reject: { ar: 'طلب يرجع للمراجعة' },
  emergency: { ar: 'قواعد الطارئ' },
  more: { ar: 'مزايا أخرى' }
};

async function flow(h) {
  const { page, scene, click, type, point, highlight, wait } = h;
  const addItem = async q => { await type('#itemSearch', q); await page.waitForSelector('#comboList .combo-opt[data-i]'); await wait(300); await click('#comboList .combo-opt[data-i]'); };
  const relogin = async (name, pass) => { await h.logout(); await h.login(name, pass); };
  await page.evaluate(() => { window.print = () => {}; });
  let reqId = '';

  await scene('intro', '', async () => { await wait(500); });

  // ١) الممرضة ترفع طلبًا لطبيب
  await scene('nurse', 'nurse', async () => {
    await h.login('Sara', '1111');
    await page.waitForSelector('.rule-slot .rule-bar').catch(() => {});
    await highlight('.rule-slot .rule-bar', 2200);
    await click('[data-seg-name="reqKind"][data-v="doctor"]');
    await page.waitForSelector('#fDocClinic');
    await h.select('#fDocClinic', el => [...el.options].find(o => /Dental Clinic 1/.test(o.textContent)).value);
    await page.waitForSelector('#fDoctor option[value="Dr. Khalid"]', { state: 'attached' });
    await h.select('#fDoctor', 'Dr. Khalid');
  });
  await scene('items', 'nurse', async () => {
    await click('[data-seg-name="reqType"][data-v="شهري"]');
    await addItem('prophy'); await addItem('floss'); await page.keyboard.press('Escape');
    await page.fill('.item-line:nth-child(1) [data-input="qtySet"]', '3'); await page.dispatchEvent('.item-line:nth-child(1) [data-input="qtySet"]', 'input');
    await click('.item-line:nth-child(2) [data-d="1"]');
    await click('#submitBtn');
    const tt = await (await page.waitForSelector('.toast:last-child')).textContent();
    reqId = (/REQ-[\d-]+/.exec(tt) || [''])[0];
    await wait(500);
  });

  // ٢) الطبيب يعتمد
  await scene('doctor', 'doctor', async () => {
    await relogin('Dr. Khalid', '4444');
    await page.waitForSelector(`#docList [data-id="${reqId}"]`);
    await click(`#docList [data-id="${reqId}"]`);
    await page.waitForSelector('#rvItems table'); await wait(500);
    await highlight('#rvItems table', 1400);
    await click('#rvApprove'); await wait(1000);
  });

  // ٣) التموين يرسل جزءًا
  const row = `.req[data-rid="${reqId}"]`, exp = `#exp-${reqId}`;
  await scene('proc', 'proc', async () => {
    await relogin('Ali', '3333');
    await click('.chip[data-g="all"]'); await page.waitForSelector(row);
    await page.locator(row).scrollIntoViewIfNeeded();
    await click(row + ' .req-actions [data-act="procToggle"]');
    await page.waitForSelector(exp + ' .dsp-table'); await wait(400);
    const q = exp + ' input.dsp-qty[data-item="PROPHY PASTE"]';
    await point(q); await page.fill(q, '1'); await page.dispatchEvent(q, 'input'); await wait(600);
    await highlight(exp + ' .dsp-row:has-text("PROPHY PASTE")', 1200);
    await click(exp + ' [data-act="dispatch"]'); await page.waitForSelector('.modal #bxpOk'); await wait(600);
    await click('.modal #bxpOk'); await wait(1200);
    await highlight(exp + ' .dsp-row:has-text("PROPHY PASTE") .qty-prog', 1500);
  });

  // ٤) السائق يوصّل
  const info = await h.api('getBoxes', [], ['Ali', '3333']);
  const box = info.boxes.find(b => (b.loads || []).some(l => String(l.request || '').indexOf(reqId) !== -1)) || info.boxes.find(b => b.owner === 'Dr. Khalid' && b.loads && b.loads.length);
  const k = await page.evaluate(id => { const d = __gas.dump('Boxes'); const i = d[0].indexOf('BoxID'), j = d[0].indexOf('Token'); return d.find(r => r[i] === id)[j]; }, box.id);
  await scene('driver', 'driver', async () => {
    await page.evaluate(([id, kk]) => showDriverBox(id, kk, true), [box.id, k]);
    await page.waitForSelector('#drvPlaces'); await wait(700);
    await highlight('#drvPlaces', 900);
    await page.setInputFiles('#drvFile', { name: 'box.png', mimeType: 'image/png', buffer: h.png });
    await wait(500);
    await type('#drvName', 'Hamad');
    await click('#drvGo'); await page.waitForSelector('.drv-done').catch(() => {}); await wait(1000);
  });

  // ٥) الممرضة ترى مكان البوكس وتستلم الشحنة الأولى
  await scene('receive', 'receive', async () => {
    await page.evaluate(() => { const v = document.getElementById('driverView'); if (v) v.remove(); document.getElementById('appShell').classList.remove('hidden'); });
    await relogin('Sara', '1111');
    await h.nav('mine');
    await page.waitForSelector(`.req:has-text("${reqId}") .box-at`).catch(() => {});
    await highlight(`.req:has-text("${reqId}") .box-at`, 1800);
    await click(`.req:has-text("${reqId}") [data-act="receive"]`);
    await page.waitForSelector('.rq'); await wait(400);
    await highlight('#rShip .box-at', 1000);
    await highlight('.rcv-note', 1200);
    await h.sign(); await wait(300); await click('#rOk'); await wait(900);
  });

  // بديل: التموين يقترح، والطبيب يوافق
  await scene('sub', 'sub', async () => {
    await relogin('Ali', '3333');
    await click('.chip[data-g="all"]'); await page.waitForSelector(row);
    await page.locator(row).scrollIntoViewIfNeeded();
    if (!(await page.$(exp + ' .dsp-table'))) await click(row + ' .req-actions [data-act="procToggle"]');
    await page.waitForSelector(exp + ' .dsp-row:has-text("DENTAL FLOSS") [data-act="subItem"]');
    await click(exp + ' .dsp-row:has-text("DENTAL FLOSS") [data-act="subItem"]');
    await page.waitForSelector('.modal #subItem');
    await type('.modal #subItem', 'MICRO BRUSH FINE'); await wait(300);
    await click('.modal #subOk'); await wait(1200);
  });
  await scene('subok', 'sub', async () => {
    await relogin('Dr. Khalid', '4444');
    await page.waitForSelector('#docSubs .sub-row').catch(() => {});
    await highlight('#docSubs .sub-row', 1200);
    await click('#docSubs [data-act="subReview"][data-ok="1"]'); await wait(1000);
  });

  // طلب يرجع للطبيب: الطبيب يرفض بسبب، والممرضة تعدّل وتعيد
  const rej = await h.api('createRequest', [{ doctor: 'Dr. Khalid', clinic: 'Dental Clinic 1', type: 'شهري', items: [{ name: 'Composite A2', qty: 12 }] }], ['Sara', '1111']);
  await scene('reject', 'reject', async () => {
    await page.evaluate(() => sync(true)); await wait(800);
    await page.waitForSelector(`#docList [data-id="${rej.id}"]`);
    await click(`#docList [data-id="${rej.id}"]`);
    await page.waitForSelector('#rvReason'); await wait(400);
    await type('#rvReason', 'الكمية أكثر من حاجة العيادة هذا الشهر');
    await click('#rvReject'); await page.waitForSelector('.modal [data-yes]'); await wait(600);
    await click('.modal [data-yes]'); await wait(1000);
  });
  await scene('resubmit', 'reject', async () => {
    await relogin('Sara', '1111');
    await h.nav('mine');
    await page.waitForSelector(`.req:has-text("${rej.id}") [data-act="resubmit"]`);
    await highlight(`.req:has-text("${rej.id}")`, 1300);
    await click(`.req:has-text("${rej.id}") [data-act="resubmit"]`);
    await page.waitForSelector('.modal #rsNote');
    await type('.modal #rsNote', 'عدّلت الكمية إلى 6');
    await click('.modal #rsOk'); await wait(1000);
  });

  // قواعد الطارئ: حد الأصناف ورسالة واضحة
  await h.api('saveOrderRules', [{ emergencyMax: 3, emergencyMaxItems: 2 }], ['Ali', '3333']);
  await scene('emergency', 'emergency', async () => {
    await h.nav('new'); await wait(600);
    await page.evaluate(() => loadRules()); await wait(600);
    await click('[data-seg-name="reqKind"][data-v="doctor"]');
    await page.waitForSelector('#fDoctor option[value="Dr. Khalid"]', { state: 'attached' });
    await click('[data-seg-name="reqType"][data-v="طارئ"]');
    await highlight('.rule-slot .rule-bar', 1400);
    await addItem('prophy'); await addItem('floss'); await addItem('etchant'); await page.keyboard.press('Escape');
    await click('#submitBtn'); await wait(500);
    await highlight('#submitErr', 2200);
    await page.evaluate(() => { nurseDraft().items = []; saveDraft(); });
  });
  await scene('rules', 'emergency', async () => {
    await relogin('Ali', '3333');
    await h.nav('rules');
    await page.waitForSelector('#rl_emergencyMaxItems');
    await highlight('#rlBox .grid-2', 1800);
    await highlight('#rlBox .rule-bar', 1200);
  });

  // مزايا أخرى
  await scene('custody', 'more', async () => {
    await h.api('issueAssets', [{ clinic: 'Dental Clinic 1', item: 'Curing Light', qty: 1, doctor: 'Dr. Khalid' }], ['Ali', '3333']);
    await h.nav('assets');
    await click('[data-seg-name="asTab"][data-v="clinics"]');
    await page.waitForSelector('#asClinics .as-docs').catch(() => {});
    await highlight('#asClinics section:has-text("Dental Clinic 1") .as-docs', 1600);
    await highlight('#asClinics section:has-text("Dental Clinic 1") .as-doc', 1200);
  });
  await scene('settings', 'more', async () => {
    await relogin('Admin', '9999');
    await h.nav('settings');
    await page.waitForSelector('#stBox .st-key');
    await highlight('#stBox section:nth-child(1)', 1300);
    await h.scroll(700); await wait(600);
    await h.scroll(1500); await wait(600);
  });
  await scene('outro', '', async () => {
    await h.scroll(0); await wait(400);
  });
}

if (require.main === module) makeTutorial({ id: 'motion', voiceLang: 'ar', langs: ['ar'], noMoney: true, scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
