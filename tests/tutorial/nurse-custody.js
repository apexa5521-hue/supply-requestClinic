/* فيديو قصير للممرضة: العهدة — صوت إنجليزي + ترجمة عربي / أردو / إندونيسي */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { en: "A short video about the custody tools in your clinic, and how to report a tool that has a problem.", ar: "فيديو قصير عن أدوات العهدة في عيادتك، وكيف تبلّغين عن أداة فيها مشكلة.", ur: "آپ کے کلینک کے کسٹڈی ٹولز اور خراب ٹول کی رپورٹ کرنے کے بارے میں ایک مختصر ویڈیو۔", id: "Video singkat tentang alat inventaris di klinik Anda, dan cara melaporkan alat yang bermasalah." },
  clinic: { en: "For each tool you see the standard, how many are in the clinic, and any shortage. Each handpiece has a serial number that matches the sticker on the tool.", ar: "لكل أداة: المعيار، وكم يوجد منها، والنقص. وكل هاندبيس برقم تسلسلي مطابق لستيكر الأداة.", ur: "ہر ٹول کے لیے معیار، کلینک میں تعداد اور کمی نظر آتی ہے۔ ہر ہینڈ پیس کا سیریل نمبر ٹول کے اسٹیکر سے ملتا ہے۔", id: "Untuk setiap alat terlihat standar, jumlah di klinik, dan kekurangannya. Setiap handpiece punya nomor seri yang sama dengan stiker di alatnya." },
  report: { en: "Tap Report and choose the problem: broken, low performance, missing, or other.", ar: "اضغطي «بلاغ»، واختاري المشكلة: خربانة، أو كفاءتها متدنية، أو مفقودة، أو أخرى.", ur: "رپورٹ دبائیں اور مسئلہ منتخب کریں: خراب، کم کارکردگی، گم شدہ، یا کوئی اور۔", id: "Ketuk Report dan pilih masalahnya: rusak, kinerja rendah, hilang, atau lainnya." },
  photo: { en: "Take a photo of the tool, required when it is broken, and tap Send. The report reaches procurement, and the tool leaves your clinic count until it comes back.", ar: "صوّري الأداة (إلزامي للخربانة) واضغطي «إرسال». يصل البلاغ للتموين، وتخرج الأداة من عدد عيادتك حتى ترجع.", ur: "ٹول کی تصویر لیں، خراب ہونے پر لازمی ہے، اور بھیجیں دبائیں۔ رپورٹ پروکیورمنٹ کو جاتی ہے، اور ٹول واپس آنے تک کلینک کی گنتی سے نکل جاتا ہے۔", id: "Foto alatnya, wajib jika rusak, lalu ketuk Send. Laporan sampai ke pengadaan, dan alat keluar dari hitungan klinik sampai kembali." },
  big: { en: "Or use the red button at the top. If the tool is not registered, write its serial number.", ar: "أو استخدمي الزر الأحمر بالأعلى. إذا لم تكن الأداة مسجلة اكتبي رقمها التسلسلي.", ur: "یا اوپر سرخ بٹن استعمال کریں۔ اگر ٹول رجسٹرڈ نہیں تو اس کا سیریل نمبر لکھیں۔", id: "Atau gunakan tombol merah di atas. Jika alat belum terdaftar, tulis nomor serinya." },
  follow: { en: "Follow your reports: received by procurement, under repair, back in the clinic, or damaged. Thank you!", ar: "تابعي بلاغاتك: استلمها التموين، قيد الصيانة، رجعت للعيادة، أو تالفة. شكرًا لك!", ur: "اپنی رپورٹس دیکھیں: پروکیورمنٹ نے وصول کی، مرمت میں، کلینک واپس، یا ناکارہ۔ شکریہ!", id: "Pantau laporan Anda: diterima pengadaan, sedang diperbaiki, kembali ke klinik, atau rusak. Terima kasih!" }
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

  await scene('intro', 'login', async () => {
    await wait(500);
    await h.login('Sara', '1111');
    await h.nav('assets');
    await page.waitForSelector('#asClinics .as-row');
  });
  await scene('clinic', 'tools', async () => {
    await page.locator(card).scrollIntoViewIfNeeded(); await wait(700);
    await highlight(card + ' .as-row >> nth=0', 2200);
    await highlight(card + ' .as-units >> nth=0', 2200);
  });
  await scene('report', 'report', async () => {
    await click(unit('NSK-1002') + ' [data-act="asReport"]');
    await page.waitForSelector('.modal #arProb'); await wait(500);
    await point('.modal #arProb'); await page.selectOption('.modal #arProb', 'خربانة'); await wait(500);
    await type('.modal #arDesc', 'The handpiece makes a loud noise and stops.');
  });
  await scene('photo', 'report', async () => {
    await point('.modal #arPh label');
    await page.setInputFiles('.modal #arFile', { name: 'tool.png', mimeType: 'image/png', buffer: photo });
    await page.waitForSelector('.modal #arPh .lab-photo'); await wait(600);
    await click('.modal #arOk'); await wait(1400);
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
    await wait(600);
  });
}

if (require.main === module) makeTutorial({ id: 'nurse-custody', noMoney: true, langs: (process.env.LANGS || 'ar,ur,id').split(','), scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
