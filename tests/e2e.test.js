/*
 * ทดสอบอัตโนมัติแบบ end-to-end ด้วย Playwright (Chromium แบบ headless)
 * รัน:  node tests/e2e.test.js   (ต้องติดตั้ง playwright และ python3)
 * สคริปต์จะเปิดเซิร์ฟเวอร์ static ชั่วคราว แล้วเล่นเกมผ่าน UI จริงทั้ง 10 ด่าน
 */
'use strict';
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { LEVELS, exploreReference } = require('../challenges.js');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8765 + Math.floor(Math.random() * 200);
const URL = 'http://127.0.0.1:' + PORT + '/index.html';
const SHOTS = process.env.SHOT_DIR || path.join(ROOT, 'tests', 'screenshots');

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
}

async function waitIdle(page) {
  await page.waitForFunction(() => window.__jcq && !window.__jcq.getState().busy, null, { timeout: 15000 });
}
async function setCode(page, code) {
  await page.fill('#code', code);
}
async function check(page) {
  await page.click('#checkBtn');
  await page.waitForTimeout(50);
  await waitIdle(page);
  const fb = await page.$eval('#feedback', (e) => ({ cls: e.className, text: e.textContent }));
  return fb;
}
async function closeModalIfOpen(page, stay) {
  const open = await page.$eval('#modal', (e) => !e.classList.contains('hidden'));
  if (open) {
    const cancelVisible = await page.$eval('#modalCancel', (e) => !e.classList.contains('hidden'));
    await page.click(stay && cancelVisible ? '#modalCancel' : '#modalOk');
  }
  return open;
}
const state = (page) => page.evaluate(() => window.__jcq.getState());

// สร้างคำตอบที่ "เดาค่าตายตัว" จากค่าตัวอย่าง — ต้องไม่ผ่านเมื่อมีหลายกรณีทดสอบ
function hardcoded(step) {
  const exp = step.expect(step.tests[0]);
  let code = '';
  for (const k of Object.keys(exp)) {
    if (k === '$pos') code += 'move();\n'.repeat(exp[k]);
    else if (k === 'energy') code += 'energy = ' + JSON.stringify(exp[k]) + ';\n';
    else code += 'let ' + k + ' = ' + JSON.stringify(exp[k]) + ';\n';
  }
  return code;
}

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push('console: ' + m.text()); });
    page.on('requestfailed', (r) => { if (!/fonts\.g/.test(r.url())) errors.push('requestfailed: ' + r.url()); });

    await page.goto(URL);
    await page.waitForSelector('.level-btn');
    record('หน้าเว็บโหลดได้ และมี 10 ด่าน', (await page.$$('.level-btn')).length === 10);
    const lockedAtStart = await page.$$eval('.level-btn', (b) => b.map((x) => x.disabled));
    record('เริ่มเกม: ด่าน 1 เปิด ด่าน 2–10 ล็อก', lockedAtStart[0] === false && lockedAtStart.slice(1).every(Boolean));

    // ---------- ความปลอดภัยของ sandbox (ด่าน 1 ขั้น 1) ----------
    await setCode(page, [
      'console.log("doc", typeof document, "ls", typeof localStorage, "fetch", typeof fetch, "self", typeof self, "import", typeof importScripts);',
      'const g = Function("return this")();',
      'console.log("gpost", typeof g.postMessage, "gfetch", typeof g.fetch, "gXHR", typeof g.XMLHttpRequest, "gWS", typeof g.WebSocket);',
      'let canStart = battery >= 20;',
    ].join('\n'));
    await page.click('#runBtn'); await page.waitForTimeout(50); await waitIdle(page);
    const secOut = await page.textContent('#output');
    record('Sandbox: ไม่มี document / localStorage / fetch / self ในโค้ดนักเรียน',
      /doc undefined ls undefined fetch undefined self undefined import undefined/.test(secOut), secOut.match(/doc[^\n]*/)?.[0]);
    record('Sandbox: global ของ worker ไม่มี postMessage / fetch / XHR / WebSocket',
      /gpost undefined gfetch undefined gXHR undefined gWS undefined/.test(secOut));
    const parentUntouched = await page.evaluate(() => typeof window.__jcq === 'object' && document.title.includes('Code Quest'));
    record('Sandbox: หน้าหลักไม่ถูกแก้ไขโดยโค้ดนักเรียน', parentUntouched);

    // พยายามปลอมผลลัพธ์ผ่าน postMessage → ต้องไม่ผ่าน
    await setCode(page, 'const g = Function("return this")();\ntry { g.postMessage({vars:{canStart:true}, logs:[], events:[], pos:0, error:null}); } catch (e) {}\ntry { Object.getPrototypeOf(g).postMessage.call(g, {}); } catch (e) {}\nlet canStart = true;');
    let fb = await check(page);
    record('Sandbox: ปลอมผลลัพธ์ด้วย postMessage ไม่สำเร็จ / คำตอบตายตัวไม่ผ่าน', /bad/.test(fb.cls));

    // ลูปไม่รู้จบ
    await setCode(page, 'while (true) { }\nlet canStart = true;');
    const t0 = Date.now();
    await page.click('#checkBtn');
    await page.waitForTimeout(300);
    const t1 = Date.now();
    await page.evaluate(() => 1 + 1); // UI ต้องตอบสนองระหว่าง worker ค้าง
    const respMs = Date.now() - t1;
    const busyMid = (await state(page)).busy;
    await waitIdle(page);
    const loopOut = await page.textContent('#feedback');
    record('Infinite loop: หน้าเว็บไม่ค้าง (ตอบสนองระหว่างรัน < 300ms)', busyMid && respMs < 300, 'ตอบสนองใน ' + respMs + 'ms');
    record('Infinite loop: ถูกหยุดด้วย timeout และแจ้งผลภาษาไทย', /นานเกิน/.test(loopOut), 'ใช้เวลา ' + (Date.now() - t0) + 'ms');
    await setCode(page, 'for (;;) { console.log("x"); }');
    await page.click('#runBtn'); await page.waitForTimeout(50); await waitIdle(page);
    record('Infinite loop + console.log: ถูกหยุดด้วย timeout', /นานเกิน/.test(await page.textContent('#output')));

    // จำกัด output
    await setCode(page, 'for (let i = 0; i < 5000; i++) { console.log("line", i); }\nlet canStart = battery >= 20;');
    await page.click('#runBtn'); await page.waitForTimeout(50); await waitIdle(page);
    const lines = await page.$eval('.console', (e) => e.textContent.split('\n').length);
    record('จำกัดจำนวน output (≤ 200 บรรทัด + มีคำเตือน)', lines <= 200 && /ถูกตัด/.test(await page.textContent('#output')), lines + ' บรรทัด');

    // error ภาษาไทย
    await setCode(page, 'let battery = 5;\nlet canStart = battery >= 20;');
    fb = await check(page);
    record('ข้อผิดพลาดอธิบายเป็นภาษาไทย (ประกาศตัวแปรซ้ำ)', /ไม่ต้องเขียน let battery ซ้ำ/.test(fb.text));
    await setCode(page, 'let canStart = batery >= 20;');
    fb = await check(page);
    record('ข้อผิดพลาดอธิบายเป็นภาษาไทย (สะกดชื่อผิด)', /ไม่รู้จักชื่อ "batery"/.test(fb.text));

    // ---------- เล่นครบทุกด่านผ่าน UI ----------
    let allCorrectPass = true, allWrongFail = true, allEmpty = true, gateOk = true, solutionGateOk = true, structureOk = true;
    const wrongDetails = [], correctDetails = [], emptyDetails = [], structDetails = [];
    let missionCount = 0;
    for (const lv of LEVELS) {
      const btn = await page.$('.level-btn[data-level="' + lv.id + '"]');
      const disabled = await btn.evaluate((b) => b.disabled);
      if (disabled) { record('ด่าน ' + lv.id + ' ปลดล็อกตามลำดับ', false); break; }
      await btn.click();
      for (let si = 0; si < lv.steps.length; si++) {
        const step = lv.steps[si];
        missionCount++;
        const tag = 'L' + lv.id + 'M' + (si + 1);
        await page.click('.step-tab[data-step="' + si + '"]');
        // editor ต้องว่างตั้งแต่เริ่ม (ยกเว้นด่าน 1 ภารกิจ 1 ที่ใช้ทดสอบ sandbox ไปแล้ว)
        const initial = await page.inputValue('#code');
        if (!(lv.id === 1 && si === 0) && initial !== '') { allEmpty = false; emptyDetails.push(tag); }
        if (/___/.test(step.starter) || step.starter !== '') { allEmpty = false; emptyDetails.push(tag + ' starter'); }
        // โครงสร้างภารกิจ: สถานการณ์ / ข้อกำหนด / ตัวอย่างพฤติกรรม / งาน / จำนวนกรณีทดสอบ
        const mt = await page.textContent('#missionTask');
        if (!(/สถานการณ์/.test(mt) && /Input และข้อกำหนด/.test(mt) && /พฤติกรรมที่คาดหวัง/.test(mt) && /งานของคุณ/.test(mt) && /กรณีทดสอบ/.test(mt))) { structureOk = false; structDetails.push(tag); }
        if (step.hints.length < 2) { structureOk = false; structDetails.push(tag + ' hints'); }

        if (step.analysis) {
          // ต้องตอบคำถามวิเคราะห์ก่อนส่งโค้ด
          await setCode(page, step.solution);
          let r = await check(page);
          if (!/bad/.test(r.cls) || !/วิเคราะห์/.test(r.text)) { gateOk = false; }
          for (let qi = 0; qi < step.analysis.length; qi++) {
            const wrong = (step.analysis[qi].answer + 1) % step.analysis[qi].options.length;
            await page.check('input[name="q' + qi + '"][value="' + wrong + '"]');
          }
          await page.click('#quizCheckBtn');
          if (!/bad/.test(await page.$eval('#feedback', (e) => e.className))) { allWrongFail = false; wrongDetails.push(tag + ' analysis wrong passed'); }
          for (let qi = 0; qi < step.analysis.length; qi++) {
            await page.check('input[name="q' + qi + '"][value="' + step.analysis[qi].answer + '"]');
          }
          await page.click('#quizCheckBtn');
          if (!/ok/.test(await page.$eval('#feedback', (e) => e.className))) { allCorrectPass = false; correctDetails.push(tag + ' analysis'); }
        }
        // เฉลยต้องยังไม่เปิดก่อนดูคำใบ้ครบและลองตรวจ
        for (let h = 0; h < step.hints.length; h++) await page.click('#hintBtn');
        if (si === 0 && lv.id > 1 && await page.isVisible('#solutionBtn')) { solutionGateOk = false; }
        // คำตอบผิด: editor ว่าง + (ถ้ามีหลายกรณี) คำตอบเดาค่าตายตัวจากตัวอย่าง
        const wrongs = [''];
        if (step.tests.length > 1 && step.expect) wrongs.push(hardcoded(step));
        for (const w of wrongs) {
          await setCode(page, w);
          const r = await check(page);
          if (!/bad/.test(r.cls)) { allWrongFail = false; wrongDetails.push(tag + ': ' + JSON.stringify(w.slice(0, 40))); }
        }
        if (step.tests.length > 1 && !(await page.isVisible('#solutionBtn'))) { solutionGateOk = false; }
        await setCode(page, step.solution);
        const r = await check(page);
        if (!/ok/.test(r.cls)) { allCorrectPass = false; correctDetails.push(tag + ': ' + r.text.slice(0, 160)); }
        await closeModalIfOpen(page, true);
      }
      const st = await state(page);
      record('ด่าน ' + lv.id + ' ผ่านครบ 3 ภารกิจ → XP = ' + st.xp, !!st.progress.levels[lv.id] && st.xp === lv.id * 10);
    }
    record('มีภารกิจเขียนโค้ดครบ 30 ภารกิจ (10 ด่าน × 3)', missionCount === 30 && LEVELS.every((l) => l.steps.length === 3), missionCount + ' ภารกิจ');
    record('ทุกภารกิจเริ่มจาก editor ว่าง (ไม่มีโค้ดเริ่มต้น / ไม่มีเติมช่องว่าง)', allEmpty, emptyDetails.join(' '));
    record('ทุกภารกิจแสดง สถานการณ์ / Input+ข้อกำหนด / พฤติกรรมที่คาดหวัง / งาน / จำนวนกรณีทดสอบ และมีคำใบ้ ≥ 2 ขั้น', structureOk, structDetails.join(' '));
    record('ทุกภารกิจที่รับ Input มีกรณีทดสอบหลายกรณี', LEVELS.every((l) => l.steps.every((s) => s.tests.length > 1 || Object.keys(s.tests[0]).length === 0)));
    record('ด่าน 10: ต้องผ่านคำถามวิเคราะห์ (IPO/Algorithm/Testing) ก่อนส่งโค้ดทั้ง 3 ภารกิจ', gateOk && LEVELS[9].steps.every((s) => s.analysis && s.analysis.length >= 4));
    record('เฉลยเปิดได้หลังดูคำใบ้ครบ และลองตรวจแล้วอย่างน้อย 1 ครั้ง เท่านั้น', solutionGateOk);
    record('คำตอบถูก (เฉลยอ้างอิง) ผ่านทุกภารกิจ', allCorrectPass, correctDetails.join(' | '));
    record('คำตอบผิด (editor ว่าง / เดาค่าตายตัว / วิเคราะห์ผิด) ไม่ผ่านทุกภารกิจ', allWrongFail, wrongDetails.join(' | '));

    let st = await state(page);
    record('XP รวม = 100 เมื่อผ่านครบ 10 ด่าน', st.xp === 100, 'XP = ' + st.xp);

    // XP ไม่ซ้ำ: เล่นด่าน 1 ซ้ำ
    await page.click('.level-btn[data-level="1"]');
    await page.click('.step-tab[data-step="0"]');
    await setCode(page, LEVELS[0].steps[0].solution);
    fb = await check(page);
    const replayModal = await closeModalIfOpen(page, true);
    st = await state(page);
    record('เล่นซ้ำด่านที่ผ่านแล้วได้ แต่ไม่ได้ XP ซ้ำ', /ok/.test(fb.cls) && st.xp === 100 && !replayModal, 'XP = ' + st.xp);

    // หุ่นยนต์ตอบสนองต่อโค้ด: ด่าน 5 ขั้น 3 → ตำแหน่ง 8
    await page.click('.level-btn[data-level="5"]');
    await page.click('.step-tab[data-step="2"]');
    await setCode(page, LEVELS[4].steps[2].solution);
    await page.click('#runBtn'); await page.waitForTimeout(50); await waitIdle(page);
    await page.waitForFunction(() => document.getElementById('robot') && document.getElementById('robot').style.getPropertyValue('--pos') === '8', null, { timeout: 8000 }).catch(() => {});
    const pos5 = await page.$eval('#robot', (r) => r.style.getPropertyValue('--pos'));
    record('หุ่นยนต์เคลื่อนที่ตามโค้ด (ด่าน 5: เดินถึงช่อง 8)', pos5 === '8', '--pos=' + pos5);

    // ด่าน 6 แสดงการเปรียบเทียบ
    await page.click('.level-btn[data-level="6"]');
    await page.click('.step-tab[data-step="0"]');
    const cmp = await page.textContent('#compareCard');
    record('ด่าน 6 แสดงการเปรียบเทียบโค้ดด่าน 5 (เขียนซ้ำ) กับลูป สำหรับภารกิจ 8 ช่องเดียวกัน', /เขียนซ้ำเอง/.test(cmp) && /10 บรรทัด/.test(cmp) && /3 บรรทัด/.test(cmp), cmp.slice(0, 160).replace(/\s+/g, ' '));

    // ด่าน 8: ชนหินต้องไม่ผ่านและหุ่นยนต์แสดงการชน
    await page.click('.level-btn[data-level="8"]');
    await page.click('.step-tab[data-step="0"]');
    await setCode(page, 'for (let i = 0; i < steps; i++) { move(); }');
    fb = await check(page);
    await page.waitForTimeout(1500);
    const crashed = await page.$eval('#robot', (r) => r.classList.contains('crashed'));
    record('ด่าน 8: เดินชนหินไม่ผ่าน และหุ่นยนต์แสดงการชน', /bad/.test(fb.cls) && /ชนหิน/.test(fb.text) && crashed);
    await setCode(page, 'for (let i = 0; i < steps; i++) { try { move(); } catch (e) { jump(); } }');
    fb = await check(page);
    record('ด่าน 8: ใช้ try/catch กลืนการชนไม่ได้', /bad/.test(fb.cls));

    // ด่าน 10 กับแผนที่อื่น (ค่ากำหนดเองตอนทดลองรัน)
    await page.click('.level-btn[data-level="10"]');
    await page.click('.step-tab[data-step="1"]');
    await setCode(page, LEVELS[9].steps[1].solution);
    const customMaps = [[4, [0, 0, 0]], [7, [1, 2, 0, 0, 9]], [0, [5, 5, 5]], [12, [2, 2, 2, 2, 2, 2]]];
    let customOk = true; const customDetail = [];
    for (const [e, m] of customMaps) {
      await page.fill('input[data-ci="energy"]', String(e));
      await page.fill('input[data-ci="energyMap"]', m.join(', '));
      await page.click('#runBtn'); await page.waitForTimeout(50); await waitIdle(page);
      const out = await page.textContent('#output');
      const ref = exploreReference(e, m);
      const ok = out.includes('explored = ' + ref.explored) && out.includes('energy = ' + ref.energy);
      customDetail.push(e + '/' + JSON.stringify(m) + '→' + ref.explored + ',' + ref.energy + (ok ? '✓' : '✗'));
      if (!ok) customOk = false;
    }
    record('ด่าน 10 ทำงานกับแผนที่พลังงานหลายแบบ (ทดลองรันด้วยค่ากำหนดเอง)', customOk, customDetail.join(' '));
    await setCode(page, 'let explored = 8;\nenergy = 15;\nfor (let i = 0; i < 8; i++) { move(); }');
    fb = await check(page);
    record('ด่าน 10: คำตอบเดาค่าตายตัว (8, 15) ไม่ผ่านเพราะทดสอบหลายแผนที่', /bad/.test(fb.cls));
    await setCode(page, 'let explored = 0;\nfor (let i = 0; i < energyMap.length; i++) {\n  move();\n  energy = energy - 2 + energyMap[i];\n  explored++;\n}');
    fb = await check(page);
    record('ด่าน 10: ลืมตรวจพลังงานก่อนสำรวจ → ไม่ผ่าน', /bad/.test(fb.cls));

    await page.screenshot({ path: path.join(SHOTS, 'desktop-level10.png'), fullPage: false });
    await page.click('.level-btn[data-level="6"]');
    await page.click('.step-tab[data-step="0"]');
    await page.click('#runBtn'); await waitIdle(page); await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SHOTS, 'desktop-level6.png'), fullPage: false });

    // ความคืบหน้าคงอยู่หลังรีโหลด
    await page.reload();
    await page.waitForSelector('.level-btn');
    st = await state(page);
    const xpText = await page.textContent('#xpText');
    record('ความคืบหน้าคงอยู่หลังรีโหลดหน้า', st.xp === 100 && /100 \/ 100/.test(xpText), xpText);

    // รีเซ็ต: ยกเลิก → ไม่ลบ, ยืนยัน → ลบ
    await page.click('#resetBtn');
    await page.click('#modalCancel');
    const afterCancel = (await state(page)).xp;
    await page.click('#resetBtn');
    await page.click('#modalOk');
    const afterReset = (await state(page)).xp;
    await page.reload(); await page.waitForSelector('.level-btn');
    const afterReload = (await state(page)).xp;
    const lockedAgain = await page.$eval('.level-btn[data-level="2"]', (b) => b.disabled);
    record('รีเซ็ตมีการยืนยัน (ยกเลิกได้) และรีเซ็ตจริงเมื่อยืนยัน', afterCancel === 100 && afterReset === 0 && afterReload === 0 && lockedAgain);

    record('ไม่มี JavaScript error ใน console ระหว่างทดสอบทั้งหมด', errors.length === 0, errors.slice(0, 5).join(' | '));
    await ctx.close();

    // ---------- มือถือ ----------
    const mctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const m = await mctx.newPage();
    const merr = [];
    m.on('pageerror', (e) => merr.push(e.message));
    await m.goto(URL);
    await m.waitForSelector('.level-btn');
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await m.fill('#code', LEVELS[0].steps[0].solution);
    await m.click('#checkBtn'); await m.waitForTimeout(50); await waitIdle(m);
    const mfb = await m.$eval('#feedback', (e) => e.className);
    record('มือถือ (375px): ไม่มีการเลื่อนแนวนอน และเล่นได้', overflow <= 0 && /ok/.test(mfb) && merr.length === 0, 'overflow=' + overflow + 'px');
    await m.screenshot({ path: path.join(SHOTS, 'mobile-top.png'), fullPage: false });
    await m.screenshot({ path: path.join(SHOTS, 'mobile-full.png'), fullPage: true });
    await mctx.close();

    // แท็บเล็ต
    const tctx = await browser.newContext({ viewport: { width: 820, height: 1180 } });
    const t = await tctx.newPage();
    await t.goto(URL); await t.waitForSelector('.level-btn');
    const tover = await t.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    record('แท็บเล็ต (820px): ไม่มีการเลื่อนแนวนอน', tover <= 0, 'overflow=' + tover + 'px');
    await tctx.close();
  } catch (e) {
    record('สคริปต์ทดสอบทำงานจนจบ', false, e.stack);
  } finally {
    await browser.close();
    server.kill();
    const failed = results.filter((r) => !r.ok);
    console.log('\nสรุป: ผ่าน ' + (results.length - failed.length) + ' / ' + results.length);
    require('fs').writeFileSync(path.join(SHOTS, '..', 'last-run.json'), JSON.stringify(results, null, 2));
    process.exit(failed.length ? 1 : 0);
  }
})();
