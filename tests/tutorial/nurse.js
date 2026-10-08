/* فيديو الممرضة — صوت إنجليزي + ترجمة عربي / أردو / إندونيسي */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: {
    en: 'Welcome to Masar. This video shows nurses everything they need, step by step.',
    ar: 'مرحبًا بك في نظام مسار. هذا الفيديو يشرح للممرضة كل ما تحتاجه، خطوة بخطوة.',
    ur: 'مسار میں خوش آمدید۔ یہ ویڈیو نرسوں کو ہر ضروری کام قدم بہ قدم دکھاتی ہے۔',
    id: 'Selamat datang di Masar. Video ini menunjukkan semua yang perawat butuhkan, langkah demi langkah.'
  },
  login: {
    en: 'Open the system link, write your name and your password, then tap Sign in.',
    ar: 'افتحي رابط النظام، واكتبي اسمك ورقمك السري، ثم اضغطي «تسجيل الدخول».',
    ur: 'سسٹم کا لنک کھولیں، اپنا نام اور پاس ورڈ لکھیں، پھر سائن اِن دبائیں۔',
    id: 'Buka tautan sistem, tulis nama dan kata sandi Anda, lalu ketuk Sign in.'
  },
  kinds: {
    en: 'At the top there are three choices. Doctor request needs the doctor\'s approval. Clinic consumables needs no doctor approval and goes straight to procurement. Send to lab is for patient work.',
    ar: 'بالأعلى ثلاثة خيارات: «طلب طبيب» يحتاج اعتماد الطبيب، و«مستهلكات عيادة» لا يحتاج اعتماد طبيب ويذهب للتموين مباشرة، و«إرسال للمعمل» لأعمال المرضى.',
    ur: 'اوپر تین انتخاب ہیں۔ ڈاکٹر کی درخواست کو ڈاکٹر کی منظوری چاہیے۔ کلینک کا سامان ڈاکٹر کی منظوری کے بغیر سیدھا پروکیورمنٹ کو جاتا ہے۔ لیب کو بھیجیں مریض کے کام کے لیے ہے۔',
    id: 'Di atas ada tiga pilihan. Doctor request perlu persetujuan dokter. Clinic consumables tanpa persetujuan dokter dan langsung ke pengadaan. Send to lab untuk pekerjaan pasien.'
  },
  doctor: {
    en: 'In a Doctor request, choose the clinic first, then the doctor, then the branch.',
    ar: 'في طلب الطبيب اختاري العيادة أولًا ثم الطبيب، ثم اختاري الفرع.',
    ur: 'ڈاکٹر کی درخواست میں پہلے کلینک، پھر ڈاکٹر، پھر برانچ منتخب کریں۔',
    id: 'Pada Doctor request, pilih klinik dulu, lalu dokter, lalu cabangnya.'
  },
  type: {
    en: 'Choose the type. Monthly is the normal order, from the 15th to the 20th of the month. Emergency is only for urgent needs.',
    ar: 'اختاري النوع: «شهري» للطلب المعتاد من 15 إلى 20 في الشهر، و«طارئ» للحاجة العاجلة فقط.',
    ur: 'قسم منتخب کریں۔ ماہانہ معمول کا آرڈر ہے، مہینے کی 15 سے 20 تاریخ تک۔ ایمرجنسی صرف فوری ضرورت کے لیے ہے۔',
    id: 'Pilih jenisnya. Monthly untuk pesanan biasa, tanggal 15 sampai 20 setiap bulan. Emergency hanya untuk kebutuhan mendesak.'
  },
  items: {
    en: 'Write the item name and tap it, then set the quantity with plus and minus. Add every consumable you need, so they all come in one order.',
    ar: 'اكتبي اسم الصنف واضغطي عليه، ثم حدّدي الكمية بالزائد والناقص. أضيفي كل المستهلكات التي تحتاجينها، حتى تُرسَل كلها في طلبية واحدة.',
    ur: 'آئٹم کا نام لکھیں اور اس پر ٹیپ کریں، پھر جمع اور منفی سے مقدار طے کریں۔ ہر ضروری چیز شامل کریں تاکہ سب ایک ہی آرڈر میں آئے۔',
    id: 'Tulis nama barang dan ketuk, lalu atur jumlah dengan plus dan minus. Tambahkan semua barang yang Anda perlukan, agar semuanya datang dalam satu pesanan.'
  },
  submit: {
    en: 'Check the summary, then tap Submit request. Your draft is saved by itself, so you never lose your work.',
    ar: 'راجعي الملخص، ثم اضغطي «إرسال الطلب». المسودة تُحفظ تلقائيًا فلا يضيع عملك.',
    ur: 'خلاصہ چیک کریں، پھر سبمٹ دبائیں۔ ڈرافٹ خود محفوظ ہوتا ہے، آپ کا کام ضائع نہیں ہوتا۔',
    id: 'Periksa ringkasan, lalu ketuk Submit request. Draf tersimpan otomatis, jadi pekerjaan Anda tidak hilang.'
  },
  consumables: {
    en: 'Clinic consumables is for Sterilization, the Triage room and the derma device rooms, and now for every dental clinic too. Choose the place, add the items, and tap Submit.',
    ar: '«مستهلكات عيادة» للتعقيم وغرفة الفرز وغرف أجهزة الجلدية، والآن لكل عيادات الأسنان أيضًا. اختاري المكان، وأضيفي الأصناف، واضغطي «إرسال».',
    ur: 'کلینک کا سامان اسٹرلائزیشن، ٹرائیج روم اور ڈرما ڈیوائس رومز کے لیے ہے، اور اب ہر ڈینٹل کلینک کے لیے بھی۔ جگہ منتخب کریں، اشیاء شامل کریں، اور سبمٹ دبائیں۔',
    id: 'Clinic consumables untuk Sterilisasi, ruang Triase, dan ruang perangkat derma, dan sekarang untuk semua klinik gigi juga. Pilih tempatnya, tambahkan barang, lalu ketuk Submit.'
  },
  mine: {
    en: 'In My requests you can see the difference. The doctor request shows Doctor review, so it waits for the doctor. Clinic consumables shows New, so it reached procurement.',
    ar: 'في «طلباتي» ترين الفرق: طلب الطبيب «مراجعة الطبيب» أي ينتظره، ومستهلكات العيادة «جديد» أي وصل التموين.',
    ur: 'میری درخواستوں میں فرق دیکھیں۔ ڈاکٹر کی درخواست ڈاکٹر ریویو دکھاتی ہے، یعنی ڈاکٹر کا انتظار۔ کلینک کا سامان نیو دکھاتا ہے، یعنی پروکیورمنٹ تک پہنچ گیا۔',
    id: 'Di My requests terlihat bedanya. Doctor request berstatus Doctor review, menunggu dokter. Clinic consumables berstatus New, sudah sampai di pengadaan.'
  },
  edit: {
    en: 'Made a mistake in a quantity? Tap Edit items, change the number, or tap the bin to remove the item, then Save.',
    ar: 'غلطتِ في كمية؟ اضغطي «تعديل الأصناف»، وغيّري الرقم أو اضغطي سلة المهملات لحذف الصنف، ثم «حفظ».',
    ur: 'مقدار میں غلطی ہو گئی؟ ایڈٹ آئٹمز دبائیں، نمبر بدلیں یا آئٹم ہٹانے کے لیے کوڑے دان دبائیں، پھر سیو کریں۔',
    id: 'Salah jumlah? Ketuk Edit items, ubah angkanya, atau ketuk tempat sampah untuk menghapus barang, lalu Save.'
  },
  withdraw: {
    en: 'Raised a request by mistake? Tap Cancel request, and write the reason if you like. You can edit or cancel while the request is in Doctor review or New. After that, ask procurement.',
    ar: 'رفعتِ الطلب بالغلط؟ اضغطي «إلغاء الطلب»، واكتبي السبب إن أردتِ. التعديل والإلغاء متاحان ما دام الطلب عند مراجعة الطبيب أو «جديد»، وبعدها اطلبيه من التموين.',
    ur: 'غلطی سے درخواست بھیج دی؟ کینسل ریکویسٹ دبائیں، اور چاہیں تو وجہ لکھیں۔ ترمیم اور منسوخی تب تک ممکن ہے جب درخواست ڈاکٹر ریویو یا نیو میں ہو۔ اس کے بعد پروکیورمنٹ سے کہیں۔',
    id: 'Salah mengirim permintaan? Ketuk Cancel request, dan tulis alasannya jika mau. Ubah dan batal bisa selama permintaan di Doctor review atau New. Setelah itu, minta ke pengadaan.'
  },
  detail: {
    en: 'Details shows every step and its time, the items and the comments. You can also write a comment as a reminder.',
    ar: '«التفاصيل» تعرض كل مرحلة ووقتها، والأصناف، والتعليقات، ويمكنك كتابة تعليق للتذكير.',
    ur: 'تفصیلات میں ہر مرحلہ اور اس کا وقت، اشیاء اور تبصرے نظر آتے ہیں۔ یاد دہانی کے لیے تبصرہ بھی لکھ سکتی ہیں۔',
    id: 'Details menampilkan setiap tahap dan waktunya, barang, dan komentar. Anda juga bisa menulis komentar sebagai pengingat.'
  },
  sent: {
    en: 'When the driver delivers the box to your branch, you get an alert, and the card turns to Arrived at branch.',
    ar: 'عندما يسلّم السواق البوكس لفرعك يصلك تنبيه، وتتلوّن البطاقة بحالة «وصل الفرع».',
    ur: 'جب ڈرائیور باکس آپ کی برانچ پہنچاتا ہے تو آپ کو اطلاع ملتی ہے، اور کارڈ پر وصل الفرع یعنی برانچ پہنچ گیا لکھا آتا ہے۔',
    id: 'Saat sopir mengantar kotak ke cabang Anda, Anda mendapat pemberitahuan, dan kartunya berubah menjadi Arrived at branch.'
  },
  receive: {
    en: 'Tap Receive and sign. Check every quantity and fix anything missing, then sign and tap Confirm receipt.',
    ar: 'اضغطي «استلام وتوقيع»، وراجعي كل كمية وعدّلي ما نقص، ثم وقّعي واضغطي «تأكيد الاستلام».',
    ur: 'وصولی اور دستخط دبائیں۔ ہر مقدار چیک کریں اور کمی ہو تو درست کریں، پھر دستخط کر کے وصولی کی تصدیق دبائیں۔',
    id: 'Ketuk Receive and sign. Periksa setiap jumlah dan perbaiki yang kurang, lalu tanda tangan dan ketuk Confirm receipt.'
  },
  cancelled: {
    en: 'If procurement cancels a request, the card shows Cancelled with the reason, and you get an email. Raise a new request if you still need it.',
    ar: 'إذا ألغى التموين طلبًا تظهر البطاقة «ملغي» مع السبب ويصلك إيميل. ارفعي طلبًا جديدًا إن احتجتِ.',
    ur: 'اگر پروکیورمنٹ درخواست منسوخ کرے تو کارڈ پر کینسلڈ اور وجہ نظر آتی ہے، اور ای میل آتی ہے۔ ضرورت ہو تو نئی درخواست بھیجیں۔',
    id: 'Jika pengadaan membatalkan permintaan, kartunya menunjukkan Cancelled beserta alasannya, dan Anda mendapat email. Ajukan permintaan baru jika masih perlu.'
  },
  lab: {
    en: 'For the lab, choose the doctor and write the patient\'s file number. For each work, choose the lab and the type, write your notes, and add a photo. The due date is set by itself.',
    ar: 'للمعمل: اختاري الطبيب واكتبي رقم ملف المريض. لكل عمل اختاري المعمل والنوع واكتبي ملاحظاتك وأضيفي صورة. الموعد يُحسب تلقائيًا.',
    ur: 'لیب کے لیے ڈاکٹر منتخب کریں اور مریض کا فائل نمبر لکھیں۔ ہر کام کے لیے لیب اور قسم چنیں، اپنے نوٹس لکھیں اور تصویر شامل کریں۔ مقررہ تاریخ خود طے ہوتی ہے۔',
    id: 'Untuk lab, pilih dokter dan tulis nomor berkas pasien. Untuk setiap pekerjaan, pilih lab dan jenisnya, tulis catatan, dan tambahkan foto. Tanggal jatuh tempo terisi otomatis.'
  },
  itero: {
    en: 'For an iTero scan, write the scan date, the iTero case number and the file number, then choose the lab.',
    ar: 'لسكان iTero اكتبي تاريخ السكان ورقم حالة الآيتيرو ورقم الملف، ثم اختاري المعمل.',
    ur: 'iTero اسکین کے لیے اسکین کی تاریخ، iTero کیس نمبر اور فائل نمبر لکھیں، پھر لیب منتخب کریں۔',
    id: 'Untuk scan iTero, tulis tanggal scan, nomor kasus iTero, dan nomor berkas, lalu pilih labnya.'
  },
  labback: {
    en: 'When the work comes back to your clinic, tap Confirm receipt.',
    ar: 'عندما يرجع العمل لعيادتك اضغطي «تأكيد الاستلام».',
    ur: 'جب کام آپ کے کلینک واپس آئے تو وصولی کی تصدیق دبائیں۔',
    id: 'Saat pekerjaan kembali ke klinik Anda, ketuk Confirm receipt.'
  },
  done: {
    en: 'That\'s all. For any problem, use the Report button on the request. Thank you!',
    ar: 'هذا كل شيء. لأي مشكلة استخدمي زر «بلاغ» على الطلب. شكرًا لك!',
    ur: 'بس اتنا ہی۔ کسی بھی مسئلے کے لیے درخواست پر رپورٹ کا بٹن استعمال کریں۔ شکریہ!',
    id: 'Itu saja. Untuk masalah apa pun, gunakan tombol Report pada permintaan. Terima kasih!'
  }
};
const steps = {
  login: { en: 'Sign in', ar: 'تسجيل الدخول', ur: 'سائن اِن', id: 'Masuk' },
  kinds: { en: 'Three kinds of requests', ar: 'أنواع الطلبات', ur: 'درخواست کی اقسام', id: 'Tiga jenis permintaan' },
  doc: { en: '1 · Doctor request', ar: '١ · طلب طبيب', ur: '١ · ڈاکٹر کی درخواست', id: '1 · Doctor request' },
  cons: { en: '2 · Clinic consumables', ar: '٢ · مستهلكات عيادة', ur: '٢ · کلینک کا سامان', id: '2 · Clinic consumables' },
  follow: { en: 'Follow your requests', ar: 'متابعة الطلبات', ur: 'درخواستوں کی نگرانی', id: 'Pantau permintaan' },
  fix: { en: 'Edit or cancel', ar: 'تعديل أو إلغاء', ur: 'ترمیم یا منسوخی', id: 'Ubah atau batalkan' },
  receive: { en: 'Receive the shipment', ar: 'استلام الشحنة', ur: 'سامان کی وصولی', id: 'Terima kiriman' },
  lab: { en: '3 · Send to lab', ar: '٣ · إرسال للمعمل', ur: '٣ · لیب کو بھیجیں', id: '3 · Kirim ke lab' }
};

async function flow(h) {
  const { page, scene, click, type, point, highlight, wait } = h;
  const addItem = async q => { await type('#itemSearch', q); await page.waitForSelector('#comboList .combo-opt'); await wait(400); await click('#comboList .combo-opt'); };
  const submit = async () => { await click('#submitBtn'); const tt = await (await page.waitForSelector('.toast:last-child')).textContent(); await wait(600); return (/REQ-[\d-]+/.exec(tt) || [''])[0]; };
  await scene('intro', '', async () => { await wait(500); });
  await scene('login', 'login', async () => { await h.login('Sara', '1111'); });
  await scene('kinds', 'kinds', async () => {
    await page.waitForSelector('[data-seg-name="reqKind"]');
    await wait(1200);
    for (const k of ['doctor', 'clinic', 'lab']) { await point('[data-seg-name="reqKind"][data-v="' + k + '"]'); await highlight('[data-seg-name="reqKind"][data-v="' + k + '"]', 2600); }
  });
  await scene('doctor', 'doc', async () => {
    await click('[data-seg-name="reqKind"][data-v="doctor"]');
    await page.waitForSelector('#fDocClinic');
    await h.select('#fDocClinic', el => [...el.options].find(o => /Dental Clinic 1/.test(o.textContent)).value);
    await page.waitForSelector('#fDoctor option[value="Dr. Khalid"]', { state: 'attached' });
    await wait(400);
    await h.select('#fDoctor', 'Dr. Khalid');
    await highlight('#fBranch', 1300);
  });
  await scene('type', 'doc', async () => { await click('[data-seg-name="reqType"][data-v="شهري"]'); await wait(400); await point('[data-seg-name="reqType"][data-v="طارئ"]'); });
  await scene('items', 'doc', async () => {
    await addItem('prophy'); await addItem('floss'); await page.keyboard.press('Escape');
    await click('.item-line:nth-child(1) [data-d="1"]'); await click('.item-line:nth-child(1) [data-d="1"]'); await click('.item-line:nth-child(2) [data-d="1"]');
  });
  let reqId = '', consId = '', extraId = '';
  await scene('submit', 'doc', async () => { await highlight('#sumBox', 1400); reqId = await submit(); });
  // طلب تعقيم سابق (يلغيه التموين لاحقاً في المشهد «ملغي»)
  extraId = (await h.api('createRequest', [{ clinic: 'Sterilization', branch: 'Buraydah', type: 'شهري', items: [{ name: 'Sterilization pouches', qty: 4 }] }], ['Sara', '1111'])).id;
  await scene('consumables', 'cons', async () => {
    await click('[data-seg-name="reqKind"][data-v="clinic"]');
    await page.waitForSelector('#fClinic');
    await highlight('#fClinic', 1500);
    await h.select('#fClinic', el => [...el.options].find(o => /Dental Clinic 1/.test(o.textContent)).value);
    await addItem('cotton'); await page.keyboard.press('Escape');
    await click('.item-line:nth-child(1) [data-d="1"]');
    consId = await submit();
  });
  await scene('mine', 'follow', async () => {
    await h.nav('mine');
    await page.waitForSelector('#mineList .req');
    await highlight(`.req:has-text("${reqId}") .badge`, 2400);
    await highlight(`.req:has-text("${consId}") .badge`, 2000);
  });
  await scene('edit', 'fix', async () => {
    await click(`.req:has-text("${reqId}") [data-act="editItems"]`);
    await page.waitForSelector('.modal .rvQty');
    await wait(500);
    await point('.modal .rvQty >> nth=0');
    await page.fill('.modal .rvQty >> nth=0', '5'); await page.dispatchEvent('.modal .rvQty >> nth=0', 'input');
    await wait(500);
    await point('.modal tr:nth-child(2) [data-rm]'); await wait(400);
    await click('#eiOk'); await wait(900);
  });
  await scene('withdraw', 'fix', async () => {
    await page.waitForSelector(`.req:has-text("${consId}") [data-act="withdraw"]`);
    await click(`.req:has-text("${consId}") [data-act="withdraw"]`);
    await page.waitForSelector('#wdReason');
    await type('#wdReason', 'Chose the wrong clinic');
    await click('#wdOk'); await wait(1000);
  });
  await scene('detail', 'follow', async () => {
    await click(`.req:has-text("${reqId}") [data-act="detail"]`);
    await page.waitForSelector('.modal .stepper');
    await wait(1000);
    await h.scroll(5000, '.modal-body');
    await type('#dComment', 'Dr. Khalid, please approve this request today.');
    await click('#dSend'); await wait(800);
    await page.keyboard.press('Escape');
  });
  // الطبيب يعتمد، التموين يجهّز ويرسل، والسواق يسلّم البوكس للفرع ← «وصل الفرع»
  await h.api('doctorReview', [reqId, 'اعتمد', '', []], ['Dr. Khalid', '4444']);
  await h.api('bulkUpdateStatus', [[reqId], 'قيد التجهيز'], ['Ali', '3333']);
  await h.api('dispatchItems', [reqId, ['PROPHY PASTE', 'DENTAL FLOSS']], ['Ali', '3333']);
  await page.evaluate(([rid, png]) => {
    const d = __gas.dump('Boxes'), H = d[0];
    const row = d.slice(1).find(r => String(r[H.indexOf('Loads')]).indexOf(rid + '#') !== -1);
    __api(null, 'boxDeliver', [{ box: row[H.indexOf('BoxID')], k: row[H.indexOf('Token')], to: 'Buraydah', driver: 'Hamad', photo: 'data:image/png;base64,' + png, clientKey: 'tut-' + rid }]);
  }, [reqId, h.png.toString('base64')]);
  await scene('sent', 'receive', async () => {
    await h.nav('new'); await h.nav('mine');
    await page.waitForSelector(`.req:has-text("${reqId}") [data-act="receive"]`);
    await highlight(`.req:has-text("${reqId}") .tag.arrived`, 1400);
    await click('#mineChips [data-g="arrived"]'); await wait(1100);
    await click('#mineChips [data-g="all"]'); await page.waitForSelector(`.req:has-text("${reqId}") [data-act="receive"]`);
  });
  await scene('receive', 'receive', async () => {
    await click(`.req:has-text("${reqId}") [data-act="receive"]`);
    await page.waitForSelector('.rq'); await wait(500);
    await highlight('.rq', 900);
    await h.sign(); await wait(300); await click('#rOk'); await wait(900);
  });
  await h.api('cancelRequests', [[extraId], 'Item not available at the supplier this month'], ['Ali', '3333']);
  await scene('cancelled', 'follow', async () => {
    await h.nav('new'); await h.nav('mine');
    await page.waitForSelector(`.req:has-text("${extraId}") .cancel-box`);
    await page.locator(`.req:has-text("${extraId}")`).scrollIntoViewIfNeeded(); await wait(400);
    await highlight(`.req:has-text("${extraId}") .badge`, 1100);
    await highlight(`.req:has-text("${extraId}") .cancel-box`, 2000);
    await h.scroll(0);
  });
  let caseId = '';
  await scene('lab', 'lab', async () => {
    await h.nav('new');
    await click('[data-seg-name="reqKind"][data-v="lab"]');
    await page.waitForSelector('#lDoctor option[value="Dr. Khalid"]', { state: 'attached' });
    await h.select('#lDoctor', 'Dr. Khalid');
    await type('#lFile', '10245');
    const L = '#lLines .lab-line:nth-child(1) ';
    await h.select(L + '[data-k="lab"]', 'Internal Lab');
    await h.select(L + '[data-k="workType"]', 'Crown');
    await type(L + '[data-k="details"]', 'Tooth 16, shade A2');
    await point(L + '.lab-line-photo-btn');
    await page.setInputFiles(L + '[data-line-photo]', { name: 'tooth.png', mimeType: 'image/png', buffer: h.png });
    await page.waitForSelector(L + '.lab-photo img').catch(() => {});
    await highlight('#lDue', 1200);
    await click('#lSubmit');
    await page.waitForSelector('#labList .lab-card');
    caseId = (await page.textContent('#labList .lab-card .req-id')).trim();
  });
  for (const a of ['start', 'ready', 'send']) await h.api('updateLabItems', [[caseId + '-1'], a, {}], ['Lab Tech', '8888']);
  await scene('itero', 'lab', async () => {
    await h.nav('new');
    await click('[data-seg-name="reqKind"][data-v="lab"]');
    await click('[data-seg-name="labMode"][data-v="itero"]');
    await page.waitForSelector('#lItero');
    await page.waitForSelector('#lDoctor option[value="Dr. Khalid"]', { state: 'attached' });
    await h.select('#lDoctor', 'Dr. Khalid');
    await type('#lFile', '10377');
    await type('#lItero', '88213457');
    await page.waitForSelector('#lIteroLab option[value="Elite Dental Lab"]', { state: 'attached' });
    await h.select('#lIteroLab', 'Elite Dental Lab');
    await click('#lSubmit'); await wait(1000);
  });
  await scene('labback', 'lab', async () => {
    await h.nav('new'); await h.nav('labmine');
    const sel = `#labList .lab-card:has-text("${caseId}") [data-act="labConfirm"]`;
    await page.waitForSelector(sel);
    await highlight(sel, 1200);
    await click(sel); await wait(800);
  });
  await scene('done', '', async () => { await h.nav('mine'); await point('#mineList .req [data-act="complaint"]'); });
}

if (require.main === module) makeTutorial({ id: 'nurse', noMoney: true, langs: (process.env.LANGS || 'ar,ur,id').split(','), scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
