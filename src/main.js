import './styles.css';
import { detectQuality } from './quality.js';
import { createHud } from './ui/hud.js';

const body = document.body;
const canvas = document.getElementById('scene');
const hud = createHud();
let experience = null;
let scroll = 0;

// ── Boot sequence (never blocks content for long) ──────────────────────────
const bootLog = document.querySelector('[data-boot-log]');
const bootBar = document.querySelector('[data-boot-bar]');
const bootLine = (text, progress) => {
  const li = document.createElement('li');
  li.textContent = text;
  bootLog.appendChild(li);
  if (bootLog.children.length > 5) bootLog.firstElementChild.remove();
  bootBar.style.width = `${progress * 100}%`;
  return li;
};
let booted = false;
function finishBoot() {
  if (booted) return;
  booted = true;
  bootBar.style.width = '100%';
  setTimeout(() => {
    body.classList.remove('is-booting');
    body.classList.add('is-ready');
    revealVisible();
  }, 250);
}
setTimeout(finishBoot, 3500); // hard cap: the portfolio is always reachable

// ── Scroll → continuous section progress ───────────────────────────────────
const sections = [...document.querySelectorAll('[data-section]')];
let anchors = [];
function measure() {
  const max = document.documentElement.scrollHeight - innerHeight;
  anchors = sections.map((s) => Math.min(s.offsetTop, max));
}
function computeScroll() {
  const y = scrollY;
  if (y <= anchors[0]) return 0;
  for (let i = 0; i < anchors.length - 1; i++) {
    if (y < anchors[i + 1]) return i + (y - anchors[i]) / Math.max(1, anchors[i + 1] - anchors[i]);
  }
  return anchors.length - 1;
}
function onScroll() {
  scroll = computeScroll();
  experience?.setScroll(scroll);
  if (!experience) hud.setSection(scroll);
}
measure();
addEventListener('resize', () => {
  measure();
  onScroll();
});
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ── Reveal + title decode effect ───────────────────────────────────────────
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/<>#';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function scramble(el) {
  if (reduced || el.dataset.scrambled) return;
  el.dataset.scrambled = '1';
  const final = el.textContent;
  let frame = 0;
  const total = 26;
  const tick = () => {
    frame++;
    el.textContent = [...final]
      .map((ch, i) => {
        if (ch === ' ' || ch === ' ') return ch;
        return frame / total > i / final.length ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      })
      .join('');
    if (frame < total) requestAnimationFrame(tick);
    else el.textContent = final;
  };
  tick();
}
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting || !booted) continue;
      e.target.classList.add('is-in');
      const titles = e.target.matches('[data-scramble]') ? [e.target] : e.target.querySelectorAll('[data-scramble]');
      titles.forEach(scramble);
      io.unobserve(e.target);
    }
  },
  { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
);
const revealEls = document.querySelectorAll('[data-reveal]');
revealEls.forEach((el) => io.observe(el));
function revealVisible() {
  // Re-observe so elements already on screen animate once the boot screen lifts.
  revealEls.forEach((el) => {
    if (!el.classList.contains('is-in')) {
      io.unobserve(el);
      io.observe(el);
    }
  });
}

document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));

// ── Pointer → subtle camera parallax ───────────────────────────────────────
addEventListener(
  'pointermove',
  (e) => {
    if (e.pointerType === 'touch') return;
    experience?.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  },
  { passive: true },
);

// ── 3D experience ──────────────────────────────────────────────────────────
function useFallback(reason) {
  body.classList.remove('is-live');
  body.classList.add('is-fallback');
  if (experience) {
    experience.dispose();
    experience = null;
  }
  if (reason) console.info(`[RS-01] Static background (${reason}).`);
  hud.setSection(scroll);
  finishBoot();
}

async function launch() {
  const { tier, reason, reducedMotion } = detectQuality();
  const l1 = bootLine('Probing graphics hardware', 0.15);
  if (!tier) {
    l1.classList.add('ok');
    bootLine('Static flight mode engaged', 0.9);
    useFallback(reason);
    return;
  }
  l1.classList.add('ok');
  const l2 = bootLine(`Quality profile: ${tier.name.toUpperCase()}`, 0.3);
  l2.classList.add('ok');
  const l3 = bootLine('Loading flight systems', 0.45);

  try {
    const { Experience } = await import('./scene/Experience.js');
    l3.classList.add('ok');
    const l4 = bootLine('Assembling airframe & atmosphere', 0.7);
    experience = new Experience(canvas, {
      tier,
      reducedMotion,
      onTelemetry: (t) => hud.update(t),
      onFatal: (why) => useFallback(why),
    });
    await experience.init();
    experience.setScroll(scroll);
    l4.classList.add('ok');
    bootLine('Engines lit. Cleared for takeoff', 1).classList.add('ok');
    experience.start();
    if (new URLSearchParams(location.search).has('debug')) window.__rs = experience;
    requestAnimationFrame(() => {
      body.classList.add('is-live');
      finishBoot();
    });
  } catch (err) {
    console.error('[RS-01] 3D scene failed to start', err);
    useFallback('init-error');
  }
}

addEventListener('pagehide', (e) => {
  if (!e.persisted) experience?.dispose();
});

launch();
