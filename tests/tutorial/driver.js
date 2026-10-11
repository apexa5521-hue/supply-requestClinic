/* فيديو السواق — صوت إنجليزي + ترجمة عربي / بنغالي / هندي */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { en: "This video is for the driver. You don't need an account, only your phone camera and one link.", ar: "هذا الفيديو للسواق. لا تحتاج حسابًا، فقط كاميرا جوالك ورابط واحد.", bn: "এই ভিডিওটি ড্রাইভারের জন্য। কোনো অ্যাকাউন্ট লাগবে না, শুধু ফোনের ক্যামেরা আর একটি লিংক।" },
  tasks: { en: "Procurement sends you the link once. Add it to your phone home screen. It shows every box you need to move, from where, and to where.", ar: "التموين يرسل لك الرابط مرة واحدة، أضفه لشاشة جوالك. يعرض كل بوكس تحتاج نقله، من أين وإلى أين.", bn: "সাপ্লাই বিভাগ আপনাকে একবার লিংকটি পাঠাবে। এটি ফোনের হোম স্ক্রিনে রাখুন। এতে প্রতিটি বক্স দেখা যায় যা সরাতে হবে, কোথা থেকে কোথায়।" },
  scan: { en: "When you deliver a box, scan its QR sticker with the camera, and choose your language: Arabic, English, Bengali or Hindi.", ar: "عند تسليم البوكس امسح الستيكر بالكاميرا، واختر لغتك: عربي، إنجليزي، بنغالي، أو هندي.", bn: "বক্স পৌঁছে দেওয়ার সময় ক্যামেরা দিয়ে QR স্টিকার স্ক্যান করুন, আর আপনার ভাষা বেছে নিন: আরবি, ইংরেজি, বাংলা বা হিন্দি।" },
  place: { en: "Choose where you delivered: the branch or procurement. The destination is chosen for you.", ar: "اختر وين سلّمت: الفرع أو التموين. الوجهة مختارة لك تلقائيًا.", bn: "কোথায় পৌঁছে দিয়েছেন বেছে নিন: শাখা না সাপ্লাই বিভাগ। গন্তব্য আগে থেকেই বেছে দেওয়া থাকে।" },
  photo: { en: "Take a photo of the box; it is required. Write your name once, and the phone remembers it.", ar: "صوّر البوكس (إلزامي)، واكتب اسمك مرة واحدة ويتذكره الجوال.", bn: "বক্সের ছবি তুলুন, এটি বাধ্যতামূলক। একবার আপনার নাম লিখুন, ফোন তা মনে রাখবে।" },
  deliver: { en: "Tap Delivered, and the nurse gets a message that the box has arrived. Scan, choose, take a photo, then Delivered. Thank you!", ar: "اضغط «تم التوصيل»، فتصل للممرضة رسالة أن البوكس وصل. امسح، اختر، صوّر، ثم «تم التوصيل». شكرًا لك.", bn: "\"ডেলিভারি সম্পন্ন\" চাপুন, নার্সের কাছে বার্তা যাবে যে বক্স পৌঁছেছে। স্ক্যান করুন, বেছে নিন, ছবি তুলুন, তারপর \"ডেলিভারি সম্পন্ন\"। ধন্যবাদ!" }
};
const steps = {
  tasks: { en: 'Shipments', ar: 'الشحنات', bn: 'চালানসমূহ', hi: 'शिपमेंट' },
  deliver: { en: 'Deliver a box', ar: 'تسليم البوكس', bn: 'বক্স ডেলিভারি', hi: 'बॉक्स डिलीवरी' }
};

async function flow(h) {
  const { page, scene, click, type, point, highlight, wait } = h;
  // بوكس جاهز للنقل: إرسال طلب د. سعد المعتمد (بوكسه في فرع الطلب)
  await h.api('dispatchItems', ['REQ-260927-016', ['MICRO BRUSH FINE', 'Etchant Blue Tip']], ['Ali', '3333']);
  const info = await h.api('getBoxes', [], ['Ali', '3333']);
  const box = info.boxes.find(b => b.owner === 'Dr. Saad' && b.loads.length);
  const k = await page.evaluate(id => { const d = __gas.dump('Boxes'); const i = d[0].indexOf('BoxID'), j = d[0].indexOf('Token'); return d.find(r => r[i] === id)[j]; }, box.id);
  await page.setViewportSize({ width: 1280, height: 720 });
  await scene('intro', '', async () => {
    await wait(500);
  });
  await scene('tasks', 'tasks', async () => {
    await page.evaluate(tk => showDriverTasks(tk), info.driverToken);
    await page.waitForSelector('[data-act="drvOpen"]'); await wait(800);
    await highlight('[data-act="drvOpen"] >> nth=0', 2200);
  });
  await scene('scan', 'deliver', async () => {
    await page.evaluate(([id, kk]) => showDriverBox(id, kk, true), [box.id, k]);
    await page.waitForSelector('#drvPlaces'); await wait(1200);
    await highlight('.drv-head', 1500);
    for (const l of ['bn', 'hi', 'en']) { await click('.drv-lang[data-l="' + l + '"]'); await page.waitForSelector('#drvPlaces'); await wait(900); }
  });
  await scene('place', 'deliver', async () => {
    await highlight('#drvPlaces', 1600);
    const pick = '#drvPlaces [data-act="drvPlace"][aria-pressed="true"]';
    await point(pick);
  });
  await scene('photo', 'deliver', async () => {
    await point('#drvPhoto');
    await page.setInputFiles('#drvFile', { name: 'box.png', mimeType: 'image/png', buffer: h.png });
    await wait(900);
    await type('#drvName', 'Hamad');
  });
  await scene('deliver', 'deliver', async () => {
    await click('#drvGo'); await page.waitForSelector('.drv-done').catch(() => {}); await wait(1500);
    await wait(600);
  });
}

if (require.main === module) makeTutorial({ id: 'driver', noMoney: true, langs: (process.env.LANGS || 'ar,bn').split(','), scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
