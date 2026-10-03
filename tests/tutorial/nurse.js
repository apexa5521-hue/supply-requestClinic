/* فيديو الممرضة — صوت إنجليزي + ترجمة عربي / أردو / إندونيسي */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: {
    en: 'Welcome to Supply Flow. This video shows nurses everything they need, step by step, in a simple way.',
    ar: 'مرحبًا بك في نظام مسار. هذا الفيديو يشرح للممرضة كل ما تحتاجه، خطوة بخطوة وبطريقة سهلة.',
    ur: 'سپلائی فلو میں خوش آمدید۔ یہ ویڈیو نرسوں کو ہر ضروری کام آسان طریقے سے، قدم بہ قدم دکھاتی ہے۔',
    id: 'Selamat datang di Supply Flow. Video ini menunjukkan semua yang perawat butuhkan, langkah demi langkah, dengan cara yang mudah.'
  },
  login: {
    en: 'Open the system link. Write your name and your password, then tap Sign in.',
    ar: 'افتحي رابط النظام، واكتبي اسمك ورقمك السري، ثم اضغطي «تسجيل الدخول».',
    ur: 'سسٹم کا لنک کھولیں۔ اپنا نام اور پاس ورڈ لکھیں، پھر سائن اِن دبائیں۔',
    id: 'Buka tautan sistem. Tulis nama dan kata sandi Anda, lalu ketuk Sign in.'
  },
  kinds: {
    en: 'On the New request page, there are three choices at the top. One: Doctor request, for supplies used by one doctor. The doctor must approve it. Two: Clinic consumables, for supplies used by the whole clinic, and for sterilization. No doctor approval is needed. Three: Send to lab, for patient work that goes to the dental lab.',
    ar: 'في صفحة «طلب جديد» توجد ثلاثة خيارات بالأعلى. الأول: طلب طبيب، لمستهلكات طبيب واحد، ويجب أن يعتمده الطبيب. الثاني: مستهلكات العيادة، لمستهلكات العيادة كاملة وللتعقيم، ولا يحتاج اعتماد طبيب. الثالث: إرسال للمعمل، لأعمال المريض التي تذهب لمعمل الأسنان.',
    ur: 'نئی درخواست والے صفحے پر اوپر تین انتخاب ہیں۔ پہلا: ڈاکٹر کی درخواست، ایک ڈاکٹر کے سامان کے لیے، جسے ڈاکٹر منظور کرتا ہے۔ دوسرا: کلینک کا سامان، پورے کلینک اور اسٹرلائزیشن کے لیے، ڈاکٹر کی منظوری ضروری نہیں۔ تیسرا: لیب کو بھیجیں، مریض کا کام جو ڈینٹل لیب جاتا ہے۔',
    id: 'Di halaman New request ada tiga pilihan di atas. Satu: Doctor request, untuk perlengkapan satu dokter, dan dokter harus menyetujuinya. Dua: Clinic consumables, untuk perlengkapan seluruh klinik dan sterilisasi, tanpa persetujuan dokter. Tiga: Send to lab, untuk pekerjaan pasien yang dikirim ke lab gigi.'
  },
  doctor: {
    en: 'Let\'s start with a Doctor request. Choose the doctor. The clinic and the branch are filled in for you.',
    ar: 'نبدأ بطلب الطبيب. اختاري الطبيب، والعيادة والفرع يتم تعبئتهما تلقائيًا.',
    ur: 'ڈاکٹر کی درخواست سے شروع کرتے ہیں۔ ڈاکٹر منتخب کریں، کلینک اور برانچ خود بخود بھر جاتے ہیں۔',
    id: 'Mari mulai dengan Doctor request. Pilih dokternya. Klinik dan cabang terisi otomatis.'
  },
  type: {
    en: 'Choose the type. Monthly is your normal monthly order. Emergency is only for urgent needs.',
    ar: 'اختاري نوع الطلب: «شهري» للطلب الشهري المعتاد، و«طارئ» للحاجات العاجلة فقط.',
    ur: 'قسم منتخب کریں۔ ماہانہ معمول کا آرڈر ہے، ایمرجنسی صرف فوری ضرورت کے لیے۔',
    id: 'Pilih jenisnya. Monthly untuk pesanan bulanan biasa. Emergency hanya untuk kebutuhan mendesak.'
  },
  items: {
    en: 'Now add the items. Tap the search box, write part of the name, and tap the item.',
    ar: 'أضيفي الأصناف: اضغطي على مربع البحث، واكتبي جزءًا من الاسم، ثم اضغطي على الصنف.',
    ur: 'اب اشیاء شامل کریں۔ سرچ باکس دبائیں، نام کا کچھ حصہ لکھیں، اور آئٹم پر ٹیپ کریں۔',
    id: 'Sekarang tambahkan barang. Ketuk kotak pencarian, tulis sebagian nama, lalu ketuk barangnya.'
  },
  qty: {
    en: 'Use plus and minus to set how many you need.',
    ar: 'استخدمي زر الزائد والناقص لتحديد الكمية المطلوبة.',
    ur: 'مقدار طے کرنے کے لیے جمع اور منفی کے بٹن استعمال کریں۔',
    id: 'Gunakan tombol plus dan minus untuk mengatur jumlahnya.'
  },
  submit: {
    en: 'Check the summary on the side, then tap Submit request. Your draft is saved by itself, so you never lose your work.',
    ar: 'راجعي الملخص في الجانب، ثم اضغطي «إرسال الطلب». المسودة تُحفظ تلقائيًا فلا يضيع عملك.',
    ur: 'سائیڈ پر خلاصہ چیک کریں، پھر سبمٹ دبائیں۔ ڈرافٹ خود محفوظ ہوتا ہے، آپ کا کام ضائع نہیں ہوتا۔',
    id: 'Periksa ringkasan di samping, lalu ketuk Submit request. Draf tersimpan otomatis, jadi pekerjaan Anda tidak hilang.'
  },
  clinic: {
    en: 'Next, Clinic consumables. Use it for things the whole clinic uses, like gloves or cotton. Choose Clinic consumables, then choose your clinic, and add the items.',
    ar: 'التالي: مستهلكات العيادة، للأشياء التي تستخدمها العيادة كاملة مثل القفازات والقطن. اختاري «مستهلكات العيادة»، ثم عيادتك، وأضيفي الأصناف.',
    ur: 'اگلا: کلینک کا سامان، جیسے دستانے یا روئی جو پورا کلینک استعمال کرتا ہے۔ کلینک کا سامان منتخب کریں، پھر اپنا کلینک، اور اشیاء شامل کریں۔',
    id: 'Berikutnya, Clinic consumables, untuk barang yang dipakai seluruh klinik seperti sarung tangan atau kapas. Pilih Clinic consumables, lalu klinik Anda, dan tambahkan barangnya.'
  },
  clinicsend: {
    en: 'Tap Submit request. This request goes straight to procurement. It does not wait for a doctor.',
    ar: 'اضغطي «إرسال الطلب». هذا الطلب يذهب للتموين مباشرة ولا ينتظر الطبيب.',
    ur: 'سبمٹ دبائیں۔ یہ درخواست سیدھی پروکیورمنٹ کو جاتی ہے، ڈاکٹر کا انتظار نہیں کرتی۔',
    id: 'Ketuk Submit request. Permintaan ini langsung ke bagian pengadaan, tidak menunggu dokter.'
  },
  steril: {
    en: 'Sterilization supplies are ordered the same way, as Clinic consumables. Open the clinic list. The Sterilization section is at the top. Choose the sterilization of your branch: Buraydah or Unayzah.',
    ar: 'مستلزمات التعقيم تُطلب بنفس الطريقة كمستهلكات عيادة. افتحي قائمة العيادات، قسم التعقيم في الأعلى، واختاري تعقيم فرعك: بريدة أو عنيزة.',
    ur: 'اسٹرلائزیشن کا سامان بھی اسی طرح کلینک کے سامان میں منگوایا جاتا ہے۔ کلینک کی فہرست کھولیں، اسٹرلائزیشن سب سے اوپر ہے۔ اپنی برانچ منتخب کریں: بریدہ یا عنیزہ۔',
    id: 'Perlengkapan sterilisasi dipesan dengan cara yang sama, sebagai Clinic consumables. Buka daftar klinik, bagian Sterilization ada di atas. Pilih sterilisasi cabang Anda: Buraydah atau Unayzah.'
  },
  sterilsend: {
    en: 'A note shows exactly where the order will be delivered. Add the items and tap Submit request.',
    ar: 'تظهر ملاحظة توضح مكان تسليم الطلب بالضبط. أضيفي الأصناف واضغطي «إرسال الطلب».',
    ur: 'ایک نوٹ بتاتا ہے کہ آرڈر کہاں پہنچے گا۔ اشیاء شامل کریں اور سبمٹ دبائیں۔',
    id: 'Sebuah catatan menunjukkan ke mana pesanan dikirim. Tambahkan barang dan ketuk Submit request.'
  },
  mine: {
    en: 'Now open My requests. Here you can see the difference. The doctor request shows Doctor review: it waits for the doctor. The clinic and sterilization requests show New: they went straight to procurement.',
    ar: 'افتحي «طلباتي» لتري الفرق: طلب الطبيب حالته «مراجعة الطبيب» أي ينتظر الطبيب، وطلبا العيادة والتعقيم حالتهما «جديد» أي ذهبا للتموين مباشرة.',
    ur: 'اب میری درخواستیں کھولیں۔ ڈاکٹر کی درخواست ڈاکٹر ریویو دکھاتی ہے، یعنی ڈاکٹر کا انتظار۔ کلینک اور اسٹرلائزیشن کی درخواستیں نیو دکھاتی ہیں، یعنی سیدھی پروکیورمنٹ کو گئیں۔',
    id: 'Buka My requests untuk melihat bedanya. Doctor request berstatus Doctor review: menunggu dokter. Permintaan klinik dan sterilisasi berstatus New: langsung ke pengadaan.'
  },
  detail: {
    en: 'Tap Details to see everything about a request: each step and its time, the items, and the comments.',
    ar: 'اضغطي «التفاصيل» لتري كل شيء عن الطلب: كل مرحلة ووقتها، والأصناف، والتعليقات.',
    ur: 'تفصیلات دبائیں: ہر مرحلہ اور اس کا وقت، اشیاء، اور تبصرے۔',
    id: 'Ketuk Details untuk melihat semuanya: setiap tahap dan waktunya, barang, dan komentar.'
  },
  notify: {
    en: 'The doctor gets an email automatically. Ask the doctor to open their page and approve. You can also write a comment here as a reminder.',
    ar: 'يصل الطبيب بريد إلكتروني تلقائيًا. اطلبي منه فتح صفحته والاعتماد، ويمكنك كتابة تعليق هنا للتذكير.',
    ur: 'ڈاکٹر کو خود بخود ای میل جاتی ہے۔ ڈاکٹر سے کہیں کہ اپنا صفحہ کھول کر منظوری دیں۔ یاد دہانی کے لیے یہاں تبصرہ بھی لکھ سکتی ہیں۔',
    id: 'Dokter otomatis menerima email. Minta dokter membuka halamannya dan menyetujui. Anda juga bisa menulis komentar sebagai pengingat.'
  },
  doctorpage: {
    en: 'This is the doctor\'s page. The doctor sees the requests that are waiting for approval.',
    ar: 'هذه صفحة الطبيب، ويرى فيها الطلبات التي تنتظر اعتماده.',
    ur: 'یہ ڈاکٹر کا صفحہ ہے۔ ڈاکٹر منظوری کی منتظر درخواستیں دیکھتا ہے۔',
    id: 'Ini halaman dokter. Dokter melihat permintaan yang menunggu persetujuan.'
  },
  approve: {
    en: 'The doctor opens the request. The doctor can change a quantity or add a note, and then taps Approve.',
    ar: 'يفتح الطبيب الطلب، ويمكنه تعديل الكمية أو إضافة ملاحظة، ثم يضغط «اعتماد».',
    ur: 'ڈاکٹر درخواست کھولتا ہے، مقدار بدل سکتا ہے یا نوٹ لکھ سکتا ہے، پھر منظور کرتا ہے۔',
    id: 'Dokter membuka permintaan, bisa mengubah jumlah atau menambah catatan, lalu mengetuk Approve.'
  },
  sent: {
    en: 'After approval, procurement prepares the order and sends it to your branch. You get an alert, and the request shows Sent.',
    ar: 'بعد الاعتماد يجهّز التموين الطلب ويرسله لفرعك، ويصلك تنبيه وتصبح حالته «تم الإرسال».',
    ur: 'منظوری کے بعد پروکیورمنٹ آرڈر تیار کر کے آپ کی برانچ بھیجتا ہے۔ آپ کو الرٹ ملتا ہے اور اسٹیٹس سینٹ ہو جاتا ہے۔',
    id: 'Setelah disetujui, pengadaan menyiapkan dan mengirim pesanan ke cabang Anda. Anda mendapat notifikasi dan statusnya Sent.'
  },
  receive: {
    en: 'When the box arrives, open My requests and tap Receive and sign. Check each quantity. If something is missing, change the number.',
    ar: 'عند وصول البوكس افتحي «طلباتي» واضغطي «استلام وتوقيع». راجعي كل كمية، وإذا نقص شيء عدّلي الرقم.',
    ur: 'جب باکس پہنچے تو میری درخواستیں کھولیں اور وصول کریں دبائیں۔ ہر مقدار چیک کریں، کمی ہو تو نمبر بدل دیں۔',
    id: 'Saat kotak tiba, buka My requests dan ketuk Receive and sign. Periksa setiap jumlah. Jika ada yang kurang, ubah angkanya.'
  },
  sign: {
    en: 'Sign in the box with your finger, then tap Confirm receipt. A receipt with your signature is saved.',
    ar: 'وقّعي في المربع بإصبعك، ثم اضغطي «تأكيد الاستلام»، ويُحفظ إيصال بتوقيعك.',
    ur: 'انگلی سے خانے میں دستخط کریں، پھر وصولی کی تصدیق دبائیں۔ آپ کے دستخط والی رسید محفوظ ہو جاتی ہے۔',
    id: 'Tanda tangani kotak dengan jari Anda, lalu ketuk Confirm receipt. Tanda terima dengan tanda tangan Anda tersimpan.'
  },
  labform: {
    en: 'Now, sending work to the lab. Choose Send to lab, choose the doctor, and write the patient file number. The scan date is today. Change it only if the scan was on another day.',
    ar: 'الآن الإرسال للمعمل: اختاري «إرسال للمعمل»، ثم الطبيب، واكتبي رقم ملف المريض. تاريخ السكان هو اليوم، غيّريه فقط إذا كان السكان في يوم آخر.',
    ur: 'اب لیب کو کام بھیجنا: لیب کو بھیجیں منتخب کریں، ڈاکٹر چنیں، اور مریض کا فائل نمبر لکھیں۔ اسکین کی تاریخ آج کی ہے، صرف ضرورت ہو تو بدلیں۔',
    id: 'Sekarang mengirim pekerjaan ke lab. Pilih Send to lab, pilih dokter, dan tulis nomor berkas pasien. Tanggal scan adalah hari ini, ubah hanya jika scan di hari lain.'
  },
  labwork: {
    en: 'Add the work: choose the lab, the type of work, and write notes, like the tooth number and the shade. You can add a photo for each work. The date the lab must finish is calculated for you.',
    ar: 'أضيفي العمل: اختاري المعمل ونوع العمل، واكتبي ملاحظات مثل رقم السن واللون، ويمكنك إضافة صورة لكل عمل. موعد انتهاء المعمل يُحسب تلقائيًا.',
    ur: 'کام شامل کریں: لیب اور کام کی قسم چنیں، اور نوٹ لکھیں جیسے دانت کا نمبر اور رنگ۔ ہر کام کی تصویر لگا سکتی ہیں۔ لیب کی آخری تاریخ خود حساب ہوتی ہے۔',
    id: 'Tambahkan pekerjaan: pilih lab, jenis pekerjaan, dan tulis catatan seperti nomor gigi dan warna. Anda bisa menambah foto untuk setiap pekerjaan. Tanggal selesai lab dihitung otomatis.'
  },
  labsend: {
    en: 'Tap Send to lab. Now you can follow it on the Lab page.',
    ar: 'اضغطي «إرسال للمعمل»، ويمكنك متابعته من صفحة «المعمل».',
    ur: 'لیب کو بھیجیں دبائیں۔ اب آپ لیب کے صفحے پر اسے دیکھ سکتی ہیں۔',
    id: 'Ketuk Send to lab. Sekarang Anda bisa memantaunya di halaman Lab.'
  },
  labback: {
    en: 'When the lab finishes, it sends the work back to the clinic. You will see the button Confirm receipt. Tap it when the work reaches your clinic.',
    ar: 'عندما ينتهي المعمل يرسل العمل للعيادة، ويظهر لك زر «تأكيد الاستلام». اضغطيه عند وصول العمل لعيادتك.',
    ur: 'جب لیب کام مکمل کرتی ہے تو کلینک واپس بھیجتی ہے۔ وصولی کی تصدیق کا بٹن نظر آئے گا، کام پہنچنے پر اسے دبائیں۔',
    id: 'Saat lab selesai, pekerjaan dikirim kembali ke klinik. Anda akan melihat tombol Confirm receipt. Ketuk saat pekerjaan tiba di klinik.'
  },
  done: {
    en: 'That\'s all. Doctor requests need the doctor\'s approval. Clinic and sterilization requests go straight to procurement. Lab work goes to the lab. If there is any problem, use the Report button on the card. Thank you!',
    ar: 'هذا كل شيء: طلب الطبيب يحتاج اعتماده، وطلبات العيادة والتعقيم تذهب للتموين مباشرة، وأعمال المرضى تذهب للمعمل. لأي مشكلة استخدمي زر «بلاغ» على الطلب. شكرًا لك!',
    ur: 'بس اتنا ہی۔ ڈاکٹر کی درخواست کو منظوری چاہیے۔ کلینک اور اسٹرلائزیشن کی درخواستیں سیدھی پروکیورمنٹ کو جاتی ہیں۔ لیب کا کام لیب کو جاتا ہے۔ کسی مسئلے پر رپورٹ کا بٹن استعمال کریں۔ شکریہ!',
    id: 'Itu saja. Doctor request perlu persetujuan dokter. Permintaan klinik dan sterilisasi langsung ke pengadaan. Pekerjaan pasien dikirim ke lab. Jika ada masalah, gunakan tombol Report di kartunya. Terima kasih!'
  }
};
const steps = {
  login: { en: 'Sign in', ar: 'تسجيل الدخول', ur: 'سائن اِن', id: 'Masuk' },
  kinds: { en: 'Three kinds of requests', ar: 'أنواع الطلبات', ur: 'درخواست کی اقسام', id: 'Tiga jenis permintaan' },
  doc: { en: '1 · Doctor request', ar: '١ · طلب طبيب', ur: '١ · ڈاکٹر کی درخواست', id: '1 · Doctor request' },
  clinic: { en: '2 · Clinic consumables', ar: '٢ · مستهلكات العيادة', ur: '٢ · کلینک کا سامان', id: '2 · Clinic consumables' },
  steril: { en: '3 · Sterilization', ar: '٣ · التعقيم', ur: '٣ · اسٹرلائزیشن', id: '3 · Sterilisasi' },
  follow: { en: 'Follow your requests', ar: 'متابعة الطلبات', ur: 'درخواستوں کی نگرانی', id: 'Pantau permintaan' },
  approval: { en: 'Doctor approval', ar: 'اعتماد الطبيب', ur: 'ڈاکٹر کی منظوری', id: 'Persetujuan dokter' },
  receive: { en: 'Receive the shipment', ar: 'استلام الشحنة', ur: 'سامان کی وصولی', id: 'Terima kiriman' },
  lab: { en: '4 · Send to lab', ar: '٤ · إرسال للمعمل', ur: '٤ · لیب کو بھیجیں', id: '4 · Kirim ke lab' }
};

async function flow(h) {
  const { page, scene, click, type, point, highlight, wait } = h;
  const addItem = async q => { await type('#itemSearch', q); await page.waitForSelector('#comboList .combo-opt'); await wait(400); await click('#comboList .combo-opt'); };
  const submit = async () => { await click('#submitBtn'); const tt = await (await page.waitForSelector('.toast:last-child')).textContent(); await wait(600); return (/REQ-[\d-]+/.exec(tt) || [''])[0]; };
  await scene('intro', '', async () => { await wait(500); });
  await scene('login', 'login', async () => { await h.login('Sara', '1111'); });
  await scene('kinds', 'kinds', async () => {
    await page.waitForSelector('[data-seg-name="reqKind"]');
    await wait(1500);
    for (const k of ['doctor', 'clinic', 'lab']) { await point('[data-seg-name="reqKind"][data-v="' + k + '"]'); await highlight('[data-seg-name="reqKind"][data-v="' + k + '"]', 3600); }
  });
  await scene('doctor', 'doc', async () => {
    await click('[data-seg-name="reqKind"][data-v="doctor"]');
    await page.waitForSelector('#fDoctor option[value="Dr. Khalid"]', { state: 'attached' });
    await h.select('#fDoctor', 'Dr. Khalid');
    await highlight('#fBranch', 1500);
  });
  await scene('type', 'doc', async () => { await click('[data-seg-name="reqType"][data-v="شهري"]'); await wait(400); await point('[data-seg-name="reqType"][data-v="طارئ"]'); });
  await scene('items', 'doc', async () => { await addItem('prophy'); await addItem('floss'); await page.keyboard.press('Escape'); });
  await scene('qty', 'doc', async () => {
    await click('.item-line:nth-child(1) [data-d="1"]'); await click('.item-line:nth-child(1) [data-d="1"]'); await click('.item-line:nth-child(2) [data-d="1"]');
  });
  let reqId = '', clinicId = '', sterilId = '';
  await scene('submit', 'doc', async () => { await highlight('#sumBox', 1400); reqId = await submit(); });
  await scene('clinic', 'clinic', async () => {
    await click('[data-seg-name="reqKind"][data-v="clinic"]');
    await page.waitForSelector('#fClinic');
    await h.select('#fClinic', el => [...el.options].find(o => /Dental Clinic 1/.test(o.textContent)).value);
    await addItem('gloves'); await addItem('cotton'); await page.keyboard.press('Escape');
    await click('.item-line:nth-child(1) [data-d="1"]');
  });
  await scene('clinicsend', 'clinic', async () => { clinicId = await submit(); });
  await scene('steril', 'steril', async () => {
    await page.waitForSelector('#fClinic');
    await highlight('#fClinic', 1600);
    await h.select('#fClinic', el => [...el.options].find(o => /Sterilization/.test(o.textContent) && /Buraydah/.test(o.textContent)).value);
  });
  await scene('sterilsend', 'steril', async () => {
    await highlight('#sterilNote', 1800);
    await addItem('pouches'); await page.keyboard.press('Escape');
    await click('.item-line:nth-child(1) [data-d="1"]');
    sterilId = await submit();
  });
  await scene('mine', 'follow', async () => {
    await h.nav('mine');
    await page.waitForSelector('#mineList .req');
    await highlight(`.req:has-text("${reqId}") .badge`, 2600);
    await highlight(`.req:has-text("${clinicId}") .badge`, 2000);
    await highlight(`.req:has-text("${sterilId}") .badge`, 2000);
  });
  await scene('detail', 'follow', async () => {
    await click(`.req:has-text("${reqId}") [data-act="detail"]`);
    await page.waitForSelector('.modal .stepper');
    await wait(1200);
    await h.scroll(260, '.modal-body');
  });
  await scene('notify', 'approval', async () => {
    await h.scroll(5000, '.modal-body');
    await type('#dComment', 'Dr. Khalid, please approve this request today.');
    await click('#dSend'); await wait(900);
    await page.keyboard.press('Escape');
  });
  await scene('doctorpage', 'approval', async () => {
    await h.logout(); await h.login('Dr. Khalid', '4444');
    await page.waitForSelector('#docList .req');
    await highlight(`#docList .req:has-text("${reqId}")`, 1500);
  });
  await scene('approve', 'approval', async () => {
    await click(`#docList [data-id="${reqId}"]`);
    await page.waitForSelector('#rvItems table'); await wait(500);
    await point('.rvQty >> nth=0');
    await page.fill('.rvQty >> nth=0', '4'); await page.dispatchEvent('.rvQty >> nth=0', 'input');
    await wait(600);
    await click('#rvApprove'); await wait(900);
  });
  await h.api('bulkUpdateStatus', [[reqId], 'قيد التجهيز'], ['Ali', '3333']);
  await h.api('dispatchItems', [reqId, ['PROPHY PASTE', 'DENTAL FLOSS']], ['Ali', '3333']);
  await scene('sent', 'receive', async () => {
    await h.logout(); await h.login('Sara', '1111');
    if (await page.isVisible('.alert.info')) await highlight('.alert.info', 1200);
    await h.nav('mine');
    await page.waitForSelector(`.req:has-text("${reqId}") [data-act="receive"]`);
    await highlight(`.req:has-text("${reqId}") .badge`, 1200);
  });
  await scene('receive', 'receive', async () => {
    await click(`.req:has-text("${reqId}") [data-act="receive"]`);
    await page.waitForSelector('.rq'); await wait(600);
    await point('.rq >> nth=0'); await highlight('.rq', 900);
  });
  await scene('sign', 'receive', async () => { await h.sign(); await wait(400); await click('#rOk'); await wait(900); });
  await scene('labform', 'lab', async () => {
    await h.nav('new');
    await click('[data-seg-name="reqKind"][data-v="lab"]');
    await page.waitForSelector('#lDoctor option[value="Dr. Khalid"]', { state: 'attached' });
    await h.select('#lDoctor', 'Dr. Khalid');
    await type('#lFile', '10245');
    await highlight('#lScan', 1400);
  });
  await scene('labwork', 'lab', async () => {
    const L = '#lLines .lab-line:nth-child(1) ';
    await h.select(L + '[data-k="lab"]', 'Internal Lab');
    await h.select(L + '[data-k="workType"]', 'Crown');
    await type(L + '[data-k="details"]', 'Tooth 16, shade A2');
    await point(L + '.lab-line-photo-btn');
    await page.setInputFiles(L + '[data-line-photo]', { name: 'tooth.png', mimeType: 'image/png', buffer: h.png });
    await page.waitForSelector(L + '.lab-photo img').catch(() => {});
    await wait(500);
    await highlight('#lDue', 1800);
  });
  let caseId = '';
  await scene('labsend', 'lab', async () => {
    await click('#lSubmit');
    await page.waitForSelector('#labList .lab-card');
    caseId = (await page.textContent('#labList .lab-card .req-id')).trim();
    await highlight('#labList .lab-card', 1600);
  });
  for (const a of ['start', 'ready', 'send']) await h.api('updateLabItems', [[caseId + '-1'], a, {}], ['Lab Tech', '8888']);
  await scene('labback', 'lab', async () => {
    await h.nav('new'); await h.nav('labmine');
    const sel = `#labList .lab-card:has-text("${caseId}") [data-act="labConfirm"]`;
    await page.waitForSelector(sel);
    await highlight(sel, 1400);
    await click(sel); await wait(900);
  });
  await scene('done', '', async () => { await h.nav('mine'); await point('#mineList .req [data-act="complaint"]'); });
}

if (require.main === module) makeTutorial({ id: 'nurse', langs: (process.env.LANGS || 'ar,ur,id').split(','), scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
