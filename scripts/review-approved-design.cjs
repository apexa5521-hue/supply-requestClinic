/* Captures the real UI with the repository's in-memory fixtures. No production requests. */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'review-output');
fs.mkdirSync(OUT,{recursive:true});
const source=fs.readFileSync(path.join(ROOT,'JavaScript.html'),'utf8');
new Function(source.match(/<script>([\s\S]*)<\/script>/)[1]);
const prefix=fs.readFileSync(path.join(ROOT,'tests/e2e.js'),'utf8').split('const errors = [];')[0];
let {initScript,playwright}=new Function('require','__dirname','process',prefix+';return {initScript,playwright};')(require,path.join(ROOT,'tests'),process);
const headers=['TicketID','Kind','Branch','Area','Clinic','Spot','Category','Priority','Stops','Description','Photos','Status','CreatedAt','CreatedBy','ApprovedAt','ApprovedBy','RejectNote','ReceivedAt','ReceivedBy','StartedAt','WaitNote','FixedAt','FixedBy','FixNote','FixPhoto','Vendor','Cost','CostType','ConfirmedAt','ConfirmedBy','ReopenCount','History','UpdatedAt','UpdatedBy','ClientKey','Item','Qty'];
const tickets=[
 {TicketID:'MNT-014',Kind:'صيانة',Branch:'جدة',Area:'عيادة',Clinic:'عيادة الأسنان 2',Spot:'عيادة ٣',Category:'أجهزة طبية',Priority:'عادي',Description:'كرسي الأسنان لا يستجيب عند تعديل الارتفاع',Status:'قيد التنفيذ',CreatedAt:new Date(Date.now()-3600000).toISOString(),CreatedBy:'مدير الفرع',History:'[]'},
 {TicketID:'MNT-015',Kind:'صيانة',Branch:'الرياض',Area:'التعقيم',Spot:'غرفة التعقيم',Category:'سباكة',Priority:'عادي',Description:'تسريب في المغسلة',Status:'جديد',CreatedAt:new Date(Date.now()-7200000).toISOString(),CreatedBy:'مدير الفرع',History:'[]'},
 {TicketID:'MNT-012',Kind:'صيانة',Branch:'جدة',Area:'التعقيم',Category:'أجهزة طبية',Priority:'عادي',Description:'صيانة جهاز التعقيم',Status:'مغلق',CreatedAt:new Date(Date.now()-86400000).toISOString(),CreatedBy:'مدير الفرع',History:'[]'}
];
initScript=initScript.replace('const g = globalThis;','gas.seed("BranchTickets",'+JSON.stringify(headers)+','+JSON.stringify(tickets.map(t=>headers.map(h=>t[h]||'')))+');const g = globalThis;');
const html=fs.readFileSync(path.join(ROOT,'Index.html'),'utf8').replace(/<\?!=\s*include_\('([\w-]+)'\);?\s*\?>/g,(_,f)=>fs.readFileSync(path.join(ROOT,f+'.html'),'utf8'));
const fontDir=path.join(ROOT,'node_modules/@fontsource/ibm-plex-sans-arabic');
const fontCss=[400,500,600,700].map(w=>fs.readFileSync(path.join(fontDir,w+'.css'),'utf8')).join('\n').replace(/url\(([^)]+)\)/g,(_,u)=>'url(https://fonts.gstatic.com/'+u.replace(/['"]/g,'').split('/').pop()+')');
const results={checks:[],failures:[],errors:[],source:process.env.GITHUB_SHA||'local'};
let browser;
async function capture(p,name){await p.screenshot({path:path.join(OUT,name+'.png'),animations:'disabled',timeout:20000});}
(async()=>{
 browser=await playwright.chromium.launch({args:['--no-sandbox']});
 const roles=[
 ['المدير','1234',['overview','monitor','maint','catalog','users','branches','settings','reports','notices','assetsdash','finance','rules','docadmin','labkpi','reqfix','extorders','nursevoice','surveys']],
 ['علي','3333',['requests','boxes','complaints','assets']],
 ['سارة','1111',['new','mine','assets','labmine']],
 ['د. خالد','4444',['reviews','docprices','labdoc']],
 ['فني المعمل','8888',['labboard']]
 ];
 for(const [name,pass,views] of roles){
  const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await ctx.addInitScript(initScript);
  await ctx.addInitScript(()=>localStorage.setItem('sf_tour_off','true'));
  await ctx.route(/cdnjs\.cloudflare\.com/,r=>r.abort());
  await ctx.route(/fonts\.googleapis\.com/,r=>r.fulfill({contentType:'text/css',body:fontCss}));
  await ctx.route(/fonts\.gstatic\.com/,r=>r.fulfill({contentType:'font/woff2',body:fs.readFileSync(path.join(fontDir,'files',new URL(r.request().url()).pathname.split('/').pop()))}));
  await ctx.route(/^http:\/\/supplyflow\.test\//,r=>r.fulfill({contentType:'text/html',body:html}));
  const p=await ctx.newPage();
  p.on('pageerror',e=>results.errors.push({role:name,message:e.message}));
  await p.goto('http://supplyflow.test/');
  await p.waitForSelector('#loginView:not(.hidden)');
  await p.fill('#loginName',name);await p.fill('#loginPass',pass);await p.click('#loginBtn');
  await p.waitForSelector('#appShell:not(.hidden)');await p.evaluate(()=>document.fonts.ready);
  for(const view of views){
   try{
    await p.evaluate(v=>go(v),view);await p.waitForTimeout(650);
    if(view==='overview')await p.waitForSelector('#mxStatusRing .mx-ring',{timeout:10000});
    if(view==='requests')await p.waitForSelector('#procList .mx-request',{timeout:10000});
    if(view==='new')await p.waitForSelector('.mx-item-card',{timeout:10000});
    for(const width of [320,390,768,1024,1440,1920]){
     await p.setViewportSize({width,height:width<=768?900:1000});
     await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
     const m=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,title:document.querySelector('#view').textContent.trim().length}));
     results.checks.push({role:name,view,...m});
     if(m.scroll>width+1)console.error('OVERFLOW ELEMENTS',JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('#view *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&(r.left< -1||r.right>innerWidth+1)&&!e.closest('.table-wrap,.chips,.segmented');}).slice(0,20).map(e=>({tag:e.tagName,id:e.id,cls:e.className,text:e.textContent.slice(0,60),left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})))));assert(m.scroll<=width+1,'Horizontal overflow in '+view+' at '+width+' ('+m.scroll+')');
     assert(m.title>0,'Empty view '+view);
     if([390,1440].includes(width))await capture(p,view+'-'+(width===390?'mobile':'desktop')+(view==='assets'?'_'+(name==='سارة'?'nurse':'proc'):''));
    }
    for(const width of [390,1440]){
     await p.setViewportSize({width,height:1000});
     await p.evaluate(()=>{if(S.lang!=='en')toggleLang();document.documentElement.dataset.theme='dark';});
     await p.waitForTimeout(150);
     const m=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
     results.checks.push({role:name,view,lang:'en',theme:'dark',...m});
     assert(m.scroll<=width+1,'English/dark overflow '+view+' '+width);
    }
    await p.evaluate(()=>{if(S.lang!=='ar')toggleLang();document.documentElement.dataset.theme='light';});
    if(view==='requests'){
     await p.setViewportSize({width:1440,height:1000});
     assert.equal(await p.locator('#procList .mx-request').first().locator('.mx-journey li').count(),5);
     await p.locator('#procList [data-act="detail"]').first().click();
     await p.waitForSelector('.request-detail .mx-detail-route');
     await capture(p,'request-details-desktop');
     await p.setViewportSize({width:390,height:900});await capture(p,'request-details-mobile');
     await p.keyboard.press('Escape');await p.waitForSelector('.request-detail',{state:'detached'});
     assert.equal(await p.evaluate(()=>document.body.style.overflow),'');
    }
    if(view==='new'){
     await p.setViewportSize({width:1440,height:1000});
     for(let i=0;i<3;i++){const add=p.locator('[data-act="mxAddCatalog"]').first();if(await add.count())await add.click();}
     await p.locator('#submitBtn').click();await p.waitForSelector('#mxReviewList:not(.hidden)');
     assert(await p.locator('#itemsList .item-line').count()>0,'Missing review items');
     await capture(p,'review-desktop');
     await p.setViewportSize({width:390,height:900});await capture(p,'review-mobile');
     const quantity=p.locator('#itemsList [data-input="qtySet"]').first();
     await quantity.fill('0');await p.click('#submitBtn');
     assert(await p.locator('#submitErr:not(.hidden)').count(),'Quantity zero bypassed validation');
     await quantity.fill('2');await p.click('#mxBackToItems');
     assert(await p.locator('#mxComposeSelection:not(.hidden)').count(),'Cannot return to item selection');
    }
    if(view==='maint'){
     const btn=p.locator('[data-act="mtOpen"]').first();if(await btn.count()){
      await p.setViewportSize({width:1440,height:1000});await btn.click();await p.waitForSelector('.mx-form-panel');await capture(p,'maintenance-details-desktop');await p.keyboard.press('Escape');await p.waitForSelector('.mx-form-panel',{state:'detached'});
     }
    }
    console.log('PASS '+name+' '+view);
   }catch(e){results.failures.push({role:name,view,message:e.message});console.error('FAIL '+view+' '+e.message);await p.evaluate(()=>{[...MODALS].forEach(closeModal);if(S.lang!=='ar')toggleLang();}).catch(()=>{});}
  }
  await ctx.close();
 }
})().catch(e=>results.failures.push({fatal:e.stack})).finally(async()=>{
 if(browser)await browser.close();
 fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({checks:results.checks.length,failures:results.failures,errors:results.errors}));
 if(results.failures.length||results.errors.length)process.exitCode=1;
});
