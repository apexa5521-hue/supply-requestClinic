/* فيديو قصير للممرضة: العهدة — صوت إنجليزي + ترجمة عربي / أردو / إندونيسي */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: {
    en: 'This short video shows nurses the Custody page: the company tools in your clinic, and how to report a faulty tool.',
    ar: 'هذا فيديو قصير للممرضة عن صفحة «العهدة»: أدوات الشركة في عيادتك، وكيف تبلّغين عن أداة فيها مشكلة.',
    ur: 'یہ مختصر ویڈیو نرسوں کو کسٹڈی کا صفحہ دکھاتی ہے: آپ کے کلینک میں کمپنی کے آلات، اور خراب آلے کی رپورٹ کیسے کریں۔',
    id: 'Video singkat ini menunjukkan halaman Custody kepada perawat: alat milik perusahaan di klinik Anda, dan cara melaporkan alat yang bermasalah.'
  },
  login: {
    en: 'Sign in with your name and password, then tap Custody in the menu.',
    ar: 'سجّلي الدخول باسمك ورقمك السري، ثم اضغطي «العهدة» من القائمة.',
    ur: 'اپنے نام اور پاس ورڈ سے سائن اِن کریں، پھر مینو میں کسٹڈی دبائیں۔',
    id: 'Masuk dengan nama dan kata sandi Anda, lalu ketuk Custody di menu.'
  },
  clinic: {
    en: 'Scroll down to your clinic. Each tool shows the standard, how many are in the clinic, and any shortage.',
    ar: 'انزلي لعيادتك. كل أداة يظهر لها المعيار، وكم يوجد منها في العيادة، والنقص إن وُجد.',
    ur: 'نیچے اپنے کلینک تک جائیں۔ ہر آلے کے ساتھ معیار، کلینک میں موجود تعداد، اور کمی نظر آتی ہے۔',
    id: 'Gulir ke bawah ke klinik Anda. Setiap alat menunjukkan standar, jumlah yang ada di klinik, dan kekurangannya.'
  },
  serials: {
    en: 'Every handpiece has its own serial number, the same number as the sticker on the tool.',
    ar: 'كل هاندبيس له رقم تسلسلي خاص، وهو نفس الرقم المكتوب على ستيكر الأداة.',
    ur: 'ہر ہینڈ پیس کا اپنا سیریل نمبر ہے، وہی نمبر جو آلے کے اسٹیکر پر لکھا ہے۔',
    id: 'Setiap handpiece punya nomor seri sendiri, sama dengan nomor di stiker alat.'
  },
  report: {
    en: 'If a tool has a problem, tap Report next to its serial number.',
    ar: 'إذا كان في الأداة مشكلة، اضغطي «بلاغ» بجانب رقمها التسلسلي.',
    ur: 'اگر کسی آلے میں مسئلہ ہو تو اس کے سیریل نمبر کے ساتھ رپورٹ دبائیں۔',
    id: 'Jika alat bermasalah, ketuk Report di samping nomor serinya.'
  },
  problem: {
    en: 'Choose the problem: broken, low performance, lost, or other. Write a short description.',
    ar: 'اختاري المشكلة: خربانة، أو كفاءتها متدنية، أو مفقودة، أو أخرى، واكتبي وصفًا قصيرًا.',
    ur: 'مسئلہ منتخب کریں: ٹوٹا ہوا، کم کارکردگی، گم شدہ، یا دیگر۔ مختصر تفصیل لکھیں۔',
    id: 'Pilih masalahnya: rusak, kinerja rendah, hilang, atau lainnya. Tulis deskripsi singkat.'
  },
  photo: {
    en: 'Take a photo of the tool. For a broken tool, the photo is required. Then tap Send.',
    ar: 'صوّري الأداة. الصورة إلزامية إذا كانت الأداة خربانة. ثم اضغطي «إرسال».',
    ur: 'آلے کی تصویر لیں۔ ٹوٹے ہوئے آلے کے لیے تصویر ضروری ہے۔ پھر بھیجیں دبائیں۔',
    id: 'Ambil foto alat. Untuk alat yang rusak, foto wajib. Lalu ketuk Send.'
  },
  sent: {
    en: 'The ticket goes to procurement with an email. The tool leaves your clinic count until it comes back.',
    ar: 'يصل البلاغ للتموين مع إيميل، وتخرج الأداة من عدد عيادتك حتى ترجع.',
    ur: 'رپورٹ ای میل کے ساتھ پروکیورمنٹ کو جاتی ہے۔ آلہ واپس آنے تک آپ کے کلینک کی گنتی سے نکل جاتا ہے۔',
    id: 'Laporan dikirim ke pengadaan dengan email. Alat keluar dari hitungan klinik Anda sampai kembali.'
  },
  big: {
    en: 'You can also use the big red button at the top. Choose the clinic, the tool and the unit. If the tool is not registered, write its serial number.',
    ar: 'ويمكنك أيضًا استخدام الزر الأحمر الكبير بالأعلى: اختاري العيادة والأداة والقطعة، وإذا لم تكن الأداة مسجلة اكتبي رقمها التسلسلي.',
    ur: 'آپ اوپر والا بڑا سرخ بٹن بھی استعمال کر سکتی ہیں۔ کلینک، آلہ اور یونٹ منتخب کریں۔ اگر آلہ رجسٹرڈ نہیں تو اس کا سیریل نمبر لکھیں۔',
    id: 'Anda juga bisa memakai tombol merah besar di atas. Pilih klinik, alat dan unitnya. Jika alat belum terdaftar, tulis nomor serinya.'
  },
  follow: {
    en: 'Follow your tickets here: received by procurement, under repair, back in the clinic, or damaged.',
    ar: 'تابعي بلاغاتك هنا: استلمها التموين، قيد الصيانة، رجعت للعيادة، أو تالفة.',
    ur: 'اپنی رپورٹس یہاں دیکھیں: پروکیورمنٹ نے وصول کیا، مرمت میں، کلینک واپس، یا ناکارہ۔',
    id: 'Pantau laporan Anda di sini: diterima pengadaan, sedang diperbaiki, kembali ke klinik, atau rusak.'
  },
  done: {
    en: 'That\'s it. Report any faulty tool right away, so your clinic always has its full set. Thank you!',
    ar: 'هذا كل شيء. بلّغي عن أي أداة فيها مشكلة فورًا، حتى تبقى عيادتك مكتملة دائمًا. شكرًا لك!',
    ur: 'بس اتنا ہی۔ کسی بھی خراب آلے کی فوراً رپورٹ کریں، تاکہ آپ کا کلینک ہمیشہ مکمل رہے۔ شکریہ!',
    id: 'Selesai. Laporkan alat yang bermasalah segera, agar klinik Anda selalu lengkap. Terima kasih!'
  }
};
const steps = {
  login: { en: 'Sign in', ar: 'تسجيل الدخول', ur: 'سائن اِن', id: 'Masuk' },
  tools: { en: 'Clinic tools', ar: 'أدوات العيادة', ur: 'کلینک کے آلات', id: 'Alat klinik' },
  report: { en: 'Report a tool', ar: 'بلاغ أداة', ur: 'آلے کی رپورٹ', id: 'Laporkan alat' },
  follow: { en: 'Follow up', ar: 'المتابعة', ur: 'فالو اَپ', id: 'Pantau' }
};

async function flow(h) {
  const { page, scene, click, type, point, highlight, wait } = h;
  const card = '#asClinics .card:has-text("Dental Clinic 1")';
  const unit = s => `#asClinics .as-unit:has-text("${s}")`;
  // صورة توضيحية للهاندبيس (بدل صورة 1×1)
  const photo = Buffer.from((await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 480; c.height = 320; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 320); g.addColorStop(0, '#e8eef5'); g.addColorStop(1, '#c9d6e3'); x.fillStyle = g; x.fillRect(0, 0, 480, 320);
    x.save(); x.translate(240, 165); x.rotate(-0.35);
    const b = x.createLinearGradient(0, -22, 0, 22); b.addColorStop(0, '#f4f6f8'); b.addColorStop(.5, '#9aa6b2'); b.addColorStop(1, '#5d6873');
    x.fillStyle = b; x.beginPath(); x.roundRect(-170, -22, 260, 44, 22); x.fill();
    x.fillStyle = '#7b8794'; x.beginPath(); x.roundRect(80, -14, 70, 28, 10); x.fill();
    x.fillStyle = '#4a5560'; x.fillRect(150, -4, 30, 8);
    x.fillStyle = '#2f7de1'; x.fillRect(-120, -22, 14, 44);
    x.restore();
    x.fillStyle = '#ffffff'; x.fillRect(150, 250, 180, 40); x.strokeStyle = '#333'; x.strokeRect(150, 250, 180, 40);
    x.fillStyle = '#111'; x.font = 'bold 22px monospace'; x.textAlign = 'center'; x.fillText('NSK-1002', 240, 278);
    return c.toDataURL('image/png').split(',')[1];
  })), 'base64');

  await scene('intro', '', async () => { await wait(500); });
  await scene('login', 'login', async () => {
    await h.login('Sara', '1111');
    await h.nav('assets');
    await page.waitForSelector('#asClinics .as-row');
  });
  await scene('clinic', 'tools', async () => {
    await page.locator(card).scrollIntoViewIfNeeded(); await wait(700);
    await highlight(card + ' .as-row >> nth=0', 2200);
  });
  await scene('serials', 'tools', async () => {
    await highlight(card + ' .as-units >> nth=0', 2200);
  });
  await scene('report', 'report', async () => {
    await click(unit('NSK-1002') + ' [data-act="asReport"]');
    await page.waitForSelector('.modal #arProb'); await wait(500);
  });
  await scene('problem', 'report', async () => {
    await point('.modal #arProb'); await page.selectOption('.modal #arProb', 'خربانة'); await wait(500);
    await type('.modal #arDesc', 'The handpiece makes a loud noise and stops.');
  });
  await scene('photo', 'report', async () => {
    await point('.modal #arPh label');
    await page.setInputFiles('.modal #arFile', { name: 'tool.png', mimeType: 'image/png', buffer: photo });
    await page.waitForSelector('.modal #arPh .lab-photo'); await wait(600);
    await click('.modal #arOk'); await wait(1400);
  });
  await scene('sent', 'report', async () => {
    await page.locator(unit('NSK-1002')).scrollIntoViewIfNeeded(); await wait(600);
    await highlight(unit('NSK-1002'), 1600);
    await highlight(card + ' .as-row >> nth=0', 1400);
  });
  await scene('big', 'report', async () => {
    await h.scroll(0); await wait(500);
    await click('#asReportBtn');
    await page.waitForSelector('.modal #anClinic'); await wait(400);
    for (const s of ['#anClinic', '#anItem', '#anUnit']) await highlight('.modal ' + s, 800);
    await page.keyboard.press('Escape'); await wait(400);
  });
  await scene('follow', 'follow', async () => {
    await page.waitForSelector('#asTickets .req');
    await highlight('#asTickets .req >> nth=0', 2000);
    await click('#asTickets .req [data-act="asTicket"] >> nth=0'); await wait(1800);
    await page.keyboard.press('Escape');
  });
  await scene('done', '', async () => { await wait(600); });
}

if (require.main === module) makeTutorial({ id: 'nurse-custody', langs: (process.env.LANGS || 'ar,ur,id').split(','), scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
