/*
 * app.js — ตัวควบคุมเกม JavaScript Code Quest V2
 * ------------------------------------------------
 * หน้าที่: แสดงผล UI, จัดการความคืบหน้า/XP, ส่งโค้ดนักเรียนไปรันใน Web Worker,
 * ตรวจผลลัพธ์จากข้อมูลที่ Worker ส่งกลับ, และแสดงภาพเคลื่อนไหวของหุ่นยนต์
 *
 * ⚠️ ไฟล์นี้ไม่เคยรันโค้ดของนักเรียนเอง (ไม่มี eval / new Function ในหน้าหลัก)
 */
'use strict';

(function () {
  const STORAGE_KEY = 'jsCodeQuestV2.progress';
  const XP_PER_LEVEL = 10;
  const RUN_TIMEOUT_MS = 2000;

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    levelList: $('levelList'), xpText: $('xpText'), xpFill: $('xpFill'), progressText: $('progressText'),
    resetBtn: $('resetBtn'), lessonTitle: $('lessonTitle'), lessonBody: $('lessonBody'), lessonCard: $('lessonCard'),
    stepTabs: $('stepTabs'), missionTitle: $('missionTitle'), missionTask: $('missionTask'), givenBox: $('givenBox'),
    editorCard: $('editorCard'), code: $('code'), gutter: $('gutter'), lineCount: $('lineCount'),
    runBtn: $('runBtn'), checkBtn: $('checkBtn'), hintBtn: $('hintBtn'), resetCodeBtn: $('resetCodeBtn'),
    customInputs: $('customInputs'),
    quizCard: $('quizCard'), quizBody: $('quizBody'), quizCheckBtn: $('quizCheckBtn'), analysisState: $('analysisState'),
    hintCard: $('hintCard'), hintList: $('hintList'), solutionBtn: $('solutionBtn'), solutionBox: $('solutionBox'),
    stage: $('stage'), robotStatus: $('robotStatus'), compareCard: $('compareCard'),
    feedback: $('feedback'), output: $('output'),
    modal: $('modal'), modalIcon: $('modalIcon'), modalTitle: $('modalTitle'), modalText: $('modalText'),
    modalOk: $('modalOk'), modalCancel: $('modalCancel'), toast: $('toast'),
  };

  // ---------- ความคืบหน้า (localStorage) ----------
  function emptyProgress() {
    return { version: 3, steps: {}, levels: {}, code: {}, hints: {}, fails: {}, analysis: {}, quiz: {}, current: { level: 1, step: 0 } };
  }
  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyProgress();
      const p = JSON.parse(raw);
      if (!p || typeof p !== 'object') return emptyProgress();
      const base = emptyProgress();
      if (p.version !== base.version) { delete p.code; delete p.hints; }
      for (const k of Object.keys(base)) if (p[k] && typeof p[k] === typeof base[k]) base[k] = p[k];
      return base;
    } catch (_) {
      return emptyProgress();
    }
  }
  function saveProgress() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch (_) { /* โหมดส่วนตัว ฯลฯ */ }
  }
  let progress = loadProgress();

  const key = (lv, st) => lv + '-' + st;
  const levelById = (id) => LEVELS.find((l) => l.id === id);
  const isLevelDone = (id) => !!progress.levels[id];
  const isStepDone = (lv, st) => !!progress.steps[key(lv, st)];
  const isLevelUnlocked = (id) => id === 1 || isLevelDone(id - 1);
  const isStepUnlocked = (lv, st) => st === 0 || isStepDone(lv, st - 1) || isLevelDone(lv);
  // XP คำนวณจากด่านที่ผ่านเท่านั้น → ไม่มีทางได้ XP ซ้ำ
  const totalXP = () => LEVELS.filter((l) => isLevelDone(l.id)).length * XP_PER_LEVEL;

  let cur = { level: 1, step: 0 };
  if (progress.current && isLevelUnlocked(progress.current.level) && levelById(progress.current.level)) {
    cur.level = progress.current.level;
    cur.step = isStepUnlocked(cur.level, progress.current.step) ? progress.current.step : 0;
    if (!levelById(cur.level).steps[cur.step]) cur.step = 0;
  }
  let busy = false;
  let animToken = 0;

  const curLevel = () => levelById(cur.level);
  const curStep = () => curLevel().steps[cur.step];

  // ---------- ตัวช่วยทั่วไป ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmt(v) {
    if (v === undefined) return 'undefined';
    if (typeof v === 'string') return '"' + v + '"';
    if (Array.isArray(v)) return '[' + v.map(fmt).join(', ') + ']';
    if (v && typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  function stripComments(code) {
    return String(code).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  }
  function codeLines(code) {
    return stripComments(code).split('\n').filter((l) => l.trim() !== '').length;
  }
  function studentInputs(step, test) {
    const hidden = step.hideInputs ? Object.keys(test) : (step.hideKeys || []);
    const out = {};
    for (const k of Object.keys(test)) if (!hidden.includes(k)) out[k] = test[k];
    return out;
  }
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.toast.classList.add('hidden'), 2600);
  }

  // ---------- Modal ----------
  function showModal({ icon, title, text, okText, cancelText, onOk }) {
    el.modalIcon.textContent = icon || '🤖';
    el.modalTitle.textContent = title;
    el.modalText.innerHTML = text;
    el.modalOk.textContent = okText || 'ตกลง';
    el.modalCancel.textContent = cancelText || 'ยกเลิก';
    el.modalCancel.classList.toggle('hidden', !cancelText);
    el.modal.classList.remove('hidden');
    el.modalOk.focus();
    el.modalOk.onclick = () => { el.modal.classList.add('hidden'); if (onOk) onOk(); };
    el.modalCancel.onclick = () => el.modal.classList.add('hidden');
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.modal.classList.contains('hidden')) el.modal.classList.add('hidden');
  });

  // =====================================================
  //  การรันโค้ดใน Web Worker (sandbox)
  // =====================================================
  let workerSupported = true;
  function runInWorker(payload) {
    return new Promise((resolve) => {
      let worker;
      try {
        worker = new Worker('worker.js');
      } catch (e) {
        workerSupported = false;
        resolve({ error: { type: 'noworker', message: 'เบราว์เซอร์ไม่อนุญาตให้สร้าง Web Worker — กรุณาเปิดผ่าน Live Server (http://) ไม่ใช่เปิดไฟล์ตรง ๆ' }, logs: [], events: [], vars: {} });
        return;
      }
      let done = false;
      const finish = (res) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        worker.terminate(); // ปิด Worker ทุกครั้ง
        resolve(res);
      };
      const timer = setTimeout(() => finish({
        error: { type: 'timeout', message: 'โค้ดทำงานนานเกิน ' + (RUN_TIMEOUT_MS / 1000) + ' วินาที จึงถูกหยุด — อาจมีลูปที่ไม่มีวันจบ (infinite loop)' },
        logs: [], events: [], vars: {},
      }), RUN_TIMEOUT_MS);
      worker.onmessage = (e) => finish(e.data || { error: { type: 'runtime', message: 'ไม่ได้รับผลลัพธ์' } });
      worker.onerror = (e) => {
        e.preventDefault();
        finish({ error: { type: 'runtime', message: (e && e.message) || 'Worker ทำงานผิดพลาด' }, logs: [], events: [], vars: {} });
      };
      worker.postMessage(payload);
    });
  }

  function buildPayload(step, test, code) {
    const world = step.world ? step.world(test) : null;
    return {
      payload: {
        code,
        inputs: JSON.parse(JSON.stringify(studentInputs(step, test))),
        outputs: step.outputs || [],
        world: world ? { cells: world.cells, start: world.start } : null,
      },
      world,
    };
  }

  // แปลง error ของ JavaScript เป็นคำอธิบายภาษาไทยที่เข้าใจง่าย
  function friendlyError(err, step, test) {
    if (!err) return '';
    const msg = String(err.message || '');
    const inputs = Object.keys(studentInputs(step, test || {}));
    let m;
    if (err.type === 'syntax') {
      if ((m = msg.match(/Identifier '(\w+)' has already been declared/))) {
        return inputs.includes(m[1])
          ? 'ตัวแปร ' + m[1] + ' ระบบเตรียมไว้ให้แล้ว ไม่ต้องเขียน let ' + m[1] + ' ซ้ำ (ใช้หรือเปลี่ยนค่าได้เลย)'
          : 'สร้างตัวแปร ' + m[1] + ' ซ้ำ 2 ครั้ง — ใช้ let กับชื่อเดียวกันได้ครั้งเดียว';
      }
      if (/Unexpected end of input/.test(msg)) return 'โค้ดจบไม่ครบ — อาจลืมปิดวงเล็บ } หรือ )';
      if (/Unexpected token '?;'?/.test(msg) || /Unexpected token ';'/.test(msg)) return 'รูปแบบโค้ดไม่ถูกต้อง: มีบางส่วนหายไปก่อนเครื่องหมาย ; (เช่น let x = ; ยังไม่ได้ใส่ค่า)';
      return 'รูปแบบโค้ดไม่ถูกต้อง (Syntax Error): ' + msg;
    }
    if (err.type === 'runtime') {
      if ((m = msg.match(/^(\w+) is not defined/))) {
        if (/^_+$/.test(m[1])) return 'ยังมีช่องว่าง ' + m[1] + ' ที่ต้องเติม';
        return 'ไม่รู้จักชื่อ "' + m[1] + '" — สะกดถูกไหม? (ตัวพิมพ์เล็ก/ใหญ่มีผล) หรือยังไม่ได้สร้างตัวแปรนี้';
      }
      if (/Assignment to constant/.test(msg)) return 'ตัวแปรที่สร้างด้วย const เปลี่ยนค่าไม่ได้ — ใช้ let แทน';
      if (/is not a function/.test(msg)) return 'เรียกใช้สิ่งที่ไม่ใช่คำสั่ง: ' + msg;
      if (/before initialization/.test(msg)) return 'ใช้ตัวแปรก่อนสร้าง — ย้ายบรรทัด let ขึ้นไปก่อน';
      return 'เกิดข้อผิดพลาดขณะรัน: ' + (err.name ? err.name + ': ' : '') + msg;
    }
    return msg;
  }

  // ตรวจผลลัพธ์หนึ่งชุดทดสอบ → { ok, msg }
  function grade(step, test, res) {
    if (res.error) return { ok: false, msg: friendlyError(res.error, step, test) };
    if (step.expect) {
      const exp = step.expect(test);
      for (const k of Object.keys(exp)) {
        if (k === '$pos') {
          const want = exp[k], got = res.pos;
          if (got !== want) {
            return {
              ok: false,
              msg: got < want ? 'หุ่นยนต์หยุดที่ช่อง ' + got + ' — ยังขาดอีก ' + (want - got) + ' ช่องจึงจะถึงเป้าหมาย (ช่อง ' + want + ')'
                : 'หุ่นยนต์เดินเลยเป้าหมายไป ' + (got - want) + ' ช่อง (ควรหยุดที่ช่อง ' + want + ')',
            };
          }
          continue;
        }
        const got = res.vars ? res.vars[k] : undefined;
        if (got === undefined && exp[k] !== undefined) {
          return { ok: false, msg: 'ไม่พบตัวแปร ' + k + ' — ต้องสร้างด้วย let ' + k + ' = ... (ที่ระดับนอกสุด ไม่ใช่ใน { } )' };
        }
        if (!same(got, exp[k])) return { ok: false, msg: k + ' ควรเป็น ' + fmt(exp[k]) + ' แต่ได้ ' + fmt(got) };
      }
    }
    if (step.check) {
      const m = step.check(res, test);
      if (m) return { ok: false, msg: m };
    }
    return { ok: true, msg: 'ถูกต้อง' };
  }

  // =====================================================
  //  แสดงผล UI
  // =====================================================
  function renderHeader() {
    const xp = totalXP();
    el.xpText.textContent = xp + ' / ' + LEVELS.length * XP_PER_LEVEL;
    el.xpFill.style.width = (xp / (LEVELS.length * XP_PER_LEVEL)) * 100 + '%';
    el.progressText.textContent = LEVELS.filter((l) => isLevelDone(l.id)).length + ' / ' + LEVELS.length + ' ด่าน';
  }

  function renderLevelList() {
    el.levelList.innerHTML = '';
    for (const lv of LEVELS) {
      const li = document.createElement('li');
      const unlocked = isLevelUnlocked(lv.id);
      const done = isLevelDone(lv.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'level-btn' + (lv.id === cur.level ? ' active' : '') + (done ? ' done' : '') + (!unlocked ? ' locked' : '');
      btn.disabled = !unlocked;
      btn.dataset.level = lv.id;
      const stepsDone = lv.steps.filter((_, i) => isStepDone(lv.id, i)).length;
      btn.innerHTML =
        '<span class="lv-icon">' + (unlocked ? lv.icon : '🔒') + '</span>' +
        '<span class="lv-text"><span class="lv-name">ด่าน ' + lv.id + ': ' + esc(lv.title) + '</span>' +
        '<span class="lv-concept">' + esc(lv.concept) + '</span></span>' +
        '<span class="lv-state">' + (done ? '✅' : unlocked ? stepsDone + '/' + lv.steps.length : '') + '</span>';
      btn.title = unlocked ? '' : 'ผ่านด่าน ' + (lv.id - 1) + ' ก่อนเพื่อปลดล็อก';
      btn.addEventListener('click', () => selectLevel(lv.id));
      li.appendChild(btn);
      el.levelList.appendChild(li);
    }
  }

  function renderStepTabs() {
    const lv = curLevel();
    el.stepTabs.innerHTML = '';
    lv.steps.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      const unlocked = isStepUnlocked(lv.id, i);
      b.className = 'step-tab' + (i === cur.step ? ' active' : '') + (isStepDone(lv.id, i) ? ' done' : '');
      b.disabled = !unlocked;
      b.setAttribute('role', 'tab');
      b.dataset.step = i;
      b.innerHTML = (isStepDone(lv.id, i) ? '✅ ' : unlocked ? '' : '🔒 ') + 'ภารกิจ ' + (i + 1);
      b.addEventListener('click', () => selectStep(i));
      el.stepTabs.appendChild(b);
    });
  }

  function describeInputs(step, test, world) {
    const ins = studentInputs(step, test);
    const parts = Object.keys(ins).map((n) => n + ' = ' + fmt(ins[n]));
    if (world && world.cells.includes('rock')) parts.push('หินที่ช่อง ' + world.cells.map((c, k) => (c === 'rock' ? k : null)).filter((x) => x !== null).join(', '));
    if (world && !Object.keys(ins).length && !world.cells.includes('rock')) parts.push('เริ่มช่อง ' + world.start + (world.goal !== undefined ? ', ธงที่ช่อง ' + world.goal : ''));
    if (world && !Object.keys(ins).length && world.cells.includes('rock') && step.hideKeys) parts.unshift('');
    return parts.filter(Boolean).join(', ') || '(ไม่มี Input)';
  }
  function describeExpected(step, test) {
    if (!step.expect) return '';
    const exp = step.expect(test);
    return Object.keys(exp).map((k) => (k === '$pos' ? 'หุ่นยนต์หยุดที่ช่อง ' + exp[k] : k + ' = ' + fmt(exp[k]))).join(', ');
  }

  function renderMission() {
    const step = curStep();
    let html = '';
    html += '<div class="m-sec"><div class="m-label">📖 สถานการณ์</div><div>' + step.scenario + '</div></div>';
    html += '<div class="m-sec"><div class="m-label">📋 Input และข้อกำหนด</div><ul class="req">' + step.requirements.map((r) => '<li>' + r + '</li>').join('') + '</ul></div>';
    // ตัวอย่างพฤติกรรมที่คาดหวัง (สร้างจากชุดทดสอบจริง)
    if (step.expect) {
      const rows = step.tests.slice(0, 3).map((t) => {
        const w = step.world ? step.world(t) : null;
        return '<tr><td><code>' + esc(describeInputs(step, t, w)) + '</code></td><td><code>' + esc(describeExpected(step, t)) + '</code></td></tr>';
      }).join('');
      html += '<div class="m-sec"><div class="m-label">🎯 พฤติกรรมที่คาดหวัง (ตัวอย่าง)</div><div class="table-scroll"><table class="op-table ex-table"><tr><th>Input</th><th>ผลที่ถูกต้อง</th></tr>' + rows + '</table></div></div>';
    }
    html += '<div class="m-sec m-task"><div class="m-label">💻 งานของคุณ</div><div>' + step.task + '</div></div>';
    html += '<div class="m-sec small muted">✔ ตอนตรวจคำตอบ ระบบจะรันโค้ดของคุณกับ <b>' + step.tests.length + ' กรณีทดสอบ</b>' +
      (step.tests.length > 1 ? ' (มีค่าที่ไม่ได้แสดงในตัวอย่างด้วย — ห้ามเขียนคำตอบตายตัว)' : '') +
      (step.outputs && step.outputs.length ? ' และอ่านค่าตัวแปร ' + step.outputs.map((n) => '<code>' + esc(n) + '</code>').join(', ') : '') + '</div>';
    el.missionTask.innerHTML = html;
    el.givenBox.innerHTML = '';
  }

  function renderHints(revealAll) {
    const step = curStep();
    const k = key(cur.level, cur.step);
    const shown = revealAll ? step.hints.length : (progress.hints[k] || 0);
    el.hintList.innerHTML = step.hints.slice(0, shown).map((h) => '<li>' + esc(h) + '</li>').join('');
    el.hintCard.classList.toggle('hidden', shown === 0);
    const allShown = shown >= step.hints.length;
    const tried = (progress.fails[k] || 0) >= 1 || isStepDone(cur.level, cur.step);
    el.solutionBtn.classList.toggle('hidden', !(allShown && tried && step.solution));
    if (allShown && !tried && step.solution) {
      el.hintList.insertAdjacentHTML('beforeend', '<li class="muted">ลองเขียนและกด "ตรวจคำตอบ" อย่างน้อย 1 ครั้ง จึงจะเปิดดูเฉลยได้</li>');
    }
    el.solutionBox.classList.add('hidden');
    const label = allShown ? '💡 คำใบ้ (ครบแล้ว)' : '💡 คำใบ้ ' + (shown + 1) + '/' + step.hints.length;
    el.hintBtn.textContent = label;
  }

  function renderCompare() {
    const lv = curLevel();
    if (lv.id !== 6) { el.compareCard.classList.add('hidden'); return; }
    const savedManual = progress.code[key(5, 2)];
    const manual = typeof savedManual === 'string' && savedManual.trim() ? savedManual : levelById(5).steps[2].solution;
    let loopCode;
    if (cur.step === 0 && el.code.value.trim()) loopCode = el.code.value;
    else {
      const saved = progress.code[key(6, 0)];
      loopCode = typeof saved === 'string' && saved.trim() ? saved : levelById(6).steps[0].solution;
    }
    const ml = codeLines(manual), ll = codeLines(loopCode);
    const mMoves = (stripComments(manual).match(/\bmove\s*\(/g) || []).length;
    el.compareCard.classList.remove('hidden');
    el.compareCard.innerHTML =
      '<h2 class="card-title">⚖️ เปรียบเทียบ: เขียนซ้ำเอง vs ใช้ลูป (ภารกิจ 8 ช่องเดียวกัน)</h2>' +
      '<div class="compare-grid">' +
      '<div class="cmp-col"><div class="cmp-head">ด่าน 5 ภารกิจ 3 — เขียนซ้ำเอง</div><pre>' + esc(manual.trim()) + '</pre><div class="cmp-count bad">' + ml + ' บรรทัด · move() ' + mMoves + ' ครั้ง</div></div>' +
      '<div class="cmp-col"><div class="cmp-head">ด่าน 6 ภารกิจ 1 — ใช้ลูป</div><pre>' + esc(loopCode.trim()) + '</pre><div class="cmp-count good">' + ll + ' บรรทัด · move() 1 ครั้ง</div></div>' +
      '</div>' +
      '<table class="op-table cmp-table"><tr><th>ระยะทาง</th><th>เขียนซ้ำเอง</th><th>ใช้ลูป</th></tr>' +
      '<tr><td>8 ช่อง</td><td>move() 8 บรรทัด</td><td>3 บรรทัด</td></tr>' +
      '<tr><td>100 ช่อง</td><td>move() 100 บรรทัด 😵</td><td>3 บรรทัดเท่าเดิม (แก้แค่ตัวเลข) 😎</td></tr></table>' +
      '<p class="small">ทั้งสองแบบทำให้หุ่นยนต์ <b>เดินเหมือนกันทุกอย่าง</b> แต่ลูปเขียน <code>move();</code> ครั้งเดียว แล้วให้คอมพิวเตอร์ทำซ้ำแทนเรา</p>';
  }

  function updateEditorMeta() {
    const lines = el.code.value.split('\n').length;
    let g = '';
    for (let i = 1; i <= lines; i++) g += i + '\n';
    el.gutter.textContent = g;
    const lv = curLevel();
    const n = codeLines(el.code.value);
    const moves = (stripComments(el.code.value).match(/\bmove\s*\(/g) || []).length;
    el.lineCount.textContent = 'จำนวนบรรทัดโค้ด: ' + n + (lv.kind === 'track' ? ' · เขียน move() ' + moves + ' ครั้ง' : '');
  }

  function renderStage(world, state) {
    // state: { pos, visited:Set, alarms:Set, crash:bool, vars }
    const lv = curLevel();
    const step = curStep();
    if (!world) {
      renderLogicStage(state && state.vars, state && state.error);
      return;
    }
    const cells = world.cells.map((c, i) => {
      let icon = '', cls = 'cell';
      if (c === 'start' || i === world.start) { icon = '🏠'; cls += ' cell-start'; }
      if (c === 'goal') { icon = '🏁'; cls += ' cell-goal'; }
      if (c === 'rock') { icon = '🪨'; cls += ' cell-rock'; }
      if (c === 'room') { cls += ' cell-room'; }
      if (c === 'energy') { cls += ' cell-energy'; }
      if (state && state.visited && state.visited.has(i)) cls += ' visited';
      if (state && state.alarms && state.alarms.has(i)) cls += ' alarm';
      const label = world.labels && world.labels[i] ? '<span class="cell-label">' + esc(world.labels[i]) + (c === 'energy' ? '⚡' : '') + '</span>' : '';
      return '<div class="' + cls + '" data-i="' + i + '"><span class="cell-icon">' + icon + '</span>' + label + '<span class="cell-idx">' + i + '</span></div>';
    }).join('');
    const pos = state ? state.pos : world.start;
    el.stage.innerHTML =
      '<div class="track-wrap"><div class="track" style="--n:' + world.cells.length + '">' + cells +
      '<div class="robot" id="robot" style="--pos:' + pos + '"><span class="robot-body">🤖</span></div></div></div>' +
      '<div class="stage-info" id="stageInfo">' + stageInfoText(step, state) + '</div>';
    if (lv.id === 6 || lv.id === 5) el.stage.classList.add('stage-compare'); else el.stage.classList.remove('stage-compare');
  }

  function stageInfoText(step, state) {
    if (!state || !state.counts) return 'ตำแหน่งเริ่มต้น — กด "ทดลองรัน" เพื่อดูหุ่นยนต์ทำงาน';
    const c = state.counts;
    const written = (stripComments(el.code.value).match(/\bmove\s*\(/g) || []).length;
    let t = '🦿 เดิน ' + c.move + ' ครั้ง';
    if (c.jump) t += ' · 🦘 กระโดด ' + c.jump + ' ครั้ง';
    if (c.alarm) t += ' · 🚨 เตือน ' + c.alarm + ' ครั้ง';
    if (c.move > 0 && written > 0 && c.move > written) t += ' — <b>เขียน move() ในโค้ดแค่ ' + written + ' ครั้ง แต่ทำงาน ' + c.move + ' ครั้ง เพราะลูป!</b>';
    if (state.vars && state.vars.energy !== undefined) t += ' · ⚡ พลังงาน ' + esc(fmt(state.vars.energy));
    return t;
  }

  const ACTION_ICONS = { charge: '🔌 ไปชาร์จแบต', work: '🛠️ ทำงาน', rest: '😴 พักผ่อน', stop: '✋ หยุด', go: '➡️ เดินต่อ' };
  function renderLogicStage(vars, error) {
    const step = curStep();
    const outs = step.outputs || [];
    let mood = 'idle', face = '🤖';
    if (error) { mood = 'error'; face = '😵'; }
    let chips = '';
    if (vars) {
      chips = outs.map((n) => {
        const v = vars[n];
        let cls = 'state-chip';
        let label = fmt(v);
        if (v === true) cls += ' on';
        else if (v === false) cls += ' off';
        if (n === 'action' && ACTION_ICONS[v]) label = '"' + v + '" ' + ACTION_ICONS[v];
        return '<div class="' + cls + '"><span>' + esc(n) + '</span><b>' + esc(label) + '</b></div>';
      }).join('');
      const vals = outs.map((n) => vars[n]);
      if (!error) {
        if (vals.length && vals.every((v) => v === true)) { mood = 'happy'; face = '🤖'; }
        else if (vals.some((v) => v === false)) { mood = 'sad'; face = '🤖'; }
        else if (vals.some((v) => v !== undefined)) { mood = 'happy'; }
      }
    } else {
      chips = outs.map((n) => '<div class="state-chip"><span>' + esc(n) + '</span><b>?</b></div>').join('');
    }
    const ins = studentInputs(step, step.tests[0]);
    const sensors = Object.keys(ins).map((n) => {
      const v = ins[n];
      if (n === 'battery') return '<div class="sensor"><span>🔋 battery</span><div class="battery"><div style="width:' + Math.max(0, Math.min(100, v)) + '%"></div></div><b>' + v + '</b></div>';
      return '<div class="sensor"><span>' + esc(n) + '</span><b>' + esc(fmt(v)) + '</b></div>';
    }).join('');
    el.stage.classList.remove('stage-compare');
    el.stage.innerHTML =
      '<div class="logic-stage"><div class="big-robot mood-' + mood + '"><span>' + face + '</span>' +
      '<div class="robot-lights"><i></i><i></i><i></i></div></div>' +
      '<div class="logic-panel"><div class="logic-sub">เซนเซอร์ (ค่าตัวอย่าง)</div>' + (sensors || '<div class="muted small">-</div>') +
      '<div class="logic-sub">ผลการตัดสินใจ</div>' + chips + '</div></div>';
  }

  function renderOutput(html) { el.output.innerHTML = html; }
  function setFeedback(kind, html) {
    el.feedback.className = 'feedback ' + kind;
    el.feedback.innerHTML = html;
  }
  function clearFeedback() { el.feedback.className = 'feedback hidden'; el.feedback.innerHTML = ''; }

  function renderQuiz() {
    const step = curStep();
    const k = key(cur.level, cur.step);
    const saved = progress.quiz[k] || {};
    el.quizBody.innerHTML = step.analysis.map((q, qi) =>
      '<fieldset class="quiz-q" data-q="' + qi + '"><legend>' + (qi + 1) + ') ' + q.q + '</legend>' +
      q.options.map((o, oi) =>
        '<label class="quiz-opt"><input type="radio" name="q' + qi + '" value="' + oi + '"' + (saved[qi] === oi ? ' checked' : '') + '> <span>' + esc(o) + '</span></label>').join('') +
      '<div class="quiz-explain"></div></fieldset>').join('');
    el.quizBody.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', () => {
      const answers = {};
      el.quizBody.querySelectorAll('input:checked').forEach((c) => { answers[c.name.slice(1)] = Number(c.value); });
      progress.quiz[k] = answers;
      saveProgress();
    }));
    renderAnalysisState();
  }
  function renderAnalysisState() {
    const ok = !!progress.analysis[key(cur.level, cur.step)];
    el.analysisState.textContent = ok ? '✅ ผ่านแล้ว' : '🔒 ต้องผ่านก่อนส่งโค้ด';
    el.analysisState.className = 'analysis-state ' + (ok ? 'ok' : 'todo');
  }

  function renderCustomInputs() {
    const step = curStep();
    if (!step.customInputs) { el.customInputs.classList.add('hidden'); el.customInputs.innerHTML = ''; return; }
    const t = step.tests[0];
    el.customInputs.classList.remove('hidden');
    el.customInputs.innerHTML = '<div class="ci-title">🧪 ทดลองกับข้อมูลของคุณเอง (ใช้ตอน "ทดลองรัน")</div>' +
      step.customInputs.map((f) => '<label>' + esc(f.name) + ' <input data-ci="' + esc(f.name) + '" data-type="' + f.type + '" type="' +
        (f.type === 'number' ? 'number' : 'text') + '" value="' + esc(f.type === 'array' ? t[f.name].join(', ') : t[f.name]) + '"></label>').join('') +
      '<small>' + (step.customInputs.some((f) => f.type === 'array') ? 'Array: ตัวเลขคั่นด้วยจุลภาค (,) ไม่เกิน 30 ค่า เว้นว่างได้ = Array ว่าง' : '') + '</small>';
  }

  function renderAll() {
    const lv = curLevel();
    const step = curStep();
    renderHeader();
    renderLevelList();
    el.lessonTitle.innerHTML = '📘 บทเรียนด่าน ' + lv.id + ': ' + esc(lv.concept);
    el.lessonBody.innerHTML = lv.lesson;
    renderStepTabs();
    el.missionTitle.innerHTML = '🎯 ภารกิจ ' + (cur.step + 1) + ' — ' + esc(step.title) + ' <span class="m-kind">' + ['นำไปใช้', 'ปรับใช้', 'วิเคราะห์'][cur.step] + '</span>';
    renderMission();
    el.quizCard.classList.toggle('hidden', !step.analysis);
    if (step.analysis) renderQuiz();
    renderCustomInputs();
    const saved = progress.code[key(lv.id, cur.step)];
    el.code.value = typeof saved === 'string' ? saved : step.starter;
    updateEditorMeta();
    renderHints(false);
    renderCompare();
    clearFeedback();
    renderOutput('<span class="muted">เขียนโค้ดแล้วกด "ทดลองรัน" เพื่อดูผลลัพธ์ที่นี่</span>');
    animToken++;
    const world = step.world ? step.world(step.tests[0]) : null;
    renderStage(world, null);
    setRobotStatus(isStepDone(lv.id, cur.step) ? '✅ ผ่านภารกิจนี้แล้ว (เล่นซ้ำได้)' : 'พร้อม', isStepDone(lv.id, cur.step) ? 'ok' : '');
  }

  function setRobotStatus(text, kind) {
    el.robotStatus.textContent = text;
    el.robotStatus.className = 'robot-status' + (kind ? ' ' + kind : '');
  }

  // ---------- ภาพเคลื่อนไหวหุ่นยนต์ ----------
  function animate(world, res) {
    const token = ++animToken;
    const events = res.events || [];
    const state = { pos: world.start, visited: new Set([world.start]), alarms: new Set(), counts: { move: 0, jump: 0, alarm: 0 }, vars: null };
    renderStage(world, state);
    const robot = () => $('robot');
    const delay = Math.max(60, Math.min(380, 3200 / Math.max(1, events.length)));
    let i = 0;
    return new Promise((resolve) => {
      function tick() {
        if (token !== animToken) return resolve(false);
        if (i >= events.length) {
          state.vars = res.vars;
          const info = $('stageInfo');
          if (info) info.innerHTML = stageInfoText(curStep(), state);
          return resolve(true);
        }
        const ev = events[i++];
        const r = robot();
        if (ev.type === 'move' || ev.type === 'jump') {
          state.pos = ev.pos;
          state.counts[ev.type]++;
          if (r) {
            r.style.setProperty('--pos', ev.pos);
            r.classList.remove('jumping'); void r.offsetWidth;
            if (ev.type === 'jump') r.classList.add('jumping');
          }
          const cell = el.stage.querySelector('.cell[data-i="' + ev.pos + '"]');
          if (cell) cell.classList.add('visited');
        } else if (ev.type === 'alarm') {
          state.counts.alarm++;
          const cell = el.stage.querySelector('.cell[data-i="' + ev.pos + '"]');
          if (cell) { cell.classList.add('alarm'); }
          if (r) { r.classList.remove('alarming'); void r.offsetWidth; r.classList.add('alarming'); }
        } else if (ev.type === 'crash' || ev.type === 'fall' || ev.type === 'badjump') {
          if (r) {
            if (ev.type === 'crash') r.style.setProperty('--pos', ev.pos - 0.35);
            if (ev.type === 'fall') r.style.setProperty('--pos', ev.pos + 0.6);
            r.classList.add('crashed');
          }
        }
        const info = $('stageInfo');
        if (info) info.innerHTML = stageInfoText(curStep(), state);
        setTimeout(tick, delay);
      }
      setTimeout(tick, 250);
    });
  }

  function showRunVisual(step, test, world, res) {
    if (world) return animate(world, res);
    renderLogicStage(res.vars, res.error);
    return Promise.resolve(true);
  }

  // ---------- แสดง output ----------
  function outputHtml(step, res) {
    let html = '';
    if (res.logs && res.logs.length) {
      html += '<div class="out-sec">console.log</div><pre class="console">' + res.logs.map(esc).join('\n') + '</pre>';
    } else {
      html += '<div class="out-sec">console.log</div><div class="muted small">(ไม่มีข้อความแสดงผล)</div>';
    }
    if (res.truncated) html += '<div class="warn small">⚠️ ข้อความถูกตัดให้สั้นลง (จำกัด 200 บรรทัด)</div>';
    if (step.outputs && step.outputs.length && !res.error) {
      html += '<div class="out-sec">ค่าตัวแปรผลลัพธ์</div><div class="chips">' +
        step.outputs.map((n) => '<code class="chip chip-out">' + esc(n) + ' = ' + esc(fmt(res.vars ? res.vars[n] : undefined)) + '</code>').join('') + '</div>';
    }
    if (step.world && !res.error) html += '<div class="out-sec">หุ่นยนต์</div><div class="small">หยุดที่ช่อง ' + res.pos + '</div>';
    if (res.error) html += '<div class="out-sec">ข้อผิดพลาด</div><div class="err">❌ ' + esc(friendlyError(res.error, step, res._test)) + '</div>';
    return html;
  }

  function setBusy(b, label) {
    busy = b;
    el.runBtn.disabled = b;
    el.checkBtn.disabled = b;
    el.quizCheckBtn.disabled = b;
    if (b) setRobotStatus(label || 'กำลังประมวลผล…', 'busy');
  }

  function saveCode() {
    progress.code[key(cur.level, cur.step)] = el.code.value;
    saveProgress();
  }

  function readCustomTest(step) {
    if (!step.customInputs) return step.tests[0];
    const test = {};
    let bad = false;
    el.customInputs.querySelectorAll('input[data-ci]').forEach((inp) => {
      const name = inp.dataset.ci;
      if (inp.dataset.type === 'array') {
        const parts = inp.value.split(',').map((x) => x.trim()).filter((x) => x !== '');
        const arr = parts.map(Number);
        if (arr.some((n) => !Number.isFinite(n)) || arr.length > 30) bad = true;
        test[name] = arr;
      } else {
        const n = Number(inp.value);
        if (inp.value.trim() === '' || !Number.isFinite(n)) bad = true;
        test[name] = n;
      }
    });
    if (bad) {
      toast('ข้อมูลที่กรอกไม่ถูกต้อง ใช้ค่าตัวอย่างแทน');
      return step.tests[0];
    }
    return test;
  }

  // ---------- ทดลองรัน (Run Code) ----------
  async function runCode() {
    if (busy) return;
    const step = curStep();
    saveCode();
    clearFeedback();
    const test = readCustomTest(step);
    const { payload, world } = buildPayload(step, test, el.code.value);
    setBusy(true, '⚙️ กำลังรัน…');
    renderOutput('<span class="muted">กำลังรันโค้ดใน sandbox…</span>');
    const res = await runInWorker(payload);
    res._test = test;
    setBusy(false);
    renderOutput('<div class="out-badge run">▶ ทดลองรัน (ค่าตัวอย่าง — ยังไม่ตรวจคำตอบ)</div>' + outputHtml(step, res));
    if (res.error) setRobotStatus('❌ มีข้อผิดพลาด', 'bad');
    else setRobotStatus('▶ รันเสร็จ — กด "ตรวจคำตอบ" เพื่อส่ง', '');
    if (world && step.customInputs) renderStage(world, null);
    await showRunVisual(step, test, world, res);
  }

  // ---------- ตรวจคำตอบ (Check Answer) ----------
  async function checkAnswer() {
    if (busy) return;
    const step = curStep();
    const lvId = cur.level, stIdx = cur.step;
    saveCode();
    const code = el.code.value;
    clearFeedback();
    const k = key(lvId, stIdx);
    if (step.analysis && !progress.analysis[k]) {
      setFeedback('bad', '🔒 <b>ตอบคำถามวิเคราะห์ให้ถูกทุกข้อก่อน</b> แล้วจึงส่งโค้ด (กด "ตรวจการวิเคราะห์" ด้านบน)');
      el.quizCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!stripComments(code).trim()) {
      setFeedback('bad', '✍️ <b>ยังไม่มีโค้ด</b> — เขียนโค้ดของคุณเองใน editor ก่อนส่ง');
      return;
    }

    if (step.source) {
      const m = step.source(code);
      if (m) {
        progress.fails[k] = (progress.fails[k] || 0) + 1; saveProgress(); renderHints(false);
        setFeedback('bad', '❌ <b>ยังไม่ผ่าน</b> — ' + esc(m));
        setRobotStatus('❌ ยังไม่ผ่าน', 'bad');
        return;
      }
    }
    setBusy(true, '🔍 กำลังตรวจ…');
    renderOutput('<span class="muted">กำลังทดสอบ ' + step.tests.length + ' กรณี…</span>');
    const results = [];
    for (const test of step.tests) {
      const { payload, world } = buildPayload(step, test, code);
      const res = await runInWorker(payload);
      res._test = test;
      results.push({ test, world, res, g: grade(step, test, res) });
      if (res.error && (res.error.type === 'timeout' || res.error.type === 'syntax' || res.error.type === 'noworker')) break; // ไม่ต้องรอซ้ำ
    }
    setBusy(false);
    const passed = results.filter((r) => r.g.ok).length;
    const allOk = passed === step.tests.length;

    let table = '<div class="out-badge check">✔ ตรวจคำตอบ: ผ่าน ' + passed + ' / ' + step.tests.length + ' กรณี</div><ol class="tests">';
    results.forEach((r, i) => {
      const ins = studentInputs(step, r.test);
      const desc = Object.keys(ins).length ? Object.keys(ins).map((n) => n + ' = ' + fmt(ins[n])).join(', ') :
        (r.world && r.world.cells.includes('rock') ? 'หินที่ช่อง ' + r.world.cells.map((c, k) => (c === 'rock' ? k : null)).filter((x) => x !== null).join(', ') :
          r.world ? 'เส้นทาง ' + (r.world.cells.length - 1) + ' ช่อง' : 'กรณีที่ ' + (i + 1));
      const hiddenDesc = step.hideKeys && r.world && r.world.cells.includes('rock')
        ? ' · หินที่ช่อง ' + r.world.cells.map((c, k) => (c === 'rock' ? k : null)).filter((x) => x !== null).join(', ') : '';
      table += '<li class="' + (r.g.ok ? 'pass' : 'fail') + '"><span>' + (r.g.ok ? '✅' : '❌') + ' <code>' + esc(desc) + '</code>' + esc(hiddenDesc) + '</span>' +
        (r.g.ok ? '' : '<div class="why">' + esc(r.g.msg) + '</div>') + '</li>';
    });
    if (results.length < step.tests.length) table += '<li class="fail">⏭️ หยุดตรวจกรณีที่เหลือ เพราะโค้ดยังรันไม่ได้</li>';
    table += '</ol>';
    const shown = results.find((r) => !r.g.ok) || results[0];
    renderOutput(table + '<details class="out-detail"' + (allOk ? '' : ' open') + '><summary>รายละเอียดกรณีที่แสดงในหุ่นยนต์</summary>' + outputHtml(step, shown.res) + '</details>');

    if (allOk) {
      onStepPassed(lvId, stIdx);
    } else {
      const first = results.find((r) => !r.g.ok);
      progress.fails[k] = (progress.fails[k] || 0) + 1; saveProgress(); renderHints(false);
      setFeedback('bad', '❌ <b>ยังไม่ผ่าน</b> — ' + esc(first.g.msg) + '<br><span class="small">ลองดูคำใบ้ 💡 หรือกด "ทดลองรัน" เพื่อดูการทำงานทีละขั้น</span>');
      setRobotStatus('❌ ยังไม่ผ่าน', 'bad');
    }
    await showRunVisual(step, shown.test, shown.world, shown.res);
    if (allOk) celebrate();
  }

  function celebrate() {
    const r = $('robot') || el.stage.querySelector('.big-robot');
    if (r) { r.classList.remove('dance'); void r.offsetWidth; r.classList.add('dance'); }
  }

  function onStepPassed(lvId, stIdx) {
    const lv = levelById(lvId);
    const wasStepDone = isStepDone(lvId, stIdx);
    progress.steps[key(lvId, stIdx)] = true;
    let levelJustDone = false;
    if (!isLevelDone(lvId) && lv.steps.every((_, i) => isStepDone(lvId, i))) {
      progress.levels[lvId] = true; // XP มาจากตรงนี้ — ให้ได้ครั้งเดียว
      levelJustDone = true;
    }
    saveProgress();
    renderHeader();
    renderLevelList();
    renderStepTabs();
    setRobotStatus('✅ ผ่าน!', 'ok');
    const nextStep = stIdx + 1 < lv.steps.length ? stIdx + 1 : null;
    let msg = '✅ <b>ถูกต้อง! ผ่านทุกกรณีทดสอบ</b>';
    if (wasStepDone && !levelJustDone) msg += ' <span class="small">(เล่นซ้ำ — ไม่ได้รับ XP เพิ่ม)</span>';
    if (nextStep !== null) msg += ' <button class="btn btn-sm btn-check" id="nextStepBtn" type="button">ไปภารกิจ ' + (nextStep + 1) + ' →</button>';
    else if (lvId < LEVELS.length) msg += ' <button class="btn btn-sm btn-check" id="nextLevelBtn" type="button">ไปด่าน ' + (lvId + 1) + ' →</button>';
    setFeedback('ok', msg);
    const ns = $('nextStepBtn'); if (ns) ns.onclick = () => selectStep(nextStep);
    const nl = $('nextLevelBtn'); if (nl) nl.onclick = () => selectLevel(lvId + 1);
    if (levelJustDone) {
      const finished = lvId === LEVELS.length;
      showModal({
        icon: finished ? '🏆' : '🎉',
        title: finished ? 'สำเร็จภารกิจสุดท้าย!' : 'ผ่านด่าน ' + lvId + '!',
        text: '<b class="xp-gain">+' + XP_PER_LEVEL + ' XP</b><br>' + (finished
          ? 'ยินดีด้วย! คุณผ่านครบทั้ง 10 ด่าน ได้ ' + totalXP() + ' XP — หุ่นยนต์พร้อมสำรวจดาวเคราะห์แล้ว 🚀'
          : 'ปลดล็อกด่าน ' + (lvId + 1) + ': ' + esc(levelById(lvId + 1).title)),
        okText: finished ? 'เยี่ยม!' : 'ไปด่านถัดไป →',
        cancelText: finished ? null : 'อยู่ด่านนี้ต่อ',
        onOk: () => { if (!finished) selectLevel(lvId + 1); },
      });
    }
  }

  function checkQuiz() {
    const step = curStep();
    if (!step.analysis) return;
    let correct = 0;
    step.analysis.forEach((q, qi) => {
      const fs = el.quizBody.querySelector('[data-q="' + qi + '"]');
      const chosen = fs.querySelector('input:checked');
      const ex = fs.querySelector('.quiz-explain');
      fs.classList.remove('right', 'wrong');
      if (chosen && Number(chosen.value) === q.answer) {
        correct++;
        fs.classList.add('right');
        ex.innerHTML = '✅ ' + esc(q.explain);
      } else {
        fs.classList.add('wrong');
        ex.innerHTML = chosen ? '❌ ยังไม่ถูก ลองอ่านสถานการณ์และบทเรียนอีกครั้ง' : '⚠️ ยังไม่ได้เลือกคำตอบ';
      }
    });
    const k = key(cur.level, cur.step);
    if (correct === step.analysis.length) {
      progress.analysis[k] = true;
      saveProgress();
      setFeedback('ok', '✅ <b>วิเคราะห์ถูกครบ ' + correct + ' / ' + step.analysis.length + ' ข้อ</b> — ต่อไปเขียน Algorithm เป็นโค้ด แล้วทดสอบด้วยข้อมูลหลายแบบ');
    } else {
      setFeedback('bad', '❌ <b>วิเคราะห์ถูก ' + correct + ' / ' + step.analysis.length + ' ข้อ</b> — แก้ข้อที่มีกรอบสีแดงแล้วตรวจอีกครั้ง');
    }
    renderAnalysisState();
  }

  // ---------- การนำทาง ----------
  function selectLevel(id) {
    if (!isLevelUnlocked(id)) return;
    saveCode();
    cur.level = id;
    // ไปที่ขั้นแรกที่ยังไม่ผ่าน
    const lv = levelById(id);
    let s = lv.steps.findIndex((_, i) => !isStepDone(id, i));
    cur.step = s === -1 ? 0 : s;
    progress.current = { level: cur.level, step: cur.step };
    saveProgress();
    renderAll();
    if (window.innerWidth < 900) el.lessonCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function selectStep(i) {
    if (!isStepUnlocked(cur.level, i)) return;
    saveCode();
    cur.step = i;
    progress.current = { level: cur.level, step: cur.step };
    saveProgress();
    renderAll();
  }

  // ---------- เหตุการณ์ ----------
  el.runBtn.addEventListener('click', runCode);
  el.checkBtn.addEventListener('click', checkAnswer);
  el.quizCheckBtn.addEventListener('click', checkQuiz);
  function nextHint() {
    const step = curStep();
    const k = key(cur.level, cur.step);
    progress.hints[k] = Math.min(step.hints.length, (progress.hints[k] || 0) + 1);
    saveProgress();
    renderHints(false);
    el.hintCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  el.hintBtn.addEventListener('click', nextHint);
  el.solutionBtn.addEventListener('click', () => {
    el.solutionBox.textContent = curStep().solution;
    el.solutionBox.classList.toggle('hidden');
  });
  el.resetCodeBtn.addEventListener('click', () => {
    showModal({
      icon: '🧹', title: 'ล้างโค้ดใน editor?', text: 'โค้ดที่เขียนไว้ในภารกิจนี้จะถูกลบ',
      okText: 'ล้างโค้ด', cancelText: 'ยกเลิก',
      onOk: () => { el.code.value = ''; saveCode(); updateEditorMeta(); renderCompare(); },
    });
  });
  el.resetBtn.addEventListener('click', () => {
    showModal({
      icon: '⚠️', title: 'รีเซ็ตความคืบหน้าทั้งหมด?',
      text: 'XP, ด่านที่ผ่าน และโค้ดที่บันทึกไว้ทั้งหมดจะถูกลบ <b>และกู้คืนไม่ได้</b>',
      okText: 'ใช่ รีเซ็ตเลย', cancelText: 'ยกเลิก',
      onOk: () => {
        progress = emptyProgress();
        saveProgress();
        cur = { level: 1, step: 0 };
        renderAll();
        toast('รีเซ็ตความคืบหน้าแล้ว');
      },
    });
  });
  el.code.addEventListener('input', () => { updateEditorMeta(); clearTimeout(el.code._t); el.code._t = setTimeout(() => { saveCode(); renderCompare(); }, 400); });
  el.code.addEventListener('scroll', () => { el.gutter.scrollTop = el.code.scrollTop; });
  el.code.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const s = el.code.selectionStart, en = el.code.selectionEnd;
      el.code.value = el.code.value.slice(0, s) + '  ' + el.code.value.slice(en);
      el.code.selectionStart = el.code.selectionEnd = s + 2;
      updateEditorMeta();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runCode();
    } else if (e.key === 'Enter') {
      // คงระยะย่อหน้าเดิม
      const s = el.code.selectionStart;
      const lineStart = el.code.value.lastIndexOf('\n', s - 1) + 1;
      const indent = (el.code.value.slice(lineStart, s).match(/^\s*/) || [''])[0];
      const extra = /[{(]\s*$/.test(el.code.value.slice(lineStart, s)) ? '  ' : '';
      if (indent || extra) {
        e.preventDefault();
        const ins = '\n' + indent + extra;
        el.code.value = el.code.value.slice(0, s) + ins + el.code.value.slice(el.code.selectionEnd);
        el.code.selectionStart = el.code.selectionEnd = s + ins.length;
        updateEditorMeta();
      }
    }
  });

  // สำหรับสคริปต์ทดสอบอัตโนมัติ (อ่านอย่างเดียว ไม่ใช่ API ให้นักเรียน)
  window.__jcq = { getState: () => ({ cur: Object.assign({}, cur), xp: totalXP(), progress: JSON.parse(JSON.stringify(progress)), busy }) };

  renderAll();
})();
