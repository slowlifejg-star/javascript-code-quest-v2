/*
 * challenges.js — บทเรียนและภารกิจเขียนโค้ดอิสระ 10 ด่าน × 3 ภารกิจ (รวม 30 ภารกิจ)
 * ------------------------------------------------------------------------------
 * แนวคิด V2: นักเรียนเขียนโค้ดเองทั้งหมดจาก editor ว่าง (ไม่มีโค้ดเริ่มต้น / ไม่มีเติมคำในช่องว่าง)
 *   ภารกิจ 1 = นำแนวคิดไปใช้เอง (Apply)
 *   ภารกิจ 2 = ปรับแนวคิดกับสถานการณ์ที่เปลี่ยนไป (Adapt)
 *   ภารกิจ 3 = วิเคราะห์และแก้ปัญหาที่ซับซ้อนขึ้น (Analyze)
 *
 * โครงสร้างแต่ละภารกิจ (step):
 *   scenario     : สถานการณ์
 *   requirements : ข้อกำหนด (array ของข้อความ)
 *   task         : งานที่ต้องเขียนโค้ด
 *   tests        : ชุดทดสอบหลายกรณี (กรณีแรก = ค่าตัวอย่างตอน "ทดลองรัน")
 *   outputs      : ชื่อตัวแปรที่ระบบจะอ่านค่าหลังรัน
 *   expect       : (inputs) => ค่าที่ถูกต้อง ({ ชื่อตัวแปร: ค่า, $pos: ตำแหน่งหุ่นยนต์ })
 *                  → ใช้ทั้งตรวจคำตอบ และสร้างตาราง "พฤติกรรมที่คาดหวัง" อัตโนมัติ
 *   world        : (inputs) => เส้นทางหุ่นยนต์ { cells, labels, start, goal }
 *   check        : (result, inputs) => ข้อความผิดพลาด | null (ตรวจพฤติกรรมเพิ่มเติม)
 *   source       : (code) => ข้อความผิดพลาด | null (บังคับวิธีคิด เช่น ต้องใช้ลูป)
 *   analysis     : (ด่าน 10) คำถามวิเคราะห์ที่ต้องตอบถูกก่อนส่งโค้ด
 *   hints        : คำใบ้แบบค่อย ๆ เปิด (ไม่เฉลยทันที)
 *   solution     : เฉลย (เปิดได้หลังดูคำใบ้ครบ และลองตรวจแล้วอย่างน้อย 1 ครั้ง)
 * ฟังก์ชันเหล่านี้ทำงานกับ "ข้อมูลผลลัพธ์" เท่านั้น ไม่เคยรันโค้ดนักเรียนในหน้าหลัก
 */
'use strict';

// ---------- ตัวช่วยสร้างเส้นทาง ----------
function lineTrack(goal, start, extra) {
  start = start || 0;
  extra = extra === undefined ? 2 : extra;
  const cells = [], labels = [];
  for (let i = 0; i <= goal + extra; i++) {
    cells.push(i === goal ? 'goal' : i === start ? 'start' : '');
    labels.push('');
  }
  return { cells, labels, start, goal };
}
function rockTrack(rocks, goal) {
  const cells = [], labels = [];
  for (let i = 0; i <= goal; i++) {
    cells.push(i === 0 ? 'start' : i === goal ? 'goal' : rocks.includes(i) ? 'rock' : '');
    labels.push('');
  }
  return { cells, labels, start: 0, goal };
}
function roomTrack(temps) {
  const cells = ['start'], labels = [''];
  temps.forEach((t) => { cells.push('room'); labels.push(t + '°'); });
  return { cells, labels, start: 0, goal: temps.length };
}
function energyTrack(map) {
  const cells = ['start'], labels = [''];
  map.forEach((e) => { cells.push('energy'); labels.push((e >= 0 ? '+' : '') + e); });
  return { cells, labels, start: 0, goal: map.length };
}
function stripComments(code) {
  return String(code).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}
function countMatches(code, re) {
  return (stripComments(code).match(re) || []).length;
}
function hasLoop(code) {
  return /\b(for|while)\b/.test(stripComments(code));
}
const NO_LOOP = (c) => (hasLoop(c) ? 'ด่านนี้ให้เขียนคำสั่งซ้ำเองทีละบรรทัด (ลูปจะได้เรียนในด่าน 6)' : null);
const NEED_FOR_ONE_MOVE = (c) => (!/\b(for|while)\b/.test(stripComments(c)) ? 'ภารกิจนี้ต้องใช้ลูป for'
  : countMatches(c, /\bmove\s*\(/g) > 1 ? 'เขียน move() ในโค้ดได้เพียงครั้งเดียว แล้วให้ลูปทำซ้ำแทน' : null);

// คำตอบอ้างอิงของด่าน 10
function exploreReference(energy, map) {
  let explored = 0, collected = 0, storms = 0;
  for (let i = 0; i < map.length; i++) {
    if (energy < 2) break;
    energy = energy - 2;
    energy = energy + map[i];
    explored = explored + 1;
    if (map[i] > 0) collected = collected + map[i];
    if (map[i] < 0) storms = storms + 1;
  }
  return { explored, energy, collected, storms };
}

const LEVELS = [
  // ================= ด่าน 1 =================
  {
    id: 1, icon: '🔋', title: 'แบตเตอรี่หุ่นยนต์', concept: 'ตัวดำเนินการเปรียบเทียบ', kind: 'logic',
    lesson: `
      <p>หุ่นยนต์ต้อง <b>ตัดสินใจ</b> จากข้อมูล เช่น "แบตเตอรี่พอไหม?" คำตอบมี 2 แบบ คือ
      <code>true</code> (จริง) หรือ <code>false</code> (เท็จ) เรียกว่าค่า <b>boolean</b></p>
      <p><b>ตัวแปร</b> คือกล่องเก็บค่า สร้างด้วย <code>let</code> เช่น <code>let speed = 5;</code>
      และเก็บผลการคำนวณได้ เช่น <code>let total = speed * 2;</code></p>
      <p><b>ตัวดำเนินการเปรียบเทียบ</b> ใช้ถามคำถามกับตัวเลข แล้วได้ผลเป็น true/false</p>
      <table class="op-table">
        <tr><th>เครื่องหมาย</th><th>ความหมาย</th><th>ตัวอย่าง (speed = 5)</th></tr>
        <tr><td><code>&gt;</code></td><td>มากกว่า</td><td><code>speed &gt; 3</code> → true</td></tr>
        <tr><td><code>&gt;=</code></td><td>มากกว่าหรือเท่ากับ</td><td><code>speed &gt;= 5</code> → true</td></tr>
        <tr><td><code>&lt;</code></td><td>น้อยกว่า</td><td><code>speed &lt; 5</code> → false</td></tr>
        <tr><td><code>&lt;=</code></td><td>น้อยกว่าหรือเท่ากับ</td><td><code>speed &lt;= 4</code> → false</td></tr>
        <tr><td><code>===</code></td><td>เท่ากับ</td><td><code>speed === 5</code> → true</td></tr>
        <tr><td><code>!==</code></td><td>ไม่เท่ากับ</td><td><code>speed !== 0</code> → true</td></tr>
      </table>
      <p>ตัวอย่าง: <code>let isFast = speed &gt; 3;</code> → ตัวแปร isFast เก็บค่า true</p>
      <p>⚠️ <code>=</code> ตัวเดียวคือ "ใส่ค่าลงตัวแปร" ส่วน <code>===</code> คือ "ถามว่าเท่ากันไหม"</p>
      <p>📥 ในภารกิจ ระบบจะ <b>เตรียมตัวแปร Input ไว้ให้</b> (เช่น <code>battery</code>) และ <b>เปลี่ยนค่าหลายแบบ</b> ตอนตรวจ
      ดังนั้นห้ามพิมพ์คำตอบตายตัว และไม่ต้องสร้างตัวแปร Input ซ้ำ</p>
      <p>🖨️ <code>console.log(ค่า)</code> คือคำสั่งแสดงข้อความในช่องผลลัพธ์ ใช้ตรวจดูค่าได้</p>`,
    steps: [
      {
        title: 'พร้อมเริ่มงานไหม?',
        scenario: 'หุ่นยนต์ส่งของจะเริ่มทำงานได้ก็ต่อเมื่อแบตเตอรี่เพียงพอ',
        requirements: ['Input: <code>battery</code> (0–100)', 'เริ่มงานได้เมื่อแบตเตอรี่ <b>อย่างน้อย 20</b> (20 ก็เริ่มได้)'],
        task: 'สร้างตัวแปร <code>canStart</code> ที่เป็น <code>true</code> เมื่อเริ่มงานได้ และ <code>false</code> เมื่อเริ่มไม่ได้',
        outputs: ['canStart'],
        tests: [{ battery: 50 }, { battery: 20 }, { battery: 19 }, { battery: 0 }, { battery: 100 }],
        expect: (i) => ({ canStart: i.battery >= 20 }),
        hints: [
          'เริ่มด้วยการสร้างตัวแปร: let canStart = ... ;',
          'ค่าทางขวาของ = ควรเป็น "คำถาม" ที่เปรียบเทียบ battery กับ 20',
          '"อย่างน้อย 20" รวม 20 ด้วย ลองดูตารางในบทเรียนว่าเครื่องหมายไหนรวม "เท่ากับ"',
        ],
        solution: 'let canStart = battery >= 20;\nconsole.log("เริ่มงานได้ไหม:", canStart);',
      },
      {
        title: 'งานใช้พลังงานไม่เท่ากัน',
        scenario: 'คราวนี้แต่ละงานใช้พลังงานไม่เท่ากัน หุ่นยนต์ต้องเทียบแบตเตอรี่กับพลังงานที่งานต้องใช้',
        requirements: ['Input: <code>battery</code> และ <code>cost</code> (พลังงานที่งานใช้)',
          'ทำงานได้เมื่อ battery <b>มากกว่าหรือเท่ากับ</b> cost',
          'งาน "พอดีเป๊ะ" เมื่อ battery <b>เท่ากับ</b> cost'],
        task: 'สร้างตัวแปร <code>canDoTask</code> และ <code>isExact</code> ตามข้อกำหนด',
        outputs: ['canDoTask', 'isExact'],
        tests: [{ battery: 50, cost: 30 }, { battery: 30, cost: 30 }, { battery: 10, cost: 25 }, { battery: 0, cost: 0 }, { battery: 99, cost: 100 }],
        expect: (i) => ({ canDoTask: i.battery >= i.cost, isExact: i.battery === i.cost }),
        hints: [
          'ภารกิจนี้มี 2 ตัวแปรผลลัพธ์ → ต้องมี let 2 บรรทัด',
          'เปรียบเทียบตัวแปรกับตัวแปรได้ เช่น a >= b',
          '"เท่ากับ" ใช้ === ไม่ใช่ =',
        ],
        solution: 'let canDoTask = battery >= cost;\nlet isExact = battery === cost;\nconsole.log(canDoTask, isExact);',
      },
      {
        title: 'ต้องเหลือพลังงานสำรอง',
        scenario: 'เพื่อความปลอดภัย หลังทำงานเสร็จหุ่นยนต์ต้องมีพลังงานเหลือ <b>อย่างน้อย 10</b> เสมอ เพื่อเดินกลับฐานได้',
        requirements: ['Input: <code>battery</code> และ <code>cost</code>',
          '<code>remaining</code> = พลังงานที่เหลือหลังทำงาน',
          '<code>canDoTask</code> = true เมื่อพลังงานที่เหลือ อย่างน้อย 10'],
        task: 'วิเคราะห์ว่าต้องคำนวณอะไรก่อน แล้วสร้างตัวแปร <code>remaining</code> และ <code>canDoTask</code>',
        outputs: ['remaining', 'canDoTask'],
        tests: [{ battery: 50, cost: 30 }, { battery: 40, cost: 30 }, { battery: 39, cost: 30 }, { battery: 15, cost: 20 }, { battery: 100, cost: 0 }],
        expect: (i) => ({ remaining: i.battery - i.cost, canDoTask: i.battery - i.cost >= 10 }),
        hints: [
          'แบ่งเป็น 2 ขั้น: (1) คำนวณพลังงานที่เหลือ (2) ตรวจว่าเหลือพอไหม',
          'พลังงานที่เหลือ = แบตเตอรี่ ลบ พลังงานที่ใช้',
          'ขั้นที่ 2 นำตัวแปร remaining ไปเปรียบเทียบกับ 10',
        ],
        solution: 'let remaining = battery - cost;\nlet canDoTask = remaining >= 10;\nconsole.log("เหลือ", remaining, "ทำได้ไหม", canDoTask);',
      },
    ],
  },

  // ================= ด่าน 2 =================
  {
    id: 2, icon: '🔑', title: 'สิทธิ์ของหุ่นยนต์', concept: 'ตัวดำเนินการตรรกะ AND (&&) และ OR (||)', kind: 'logic',
    lesson: `
      <p>บางครั้งต้องตรวจ <b>หลายเงื่อนไขพร้อมกัน</b> เราจึงรวมค่า true/false ด้วยตัวดำเนินการตรรกะ</p>
      <p><b>AND <code>&amp;&amp;</code></b> = "และ" → true เมื่อ <b>ทั้งสองฝั่ง</b> เป็น true เท่านั้น<br>
      <b>OR <code>||</code></b> = "หรือ" → true เมื่อ <b>อย่างน้อยหนึ่งฝั่ง</b> เป็น true</p>
      <table class="op-table">
        <tr><th>A</th><th>B</th><th>A &amp;&amp; B</th><th>A || B</th></tr>
        <tr><td>true</td><td>true</td><td>true</td><td>true</td></tr>
        <tr><td>true</td><td>false</td><td>false</td><td>true</td></tr>
        <tr><td>false</td><td>true</td><td>false</td><td>true</td></tr>
        <tr><td>false</td><td>false</td><td>false</td><td>false</td></tr>
      </table>
      <p>ตัวอย่าง: ไฟจะติดเมื่อ "มืด <b>และ</b> มีคนอยู่" → <code>let lightOn = isDark &amp;&amp; hasPerson;</code></p>
      <p>ใช้วงเล็บ <code>( )</code> จัดกลุ่มเงื่อนไขได้เหมือนคณิตศาสตร์ เช่น <code>a &amp;&amp; (b || c)</code></p>`,
    steps: [
      {
        title: 'เข้าห้องแล็บ',
        scenario: 'ห้องแล็บหุ่นยนต์มีระบบรักษาความปลอดภัย',
        requirements: ['Input: <code>hasKeyCard</code>, <code>isTrained</code> (true/false)', 'เข้าได้เมื่อ <b>มีบัตร และ ผ่านการฝึก</b>'],
        task: 'สร้างตัวแปร <code>canEnterLab</code>',
        outputs: ['canEnterLab'],
        tests: [{ hasKeyCard: true, isTrained: true }, { hasKeyCard: true, isTrained: false }, { hasKeyCard: false, isTrained: true }, { hasKeyCard: false, isTrained: false }],
        expect: (i) => ({ canEnterLab: i.hasKeyCard && i.isTrained }),
        hints: ['ต้องจริง "ทั้งสองอย่าง" → ใช้ตัวดำเนินการ "และ"', 'ดูตารางในบทเรียน: "และ" เขียนอย่างไรใน JavaScript?'],
        solution: 'let canEnterLab = hasKeyCard && isTrained;',
      },
      {
        title: 'เปิดประตูฉุกเฉิน',
        scenario: 'ประตูฉุกเฉินต่างจากห้องแล็บ: ขอแค่มีสิทธิ์ <b>อย่างใดอย่างหนึ่ง</b> ก็เปิดได้',
        requirements: ['Input: <code>isAdmin</code>, <code>isOwner</code>, <code>isEmergency</code>', 'เปิดได้เมื่อเป็นผู้ดูแล <b>หรือ</b> เจ้าของ <b>หรือ</b> เกิดเหตุฉุกเฉิน'],
        task: 'สร้างตัวแปร <code>canOpenDoor</code>',
        outputs: ['canOpenDoor'],
        tests: [
          { isAdmin: false, isOwner: false, isEmergency: true }, { isAdmin: true, isOwner: false, isEmergency: false },
          { isAdmin: false, isOwner: true, isEmergency: false }, { isAdmin: false, isOwner: false, isEmergency: false },
          { isAdmin: true, isOwner: true, isEmergency: true },
        ],
        expect: (i) => ({ canOpenDoor: i.isAdmin || i.isOwner || i.isEmergency }),
        hints: ['"อย่างใดอย่างหนึ่ง" → ใช้ "หรือ"', 'เชื่อมได้มากกว่า 2 เงื่อนไข เช่น a || b || c'],
        solution: 'let canOpenDoor = isAdmin || isOwner || isEmergency;',
      },
      {
        title: 'ใช้เครื่องมืออันตราย',
        scenario: 'เครื่องตัดเลเซอร์อันตราย หุ่นยนต์ต้องมีพลังงานพอ และต้องมีสิทธิ์',
        requirements: ['Input: <code>battery</code>, <code>isAdmin</code>, <code>isTrained</code>',
          'แบตเตอรี่ต้อง <b>อย่างน้อย 30</b>', '<b>และ</b> ต้องเป็นผู้ดูแล <b>หรือ</b> ผ่านการฝึก'],
        task: 'วิเคราะห์ว่าเงื่อนไขไหนต้องจัดกลุ่มกัน แล้วสร้างตัวแปร <code>canUseTool</code>',
        outputs: ['canUseTool'],
        tests: [
          { battery: 50, isAdmin: true, isTrained: false }, { battery: 50, isAdmin: false, isTrained: true },
          { battery: 50, isAdmin: false, isTrained: false }, { battery: 29, isAdmin: true, isTrained: true },
          { battery: 30, isAdmin: false, isTrained: true }, { battery: 10, isAdmin: true, isTrained: false },
        ],
        expect: (i) => ({ canUseTool: i.battery >= 30 && (i.isAdmin || i.isTrained) }),
        hints: [
          'แยกเป็น 2 ส่วน: ส่วนพลังงาน และ ส่วนสิทธิ์',
          'ส่วนสิทธิ์มี "หรือ" อยู่ข้างใน → ควรอยู่ในวงเล็บ',
          'ลองทดสอบในใจ: battery = 10, isAdmin = true ต้องได้ false — ถ้าไม่ใส่วงเล็บจะได้อะไร?',
        ],
        solution: 'let canUseTool = battery >= 30 && (isAdmin || isTrained);',
      },
    ],
  },

  // ================= ด่าน 3 =================
  {
    id: 3, icon: '🛡️', title: 'ความปลอดภัยของหุ่นยนต์', concept: 'NOT (!) + รวมการเปรียบเทียบกับ AND', kind: 'logic',
    lesson: `
      <p><b>NOT <code>!</code></b> = "ไม่" → กลับค่า true เป็น false และ false เป็น true</p>
      <pre><code>!true      // false
!false     // true
!isLocked  // "ไม่ได้ล็อก"</code></pre>
      <p>นำมารวมกับสิ่งที่เรียนแล้วได้ เช่น "ประตูเปิดได้เมื่อ ไม่ได้ล็อก และ มีไฟฟ้าอย่างน้อย 5"</p>
      <pre><code>let canOpen = !isLocked &amp;&amp; power &gt;= 5;</code></pre>
      <p>ใส่ <code>!</code> หน้าวงเล็บได้ด้วย: <code>!(a || b)</code> = "ไม่ใช่ทั้ง a และ b"</p>
      <p>💡 อ่านโค้ดออกเสียงเป็นภาษาไทยทีละส่วน จะช่วยให้เขียนเงื่อนไขถูก</p>`,
    steps: [
      {
        title: 'เดินได้อย่างปลอดภัย',
        scenario: 'มอเตอร์หุ่นยนต์อาจร้อนเกินไปถ้าใช้งานนาน',
        requirements: ['Input: <code>battery</code>, <code>isOverheated</code>', 'เดินได้เมื่อแบตเตอรี่ <b>อย่างน้อย 20</b> และ <b>ไม่</b>ร้อนเกินไป'],
        task: 'สร้างตัวแปร <code>canWalk</code>',
        outputs: ['canWalk'],
        tests: [{ battery: 50, isOverheated: false }, { battery: 50, isOverheated: true }, { battery: 19, isOverheated: false }, { battery: 20, isOverheated: false }, { battery: 5, isOverheated: true }],
        expect: (i) => ({ canWalk: i.battery >= 20 && !i.isOverheated }),
        hints: ['"ไม่ร้อนเกินไป" ใช้ ! หน้าตัวแปร isOverheated', 'มี 2 เงื่อนไขที่ต้องจริงทั้งคู่ → เชื่อมด้วย "และ"'],
        solution: 'let canWalk = battery >= 20 && !isOverheated;',
      },
      {
        title: 'ออกไปตอนฝนตก',
        scenario: 'หุ่นยนต์ไม่กันน้ำ แต่ถ้ามีร่มติดตัวก็ออกไปข้างนอกได้',
        requirements: ['Input: <code>isRaining</code>, <code>hasUmbrella</code>', 'ออกไปได้เมื่อ <b>ฝนไม่ตก</b> หรือ <b>มีร่ม</b>'],
        task: 'สร้างตัวแปร <code>canGoOutside</code>',
        outputs: ['canGoOutside'],
        tests: [{ isRaining: true, hasUmbrella: false }, { isRaining: true, hasUmbrella: true }, { isRaining: false, hasUmbrella: false }, { isRaining: false, hasUmbrella: true }],
        expect: (i) => ({ canGoOutside: !i.isRaining || i.hasUmbrella }),
        hints: ['ครั้งนี้เชื่อมด้วย "หรือ" ไม่ใช่ "และ"', '"ฝนไม่ตก" เขียนด้วย ! นำหน้า isRaining'],
        solution: 'let canGoOutside = !isRaining || hasUmbrella;',
      },
      {
        title: 'ภารกิจนอกอาคาร',
        scenario: 'ศูนย์ควบคุมต้องการกฎความปลอดภัยสำหรับส่งหุ่นยนต์ออกไปซ่อมเสาสัญญาณ',
        requirements: ['Input: <code>battery</code>, <code>temperature</code>, <code>isStorm</code>',
          'แบตเตอรี่ <b>อย่างน้อย 50</b>', 'อุณหภูมิ <b>ตั้งแต่ 0 แต่ต่ำกว่า 40</b> องศา', '<b>ไม่มี</b>พายุ'],
        task: 'วิเคราะห์ว่ามีเงื่อนไขย่อยกี่ข้อ (ช่วงอุณหภูมิต้องใช้ 2 การเปรียบเทียบ) แล้วสร้างตัวแปร <code>isSafe</code>',
        outputs: ['isSafe'],
        tests: [
          { battery: 80, temperature: 25, isStorm: false }, { battery: 80, temperature: 25, isStorm: true },
          { battery: 80, temperature: 40, isStorm: false }, { battery: 80, temperature: -1, isStorm: false },
          { battery: 49, temperature: 25, isStorm: false }, { battery: 50, temperature: 0, isStorm: false },
        ],
        expect: (i) => ({ isSafe: i.battery >= 50 && i.temperature >= 0 && i.temperature < 40 && !i.isStorm }),
        hints: [
          'เขียนรายการเงื่อนไขย่อยก่อน: แบต / อุณหภูมิต่ำสุด / อุณหภูมิสูงสุด / พายุ',
          '"ตั้งแต่ 0 แต่ต่ำกว่า 40" = temperature >= 0 และ temperature < 40',
          'ทุกข้อต้องจริงพร้อมกัน → เชื่อมทั้ง 4 ข้อด้วย &&',
        ],
        solution: 'let isSafe = battery >= 50 && temperature >= 0 && temperature < 40 && !isStorm;',
      },
    ],
  },

  // ================= ด่าน 4 =================
  {
    id: 4, icon: '🧠', title: 'หุ่นยนต์ตัดสินใจ', concept: 'if / else / else if', kind: 'logic',
    lesson: `
      <p>เมื่อถามคำถามได้แล้ว ต่อไปคือ <b>ทำสิ่งที่ต่างกันตามคำตอบ</b> ด้วย <code>if / else</code></p>
      <pre><code>if (เงื่อนไข) {
  // ทำเมื่อเงื่อนไขเป็น true
} else {
  // ทำเมื่อเงื่อนไขเป็น false
}</code></pre>
      <p>ตัวอย่าง: เลือกไฟสัญญาณตามความเร็ว</p>
      <pre><code>let light = "";
if (speed &gt; 10) {
  light = "red";
} else {
  light = "green";
}</code></pre>
      <p>ถ้ามีมากกว่า 2 ทางเลือก ใช้ <code>else if</code> คั่นกลาง คอมพิวเตอร์ตรวจ <b>จากบนลงล่าง</b> และทำ <b>เฉพาะทางแรก</b> ที่เงื่อนไขเป็นจริง
      → ลำดับของเงื่อนไขจึงสำคัญมาก</p>
      <p>📝 ข้อความ (string) ต้องอยู่ในเครื่องหมายคำพูด เช่น <code>"red"</code></p>`,
    steps: [
      {
        title: 'ชาร์จหรือทำงาน',
        scenario: 'ทุกเช้าหุ่นยนต์ต้องเลือกว่าจะไปชาร์จแบตหรือเริ่มทำงาน',
        requirements: ['Input: <code>battery</code>', 'ถ้า battery <b>น้อยกว่า 20</b> → <code>"charge"</code>', 'ไม่อย่างนั้น → <code>"work"</code>'],
        task: 'สร้างตัวแปร <code>action</code> แล้วใช้ if/else กำหนดค่าให้ถูกต้อง',
        outputs: ['action'],
        tests: [{ battery: 10 }, { battery: 19 }, { battery: 20 }, { battery: 90 }],
        expect: (i) => ({ action: i.battery < 20 ? 'charge' : 'work' }),
        hints: ['สร้างตัวแปรว่างไว้ก่อน: let action = "";', 'ใน if และ else ให้ใส่ค่าใหม่ลง action (ไม่ต้อง let ซ้ำ)', 'ข้อความต้องอยู่ใน " "'],
        solution: 'let action = "";\nif (battery < 20) {\n  action = "charge";\n} else {\n  action = "work";\n}',
      },
      {
        title: 'ควบคุมความเร็วตามระยะ',
        scenario: 'เซนเซอร์วัดระยะถึงสิ่งกีดขวางข้างหน้า หุ่นยนต์ต้องปรับความเร็วเป็น 3 ระดับ',
        requirements: ['Input: <code>distance</code> (เมตร)', 'น้อยกว่า 3 → <code>"stop"</code>', 'ตั้งแต่ 3 แต่น้อยกว่า 10 → <code>"slow"</code>', 'ตั้งแต่ 10 ขึ้นไป → <code>"go"</code>'],
        task: 'สร้างตัวแปร <code>action</code> ด้วย if / else if / else',
        outputs: ['action'],
        tests: [{ distance: 1 }, { distance: 3 }, { distance: 9.5 }, { distance: 10 }, { distance: 50 }, { distance: 0 }],
        expect: (i) => ({ action: i.distance < 3 ? 'stop' : i.distance < 10 ? 'slow' : 'go' }),
        hints: ['มี 3 ทางเลือก → if, else if, else', 'ถ้าตรวจ distance < 3 ไปก่อนแล้ว ใน else if เหลือแค่ตรวจ distance < 10'],
        solution: 'let action = "";\nif (distance < 3) {\n  action = "stop";\n} else if (distance < 10) {\n  action = "slow";\n} else {\n  action = "go";\n}',
      },
      {
        title: 'จัดลำดับความสำคัญ',
        scenario: 'หุ่นยนต์มีหลายปัญหาพร้อมกันได้ ต้องเลือกทำสิ่งที่ <b>สำคัญที่สุดก่อน</b>',
        requirements: ['Input: <code>battery</code>, <code>hasTask</code>, <code>isOverheated</code>',
          'ลำดับความสำคัญ: 1) ร้อนเกินไป → <code>"cool"</code>', '2) แบตน้อยกว่า 20 → <code>"charge"</code>', '3) มีงาน → <code>"work"</code>', '4) นอกนั้น → <code>"rest"</code>'],
        task: 'วิเคราะห์ว่าเงื่อนไขควรเรียงลำดับอย่างไร แล้วสร้างตัวแปร <code>action</code>',
        outputs: ['action'],
        tests: [
          { battery: 10, hasTask: true, isOverheated: true }, { battery: 10, hasTask: true, isOverheated: false },
          { battery: 80, hasTask: true, isOverheated: false }, { battery: 80, hasTask: false, isOverheated: false },
          { battery: 80, hasTask: false, isOverheated: true }, { battery: 20, hasTask: false, isOverheated: false },
        ],
        expect: (i) => ({ action: i.isOverheated ? 'cool' : i.battery < 20 ? 'charge' : i.hasTask ? 'work' : 'rest' }),
        hints: [
          'มี 4 ทางเลือก → if, else if, else if, else',
          'เงื่อนไขที่สำคัญที่สุดต้องอยู่ "บนสุด" เพราะคอมพิวเตอร์ทำเฉพาะทางแรกที่เป็นจริง',
          'ลองไล่กรณี battery = 10 และร้อนเกินไป: ควรได้ "cool" ไม่ใช่ "charge"',
        ],
        solution: 'let action = "";\nif (isOverheated) {\n  action = "cool";\n} else if (battery < 20) {\n  action = "charge";\n} else if (hasTask) {\n  action = "work";\n} else {\n  action = "rest";\n}',
      },
    ],
  },

  // ================= ด่าน 5 =================
  {
    id: 5, icon: '🦿', title: 'เดินด้วยมือ', concept: 'คำสั่งหุ่นยนต์ move() และการทำงานทีละบรรทัด', kind: 'track',
    lesson: `
      <p>หุ่นยนต์มี <b>คำสั่ง</b> ที่เรียกใช้ได้เลย โดยเขียนชื่อคำสั่งตามด้วย <code>()</code> และ <code>;</code></p>
      <pre><code>move();   // เดินไปข้างหน้า 1 ช่อง</code></pre>
      <p>(<code>console.log(...)</code> ที่ใช้มาตั้งแต่ด่าน 1 ก็เป็นคำสั่งแบบเดียวกัน — คำสั่งแสดงข้อความ)</p>
      <p>คอมพิวเตอร์ทำงาน <b>ทีละบรรทัด จากบนลงล่าง</b> ถ้าอยากให้หุ่นยนต์เดิน 2 ช่องแล้วรายงาน ก็เขียนตามลำดับ:</p>
      <pre><code>move();
move();
console.log("เดินแล้ว 2 ช่อง");</code></pre>
      <p>🎯 ในด่านนี้ให้เขียนคำสั่งซ้ำ <b>เอง</b> (ห้ามใช้ลูป) แล้ว <b>สังเกตจำนวนบรรทัด</b> ที่ต้องเขียน — ด่านต่อไปจะแก้ปัญหาเดียวกันด้วยวิธีที่ฉลาดกว่า!</p>
      <p>⚠️ ถ้าเดินเลยธง 🏁 หรือไม่ถึงธง จะไม่ผ่าน</p>`,
    steps: [
      {
        title: 'ส่งของ 3 ช่อง',
        scenario: 'หุ่นยนต์ต้องส่งกล่องไปยังจุดรับของ 🏁',
        requirements: ['หุ่นยนต์เริ่มที่ช่อง 0', 'จุดรับของอยู่ที่ช่อง 3', 'ห้ามใช้ลูป'],
        task: 'เขียนคำสั่งให้หุ่นยนต์หยุดที่ช่อง 3 พอดี',
        outputs: [], tests: [{}],
        world: () => lineTrack(3), expect: () => ({ $pos: 3 }), source: NO_LOOP,
        hints: ['คำสั่ง move(); ทำให้เดิน 1 ช่อง', 'จากช่อง 0 ไปช่อง 3 ต้องเดินกี่ครั้ง?'],
        solution: 'move();\nmove();\nmove();',
      },
      {
        title: 'เริ่มกลางทาง',
        scenario: 'คราวนี้หุ่นยนต์ไม่ได้เริ่มที่ฐาน แต่เริ่มกลางทาง',
        requirements: ['หุ่นยนต์เริ่มที่ช่อง 2', 'จุดหมายอยู่ที่ช่อง 7', 'เมื่อถึงแล้วให้แสดงข้อความ <code>"ถึงแล้ว"</code>', 'ห้ามใช้ลูป'],
        task: 'เขียนคำสั่งเดินให้ถึงช่อง 7 แล้วใช้ console.log รายงานว่าถึงแล้ว',
        outputs: [], tests: [{}],
        world: () => lineTrack(7, 2), expect: () => ({ $pos: 7 }), source: NO_LOOP,
        check: (r) => (r.logs[r.logs.length - 1] !== 'ถึงแล้ว' ? 'บรรทัดสุดท้ายของผลลัพธ์ต้องเป็นข้อความ "ถึงแล้ว"' : null),
        hints: ['ระยะที่ต้องเดิน = ช่องปลายทาง − ช่องเริ่มต้น', 'console.log ต้องอยู่ "หลัง" คำสั่งเดินทั้งหมด เพราะโค้ดทำงานจากบนลงล่าง'],
        solution: 'move();\nmove();\nmove();\nmove();\nmove();\nconsole.log("ถึงแล้ว");',
      },
      {
        title: 'ภารกิจหลัก: ทางไกล 8 ช่อง',
        scenario: 'คลังสินค้าอยู่ไกล หุ่นยนต์ต้องเดิน 8 ช่อง และรายงานความคืบหน้าระหว่างทาง',
        requirements: ['เริ่มที่ช่อง 0 ปลายทางช่อง 8', 'หลังเดินครบ 4 ช่อง ให้แสดง <code>"ครึ่งทาง"</code>', 'เมื่อถึงช่อง 8 ให้แสดง <code>"ถึงคลังสินค้า"</code>', 'ห้ามใช้ลูป'],
        task: 'วางแผนลำดับคำสั่งให้ถูกต้อง แล้วเขียนเอง — สังเกต <b>จำนวนบรรทัดโค้ด</b> ด้านบน editor ไว้เทียบกับด่าน 6',
        outputs: [], tests: [{}],
        world: () => lineTrack(8), expect: () => ({ $pos: 8 }), source: NO_LOOP,
        check: (r) => (r.logs.join('|') !== 'ครึ่งทาง|ถึงคลังสินค้า' ? 'ผลลัพธ์ควรมี 2 บรรทัดตามลำดับ: "ครึ่งทาง" แล้ว "ถึงคลังสินค้า"' : null),
        hints: ['แบ่งเป็น 2 ช่วง: เดิน 4 ช่อง → รายงาน → เดินอีก 4 ช่อง → รายงาน', 'ระวังตำแหน่งของ console.log — ต้องอยู่ระหว่างคำสั่งเดินพอดี', 'ลองนึกดู: ถ้าคลังอยู่ไกล 100 ช่อง ต้องเขียนกี่บรรทัด? 😅'],
        solution: 'move();\nmove();\nmove();\nmove();\nconsole.log("ครึ่งทาง");\nmove();\nmove();\nmove();\nmove();\nconsole.log("ถึงคลังสินค้า");',
        compareKey: true,
      },
    ],
  },

  // ================= ด่าน 6 =================
  {
    id: 6, icon: '🔁', title: 'เดินอัตโนมัติ', concept: 'ลูป for — ทำซ้ำโดยไม่ต้องเขียนซ้ำ', kind: 'track',
    lesson: `
      <p>ในด่าน 5 เราเขียน <code>move();</code> ซ้ำหลายบรรทัด ถ้าต้องเดิน 100 ช่องคงเหนื่อยมาก และพิมพ์ผิดง่าย</p>
      <p><b>ลูป (loop)</b> คือการสั่งให้คอมพิวเตอร์ <b>ทำงานเดิมซ้ำหลายรอบ</b> โดยเขียนคำสั่งนั้นแค่ครั้งเดียว</p>
      <pre><code>for (let i = 0; i &lt; 3; i++) {
  console.log("สวัสดี");   // ส่วนที่ถูกทำซ้ำ
}</code></pre>
      <p>อ่านว่า:</p>
      <ol>
        <li><code>let i = 0</code> → เริ่มตัวนับรอบที่ 0</li>
        <li><code>i &lt; 3</code> → ทำซ้ำต่อไป <b>ตราบใดที่</b> i ยังน้อยกว่า 3</li>
        <li><code>i++</code> → จบแต่ละรอบ เพิ่ม i ขึ้น 1</li>
      </ol>
      <p>i จะเป็น 0, 1, 2 รวม <b>3 รอบ</b> → แสดง "สวัสดี" 3 ครั้ง และเรานำค่า <code>i</code> ไปใช้ในลูปได้ด้วย เช่น <code>console.log(i)</code></p>
      <p>การนับสะสม: สร้างตัวแปรก่อนลูป แล้วเพิ่มค่าในลูป <code>count = count + 1;</code></p>
      <p>🤔 <b>ทำไมลูปถึงมีประโยชน์?</b> โค้ดสั้นลง, เปลี่ยนจำนวนรอบได้ที่เดียว (3 → 100), และลดโอกาสพิมพ์ผิด</p>`,
    steps: [
      {
        title: 'ภารกิจเดิม 8 ช่อง ด้วยลูป',
        scenario: '<b>ภารกิจเดียวกับด่าน 5</b> — เดินไปคลังสินค้าที่ช่อง 8 แต่คราวนี้ใช้ลูป',
        requirements: ['เริ่มที่ช่อง 0 ปลายทางช่อง 8', 'ต้องใช้ลูป <code>for</code>', 'เขียน <code>move()</code> ในโค้ดได้ <b>ครั้งเดียว</b>'],
        task: 'เขียนลูปพาหุ่นยนต์ไปช่อง 8 แล้วดูแผงเปรียบเทียบกับโค้ดด่าน 5',
        outputs: [], tests: [{}],
        world: () => lineTrack(8), expect: () => ({ $pos: 8 }), source: NEED_FOR_ONE_MOVE,
        hints: ['ดูโครงสร้าง for ในบทเรียน แล้วเปลี่ยน "สิ่งที่ทำซ้ำ" เป็น move();', 'ต้องการกี่รอบ? ให้เงื่อนไข i < ... ตรงกับจำนวนรอบนั้น'],
        solution: 'for (let i = 0; i < 8; i++) {\n  move();\n}',
        compareKey: true,
      },
      {
        title: 'รายงานทุกก้าว',
        scenario: 'ศูนย์ควบคุมอยากติดตามหุ่นยนต์ทุกก้าว',
        requirements: ['เดินจากช่อง 0 ไปช่อง 6', 'หลังเดินแต่ละก้าว แสดงข้อความ <code>"ก้าวที่ 1"</code>, <code>"ก้าวที่ 2"</code>, … จนถึง <code>"ก้าวที่ 6"</code>', 'ใช้ลูป และเขียน move() ครั้งเดียว'],
        task: 'ใช้ตัวนับ <code>i</code> ของลูปสร้างข้อความรายงานแต่ละก้าว',
        outputs: [], tests: [{}],
        world: () => lineTrack(6), expect: () => ({ $pos: 6 }), source: NEED_FOR_ONE_MOVE,
        check: (r) => {
          const want = [1, 2, 3, 4, 5, 6].map((n) => 'ก้าวที่ ' + n);
          return r.logs.join('|') !== want.join('|') ? 'ผลลัพธ์ควรเป็น "ก้าวที่ 1" ถึง "ก้าวที่ 6" ตามลำดับ (ได้ ' + r.logs.length + ' บรรทัด)' : null;
        },
        hints: ['ในลูปมี 2 คำสั่ง: move(); และ console.log(...)', 'ถ้า i เริ่มที่ 0 ก้าวแรกจะเป็น i = 0 → ต้องแสดงเลข i + 1 หรือเริ่ม i ที่ 1', 'ต่อข้อความกับตัวเลขด้วย + เช่น "ก้าวที่ " + n'],
        solution: 'for (let i = 1; i <= 6; i++) {\n  move();\n  console.log("ก้าวที่ " + i);\n}',
      },
      {
        title: 'นับระยะทางไกล 20 ช่อง',
        scenario: 'เส้นทางลาดตระเวนยาว 20 ช่อง — ถ้าเขียนแบบด่าน 5 คงต้องเขียน 20 บรรทัด!',
        requirements: ['เดินจากช่อง 0 ไปช่อง 20', 'ใช้ตัวแปร <code>count</code> นับจำนวนก้าวที่เดินจริง (เพิ่มทีละ 1 ทุกครั้งที่เดิน)', 'หลังจบลูป แสดง <code>"เดินทั้งหมด 20 ช่อง"</code> เพียงบรรทัดเดียว', 'เขียน move() ครั้งเดียว'],
        task: 'วิเคราะห์ว่าอะไรอยู่ "ในลูป" และอะไรอยู่ "นอกลูป" แล้วเขียนโปรแกรม',
        outputs: ['count'], tests: [{}],
        world: () => lineTrack(20), expect: () => ({ $pos: 20, count: 20 }), source: NEED_FOR_ONE_MOVE,
        check: (r) => (r.logs.length !== 1 || r.logs[0] !== 'เดินทั้งหมด 20 ช่อง' ? 'ต้องแสดงผลแค่ 1 บรรทัดว่า "เดินทั้งหมด 20 ช่อง" (หลังจบลูป) — ตอนนี้ได้ ' + r.logs.length + ' บรรทัด' : null),
        hints: ['สร้าง count = 0 ไว้ "ก่อน" ลูป', 'ในลูป: เดิน และเพิ่ม count', 'console.log ที่อยู่ในลูปจะทำงานทุกรอบ — ถ้าต้องการบรรทัดเดียว ต้องวางไว้หลัง } ของลูป และใช้ค่า count สร้างข้อความ'],
        solution: 'let count = 0;\nfor (let i = 0; i < 20; i++) {\n  move();\n  count = count + 1;\n}\nconsole.log("เดินทั้งหมด " + count + " ช่อง");',
      },
    ],
  },

  // ================= ด่าน 7 =================
  {
    id: 7, icon: '🎛️', title: 'เดินแบบปรับได้', concept: 'ใช้ตัวแปรควบคุมจำนวนรอบของลูป', kind: 'track',
    lesson: `
      <p>ในด่าน 6 เราเขียนตัวเลขจำนวนรอบลงในลูปตรง ๆ แต่ในงานจริงระยะทาง <b>เปลี่ยนไปทุกครั้ง</b></p>
      <p>เราจึงใช้ <b>ตัวแปร</b> แทนตัวเลข ลูปจะทำงานตามค่าในตัวแปรนั้น</p>
      <pre><code>let times = 4;
for (let i = 0; i &lt; times; i++) {
  console.log("บี๊บ");
}</code></pre>
      <p>ถ้าเปลี่ยน <code>times</code> เป็น 20 ก็ทำงาน 20 รอบ <b>โดยไม่ต้องแก้ลูปเลย</b></p>
      <p>ตัวแปรนั้น <b>คำนวณ</b> ได้ด้วย เช่น <code>let times = total - done;</code></p>
      <p>⚠️ ระบบจะตรวจด้วย <b>ค่าหลายแบบ</b> — ถ้าเขียนตัวเลขตายตัวจะไม่ผ่าน</p>`,
    steps: [
      {
        title: 'ระยะทางเปลี่ยนได้',
        scenario: 'ทุกวันจุดส่งของอยู่ไกลไม่เท่ากัน ระบบบอกระยะทางมาในตัวแปร',
        requirements: ['Input: <code>distance</code> (ระยะจากช่อง 0 ถึงธง)', 'หุ่นยนต์ต้องหยุดที่ธงพอดี', 'เขียน move() ครั้งเดียว'],
        task: 'เขียนลูปที่เดินเท่ากับ <code>distance</code>',
        outputs: [],
        tests: [{ distance: 3 }, { distance: 5 }, { distance: 7 }, { distance: 1 }, { distance: 0 }],
        world: (i) => lineTrack(i.distance), expect: (i) => ({ $pos: i.distance }),
        source: (c) => (countMatches(c, /\bmove\s*\(/g) > 1 ? 'เขียน move() ในโค้ดได้เพียงครั้งเดียว' : null),
        hints: ['ใช้โครงสร้างลูปจากด่าน 6', 'แทนที่ตัวเลขจำนวนรอบด้วยชื่อตัวแปร Input'],
        solution: 'for (let i = 0; i < distance; i++) {\n  move();\n}',
      },
      {
        title: 'เริ่มกลางทาง',
        scenario: 'หุ่นยนต์อาจเริ่มจากจุดใดก็ได้บนเส้นทาง',
        requirements: ['Input: <code>start</code> (ช่องเริ่มต้น) และ <code>goal</code> (ช่องธง)', 'สร้างตัวแปร <code>steps</code> = จำนวนช่องที่ต้องเดิน', 'เดินให้ถึงธงพอดี'],
        task: 'คำนวณ <code>steps</code> แล้วใช้ควบคุมลูป',
        outputs: ['steps'],
        tests: [{ start: 2, goal: 7 }, { start: 0, goal: 4 }, { start: 5, goal: 5 }, { start: 1, goal: 9 }],
        world: (i) => lineTrack(i.goal, i.start), expect: (i) => ({ steps: i.goal - i.start, $pos: i.goal }),
        source: (c) => (countMatches(c, /\bmove\s*\(/g) > 1 ? 'เขียน move() ในโค้ดได้เพียงครั้งเดียว' : null),
        hints: ['ถ้าเริ่มช่อง 2 ธงอยู่ช่อง 7 ต้องเดินกี่ช่อง? คำนวณด้วยอะไร?', 'ใช้ steps เป็นเงื่อนไขของลูป'],
        solution: 'let steps = goal - start;\nfor (let i = 0; i < steps; i++) {\n  move();\n}',
      },
      {
        title: 'พลังงานจำกัด',
        scenario: 'การเดิน 1 ช่องใช้แบตเตอรี่ 5 หน่วย บางวันแบตเตอรี่ไม่พอเดินถึงธง หุ่นยนต์จึงต้องเดินเท่าที่พลังงานพอ',
        requirements: ['Input: <code>distance</code>, <code>battery</code> (หาร 5 ลงตัวเสมอ)',
          '<code>steps</code> = ระยะที่ <b>เดินได้จริง</b>: ถ้าแบตพอสำหรับทั้งเส้นทางให้เท่ากับ distance ถ้าไม่พอให้เท่ากับจำนวนช่องที่แบตพอเดิน',
          'เดินตาม steps', '<code>batteryLeft</code> = แบตเตอรี่ที่เหลือหลังเดิน'],
        task: 'วิเคราะห์ 2 กรณี (พอ / ไม่พอ) ด้วย if/else คำนวณ <code>steps</code> แล้วเดิน และคำนวณ <code>batteryLeft</code>',
        outputs: ['steps', 'batteryLeft'],
        tests: [{ distance: 4, battery: 100 }, { distance: 6, battery: 20 }, { distance: 3, battery: 15 }, { distance: 5, battery: 0 }, { distance: 2, battery: 50 }],
        world: (i) => lineTrack(i.distance),
        expect: (i) => {
          const s = Math.min(i.distance, i.battery / 5);
          return { steps: s, batteryLeft: i.battery - s * 5, $pos: s };
        },
        source: (c) => (countMatches(c, /\bmove\s*\(/g) > 1 ? 'เขียน move() ในโค้ดได้เพียงครั้งเดียว' : null),
        hints: [
          'พลังงานที่ต้องใช้ทั้งเส้นทาง = distance * 5',
          'ถ้าแบตไม่พอ จำนวนช่องที่เดินได้ = battery / 5',
          'ใช้ if/else กำหนด steps ก่อน แล้วค่อยเขียนลูป และคำนวณ batteryLeft = battery - steps * 5',
        ],
        solution: 'let steps = distance;\nif (battery < distance * 5) {\n  steps = battery / 5;\n}\nfor (let i = 0; i < steps; i++) {\n  move();\n}\nlet batteryLeft = battery - steps * 5;',
      },
    ],
  },

  // ================= ด่าน 8 =================
  {
    id: 8, icon: '🪨', title: 'ตรวจจับสิ่งกีดขวาง', concept: 'ลูป + เงื่อนไข (if/else ภายในลูป)', kind: 'track',
    lesson: `
      <p>บนเส้นทางมี <b>หิน 🪨</b> ถ้าสั่ง <code>move()</code> ใส่หิน หุ่นยนต์จะชน!</p>
      <p>คำสั่งใหม่ของหุ่นยนต์:</p>
      <ul>
        <li><code>isBlocked()</code> — <b>เซนเซอร์</b> ตอบกลับ <code>true</code> ถ้าช่องข้างหน้ามีหิน, <code>false</code> ถ้าว่าง</li>
        <li><code>jump()</code> — ปีนขึ้นไปบนหินข้างหน้า 1 ช่อง (ใช้ได้ <b>เฉพาะ</b> เมื่อข้างหน้ามีหิน)</li>
      </ul>
      <p>เพราะ <code>isBlocked()</code> ให้ค่า true/false จึงใช้เป็นเงื่อนไขของ if หรือเก็บในตัวแปรได้:</p>
      <pre><code>if (isBlocked()) {
  console.log("ข้างหน้ามีหิน!");
}</code></pre>
      <p>💡 <b>ลูป + เงื่อนไข</b>: ถ้าใส่ if/else ไว้ <b>ในลูป</b> หุ่นยนต์จะตัดสินใจใหม่ทุกก้าว
      → ใช้ได้กับทุกเส้นทาง ไม่ว่าหินจะอยู่ตรงไหน</p>`,
    steps: [
      {
        title: 'ข้ามหินถึงธง',
        scenario: 'ทางไปเหมืองมีหินตกอยู่หลายจุด และตำแหน่งหินเปลี่ยนทุกวัน',
        requirements: ['Input: <code>steps</code> (ระยะถึงธง)', 'ทุกก้าว: ถ้าข้างหน้ามีหิน ใช้ <code>jump()</code> ถ้าว่างใช้ <code>move()</code>', 'ห้ามชนหิน และห้าม jump() ตอนไม่มีหิน'],
        task: 'เขียนลูปที่ตัดสินใจทุกก้าว พาหุ่นยนต์ไปถึงธง',
        outputs: [],
        tests: [{ steps: 6, rocks: [2, 4] }, { steps: 5, rocks: [] }, { steps: 7, rocks: [1, 2, 5] }, { steps: 4, rocks: [3] }],
        world: (i) => rockTrack(i.rocks, i.steps), expect: (i) => ({ $pos: i.steps }), hideKeys: ['rocks'],
        hints: ['ต้องเดิน steps ก้าว → ลูปกี่รอบ?', 'ในลูป ใช้ isBlocked() เป็นเงื่อนไขของ if', 'if → jump(); else → move();'],
        solution: 'for (let i = 0; i < steps; i++) {\n  if (isBlocked()) {\n    jump();\n  } else {\n    move();\n  }\n}',
      },
      {
        title: 'รายงานจำนวนหิน',
        scenario: 'ทีมเก็บกวาดอยากรู้ว่าบนเส้นทางมีหินกี่ก้อน',
        requirements: ['Input: <code>steps</code>', 'พาหุ่นยนต์ไปถึงธงเหมือนภารกิจ 1', '<code>jumps</code> = จำนวนครั้งที่กระโดดข้ามหิน', '<code>moves</code> = จำนวนครั้งที่เดินปกติ'],
        task: 'เพิ่มตัวนับ 2 ตัวในโปรแกรมเดินทาง',
        outputs: ['jumps', 'moves'],
        tests: [{ steps: 7, rocks: [2, 3, 6] }, { steps: 5, rocks: [] }, { steps: 6, rocks: [1] }, { steps: 8, rocks: [1, 3, 5, 7] }],
        world: (i) => rockTrack(i.rocks, i.steps), expect: (i) => ({ $pos: i.steps, jumps: i.rocks.length, moves: i.steps - i.rocks.length }), hideKeys: ['rocks'],
        hints: ['สร้างตัวนับทั้ง 2 ตัว = 0 ไว้ก่อนลูป', 'เพิ่มตัวนับในส่วนเดียวกับคำสั่งที่มันนับ', 'ลองตรวจ: jumps + moves ควรเท่ากับ steps เสมอ'],
        solution: 'let jumps = 0;\nlet moves = 0;\nfor (let i = 0; i < steps; i++) {\n  if (isBlocked()) {\n    jump();\n    jumps = jumps + 1;\n  } else {\n    move();\n    moves = moves + 1;\n  }\n}',
      },
      {
        title: 'พลังงานในการข้ามหิน',
        scenario: 'การเดินปกติใช้แบต 1 หน่วย แต่การกระโดดข้ามหินใช้ 3 หน่วย ศูนย์ควบคุมต้องรู้แบตที่เหลือ และต้องได้รับคำเตือนถ้าแบตเหลือน้อย',
        requirements: ['Input: <code>steps</code>, <code>battery</code>', 'พาหุ่นยนต์ไปถึงธง (แบตพอเสมอ)',
          '<code>batteryLeft</code> = แบตที่เหลือเมื่อถึงธง', '<code>lowBattery</code> = true ถ้า batteryLeft น้อยกว่า 5'],
        task: 'วิเคราะห์ว่าต้องหักแบตตรงไหนในลูป แล้วเขียนโปรแกรมทั้งหมด',
        outputs: ['batteryLeft', 'lowBattery'],
        tests: [{ steps: 6, battery: 20, rocks: [2, 4] }, { steps: 5, battery: 10, rocks: [] }, { steps: 7, battery: 18, rocks: [1, 2, 5] }, { steps: 4, battery: 6, rocks: [3] }],
        world: (i) => rockTrack(i.rocks, i.steps),
        expect: (i) => {
          const left = i.battery - (i.steps - i.rocks.length) - 3 * i.rocks.length;
          return { $pos: i.steps, batteryLeft: left, lowBattery: left < 5 };
        },
        hideKeys: ['rocks'],
        hints: ['เริ่มจาก batteryLeft = battery (ก่อนลูป)', 'ในส่วน jump ลด 3 ในส่วน move ลด 1', 'lowBattery คำนวณ "หลัง" ลูปจบ ด้วยการเปรียบเทียบ (ด่าน 1)'],
        solution: 'let batteryLeft = battery;\nfor (let i = 0; i < steps; i++) {\n  if (isBlocked()) {\n    jump();\n    batteryLeft = batteryLeft - 3;\n  } else {\n    move();\n    batteryLeft = batteryLeft - 1;\n  }\n}\nlet lowBattery = batteryLeft < 5;',
      },
    ],
  },

  // ================= ด่าน 9 =================
  {
    id: 9, icon: '🚨', title: 'หุ่นยนต์ลาดตระเวน', concept: 'Array + ลูป + ตรรกะ + การนับ', kind: 'track',
    lesson: `
      <p><b>Array (อาร์เรย์)</b> คือตัวแปรที่เก็บ <b>ข้อมูลหลายค่าเรียงกัน</b> ไว้ในวงเล็บเหลี่ยม</p>
      <pre><code>let scores = [7, 9, 4];
scores[0]      // 7   (ข้อมูลแรกคือลำดับที่ 0)
scores[2]      // 4
scores.length  // 3   (จำนวนข้อมูลทั้งหมด)</code></pre>
      <p>⚠️ ลำดับ (index) เริ่มที่ <b>0</b> ดังนั้นข้อมูลสุดท้ายคือ <code>scores[scores.length - 1]</code></p>
      <p>ใช้ลูปอ่านข้อมูลทีละช่องได้ โดยให้ตัวนับ <code>i</code> เป็นลำดับ:</p>
      <pre><code>for (let i = 0; i &lt; scores.length; i++) {
  console.log(scores[i]);
}</code></pre>
      <p>ในด่านนี้หุ่นยนต์ <b>ลาดตระเวนตรวจอุณหภูมิทุกห้อง</b> คำสั่งที่ใช้: <code>move()</code> (เดินเข้าห้องถัดไป)
      และ <code>alarm()</code> (ส่งสัญญาณเตือนในห้องที่อยู่ตอนนี้) — ห้องที่ 1 อยู่ช่อง 1 ห้องที่ 2 อยู่ช่อง 2 …</p>`,
    steps: [
      {
        title: 'อ่านรายงานอุณหภูมิ',
        scenario: 'เซนเซอร์ส่งรายงานอุณหภูมิทุกห้องมาเป็น Array',
        requirements: ['Input: <code>temps</code> (Array ของอุณหภูมิ มีอย่างน้อย 1 ห้อง)', '<code>totalRooms</code> = จำนวนห้อง', '<code>firstTemp</code> = อุณหภูมิห้องแรก', '<code>lastTemp</code> = อุณหภูมิห้องสุดท้าย'],
        task: 'สร้างตัวแปรทั้ง 3 ตัวจาก Array (ยังไม่ต้องเดิน)',
        outputs: ['totalRooms', 'firstTemp', 'lastTemp'],
        tests: [{ temps: [24, 31, 19, 27] }, { temps: [30, 22] }, { temps: [18, 18, 40, 25, 26] }, { temps: [21] }],
        world: (i) => roomTrack(i.temps),
        expect: (i) => ({ totalRooms: i.temps.length, firstTemp: i.temps[0], lastTemp: i.temps[i.temps.length - 1] }),
        hints: ['จำนวนข้อมูลใช้ .length', 'ข้อมูลแรกอยู่ลำดับที่ 0', 'ข้อมูลสุดท้ายอยู่ลำดับ "จำนวนข้อมูล − 1" (ห้ามเขียนตัวเลขตายตัว เพราะจำนวนห้องเปลี่ยนได้)'],
        solution: 'let totalRooms = temps.length;\nlet firstTemp = temps[0];\nlet lastTemp = temps[temps.length - 1];',
      },
      {
        title: 'ลาดตระเวนนับห้องร้อน',
        scenario: 'คราวนี้หุ่นยนต์ต้องเดินเข้าไปตรวจทุกห้องจริง ๆ',
        requirements: ['Input: <code>temps</code>', 'เดินเข้าทุกห้อง (move() ห้องละ 1 ครั้ง)', '<code>hotRooms</code> = จำนวนห้องที่ <b>ร้อนกว่า 30</b> องศา'],
        task: 'ใช้ลูปตามจำนวนห้อง เดิน ตรวจ และนับ',
        outputs: ['hotRooms'],
        tests: [{ temps: [24, 31, 19, 35] }, { temps: [30, 30, 30] }, { temps: [40, 41, 12, 33, 29] }, { temps: [20] }, { temps: [] }],
        world: (i) => roomTrack(i.temps),
        expect: (i) => ({ hotRooms: i.temps.filter((t) => t > 30).length, $pos: i.temps.length }),
        hints: ['จำนวนรอบของลูป = จำนวนข้อมูลใน temps', 'ในรอบที่ i อุณหภูมิของห้องคือ temps[i]', 'นับด้วยตัวแปรที่เริ่มเป็น 0 แล้วเพิ่มเมื่อเงื่อนไขเป็นจริง'],
        solution: 'let hotRooms = 0;\nfor (let i = 0; i < temps.length; i++) {\n  move();\n  if (temps[i] > 30) {\n    hotRooms = hotRooms + 1;\n  }\n}',
      },
      {
        title: 'แจ้งเตือนห้องผิดปกติ',
        scenario: 'ห้องเก็บยาต้องมีอุณหภูมิในช่วงปกติเท่านั้น หุ่นยนต์ต้องเตือนทันทีในห้องที่ผิดปกติ',
        requirements: ['Input: <code>temps</code>', 'อุณหภูมิปกติคือ <b>18 ถึง 28</b> องศา (รวม 18 และ 28)', 'ในห้องที่ <b>เย็นกว่า 18 หรือ ร้อนกว่า 28</b> ให้สั่ง <code>alarm()</code>',
          '<code>alerts</code> = จำนวนห้องที่เตือน', '<code>maxTemp</code> = อุณหภูมิสูงสุดที่พบ (ถ้าไม่มีห้องเลย ให้เป็น 0)'],
        task: 'วิเคราะห์เงื่อนไขผิดปกติ และวิธีหาค่าสูงสุด แล้วเขียนโปรแกรมลาดตระเวน',
        outputs: ['alerts', 'maxTemp'],
        tests: [{ temps: [24, 31, 15, 28] }, { temps: [18, 28, 20] }, { temps: [10, 40, 17, 29, 22] }, { temps: [] }, { temps: [5, 3] }],
        world: (i) => roomTrack(i.temps),
        expect: (i) => ({ alerts: i.temps.filter((t) => t < 18 || t > 28).length, maxTemp: i.temps.length ? Math.max(...i.temps) : 0, $pos: i.temps.length }),
        check: (r, i) => {
          const want = [];
          i.temps.forEach((t, k) => { if (t < 18 || t > 28) want.push(k + 1); });
          const got = r.events.filter((e) => e.type === 'alarm').map((e) => e.pos);
          return want.join(',') !== got.join(',')
            ? 'ต้องสั่ง alarm() ในห้องที่ ' + (want.length ? want.join(', ') : '(ไม่มี)') + ' แต่สั่งที่ห้อง ' + (got.length ? got.join(', ') : '(ไม่ได้สั่ง)') : null;
        },
        hints: [
          'โครงสร้างเหมือนภารกิจ 2: ลูปทุกห้อง → move() → ตรวจเงื่อนไข',
          '"เย็นกว่า 18 หรือ ร้อนกว่า 28" ใช้ || ระหว่าง 2 การเปรียบเทียบ',
          'หาค่าสูงสุด: เริ่ม maxTemp = 0 แล้วในแต่ละห้อง ถ้าอุณหภูมิมากกว่า maxTemp ให้แทนค่า (ระวัง: ถ้าทุกห้องติดลบ? ในโจทย์นี้อุณหภูมิไม่ติดลบ)',
        ],
        solution: 'let alerts = 0;\nlet maxTemp = 0;\nfor (let i = 0; i < temps.length; i++) {\n  move();\n  if (temps[i] < 18 || temps[i] > 28) {\n    alarm();\n    alerts = alerts + 1;\n  }\n  if (temps[i] > maxTemp) {\n    maxTemp = temps[i];\n  }\n}',
      },
    ],
  },

  // ================= ด่าน 10 =================
  {
    id: 10, icon: '🪐', title: 'FINAL: สำรวจดาวเคราะห์', concept: 'วิเคราะห์ Input–Process–Output → ออกแบบ Algorithm → เขียนโค้ด → ทดสอบ', kind: 'track',
    lesson: `
      <p><b>สถานการณ์:</b> หุ่นยนต์ลงจอดบนดาวเคราะห์ที่มีช่องพลังงานเรียงกัน</p>
      <ul>
        <li>พลังงานเริ่มต้น <code>energy = 10</code></li>
        <li>แผนที่พลังงาน <code>energyMap = [3, 0, 5, 2, 0, 4, 1, 6]</code></li>
        <li>สำรวจ 1 ช่อง ใช้พลังงาน <b>2 หน่วย</b></li>
        <li><b>ก่อน</b>สำรวจแต่ละช่อง ต้องมีพลังงาน <b>อย่างน้อย 2</b></li>
        <li>สำรวจ = หักพลังงาน 2 แล้ว <b>เก็บพลังงาน</b> ของช่องนั้นเพิ่ม</li>
        <li><b>หยุด</b> เมื่อพลังงานไม่พอ (หรือสำรวจครบทุกช่อง)</li>
        <li>รายงาน <b>จำนวนช่องที่สำรวจ</b> และ <b>พลังงานคงเหลือ</b></li>
      </ul>
      <p>นักเขียนโปรแกรมจะ <b>วิเคราะห์ก่อนเขียนโค้ด</b> เสมอ:</p>
      <ol>
        <li><b>Input</b> — ข้อมูลที่โปรแกรมได้รับ</li>
        <li><b>Process</b> — สิ่งที่ต้องทำกับข้อมูล</li>
        <li><b>Output</b> — ผลลัพธ์ที่ต้องรายงาน</li>
        <li><b>Algorithm</b> — ขั้นตอนทำงานเรียงลำดับ (เขียนเป็นภาษาไทยก่อนก็ได้)</li>
        <li><b>Testing</b> — ลองกับข้อมูลหลายแบบ รวมถึงกรณีพิเศษ เช่น แผนที่ว่าง หรือพลังงานน้อยมาก</li>
      </ol>
      <p>🆕 คำสั่ง <code>break;</code> ใช้ <b>หยุดลูปทันที</b> เช่น <code>if (x &gt; 100) { break; }</code></p>
      <p>ทุกภารกิจในด่านนี้ต้อง <b>ตอบคำถามวิเคราะห์ให้ถูกก่อน</b> จึงจะส่งโค้ดได้ และใช้ช่อง "ทดลองกับข้อมูลของคุณเอง" เพื่อทดสอบโปรแกรม</p>`,
    steps: [
      {
        title: 'วิเคราะห์ + สำรวจ 1 ช่อง',
        scenario: 'ก่อนสำรวจทั้งแผนที่ วิศวกรอยากให้ทดสอบกระบวนการกับ <b>ช่องเดียว</b> ก่อน',
        requirements: ['Input: <code>energy</code> (พลังงานปัจจุบัน), <code>cell</code> (พลังงานในช่องถัดไป)',
          'ถ้าพลังงาน ≥ 2: <code>move()</code>, หัก 2, เก็บพลังงานของช่อง, <code>explored</code> = 1',
          'ถ้าพลังงานไม่พอ: ไม่เดิน, <code>explored</code> = 0, พลังงานเท่าเดิม',
          'Output: <code>explored</code> และ <code>energy</code> (เปลี่ยนค่าตัวแปร energy ได้เลย ไม่ต้อง let ซ้ำ)'],
        task: 'ตอบคำถามวิเคราะห์ให้ถูกทุกข้อ แล้วเขียนโปรแกรมสำรวจ 1 ช่อง',
        outputs: ['explored', 'energy'],
        tests: [{ energy: 10, cell: 3 }, { energy: 2, cell: 0 }, { energy: 1, cell: 5 }, { energy: 5, cell: 4 }, { energy: 0, cell: 9 }],
        world: (i) => energyTrack([i.cell]),
        expect: (i) => (i.energy >= 2 ? { explored: 1, energy: i.energy - 2 + i.cell, $pos: 1 } : { explored: 0, energy: i.energy, $pos: 0 }),
        customInputs: [{ name: 'energy', type: 'number' }, { name: 'cell', type: 'number' }],
        analysis: [
          { q: '<b>Input</b> ของภารกิจนี้คืออะไร?', options: ['explored', 'energy และ cell', 'move()', 'ค่า 2'], answer: 1, explain: 'Input คือข้อมูลที่ได้รับมา: พลังงานปัจจุบันและพลังงานในช่อง' },
          { q: '<b>Output</b> ที่ต้องรายงานคืออะไร?', options: ['cell', 'explored และ energy (หลังสำรวจ)', 'จำนวนหิน', 'ไม่มี'], answer: 1, explain: 'ต้องรายงานว่าสำรวจได้ไหม (explored) และพลังงานที่เหลือ' },
          { q: '<b>Process</b> ลำดับใดถูกต้อง?', options: ['เก็บพลังงาน → ตรวจ ≥ 2 → หัก 2', 'ตรวจ ≥ 2 → หัก 2 → เก็บพลังงาน', 'หัก 2 → ตรวจ ≥ 0 → เก็บพลังงาน', 'เก็บพลังงานอย่างเดียว'], answer: 1, explain: 'ต้องตรวจก่อนว่าพลังงานพอ แล้วจึงหัก 2 และเก็บพลังงาน' },
          { q: '<b>Trace:</b> energy = 10, cell = 3 ผลลัพธ์คือ?', options: ['explored = 1, energy = 13', 'explored = 1, energy = 11', 'explored = 0, energy = 10', 'explored = 1, energy = 8'], answer: 1, explain: '10 − 2 = 8 แล้ว + 3 = 11' },
        ],
        hints: ['โครงสร้างหลักคือ if เดียว (ด่าน 4)', 'สร้าง explored = 0 ไว้ก่อน แล้วเปลี่ยนเป็น 1 เฉพาะเมื่อสำรวจ', 'การเปลี่ยนพลังงาน: energy = energy - 2; แล้วบวกค่าจาก cell'],
        solution: 'let explored = 0;\nif (energy >= 2) {\n  move();\n  energy = energy - 2;\n  energy = energy + cell;\n  explored = 1;\n}',
      },
      {
        title: 'FINAL: สำรวจทั้งแผนที่',
        scenario: 'ถึงเวลาภารกิจจริง: สำรวจแผนที่พลังงานทีละช่องตามกติกาในบทเรียน (พลังงานเริ่มต้น 10, แผนที่ [3, 0, 5, 2, 0, 4, 1, 6])',
        requirements: ['Input: <code>energy</code>, <code>energyMap</code> (Array — แผนที่อาจยาวหรือสั้นต่างกัน และอาจว่าง)',
          'ก่อนสำรวจแต่ละช่อง ต้องมีพลังงาน ≥ 2 ไม่อย่างนั้น <b>หยุดทันที</b>', 'สำรวจ = <code>move()</code>, หัก 2, เก็บพลังงานของช่อง',
          'Output: <code>explored</code> (จำนวนช่องที่สำรวจ) และ <code>energy</code> (พลังงานคงเหลือ)'],
        task: 'ตอบคำถามออกแบบ Algorithm ให้ถูก แล้วเขียนโปรแกรมทั้งหมดเอง — ทดสอบกับแผนที่ของคุณเองก่อนส่ง',
        outputs: ['explored', 'energy'],
        tests: [
          { energy: 10, energyMap: [3, 0, 5, 2, 0, 4, 1, 6] }, { energy: 10, energyMap: [0, 0, 0, 0, 0, 0, 0] },
          { energy: 3, energyMap: [1, 0, 0, 0] }, { energy: 1, energyMap: [5, 5] }, { energy: 4, energyMap: [0, 1, 0, 0, 0] },
          { energy: 6, energyMap: [] }, { energy: 2, energyMap: [0, 9, 0] },
        ],
        world: (i) => energyTrack(i.energyMap),
        expect: (i) => { const r = exploreReference(i.energy, i.energyMap); return { explored: r.explored, energy: r.energy, $pos: r.explored }; },
        customInputs: [{ name: 'energy', type: 'number' }, { name: 'energyMap', type: 'array' }],
        analysis: [
          { q: 'หุ่นยนต์ <b>หยุด</b> เมื่อใด?', options: ['เมื่อเจอช่องที่มีพลังงาน 0', 'เมื่อพลังงานน้อยกว่า 2 หรือสำรวจครบทุกช่อง', 'เมื่อพลังงานเท่ากับ 0 เท่านั้น', 'เมื่อสำรวจได้ 5 ช่อง'], answer: 1, explain: 'ถ้าพลังงาน < 2 สำรวจช่องถัดไปไม่ได้ และถ้าหมดแผนที่ก็ต้องหยุดเช่นกัน' },
          { q: '<b>Algorithm</b> ควรใช้โครงสร้างใด?', options: ['if อย่างเดียว 1 ครั้ง', 'ลูปวนทีละช่องของ energyMap + if ตรวจพลังงาน (ไม่พอ → break)', 'move() 8 บรรทัด', 'นับ energyMap.length แล้วตอบเลย'], answer: 1, explain: 'ต้องทำซ้ำทีละช่อง (ลูป) และตัดสินใจทุกรอบ (if) จึงหยุดได้ถูกจังหวะ' },
          { q: 'ในรอบที่ i พลังงานของช่องปัจจุบันคือ?', options: ['energyMap', 'energyMap[i]', 'energyMap.length', 'i'], answer: 1, explain: 'ใช้ index i อ่านข้อมูลใน Array (ด่าน 9)' },
          { q: '<b>Trace:</b> energy = 3, energyMap = [1, 0, 0] สำรวจได้กี่ช่อง เหลือพลังงานเท่าไร?', options: ['1 ช่อง เหลือ 2', '2 ช่อง เหลือ 0', '3 ช่อง เหลือ 0', '0 ช่อง เหลือ 3'], answer: 1, explain: 'ช่อง 1: 3−2+1 = 2 → ช่อง 2: 2−2+0 = 0 → พลังงาน < 2 หยุด' },
        ],
        hints: ['วนทีละช่องด้วย for โดยใช้ energyMap.length เป็นจำนวนรอบ', 'ตรวจพลังงานเป็นสิ่งแรกในแต่ละรอบ ถ้าไม่พอใช้ break', 'ในรอบที่สำรวจได้: เดิน, ปรับพลังงาน 2 ครั้ง (หัก/เก็บ), และนับ explored'],
        solution: 'let explored = 0;\nfor (let i = 0; i < energyMap.length; i++) {\n  if (energy < 2) {\n    break;\n  }\n  move();\n  energy = energy - 2;\n  energy = energy + energyMap[i];\n  explored = explored + 1;\n}\nconsole.log("สำรวจได้", explored, "ช่อง พลังงานคงเหลือ", energy);',
      },
      {
        title: 'FINAL+: พายุบนดาวเคราะห์',
        scenario: 'ดาวเคราะห์อีกดวงมี <b>ช่องพายุ</b> (ค่าติดลบ) ที่ดูดพลังงานออกไป ศูนย์วิจัยต้องการรายงานละเอียดขึ้น',
        requirements: ['Input: <code>energy</code>, <code>energyMap</code> (มีค่าติดลบได้)', 'กติกาสำรวจและการหยุดเหมือนภารกิจ 2 (ค่าติดลบก็นำไปบวกตามปกติ ทำให้พลังงานลดลง)',
          'Output: <code>explored</code>, <code>energy</code>', '<code>collected</code> = ผลรวมพลังงาน <b>บวก</b> ที่เก็บได้จากช่องที่สำรวจ', '<code>storms</code> = จำนวนช่องพายุ (ค่าติดลบ) ที่สำรวจผ่าน'],
        task: 'วิเคราะห์ Input/Output ใหม่ ออกแบบ Algorithm เขียนโปรแกรม และ <b>ทดสอบเอง</b> กับกรณีพิเศษก่อนส่ง',
        outputs: ['explored', 'energy', 'collected', 'storms'],
        tests: [
          { energy: 10, energyMap: [3, -4, 5, 0, -2, 6] }, { energy: 4, energyMap: [-3, 5, 5] },
          { energy: 10, energyMap: [3, 0, 5, 2, 0, 4, 1, 6] }, { energy: 2, energyMap: [] },
          { energy: 6, energyMap: [-1, -1, -1] }, { energy: 1, energyMap: [9] },
        ],
        world: (i) => energyTrack(i.energyMap),
        expect: (i) => { const r = exploreReference(i.energy, i.energyMap); return { explored: r.explored, energy: r.energy, collected: r.collected, storms: r.storms, $pos: r.explored }; },
        customInputs: [{ name: 'energy', type: 'number' }, { name: 'energyMap', type: 'array' }],
        analysis: [
          { q: 'Output ใหม่ <code>collected</code> ควรคำนวณอย่างไร?', options: ['ผลรวมทุกช่องในแผนที่', 'ผลรวมเฉพาะค่าบวกของช่องที่สำรวจจริง', 'พลังงานสุดท้าย', 'จำนวนช่องที่สำรวจ'], answer: 1, explain: 'นับเฉพาะช่องที่สำรวจจริง และเฉพาะค่าที่มากกว่า 0' },
          { q: 'ต้องใช้ <b>ตัวนับ/ตัวสะสม</b> กี่ตัว และสร้างไว้ที่ไหน?', options: ['1 ตัว ในลูป', '3 ตัว (explored, collected, storms) สร้างไว้ก่อนลูป', '3 ตัว สร้างในลูป', 'ไม่ต้องใช้'], answer: 1, explain: 'ถ้าสร้างในลูป ค่าจะเริ่มใหม่ทุกรอบ จึงต้องสร้างก่อนลูป' },
          { q: '<b>Trace:</b> energy = 4, energyMap = [-3, 5, 5] ผลคือ?', options: ['explored 3', 'explored 1, energy −1, collected 0, storms 1', 'explored 0, energy 4', 'explored 1, energy 2'], answer: 1, explain: '4−2−3 = −1 → รอบถัดไปพลังงาน < 2 จึงหยุด' },
          { q: '<b>Testing:</b> กรณีทดสอบใดตรวจว่าโปรแกรม "ไม่พัง" เมื่อไม่มีข้อมูล?', options: ['energy = 10, energyMap = [3, 0, 5]', 'energy = 2, energyMap = [] (แผนที่ว่าง)', 'energy = 100, energyMap = [1]', 'energy = 10, energyMap = [6, 6]'], answer: 1, explain: 'แผนที่ว่างคือกรณีขอบ (edge case) ที่ควรทดสอบเสมอ — ผลที่ถูกคือ explored 0 และพลังงานเท่าเดิม' },
        ],
        hints: ['เริ่มจากโปรแกรมภารกิจ 2 แล้วเพิ่มตัวสะสมใหม่', 'ในรอบที่สำรวจ ตรวจค่าในช่อง: มากกว่า 0 → บวกเข้า collected, น้อยกว่า 0 → เพิ่ม storms', 'ใช้ช่อง "ทดลองกับข้อมูลของคุณเอง" ลองแผนที่ว่าง และแผนที่ที่ช่องแรกเป็นพายุ'],
        solution: 'let explored = 0;\nlet collected = 0;\nlet storms = 0;\nfor (let i = 0; i < energyMap.length; i++) {\n  if (energy < 2) {\n    break;\n  }\n  move();\n  energy = energy - 2 + energyMap[i];\n  explored = explored + 1;\n  if (energyMap[i] > 0) {\n    collected = collected + energyMap[i];\n  }\n  if (energyMap[i] < 0) {\n    storms = storms + 1;\n  }\n}',
      },
    ],
  },
];

// ทุกภารกิจเริ่มจาก editor ว่าง
LEVELS.forEach((lv) => lv.steps.forEach((s) => { s.starter = ''; }));

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LEVELS, exploreReference, stripComments };
}
