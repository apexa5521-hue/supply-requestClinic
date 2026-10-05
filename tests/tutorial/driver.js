/* فيديو السواق — صوت إنجليزي + ترجمة عربية */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { en: 'This video is for the driver. You don\'t need an account. You only use your phone camera and one link.',
    ar: 'هذا الفيديو للسواق. لا تحتاج حسابًا، فقط كاميرا جوالك ورابط واحد.' },
  tasks: { en: 'Procurement sends you the Driver tasks link once. Add it to your phone home screen. It shows every box you need to move, from where, and to where.',
    ar: 'التموين يرسل لك رابط «مهام السواق» مرة واحدة، أضفه لشاشة جوالك. يعرض كل بوكس تحتاج نقله، من أين وإلى أين.' },
  scan: { en: 'Every box has a QR sticker. When you deliver a box, scan its sticker with the camera. This page opens.',
    ar: 'كل بوكس عليه ستيكر QR. عند تسليم البوكس امسح الستيكر بالكاميرا، فتفتح هذه الصفحة.' },
  place: { en: 'Choose where you delivered the box: the branch or procurement. The destination is chosen for you, and the place where the box already is can\'t be chosen.',
    ar: 'اختر وين سلّمت البوكس: الفرع أو التموين. الوجهة مختارة لك تلقائيًا، والمكان الموجود فيه البوكس لا يمكن اختياره.' },
  photo: { en: 'Take a photo of the box. The photo is required. Write your name once; the phone remembers it.',
    ar: 'صوّر البوكس، والصورة إلزامية. واكتب اسمك مرة واحدة ويتذكره الجوال.' },
  deliver: { en: 'Tap Deliver. The nurse gets a message that the box arrived, and procurement sees it on the boxes page.',
    ar: 'اضغط «تسليم»، فتصل للممرضة رسالة أن البوكس وصل، ويراه التموين في صفحة البوكسات.' },
  done: { en: 'That\'s it: scan, choose the place, photo, deliver. Thank you!',
    ar: 'هذا كل شيء: امسح، اختر المكان، صوّر، ثم سلّم. شكرًا لك!' }
};
const steps = { tasks: { en: 'Driver tasks', ar: 'مهام السواق' }, deliver: { en: 'Deliver a box', ar: 'تسليم البوكس' } };

async function flow(h) {
  const { page, scene, click, type, point, highlight, wait } = h;
  // بوكس جاهز للنقل: إرسال طلب د. سعد المعتمد
  await h.api('dispatchItems', ['REQ-260927-016', ['MICRO BRUSH FINE', 'Etchant Blue Tip']], ['Ali', '3333']);
  const info = await h.api('getBoxes', [], ['Ali', '3333']);
  const box = info.boxes.find(b => b.owner === 'Dr. Saad');
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
  });
  await scene('place', 'deliver', async () => {
    await highlight('#drvPlaces', 1600);
    const pick = '#drvPlaces [data-act="drvPlace"]:not([disabled]) >> nth=1';
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

if (require.main === module) makeTutorial({ id: 'driver', langs: ['ar'], scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
