// Движок игр Такопи: чёткая графика в полном разрешении, звук, частицы, ввод.
// Игра рисует в логических координатах W x H (360x640), движок масштабирует под экран и devicePixelRatio.
const W = 360, H = 640;
const cv = document.getElementById("game");
const ctx = cv.getContext("2d");
let VIEW_SCALE = 1, DPR = 1;

function fit() {
  DPR = Math.min(3, window.devicePixelRatio || 1);
  VIEW_SCALE = Math.min(innerWidth / W, innerHeight / H);
  const cw = Math.floor(W * VIEW_SCALE), ch = Math.floor(H * VIEW_SCALE);
  cv.style.width = cw + "px";
  cv.style.height = ch + "px";
  cv.width = Math.round(cw * DPR);
  cv.height = Math.round(ch * DPR);
}
addEventListener("resize", fit);
fit();

const COLORS = {
  ink: "#f6f3ff", muted: "#b9b3e0", dim: "rgba(10,8,30,0.62)",
  pink: "#ff7eb6", pinkD: "#e0559a", pinkL: "#ffc2dd", cheek: "#ff4f7a",
  yellow: "#ffd84a", orange: "#ff9a3c", red: "#ff4d5e", green: "#5fdc7a", greenD: "#2fa84f",
  blue: "#6aa8ff", cyan: "#5ff0f0", violet: "#a58cff", white: "#ffffff", black: "#14121f",
};
const FONT = '"Rubik", system-ui, "Segoe UI", Roboto, sans-serif';

const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;

// ---------- рисование ----------
function rrect(x, y, w, h, r, fill, stroke, lw = 2) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function circle(x, y, r, fill, stroke, lw = 2) {
  ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function vgrad(y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}
// text("Очки", x, y, { size: 20, weight: 800, color, align: "center", base: "middle", shadow: true })
function text(str, x, y, o = {}) {
  const { size = 18, weight = 700, color = COLORS.ink, align = "center", base = "middle", shadow = true, stroke = 0 } = o;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = base;
  if (stroke) { ctx.lineJoin = "round"; ctx.lineWidth = stroke; ctx.strokeStyle = "rgba(10,8,30,0.85)"; ctx.strokeText(str, x, y); }
  if (shadow) { ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillText(str, x, y + Math.max(1.5, size * 0.07)); }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}

// Такопи: розовый инопланетянин с щупальцами. x,y — центр, s — ширина. mood: "happy" | "oh" | "ko" | "cool"
function drawTakopi(x, y, s, { t = 0, flip = false, mood = "happy", squash = 0, color = COLORS.pink } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -1 : 1, 1);
  ctx.scale(1 + squash * 0.18, 1 - squash * 0.18);
  const k = s / 48;
  ctx.scale(k, k);
  // тень
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath(); ctx.ellipse(0, 22, 16, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  // щупальца шевелятся
  ctx.strokeStyle = color; ctx.lineCap = "round"; ctx.lineWidth = 5;
  for (let i = 0; i < 5; i++) {
    const bx = -12 + i * 6, sw = Math.sin(t * 10 + i * 1.3) * 3;
    ctx.beginPath(); ctx.moveTo(bx, 6); ctx.quadraticCurveTo(bx + sw, 14, bx + sw * 1.4 + (i - 2) * 1.5, 20); ctx.stroke();
  }
  // голова
  const g = ctx.createRadialGradient(-6, -12, 3, 0, -4, 24);
  g.addColorStop(0, "#ffd0e6"); g.addColorStop(0.45, color); g.addColorStop(1, COLORS.pinkD);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, -4, 20, 17, 0, 0, Math.PI * 2); ctx.fill();
  // блик
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath(); ctx.ellipse(-8, -14, 5, 3, -0.5, 0, Math.PI * 2); ctx.fill();
  // щёки
  ctx.fillStyle = "rgba(255,79,122,0.55)";
  ctx.beginPath(); ctx.ellipse(-12, 1, 4, 2.4, 0, 0, Math.PI * 2); ctx.ellipse(12, 1, 4, 2.4, 0, 0, Math.PI * 2); ctx.fill();
  // глаза
  if (mood === "ko") {
    ctx.strokeStyle = COLORS.black; ctx.lineWidth = 2.4;
    for (const ex of [-7, 7]) { ctx.beginPath(); ctx.moveTo(ex - 3, -9); ctx.lineTo(ex + 3, -3); ctx.moveTo(ex + 3, -9); ctx.lineTo(ex - 3, -3); ctx.stroke(); }
  } else if (mood === "cool") {
    rrect(-14, -10, 11, 7, 2.5, COLORS.black); rrect(3, -10, 11, 7, 2.5, COLORS.black);
    ctx.fillStyle = COLORS.black; ctx.fillRect(-3, -8, 6, 2);
  } else {
    const blink = (t % 3.2) > 3.08;
    for (const ex of [-7, 7]) {
      if (blink) { ctx.fillStyle = COLORS.black; ctx.fillRect(ex - 3, -6, 6, 1.8); continue; }
      circle(ex, -6, 4.2, COLORS.white);
      circle(ex + 0.8, -5.4, 2.4, COLORS.black);
      circle(ex + 1.6, -6.6, 0.9, COLORS.white);
    }
  }
  // рот
  ctx.strokeStyle = "#b02a62"; ctx.fillStyle = "#b02a62"; ctx.lineWidth = 2; ctx.lineCap = "round";
  if (mood === "oh" || mood === "ko") { ctx.beginPath(); ctx.ellipse(0, 4, 2.6, 3, 0, 0, Math.PI * 2); ctx.fill(); }
  else { ctx.beginPath(); ctx.moveTo(-4, 2.5); ctx.quadraticCurveTo(0, 6.5, 4, 2.5); ctx.stroke(); }
  ctx.restore();
}

// Зелёный пришелец-противник. x,y — центр, s — ширина
function drawAlien(x, y, s, { t = 0, flip = false, color = COLORS.green, hurt = false } = {}) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(flip ? -1 : 1, 1);
  const k = s / 48; ctx.scale(k, k);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath(); ctx.ellipse(0, 22, 15, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  const bob = Math.sin(t * 6) * 1.5;
  // антенны
  ctx.strokeStyle = COLORS.greenD; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-7, -14 + bob); ctx.lineTo(-11, -24 + bob); ctx.moveTo(7, -14 + bob); ctx.lineTo(11, -24 + bob); ctx.stroke();
  circle(-11, -25 + bob, 3, COLORS.yellow); circle(11, -25 + bob, 3, COLORS.yellow);
  // тело
  const g = ctx.createRadialGradient(-6, -8, 3, 0, 0, 24);
  g.addColorStop(0, hurt ? "#ffffff" : "#b6ffc4"); g.addColorStop(0.5, hurt ? "#ffb0b0" : color); g.addColorStop(1, COLORS.greenD);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0 + bob, 18, 16, 0, 0, Math.PI * 2); ctx.fill();
  // ножки
  ctx.fillStyle = COLORS.greenD;
  for (const lx of [-10, -3, 4, 11]) { ctx.beginPath(); ctx.ellipse(lx - 0.5, 16 + bob * 0.3 + Math.sin(t * 12 + lx) * 1.2, 3, 4, 0, 0, Math.PI * 2); ctx.fill(); }
  // один большой глаз
  circle(0, -3 + bob, 7.5, COLORS.white);
  circle(1.5, -2 + bob, 4, COLORS.black);
  circle(3, -4 + bob, 1.4, COLORS.white);
  ctx.strokeStyle = "#145a26"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-5, 8 + bob); ctx.lineTo(5, 8 + bob); ctx.stroke();
  ctx.restore();
}

// ---------- частицы и тряска ----------
let particles = [], shakeAmt = 0;
function burst(x, y, n, colors, { speed = 160, life = 0.7, size = 3.5, gravity = 300, up = 0 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, t: 0, life: life * (0.5 + Math.random() * 0.6),
      s: size * (0.5 + Math.random() * 0.8), c: colors[i % colors.length], g: gravity });
  }
}
function shake(a = 1) { shakeAmt = Math.max(shakeAmt, a); }
function updateParticles(dt) {
  particles.forEach(p => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= 0.985; });
  particles = particles.filter(p => p.t < p.life);
}
function drawParticles() {
  particles.forEach(p => { ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); circle(p.x, p.y, p.s * (1 - p.t / p.life * 0.5), p.c); });
  ctx.globalAlpha = 1;
}
// всплывающие надписи «+10»
let floaters = [];
function floatText(str, x, y, color = COLORS.yellow, size = 18) { floaters.push({ str, x, y, t: 0, color, size }); }

// ---------- звук: синтез в WebAudio ----------
const Sound = (() => {
  let ac = null, master = null, on = true;
  try { on = localStorage.getItem("takopi-sound") !== "off"; } catch (e) {}
  function a() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC(); master = ac.createGain(); master.gain.value = 0.45; master.connect(ac.destination);
    }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function tone(freq, dur, { type = "square", vol = 0.2, slide = 0, delay = 0, attack = 0.004 } = {}) {
    const c = on && a(); if (!c) return;
    const t0 = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, { vol = 0.4, from = 1800, to = 120, delay = 0 } = {}) {
    const c = on && a(); if (!c) return;
    const t0 = c.currentTime + delay, len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = "lowpass"; f.frequency.setValueAtTime(from, t0); f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
    g.gain.value = vol; src.connect(f); f.connect(g); g.connect(master); src.start(t0);
  }
  const melody = (notes, step, opts) => notes.forEach((f, i) => f && tone(f, step * 0.95, { ...opts, delay: i * step }));
  return {
    get on() { return on; },
    set on(v) { on = v; try { localStorage.setItem("takopi-sound", v ? "on" : "off"); } catch (e) {} if (v) a(); },
    unlock: () => on && a(),
    tone, noise, melody,
    click: () => tone(880, 0.05, { type: "triangle", vol: 0.16 }),
    jump: () => tone(380, 0.16, { type: "square", vol: 0.1, slide: 420 }),
    jump2: () => tone(560, 0.14, { type: "square", vol: 0.09, slide: 520 }),
    coin: () => { tone(988, 0.06, { type: "square", vol: 0.09 }); tone(1319, 0.14, { type: "square", vol: 0.09, delay: 0.06 }); },
    power: () => melody([523, 659, 784, 1047, 1319], 0.06, { type: "square", vol: 0.08 }),
    shoot: () => tone(1200, 0.07, { type: "square", vol: 0.05, slide: -700 }),
    hit: () => { noise(0.12, { vol: 0.3, from: 3000, to: 400 }); tone(220, 0.1, { type: "square", vol: 0.1, slide: -120 }); },
    bump: () => tone(160, 0.08, { type: "triangle", vol: 0.2, slide: -60 }),
    explode: (big = false) => { noise(big ? 0.8 : 0.35, { vol: big ? 0.8 : 0.4, from: big ? 2400 : 2000, to: 60 }); tone(big ? 110 : 150, big ? 0.5 : 0.22, { type: "sine", vol: big ? 0.5 : 0.25, slide: -70 }); },
    hurt: () => { tone(300, 0.25, { type: "sawtooth", vol: 0.1, slide: -220 }); noise(0.15, { vol: 0.2, from: 1500, to: 200 }); },
    lose: () => melody([392, 330, 262, 196], 0.17, { type: "triangle", vol: 0.15 }),
    win: () => { melody([523, 659, 784, 1047, 784, 1047, 1319], 0.11, { type: "square", vol: 0.1 }); melody([262, 330, 392, 523, 392, 523, 659], 0.11, { type: "triangle", vol: 0.1 }); },
    start: () => melody([392, 523, 659, 784], 0.07, { type: "square", vol: 0.09 }),
    tick: () => tone(1400, 0.03, { type: "square", vol: 0.04 }),
    swoosh: () => noise(0.18, { vol: 0.15, from: 4000, to: 600 }),
  };
})();

// ---------- ввод ----------
const keys = {};
const input = { x: W / 2, y: H / 2, down: false, sx: 0, sy: 0, t0: 0 };
const handlers = { tap: [], swipe: [], key: [], down: [], up: [] };
const on = (type, fn) => handlers[type].push(fn);
const pointers = new Map();
function toLocal(e) {
  const r = cv.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
}
function held(x, y, w, h) {
  for (const [px, py] of pointers.values()) if (px >= x && px < x + w && py >= y && py < y + h) return true;
  return false;
}
cv.addEventListener("pointerdown", e => {
  e.preventDefault();
  Sound.unlock();
  try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  const p = toLocal(e);
  pointers.set(e.pointerId, p);
  [input.x, input.y] = p; input.down = true; input.sx = p[0]; input.sy = p[1]; input.t0 = performance.now();
  handlers.down.forEach(f => f(p[0], p[1], e));
});
cv.addEventListener("pointermove", e => {
  const p = toLocal(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
  [input.x, input.y] = p;
});
function pointerEnd(e) {
  const p = toLocal(e);
  pointers.delete(e.pointerId);
  [input.x, input.y] = p;
  input.down = pointers.size > 0;
  handlers.up.forEach(f => f(p[0], p[1], e));
  if (e.type === "pointercancel") return;
  const dx = p[0] - input.sx, dy = p[1] - input.sy;
  if (Math.hypot(dx, dy) > 30) {
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    handlers.swipe.forEach(f => f(dir));
  } else if (performance.now() - input.t0 < 450) {
    handlers.tap.forEach(f => f(p[0], p[1], e));
  }
}
cv.addEventListener("pointerup", pointerEnd);
cv.addEventListener("pointercancel", pointerEnd);
addEventListener("contextmenu", e => e.preventDefault());
addEventListener("keydown", e => {
  if (window.rulesOpen && window.rulesOpen()) return;   // пока открыты правила, клавиши не доходят до игры
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  Sound.unlock();
  if (!keys[e.code]) handlers.key.forEach(f => f(e.code));
  keys[e.code] = true;
  if (e.code === "KeyM") setSound(!Sound.on);
});
addEventListener("keyup", e => { keys[e.code] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; pointers.clear(); input.down = false; });

// экранная кнопка: active — нажата сейчас
function button(x, y, w, h, label, active, { size = 18, color = COLORS.pinkD } = {}) {
  ctx.save();
  const dy = active ? 3 : 0;
  rrect(x, y + 4, w, h, 14, "rgba(0,0,0,0.35)");
  rrect(x, y + dy, w, h, 14, active ? color : "rgba(255,255,255,0.13)", "rgba(255,255,255,0.22)", 1.5);
  text(label, x + w / 2, y + h / 2 + dy + 1, { size, weight: 800 });
  ctx.restore();
}

// ---------- рекорды ----------
function getBest(id) { try { return +localStorage.getItem("takopi-best2-" + id) || 0; } catch (e) { return 0; } }
function saveBest(id, score) {
  const best = Math.max(getBest(id), score);
  try { localStorage.setItem("takopi-best2-" + id, best); } catch (e) {}
  return best;
}

// ---------- экраны: заставка и конец игры ----------
// card({ title, lines: [...], hint, y }) — карточка поверх затемнения
function card({ title, lines = [], hint = "", y = 230, accent = COLORS.pink, dim = true }) {
  if (dim) { ctx.fillStyle = COLORS.dim; ctx.fillRect(0, 0, W, H); }
  const h = 96 + lines.length * 30 + (hint ? 34 : 0);
  rrect(30, y, W - 60, h, 22, "rgba(30,26,64,0.94)", "rgba(255,255,255,0.12)", 1.5);
  rrect(30, y, W - 60, 6, 3, accent);
  text(title, W / 2, y + 46, { size: 30, weight: 900, color: accent, stroke: 6 });
  lines.forEach((l, i) => {
    const [str, color, size] = Array.isArray(l) ? l : [l];
    text(str, W / 2, y + 92 + i * 30, { size: size || 18, weight: 700, color: color || COLORS.ink, shadow: false });
  });
  if (hint) {
    const pulse = 0.65 + Math.sin(performance.now() / 260) * 0.35;
    ctx.globalAlpha = pulse;
    text(hint, W / 2, y + h - 30, { size: 16, weight: 800, color: COLORS.yellow, shadow: false });
    ctx.globalAlpha = 1;
  }
}
// плашка счёта сверху
function hudPill(x, y, label, value, color = COLORS.ink, align = "left") {
  ctx.font = `800 20px ${FONT}`;
  const vw = ctx.measureText(String(value)).width;
  ctx.font = `700 14px ${FONT}`;
  const lw = ctx.measureText(String(label)).width;
  const w = Math.max(64, lw + vw + 42);
  const px = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  rrect(px, y, w, 34, 17, "rgba(10,8,30,0.55)");
  text(label, px + 18, y + 17, { size: 14, color: COLORS.muted, shadow: false });
  text(String(value), px + w - 14, y + 18, { size: 20, weight: 800, color, align: "right", shadow: false });
}

// ---------- кнопки страницы: назад и звук ----------
const soundBtn = document.createElement("button");
soundBtn.className = "sound-btn";
soundBtn.title = "Звук (M)";
document.body.appendChild(soundBtn);
function setSound(v) { Sound.on = v; soundBtn.textContent = v ? "🔊" : "🔇"; }
soundBtn.addEventListener("click", () => { setSound(!Sound.on); if (Sound.on) Sound.click(); });
setSound(Sound.on);

// ---------- правила игры: кнопка «❓» и окно; при первом заходе открывается само ----------
const RULES = {
  run: {
    title: "Такопи-бег",
    goal: "Пробежать как можно дальше. Очки растут сами, пока Такопи бежит.",
    controls: ["Тап по экрану, пробел или ↑ — прыжок", "Ещё один тап в воздухе — двойной прыжок (только один раз, до приземления)"],
    rules: ["Задел конус, ящик или птицу — игра окончена", "Птицы летят быстрее земли: прыгай заранее", "Скорость всё время растёт"],
    score: ["Печенька — +10 очков", "Каждые 500 очков — звуковой сигнал"],
  },
  space: {
    title: "Такопи в космосе",
    goal: "Продержаться как можно дольше и сбить больше врагов.",
    controls: ["Веди пальцем по экрану или стрелками ← → — тарелка летит за ним", "Стрелять не нужно: тарелка стреляет сама"],
    rules: ["Тарелка не вылетает за края экрана", "Столкновение с астероидом или пришельцем, а также их выстрел — минус жизнь", "Жизней 3. После удара тарелка пару секунд мигает и неуязвима", "Каждые 300 очков — новая волна: врагов больше, они быстрее"],
    score: ["Астероид — +10 (нужно 2 попадания)", "Пришелец — +25 (перед выстрелом светится красным)", "Жёлтый бонус — тройной выстрел на 8 секунд"],
  },
  bricks: {
    title: "Разбивалка",
    goal: "Разбить все кирпичи мячом и пройти как можно больше уровней.",
    controls: ["Веди пальцем по экрану или стрелками ← → — двигаешь платформу", "Тап, пробел или ↑ — запустить мяч (он полетит туда, куда движется платформа)"],
    rules: ["Мяч отскакивает от стен и потолка, но не от низа: упустил — минус жизнь", "Жизней 3", "Чем дальше от центра платформы ударил мяч, тем острее он отлетит; движение платформы в момент удара подкручивает мяч", "С 2-го уровня верхний ряд — железные кирпичи, их нужно ударить дважды"],
    score: ["Кирпич — +10", "Уровень пройден — +100", "Печенька из кирпича — +5 и платформа шире на 10 секунд"],
  },
  snake: {
    title: "Такопи-змейка",
    goal: "Вырастить самую длинную змейку.",
    controls: ["Свайп в нужную сторону или стрелки / WASD — поворот", "Тап сбоку от головы тоже поворачивает в ту сторону"],
    rules: ["За рамку поля выходить нельзя: стена — конец игры", "Врезаться в свой хвост — конец игры", "Развернуться назад на 180° нельзя", "С каждой печенькой змейка движется чуть быстрее, каждые 5 печенек — «Быстрее!»"],
    score: ["Печенька — +10 и +1 к длине", "Золотая печенька (появляется ненадолго и мигает) — +50 и +3 к длине"],
  },
  race: {
    title: "Такопи-гонки",
    goal: "Проехать как можно дальше, не врезавшись.",
    controls: ["Свайп или тап по левой/правой половине экрана — сменить полосу", "Стрелки ← → или A/D на компьютере"],
    rules: ["Полос три, выехать за край дороги нельзя", "Врезался в машину — конец игры", "Скорость постепенно растёт", "Одна полоса всегда остаётся свободной — ищи её"],
    score: ["Очки идут за пройденный путь", "Молния ⚡ — +20 и турбо на 3 секунды: быстрее, а машины можно таранить (+30 за каждую)",
            "«Впритирку!» — ушёл с полосы перед самой машиной: +15"],
  },
};
const PAGE = (location.pathname.split("/").pop() || "").replace(".html", "");
if (RULES[PAGE]) {
  const r = RULES[PAGE];
  const list = items => "<ul>" + items.map(i => `<li>${i}</li>`).join("") + "</ul>";
  const box = document.createElement("div");
  box.className = "rules";
  box.innerHTML = `<div class="rules-card" role="dialog" aria-label="Правила">
    <h2>${r.title}</h2><p class="goal">🎯 ${r.goal}</p>
    <h3>Управление</h3>${list(r.controls)}<h3>Правила</h3>${list(r.rules)}<h3>Очки и бонусы</h3>${list(r.score)}
    <button class="rules-ok">Понятно, играем!</button></div>`;
  document.body.appendChild(box);
  const rulesBtn = document.createElement("button");
  rulesBtn.className = "rules-btn"; rulesBtn.textContent = "❓"; rulesBtn.title = "Правила";
  document.body.appendChild(rulesBtn);
  const show = v => { box.classList.toggle("open", v); for (const k in keys) keys[k] = false; pointers.clear(); input.down = false; };
  rulesBtn.addEventListener("click", () => { Sound.click(); show(true); });
  box.addEventListener("click", e => { if (e.target === box || e.target.classList.contains("rules-ok")) { Sound.unlock(); show(false); } });
  addEventListener("keydown", e => { if (e.code === "Escape") show(false); });
  try { if (!new URLSearchParams(location.search).has("play") && !localStorage.getItem("takopi-rules-seen-" + PAGE)) { show(true); localStorage.setItem("takopi-rules-seen-" + PAGE, "1"); } } catch (e) {}
  window.rulesOpen = () => box.classList.contains("open");
}

// ---------- игровой цикл ----------
const startPlaying = new URLSearchParams(location.search).has("play");
function run(game) {
  let last = performance.now();
  function frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    try {
      game.update(dt, now / 1000);
      updateParticles(dt);
      floaters.forEach(f => { f.t += dt; f.y -= 40 * dt; }); floaters = floaters.filter(f => f.t < 0.8);
      shakeAmt = Math.max(0, shakeAmt - dt * 2.5);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      const k = VIEW_SCALE * DPR;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.save();
      if (shakeAmt > 0) ctx.translate((Math.random() - 0.5) * 16 * shakeAmt, (Math.random() - 0.5) * 16 * shakeAmt);
      game.draw(now / 1000);
      ctx.restore();
      floaters.forEach(f => { ctx.globalAlpha = 1 - f.t / 0.8; text(f.str, f.x, f.y, { size: f.size, weight: 900, color: f.color, stroke: 4 }); });
      ctx.globalAlpha = 1;
      if (game.drawUI) game.drawUI(now / 1000);
    } catch (err) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = COLORS.red; ctx.fillRect(0, 0, cv.width, 60);
      ctx.fillStyle = "#fff"; ctx.font = "16px monospace"; ctx.fillText(String(err.message).slice(0, 60), 10, 34);
      throw err;
    }
    requestAnimationFrame(frame);
  }
  const go = () => { if (startPlaying && game.start) game.start(); requestAnimationFrame(frame); };
  (document.fonts ? Promise.all([document.fonts.load(`700 18px "Rubik"`), document.fonts.load(`900 18px "Rubik"`)]).catch(() => {}) : Promise.resolve()).then(go, go);
}


// ---------- Telegram WebApp интеграция для общих топов ----------
// Доверяем счёту с клиента, но ограничиваем абсурдные значения; серверный
// бот тоже проверяет верхние границы и частоту. Отправка: мягкий баннер
// внизу с кнопкой «Отправить в чат», которая открывает диалог с ботом.
(function () {
  const SCORE_CAP = { run: 100000, space: 500000, bricks: 500000, snake: 10000, race: 100000 };
  const BOT_USERNAME = "SuperRasulBot";

  function openLink(url) {
    const TG = window.Telegram && window.Telegram.WebApp;
    try {
      if (TG && TG.openTelegramLink) { TG.openTelegramLink(url); return; }
    } catch (e) {}
    window.open(url, "_blank");
  }

  let bannerEl = null;
  function showBanner(id, n) {
    if (bannerEl) bannerEl.remove();
    bannerEl = document.createElement("div");
    bannerEl.className = "tg-submit";
    bannerEl.innerHTML = '<div class="tg-submit-txt">\u{1f3c6} Новый рекорд: <b>' + n + '</b></div>' +
      '<button class="tg-submit-btn" type="button">\u{1f4e4} Отправить в чат</button>';
    document.body.appendChild(bannerEl);
    const btn = bannerEl.querySelector("button");
    btn.addEventListener("click", () => {
      const url = "https://t.me/" + BOT_USERNAME + "?start=score-" + encodeURIComponent(id) + "-" + n;
      openLink(url);
      bannerEl.querySelector(".tg-submit-txt").textContent = "✓ Рекорд отправлен";
      btn.remove();
      setTimeout(() => { if (bannerEl) { bannerEl.remove(); bannerEl = null; } }, 1800);
    });
  }

  window.TakopiScore = {
    submit(id, score) {
      const cap = SCORE_CAP[id];
      const n = cap ? Math.min(Math.max(0, score | 0), cap) : (score | 0);
      if (n < 10) return false;
      showBanner(id, n);
      return true;
    },
    hide() { if (bannerEl) { bannerEl.remove(); bannerEl = null; } },
  };

  // Автоматически оборачиваем движковый saveBest: если новый рекорд —
  // показываем баннер отправки. Для mines работает своя логика в mines.html.
  if (typeof saveBest === "function") {
    const _saveBest = saveBest;
    window.saveBest = function (id, score) {
      let prev = 0;
      try { prev = +localStorage.getItem("takopi-best2-" + id) || 0; } catch (e) {}
      const best = _saveBest(id, score);
      if (score > prev) window.TakopiScore.submit(id, Math.floor(score));
      return best;
    };
  }

  // Telegram WebApp: раскрыть на весь экран и подогнать цвета
  try {
    const TG = window.Telegram && window.Telegram.WebApp;
    if (TG) {
      TG.ready();
      TG.expand();
      if (TG.setHeaderColor) TG.setHeaderColor("#0e0c22");
      if (TG.setBackgroundColor) TG.setBackgroundColor("#0e0c22");
    }
  } catch (e) {}
})();
