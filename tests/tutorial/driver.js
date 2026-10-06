/* فيديو السواق — صوت إنجليزي + ترجمة عربي / بنغالي / هندي */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: {
    en: 'This video is for the driver. You don\'t need an account. You only use your phone camera and one link.',
    ar: 'هذا الفيديو للسواق. لا تحتاج حسابًا، فقط كاميرا جوالك ورابط واحد.',
    bn: 'এই ভিডিওটি ড্রাইভারের জন্য। আপনার কোনো অ্যাকাউন্ট লাগবে না। শুধু ফোনের ক্যামেরা আর একটি লিংক।',
    hi: 'यह वीडियो ड्राइवर के लिए है। आपको कोई अकाउंट नहीं चाहिए। सिर्फ़ फ़ोन का कैमरा और एक लिंक।'
  },
  tasks: {
    en: 'Procurement sends you the Driver tasks link once. Add it to your phone home screen. It shows every box you need to move, from where, and to where.',
    ar: 'التموين يرسل لك رابط «مهام السواق» مرة واحدة، أضفه لشاشة جوالك. يعرض كل بوكس تحتاج نقله، من أين وإلى أين.',
    bn: 'সাপ্লাই বিভাগ আপনাকে একবার "ড্রাইভারের কাজ" লিংক পাঠাবে। এটি ফোনের হোম স্ক্রিনে রাখুন। এখানে প্রতিটি বক্স দেখাবে: কোথা থেকে, কোথায় নিতে হবে।',
    hi: 'सप्लाई विभाग आपको "ड्राइवर के काम" का लिंक एक बार भेजेगा। इसे फ़ोन की होम स्क्रीन पर रखें। इसमें हर बॉक्स दिखता है: कहाँ से, कहाँ ले जाना है।'
  },
  scan: {
    en: 'Every box has a QR sticker with the doctor\'s name and branch. When you deliver a box, scan its sticker with the camera. This page opens.',
    ar: 'كل بوكس عليه ستيكر QR فيه اسم الطبيب والفرع. عند تسليم البوكس امسح الستيكر بالكاميرا، فتفتح هذه الصفحة.',
    bn: 'প্রতিটি বক্সে ডাক্তারের নাম ও শাখাসহ একটি QR স্টিকার আছে। বক্স পৌঁছে দেওয়ার সময় ক্যামেরা দিয়ে স্টিকারটি স্ক্যান করুন। এই পেজটি খুলবে।',
    hi: 'हर बॉक्स पर डॉक्टर के नाम और शाखा वाला QR स्टिकर है। बॉक्स पहुँचाते समय कैमरे से स्टिकर स्कैन करें। यह पेज खुल जाएगा।'
  },
  lang: {
    en: 'Choose your language at the top: Arabic, English, Bengali or Hindi.',
    ar: 'اختر لغتك من الأعلى: عربي، أو إنجليزي، أو بنغالي، أو هندي.',
    bn: 'ওপরে আপনার ভাষা বেছে নিন: আরবি, ইংরেজি, বাংলা বা হিন্দি।',
    hi: 'ऊपर अपनी भाषा चुनें: अरबी, अंग्रेज़ी, बांग्ला या हिन्दी।'
  },
  place: {
    en: 'Choose where you delivered the box: the branch or procurement. The destination is chosen for you, and the place where the box already is can\'t be chosen.',
    ar: 'اختر وين سلّمت البوكس: الفرع أو التموين. الوجهة مختارة لك تلقائيًا، والمكان الموجود فيه البوكس لا يمكن اختياره.',
    bn: 'বক্সটি কোথায় দিয়েছেন তা বেছে নিন: শাখা না সাপ্লাই বিভাগ। গন্তব্য আগে থেকেই বাছাই করা থাকে, আর বক্সটি যেখানে আছে সেটি বাছা যায় না।',
    hi: 'चुनें कि बॉक्स कहाँ पहुँचाया: शाखा या सप्लाई विभाग। मंज़िल पहले से चुनी होती है, और जहाँ बॉक्स अभी है वह नहीं चुना जा सकता।'
  },
  photo: {
    en: 'Take a photo of the box. The photo is required. Write your name once; the phone remembers it.',
    ar: 'صوّر البوكس، والصورة إلزامية. واكتب اسمك مرة واحدة ويتذكره الجوال.',
    bn: 'বক্সের ছবি তুলুন। ছবি বাধ্যতামূলক। একবার আপনার নাম লিখুন, ফোন সেটি মনে রাখবে।',
    hi: 'बॉक्स की फ़ोटो लें। फ़ोटो ज़रूरी है। एक बार अपना नाम लिखें, फ़ोन उसे याद रखेगा।'
  },
  deliver: {
    en: 'Tap Delivered. The nurse gets a message that the box arrived, and procurement sees it on the boxes page.',
    ar: 'اضغط «تم التوصيل»، فتصل للممرضة رسالة أن البوكس وصل، ويراه التموين في صفحة البوكسات.',
    bn: '"ডেলিভারি সম্পন্ন" চাপুন। নার্স বার্তা পাবেন যে বক্স পৌঁছেছে, আর সাপ্লাই বিভাগ বক্সের পেজে তা দেখবে।',
    hi: '"डिलीवरी पूरी हुई" दबाएँ। नर्स को संदेश मिलेगा कि बॉक्स पहुँच गया, और सप्लाई विभाग इसे बॉक्स पेज पर देखेगा।'
  },
  done: {
    en: 'That\'s it: scan, choose the place, photo, your name, then Delivered. Thank you!',
    ar: 'هذا كل شيء: امسح، اختر المكان، صوّر، اكتب اسمك، ثم «تم التوصيل». شكرًا لك!',
    bn: 'ব্যস: স্ক্যান, জায়গা বাছাই, ছবি, আপনার নাম, তারপর "ডেলিভারি সম্পন্ন"। ধন্যবাদ!',
    hi: 'बस इतना ही: स्कैन, जगह चुनें, फ़ोटो, अपना नाम, फिर "डिलीवरी पूरी हुई"। धन्यवाद!'
  }
};
const steps = {
  tasks: { en: 'Driver tasks', ar: 'مهام السواق', bn: 'ড্রাইভারের কাজ', hi: 'ड्राइवर के काम' },
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
  await scene('intro', '', async () => { await wait(500); });
  await scene('tasks', 'tasks', async () => {
    await page.evaluate(tk => showDriverTasks(tk), info.driverToken);
    await page.waitForSelector('[data-act="drvOpen"]'); await wait(800);
    await highlight('[data-act="drvOpen"] >> nth=0', 2200);
  });
  await scene('scan', 'deliver', async () => {
    await page.evaluate(([id, kk]) => showDriverBox(id, kk, true), [box.id, k]);
    await page.waitForSelector('#drvPlaces'); await wait(1200);
    await highlight('.drv-head', 1500);
  });
  await scene('lang', 'deliver', async () => {
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
  await scene('deliver', 'deliver', async () => { await click('#drvGo'); await page.waitForSelector('.drv-done').catch(() => {}); await wait(1500); });
  await scene('done', '', async () => { await wait(600); });
}

if (require.main === module) makeTutorial({ id: 'driver', noMoney: true, langs: (process.env.LANGS || 'ar,bn,hi').split(','), scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
