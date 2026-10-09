import * as THREE from 'three';
import { profile, projects, oakdbFacts } from './data.js';
import { Terminal, wait } from './terminal.js';
import { installCommands } from './commands.js';
import { createWorld } from './world.js';
import { Sound } from './sound.js';

const { gsap, ScrollTrigger, SplitText, Lenis } = window;
if (gsap) gsap.registerPlugin(ScrollTrigger, SplitText);

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(hover: none), (pointer: coarse)').matches;
const mobile = innerWidth < 860;
const sound = new Sound();

/* ---------------- Toast ---------------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), 2200);
}

async function copyEmail() {
  try {
    await navigator.clipboard.writeText(profile.email);
    toast('Email copied');
  } catch {
    const r = document.createRange();
    r.selectNodeContents($('#emailTxt'));
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    toast('Email selected, press Cmd+C');
  }
}

/* ---------------- Boot (POST) ---------------- */
async function runBoot() {
  const log = $('#bootLog');
  const add = (html) => { log.innerHTML += html; };
  const lines = [
    ['IR-BIOS v2.0.27   (C) 2026 Ibrahim Raza', 0],
    ['', 60],
    ['CPU   : Human, final-year Computer Science', 90],
    ['Memory test : ', 40, 'mem'],
    ['Detecting languages : Go  TypeScript  Python  SQL ', 120, 'ok'],
    ['Detecting frameworks: React  FastAPI  Express  Socket.IO ', 120, 'ok'],
    ['Mounting oak.db ....................... ', 140, 'ok'],
    ['  WAL recovery: 0 torn frames, 0 lost transactions', 80],
    ['Compiling shaders ', 60, 'bar'],
    ['', 40],
  ];
  for (const [text, delay, kind] of lines) {
    await wait(reduced ? 0 : delay);
    if (kind === 'mem') {
      add(text);
      for (let k = 0; k <= 16384; k += 2048) { log.lastChild && (log.innerHTML = log.innerHTML.replace(/\d+K$/, '')); add(`${k}K`); await wait(reduced ? 0 : 35); }
      add(' <span class="ok">OK</span>\n');
    } else if (kind === 'bar') {
      add(text + '[');
      for (let k = 0; k < 24; k++) { add('<span class="blk">█</span>'); await wait(reduced ? 0 : 22); }
      add('] <span class="ok">OK</span>\n');
    } else {
      add(text + (kind === 'ok' ? '<span class="ok">OK</span>' : '') + '\n');
    }
  }
  add('Ready. Press ENTER to power on the monitor.\n');
  const start = $('#bootStart');
  start.classList.add('is-ready');

  return new Promise((resolve) => {
    let done = false;
    const go = (withSound) => {
      if (done) return;
      done = true;
      removeEventListener('keydown', onKey);
      if (withSound) sound.start();
      resolve(withSound);
    };
    const onKey = (e) => {
      if (e.target.closest?.('button')) return;
      if (e.key === 'Enter') go(true);
      if (e.key === 'Escape') go(false);
    };
    addEventListener('keydown', onKey);
    $$('[data-start]').forEach((b) => b.addEventListener('click', () => go(b.dataset.start === 'sound'), { once: true }));
  });
}

/* ---------------- Boot it all ---------------- */
(async function main() {
  document.body.classList.add('is-booting');
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  scrollTo(0, 0);

  // Fonts must be ready before the terminal canvas and the particle name are drawn.
  await Promise.race([
    Promise.all(['22px VT323', '800 100px Archivo', '40px "IBM Plex Mono"', '30px Caveat'].map((f) => document.fonts.load(f))),
    wait(2500),
  ]);

  const term = new Terminal({ fontSize: mobile ? 30 : 27 });
  document.fonts.ready.then(() => { term.measure(); term.dirty = true; });
  let world;
  try {
    if (!gsap || !ScrollTrigger || !SplitText) throw new Error('animation libraries failed to load');
    if (location.hash === '#static') throw new Error('static version requested');
    world = createWorld($('#gl'), { mobile, terminalCanvas: term.canvas, reduced });
  } catch (err) {
    console.warn('Falling back to the static page:', err);
    return staticFallback();
  }
  world.inside.uniforms.uBurst.value = reduced ? 0.3 : 1.8;
  $('#hudPts').textContent = `${world.inside.count.toLocaleString('en-GB')} particles`;
  $('#partCount').textContent = world.inside.count.toLocaleString('en-GB');

  const shell = installCommands(term, {
    onHire: () => { toast('Good call. Scroll down or copy the email at the bottom.'); },
    onQuery: (ok) => sound.beep(ok ? 1320 : 220, 0.05),
    onMatrix: () => sound.shimmer(),
  });
  term.onKey = (k) => {
    world.computer.press(k === 'enter' ? 'enter' : k === 'backspace' ? 'backspace' : k === 'tab' ? 'tab' : k);
    sound.key(k === 'enter' ? 'enter' : k === ' ' ? 'space' : 'char');
  };

  const withSound = await runBoot();
  setSoundUI(withSound);
  await powerOn(world, term, shell);
  setupScroll(world, term);
  setupTerminalInput(world, term);
  setupUI(world);
})();

function setSoundUI(on) {
  $('#soundBtn').setAttribute('aria-pressed', String(on));
  $('#soundTxt').textContent = on ? 'Sound on' : 'Sound off';
}

async function powerOn(world, term, shell) {
  const boot = $('#boot');
  sound.beep(988, 0.1);
  await gsap.to(boot, { opacity: 0, duration: reduced ? 0.01 : 0.5, ease: 'power2.in' }).then();
  boot.remove();

  // CRT warms up with a flicker, then the room light comes with it.
  const s = world.state;
  if (reduced) s.power = 1;
  else {
    await gsap.timeline()
      .to(s, { power: 0.35, duration: 0.18, ease: 'power4.out' })
      .to(s, { power: 0.12, duration: 0.08 })
      .to(s, { power: 0.6, duration: 0.12 })
      .to(s, { power: 1, duration: 1.1, ease: 'power2.out' })
      .then();
  }
  sound.setPower(1);
  document.body.classList.remove('is-booting');

  const split = SplitText.create('#heroName', { type: 'words,chars', charsClass: 'char' });
  if (!reduced) gsap.timeline()
    .from(split.chars, { yPercent: 110, opacity: 0, rotateX: -80, transformOrigin: '50% 100%', duration: 1.1, ease: 'expo.out', stagger: 0.035 })
    .from('.hero .kicker, .hero__pitch, .hero__try, .hero__hint', { opacity: 0, y: 18, duration: 0.9, ease: 'power3.out', stagger: 0.1 }, 0.3)
    .from('.bar, .hud', { opacity: 0, y: -10, duration: 0.8 }, 0.5);

  shell.greet();
  await wait(500);
  await term.type('neofetch', 55);
  term.print('');
  term.print("Type 'help', or query me in SQL:  SELECT * FROM projects;", 'dim');
}

/* ---------------- Typing into the 3D terminal ---------------- */
// Desktop: printable keys typed while the hero is on screen go to the terminal, so
// visitors can just start typing. Navigation keys stay with the page unless the
// visitor is mid-command, and focused links/buttons always keep their keys.
function setupTerminalInput(world, term) {
  const active = () => !world.state.inside && world.state.dive < 0.25;
  const hint = $('#heroHint');
  let used = false;
  const markUsed = () => {
    if (used) return;
    used = true;
    gsap.to(hint, { opacity: 0.45, duration: 0.4 });
  };
  const interactive = 'a, button, input, textarea, select, [contenteditable]';

  if (!touch) {
    addEventListener('keydown', (e) => {
      if (!active() || e.target.closest?.(interactive)) return;
      const k = e.key;
      if (k === 'Tab' || k.startsWith('Page') || k === 'Home' || k === 'End') return;
      const typing = term.input.length > 0 || term.busy;
      if ((k === 'ArrowUp' || k === 'ArrowDown') && !typing && !used) return;
      if (k === ' ' && !typing) return;
      if (k === 'Enter' && !typing && !used) return;
      if (term.handleKey(e)) { e.preventDefault(); markUsed(); }
    });
  } else {
    // Phones: tapping the hero opens the keyboard through a hidden textarea. A sentinel
    // character lets Android report Backspace (its keydown key is often "Unidentified").
    const box = $('#termInput');
    const SENT = '\u200b';
    const reset = () => { box.value = SENT; box.setSelectionRange(1, 1); };
    reset();
    $('.hero').addEventListener('click', (e) => {
      if (e.target.closest(interactive)) return;
      reset();
      box.focus({ preventScroll: true });
    });
    box.addEventListener('keydown', (e) => {
      if (!active()) return;
      if (['Enter', 'ArrowUp', 'ArrowDown'].includes(e.key)) { term.handleKey(e); e.preventDefault(); markUsed(); }
    });
    box.addEventListener('input', (e) => {
      if (e.isComposing) return;
      if (!active()) { reset(); return; }
      if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') term.handleKey({ key: 'Enter' });
      else if (e.inputType === 'deleteContentBackward' && box.value.length < 1) term.handleKey({ key: 'Backspace' });
      else for (const ch of box.value.replaceAll(SENT, '')) term.handleKey({ key: ch === '\n' ? 'Enter' : ch });
      reset();
      markUsed();
    });
    box.addEventListener('compositionend', () => box.dispatchEvent(new Event('input')));
    // Close the keyboard once the visitor scrolls away from the computer.
    ScrollTrigger.create({ trigger: '#dive', start: 'top 95%', onEnter: () => box.blur() });
  }

  $$('[data-cmd]').forEach((b) => b.addEventListener('click', () => {
    if (world.state.dive > 0.05) return;
    markUsed();
    term.type(b.dataset.cmd, 28);
  }));
}

/* ---------------- Scroll choreography ---------------- */
function setupScroll(world, term) {
  const lenis = reduced ? null : new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  $$('[data-nav]').forEach((a) => a.addEventListener('click', (e) => {
    const target = $(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    const y = a.getAttribute('href') === '#hero' ? 0 : target;
    lenis ? lenis.scrollTo(y, { duration: 2.4 }) : (y === 0 ? scrollTo(0, 0) : target.scrollIntoView());
  }));

  const s = world.state;
  const inside = world.inside;

  // Dive: hero → through the glass
  ScrollTrigger.create({
    trigger: '#dive', start: 'top bottom', end: 'bottom bottom', scrub: true,
    onUpdate: (st) => { s.dive = st.progress; },
  });
  gsap.to('.hero__copy, .hero__hint', { opacity: 0, y: -60, filter: 'blur(6px)', ease: 'none', scrollTrigger: { trigger: '#dive', start: 'top bottom', end: 'top 55%', scrub: true } });
  gsap.timeline({ scrollTrigger: { trigger: '#dive', start: 'top 20%', end: 'bottom bottom', scrub: true } })
    .fromTo('#diveCmd', { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, ease: 'none', duration: 0.4 })
    .to('#diveCmd', { opacity: 0, scale: 1.6, filter: 'blur(8px)', ease: 'none', duration: 0.6 });

  // Morph segments. morph = -1 + sum of segment progress.
  const seg = [0, 0, 0, 0];
  const setSeg = (i) => (st) => { seg[i] = st.progress; };
  ScrollTrigger.create({ trigger: '#name', start: 'top bottom', end: 'top 25%', scrub: true, onUpdate: setSeg(0) });
  ScrollTrigger.create({ trigger: '#oakdb', start: 'top 85%', end: 'top 5%', scrub: true, onUpdate: setSeg(1) });
  ScrollTrigger.create({ trigger: '#work', start: 'top 85%', end: 'top 5%', scrub: true, onUpdate: setSeg(2) });
  ScrollTrigger.create({ trigger: '#contact', start: 'top 85%', end: 'top 10%', scrub: true, onUpdate: setSeg(3) });

  let shimmered = -1;
  let morphS = -1;

  // Active project in the work section
  let active = 0;
  ScrollTrigger.create({
    trigger: '#work', start: 'top top', end: 'bottom bottom',
    onUpdate: (st) => {
      const i = Math.min(projects.length - 1, Math.floor(st.progress * projects.length));
      if (i !== active) { active = i; showProject(i); sound.beep(660 + i * 90, 0.04); }
    },
  });

  // Panels slide in
  [['#oakdb .panel', '#oakdb'], ['#work .panel', '#work'], ['.contact__inner', '#contact']].forEach(([el, trig]) => {
    gsap.fromTo(el, { opacity: 0, x: el.includes('contact') ? 0 : -40, y: el.includes('contact') ? 40 : 0 }, {
      opacity: 1, x: 0, y: 0, ease: 'power2.out',
      scrollTrigger: { trigger: trig, start: 'top 30%', end: 'top -10%', scrub: true },
    });
  });
  gsap.fromTo('.name__foot', { opacity: 0, y: 20 }, { opacity: 1, y: 0, scrollTrigger: { trigger: '#name', start: 'top 20%', end: 'top -10%', scrub: true } });
  gsap.fromTo('.work__list', { opacity: 0 }, { opacity: 1, scrollTrigger: { trigger: '#work', start: 'top 20%', end: 'top 0%', scrub: true } });

  // Nav highlight
  [['#hero', 0], ['#oakdb', 1], ['#work', 2], ['#contact', 3]].forEach(([id, i]) => {
    ScrollTrigger.create({
      trigger: id, start: 'top 50%', end: 'bottom 50%',
      onToggle: (st) => { if (st.isActive) $$('.bar__nav a').forEach((a, k) => a.classList.toggle('is-active', k === i)); },
    });
  });

  // Inside camera choreography, computed every frame from the morph value
  const fov = 45;
  const fit = (width, frac) => width / frac / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2)) / (innerWidth / innerHeight);
  const camName = () => ({ pos: new THREE.Vector3(0, 0, Math.max(15, fit(mobile ? 10 : 18.5, 1))), look: new THREE.Vector3(0, 0, 0) });
  const camTree = (t) => {
    const d = mobile ? fit(11, 0.95) : fit(24, 0.56);
    const x = mobile ? 0 : -d * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * (innerWidth / innerHeight) * 0.4;
    const ly = mobile ? 1 - d * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * 0.5 : 0.6;
    return { pos: new THREE.Vector3(x + Math.sin(t * 0.25) * 1.2, ly + 0.4, d), look: new THREE.Vector3(x, ly, 0) };
  };
  const camPlanet = (i) => {
    const { center: c, radius } = inside.layout[i];
    const dist = 4.6 + radius * 3.6;
    const off = mobile ? 0 : dist * 0.34;
    return { pos: new THREE.Vector3(c.x - off, c.y + 0.6, c.z + dist), look: new THREE.Vector3(c.x - off, c.y + (mobile ? -radius * 1.4 : 0), c.z) };
  };
  const camGalaxy = (t) => ({ pos: new THREE.Vector3(Math.sin(t * 0.05) * 3, 12, 15), look: new THREE.Vector3(0, -1.5, 0) });
  const lerpCam = (a, b, k) => ({ pos: a.pos.clone().lerp(b.pos, k), look: a.look.clone().lerp(b.look, k) });

  // 3D labels
  const labelLayer = $('#labels');
  const mkLabel = (html, cls = '') => { const el = document.createElement('div'); el.className = `label3d ${cls}`; el.innerHTML = html; labelLayer.appendChild(el); return el; };
  const treeLabels = [
    [mkLabel('Root page'), inside.treeLabels.root],
    [mkLabel('Internal node'), inside.treeLabels.internal],
    [mkLabel('Leaf pages, linked for range scans'), inside.treeLabels.leaves],
  ];
  const planetLabels = inside.layout.map((p, i) => [mkLabel(`<b>${String(i + 1).padStart(2, '0')}</b> ${projects[i].name}`, 'label3d--planet'), p.center.clone().add(new THREE.Vector3(p.radius * 1.15, p.radius * 0.9, 0))]);
  const v = new THREE.Vector3();
  const place = (el, pos, alpha) => {
    v.copy(pos).project(inside.camera);
    const vis = alpha > 0.01 && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
    const o = vis ? alpha.toFixed(2) : '0';
    if (el._o !== o) { el._o = o; el.style.opacity = o; }
    if (vis) el.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * innerWidth).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * innerHeight).toFixed(1)}px, 0)`;
  };

  const hudFps = $('#hudFps');
  const hudAddr = $('#hudAddr');
  let hudTick = 0;

  world.onFrame((dt, t) => {
    // Terminal → texture
    if (term.render(performance.now())) world.termTex.needsUpdate = true;

    const morph = -1 + seg[0] + seg[1] + seg[2] + seg[3];
    morphS += (morph - morphS) * Math.min(1, dt * 6);
    inside.uniforms.uMorph.value = morphS;
    inside.uniforms.uActive.value += (active - inside.uniforms.uActive.value) * 0.2;
    inside.uniforms.uRepel.value = s.inside ? 1 : 0;

    const seg2 = Math.floor(morph + 1e-3);
    if (seg2 !== shimmered && s.inside && Math.abs(morph - Math.round(morph)) < 0.02) { shimmered = seg2; sound.shimmer(); }

    // Pick camera between phases (only matters once the inside world is visible)
    let cam;
    if (!s.inside && s.dive < 0.4) cam = null;
    else
 if (morph < 0.5) cam = camName();
    else if (morph < 1) cam = lerpCam(camName(), camTree(t), THREE.MathUtils.smoothstep(morph, 0.5, 1));
    else if (morph < 1.5) cam = lerpCam(camTree(t), camPlanet(0), THREE.MathUtils.smoothstep(morph, 1, 1.5));
    else if (morph < 2.2) cam = camPlanet(active);
    else cam = lerpCam(camPlanet(active), camGalaxy(t), THREE.MathUtils.smoothstep(morph, 2.2, 2.9));
    if (cam) {
      s.insideCam.pos.copy(cam.pos);
      s.insideCam.look.copy(cam.look);
    }

    const treeA = s.inside && !mobile ? Math.max(0, 1 - Math.abs(morph - 1.0) * 4) : 0;
    treeLabels.forEach(([el, pos]) => place(el, pos, treeA));
    const planetA = s.inside ? THREE.MathUtils.smoothstep(morph, 1.7, 1.95) * (1 - THREE.MathUtils.smoothstep(morph, 2.2, 2.45)) : 0;
    planetLabels.forEach(([el, pos], i) => place(el, pos, i === active ? planetA : 0));

    sound.setDive(s.dive, s.inside);

    if (++hudTick % 15 === 0) {
      hudFps.textContent = `${world.stats.fps} FPS`;
      hudAddr.textContent = '0x' + Math.round(scrollY).toString(16).toUpperCase().padStart(4, '0');
    }
  });
}

/* ---------------- Project card ---------------- */
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&<>/';
function decode(el, text) {
  if (reduced || !window.gsap) { el.textContent = text; return; }
  el._t && el._t.kill();
  const o = { p: 0 };
  el._t = gsap.to(o, {
    p: 1, duration: 0.6, ease: 'power2.out',
    onUpdate: () => {
      const n = Math.floor(o.p * text.length);
      el.textContent = text.slice(0, n) + [...text.slice(n)].map((c) => (c === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join('');
    },
    onComplete: () => (el.textContent = text),
  });
}

function showProject(i) {
  const p = projects[i];
  $('#workIdx').textContent = String(i + 1).padStart(2, '0');
  $('#workTotal').textContent = String(projects.length).padStart(2, '0');
  decode($('#workTitle'), p.name);
  $('#workMeta').textContent = `${p.lang} · ${p.stack}`;
  $('#workSummary').textContent = p.summary;
  $('#workProof').textContent = p.proof;
  const links = $('#workLinks');
  links.innerHTML = '';
  if (p.demo) links.insertAdjacentHTML('beforeend', `<a class="btn" href="${p.demo}" target="_blank" rel="noopener">Live demo ↗</a>`);
  links.insertAdjacentHTML('beforeend', `<a class="btn ${p.demo ? 'btn--ghost' : ''}" href="${p.repo}" target="_blank" rel="noopener">Source ↗</a>`);
  window.gsap?.fromTo('#workSummary, #workProof, #workMeta, #workLinks', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.05, ease: 'power2.out', overwrite: true });
  $$('#workList li').forEach((li, k) => li.classList.toggle('is-active', k === i));
}

/* ---------------- Static UI ---------------- */
function setupUI(world) {
  $('#oakFacts').innerHTML = oakdbFacts.map((f) => `<div><dt>${f.value}</dt><dd>${f.label}</dd></div>`).join('');
  $('#workList').innerHTML = projects.map((p) => `<li>${p.name}</li>`).join('');
  showProject(0);

  const links = $('#contactLinks');
  if (profile.linkedin) links.insertAdjacentHTML('beforeend', `<a class="btn btn--ghost" href="${profile.linkedin}" target="_blank" rel="noopener">LinkedIn ↗</a>`);
  if (profile.cv) links.insertAdjacentHTML('afterbegin', `<a class="btn" href="${profile.cv}" target="_blank" rel="noopener">Download CV ↗</a>`);

  $('#emailBtn').addEventListener('click', copyEmail);
  $('#soundBtn').addEventListener('click', () => {
    const on = sound.toggle();
    setSoundUI(on);
    if (on && world) { sound.setPower(world.state.inside ? 0 : 1); }
  });
}

/* ---------------- No WebGL / no CDN: a plain, complete page ---------------- */
function staticFallback() {
  $('#boot')?.remove();
  document.body.classList.remove('is-booting');
  document.body.classList.add('no-webgl');
  const panel = $('#work .panel');
  panel.innerHTML = '<p class="kicker">Selected work</p>' + projects.map((p) => `
    <article class="fallback-project">
      <h3>${p.name}</h3>
      <p class="work__meta">${p.lang} · ${p.stack}</p>
      <p class="lede">${p.summary}</p>
      <div class="links">${p.demo ? `<a class="btn" href="${p.demo}" target="_blank" rel="noopener">Live demo ↗</a>` : ''}<a class="btn btn--ghost" href="${p.repo}" target="_blank" rel="noopener">Source ↗</a></div>
    </article>`).join('');
  $('#oakFacts').innerHTML = oakdbFacts.map((f) => `<div><dt>${f.value}</dt><dd>${f.label}</dd></div>`).join('');
  $('#emailBtn').addEventListener('click', copyEmail);
  $('#partCount').closest('p').textContent = 'Your browser could not start WebGL, so this is the plain version of the site.';
}
