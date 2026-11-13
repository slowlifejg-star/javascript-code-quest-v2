/*
 * worker.js — Sandbox สำหรับรันโค้ดของนักเรียน
 * --------------------------------------------------
 * - ทำงานใน Web Worker แยกจากหน้าเว็บหลัก (ไม่มี DOM, ไม่มี localStorage)
 * - หน้าเว็บหลักจะสร้าง Worker ใหม่ทุกครั้งที่รัน และ terminate() ทิ้งเสมอ
 *   (รวมถึงเมื่อเกินเวลา เช่น ลูปไม่รู้จบ)
 * - ตัด API เครือข่าย/การโหลดสคริปต์ออกก่อนรันโค้ดนักเรียน
 * - จำกัดจำนวนบรรทัด output และจำนวนคำสั่งหุ่นยนต์
 */
'use strict';

const MAX_LOG_LINES = 200;
const MAX_LOG_CHARS = 500;
const MAX_ROBOT_ACTIONS = 1000;

// เก็บช่องทางส่งผลลัพธ์ไว้ใน closure ก่อนล็อก (โค้ดนักเรียนเข้าถึงไม่ได้)
const sendResult = self.postMessage.bind(self);

// ---------- ล็อก API ที่ไม่จำเป็น/อันตราย ----------
(function lockDown() {
  const blocked = [
    'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts',
    'indexedDB', 'caches', 'BroadcastChannel', 'Worker', 'SharedWorker',
    'WebTransport', 'RTCPeerConnection', 'Request', 'Response', 'postMessage',
    'navigator', 'location', 'open', 'close', 'requestFileSystem',
  ];
  for (const name of blocked) {
    // ลบออกจากทุกชั้นของ prototype chain
    for (let obj = self; obj; obj = Object.getPrototypeOf(obj)) {
      try {
        if (Object.prototype.hasOwnProperty.call(obj, name)) delete obj[name];
      } catch (_) { /* ignore */ }
    }
    try {
      Object.defineProperty(self, name, { value: undefined, writable: false, configurable: false });
    } catch (_) {
      try { self[name] = undefined; } catch (__) { /* ignore */ }
    }
  }
})();

// ตัวแปรที่จะถูก "บัง" (shadow) เป็น undefined ภายในโค้ดนักเรียน
const SHADOWED = ['self', 'globalThis', 'onmessage', 'postMessage', 'importScripts',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'indexedDB', 'caches', 'navigator', 'location', 'close'];

const ROBOT_API = ['console', 'move', 'jump', 'isBlocked', 'alarm'];

function formatValue(v, depth) {
  depth = depth || 0;
  try {
    if (typeof v === 'string') return depth === 0 ? v : JSON.stringify(v);
    if (typeof v === 'number' || typeof v === 'boolean' || v === null || v === undefined) return String(v);
    if (typeof v === 'function') return '[function]';
    if (Array.isArray(v)) {
      if (depth > 2) return '[...]';
      return '[' + v.slice(0, 50).map((x) => formatValue(x, depth + 1)).join(', ') + (v.length > 50 ? ', ...' : '') + ']';
    }
    if (typeof v === 'object') {
      if (depth > 2) return '{...}';
      return '{ ' + Object.keys(v).slice(0, 20).map((k) => k + ': ' + formatValue(v[k], depth + 1)).join(', ') + ' }';
    }
    return String(v);
  } catch (_) {
    return '[ค่าที่แสดงผลไม่ได้]';
  }
}

// แปลงค่าให้ส่งข้าม Worker ได้อย่างปลอดภัย (เฉพาะชนิดข้อมูลพื้นฐาน)
function sanitize(v, depth) {
  depth = depth || 0;
  if (v === null || v === undefined) return v;
  const t = typeof v;
  if (t === 'number' || t === 'boolean') return v;
  if (t === 'string') return v.slice(0, 1000);
  if (depth > 3) return '[ซ้อนลึกเกินไป]';
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => sanitize(x, depth + 1));
  if (t === 'object') {
    const out = {};
    for (const k of Object.keys(v).slice(0, 50)) out[k] = sanitize(v[k], depth + 1);
    return out;
  }
  return '[' + t + ']';
}

// สัญญาณภายในสำหรับหยุดการทำงาน (เช่น หุ่นยนต์ชนหิน)
function StopSignal(type, message) { this.type = type; this.message = message; }

self.onmessage = function (event) {
  self.onmessage = null; // รับงานเพียงครั้งเดียว
  const job = event.data || {};
  const code = String(job.code || '');
  const inputs = job.inputs || {};
  const outputs = Array.isArray(job.outputs) ? job.outputs.filter((n) => /^[A-Za-z_$][\w$]*$/.test(n)) : [];
  const world = job.world || null;

  const logs = [];
  const events = [];
  let truncated = false;
  let pos = world ? (world.start || 0) : 0;
  let stopped = null; // StopSignal ที่เกิดขึ้น (นักเรียน try/catch กลืนไม่ได้)

  function guard() {
    if (stopped) throw stopped;
  }
  function stop(type, message) {
    stopped = new StopSignal(type, message);
    throw stopped;
  }
  function record(ev) {
    if (events.length >= MAX_ROBOT_ACTIONS) {
      stop('limit', 'หุ่นยนต์ได้รับคำสั่งเกิน ' + MAX_ROBOT_ACTIONS + ' ครั้ง — อาจมีลูปที่ไม่หยุด');
    }
    events.push(ev);
  }
  function needWorld(cmd) {
    if (!world) stop('noworld', 'ด่านนี้ยังไม่มีเส้นทางให้หุ่นยนต์ ไม่ต้องใช้คำสั่ง ' + cmd + '()');
  }
  function cellAt(i) { return world.cells[i]; }

  function step(kind) {
    guard();
    needWorld(kind);
    const next = pos + 1;
    if (next >= world.cells.length) {
      record({ type: 'fall', pos: pos });
      stop('fall', 'หุ่นยนต์เดินเลยขอบเส้นทาง! (อยู่ช่อง ' + pos + ' แล้วสั่ง ' + kind + '() อีก)');
    }
    const blocked = cellAt(next) === 'rock';
    if (kind === 'move' && blocked) {
      record({ type: 'crash', pos: next });
      stop('crash', 'หุ่นยนต์ชนหินที่ช่อง ' + next + '! ควรตรวจด้วย isBlocked() แล้วใช้ jump()');
    }
    if (kind === 'jump' && !blocked) {
      record({ type: 'badjump', pos: pos });
      stop('badjump', 'สั่ง jump() ที่ช่อง ' + pos + ' แต่ข้างหน้าไม่มีหิน — jump() ใช้เฉพาะเมื่อมีสิ่งกีดขวาง');
    }
    pos = next;
    record({ type: kind, pos: pos });
  }

  const api = {
    move: function move() { step('move'); },
    jump: function jump() { step('jump'); },
    isBlocked: function isBlocked() {
      guard();
      needWorld('isBlocked');
      return cellAt(pos + 1) === 'rock';
    },
    alarm: function alarm() {
      guard();
      needWorld('alarm');
      record({ type: 'alarm', pos: pos });
    },
  };
  function log() {
    if (logs.length >= MAX_LOG_LINES) { truncated = true; return; }
    const parts = [];
    for (let i = 0; i < arguments.length; i++) parts.push(formatValue(arguments[i]));
    let line = parts.join(' ');
    if (line.length > MAX_LOG_CHARS) { line = line.slice(0, MAX_LOG_CHARS) + ' …'; truncated = true; }
    logs.push(line);
  }
  const fakeConsole = Object.freeze({ log: log, info: log, warn: log, error: log });
  Object.values(api).forEach(Object.freeze);

  const inputNames = Object.keys(inputs).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
  const paramNames = ROBOT_API.concat(inputNames, SHADOWED);
  const paramValues = [fakeConsole, api.move, api.jump, api.isBlocked, api.alarm]
    .concat(inputNames.map((n) => inputs[n]), SHADOWED.map(() => undefined));

  const capture = '\n;return {' + outputs.map((n) =>
    JSON.stringify(n) + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined)').join(', ') + '};';

  let vars = {};
  let error = null;
  let fn = null;
  try {
    fn = new Function(...paramNames, '"use strict";\n' + code + capture);
  } catch (e) {
    error = { type: 'syntax', name: String(e && e.name), message: String(e && e.message) };
  }
  if (fn) {
    try {
      const result = fn.apply(undefined, paramValues);
      if (stopped) throw stopped; // ถูกกลืนด้วย try/catch ในโค้ดนักเรียน
      vars = result && typeof result === 'object' ? result : {};
    } catch (e) {
      if (stopped) {
        error = { type: stopped.type, message: stopped.message };
      } else {
        let name = 'Error', message = '';
        try { name = String(e && e.name); message = String(e && e.message); } catch (_) { message = String(e); }
        error = { type: 'runtime', name: name, message: message };
      }
    }
  }

  let safeVars = {};
  try { safeVars = sanitize(vars); } catch (_) { safeVars = {}; }
  sendResult({
    vars: safeVars,
    logs: logs,
    events: events,
    pos: pos,
    error: error,
    truncated: truncated,
  });
};
