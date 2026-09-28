// HUD overlay: clock, compass, tapes, target reticle tracking the jet, readouts.

const SECTORS = ['HOME', 'ABOUT', 'SKILLS', 'PROJECTS', 'TRAINING', 'CONTACT'];
const MODES = ['CRUISE', 'FORMATION', 'HANGAR', 'MISSION', 'TRAINING', 'HOMING'];

export function createHud() {
  const q = (k) => document.querySelector(`[data-hud="${k}"]`);
  const el = {
    root: document.querySelector('.hud'),
    clock: q('clock'),
    compass: q('compass'),
    heading: q('heading'),
    altScale: q('alt-scale'),
    alt: q('alt'),
    spdScale: q('spd-scale'),
    spd: q('spd'),
    reticle: q('reticle'),
    range: q('range'),
    thr: q('thr'),
    g: q('g'),
    bank: q('bank'),
    mode: q('mode'),
    horizon: q('horizon'),
    rail: q('rail'),
    sector: q('sector'),
  };
  const navLinks = [...document.querySelectorAll('[data-nav]')];

  const tickClock = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    el.clock.textContent = `UTC ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  };
  tickClock();
  setInterval(tickClock, 1000);

  let lastSection = -1;
  let frame = 0;
  const reticle = { x: innerWidth / 2, y: innerHeight / 2, s: 120 };

  function setSection(scroll) {
    const idx = Math.round(scroll);
    el.rail.style.transform = `scaleX(${Math.min(1, scroll / (SECTORS.length - 1))})`;
    if (idx === lastSection) return;
    lastSection = idx;
    el.sector.textContent = `SECTOR ${String(idx + 1).padStart(2, '0')} · ${SECTORS[idx] ?? ''}`;
    el.mode.textContent = MODES[idx] ?? 'CRUISE';
    navLinks.forEach((a) => a.classList.toggle('is-active', Number(a.dataset.nav) === idx));
    el.root.classList.toggle('is-locked', idx === 3);
    el.root.classList.toggle('is-hidden-reticle', idx === 1);
  }

  function update(t) {
    setSection(t.scroll);
    // Reticle follows every frame (smoothed); text readouts every 4th frame.
    reticle.x += (t.x - reticle.x) * 0.25;
    reticle.y += (t.y - reticle.y) * 0.25;
    reticle.s += (t.size - reticle.s) * 0.1;
    el.reticle.style.transform = `translate3d(${reticle.x}px, ${reticle.y}px, 0)`;
    el.reticle.style.width = el.reticle.style.height = `${reticle.s}px`;
    el.reticle.style.margin = `${-reticle.s / 2}px 0 0 ${-reticle.s / 2}px`;
    el.reticle.style.visibility = t.visible ? 'visible' : 'hidden';

    el.compass.style.transform = `translateX(${-t.heading * 5}px)`;
    el.altScale.style.backgroundPositionY = `${t.altitude * 0.12}px`;
    el.spdScale.style.backgroundPositionY = `${t.speed * 0.6}px`;
    el.horizon.style.transform = `translateY(${t.pitch * 4}px) rotate(${-t.roll}deg)`;

    if (frame++ % 4) return;
    el.heading.textContent = String(Math.round(t.heading)).padStart(3, '0');
    el.alt.textContent = (Math.max(0, Math.round(t.altitude / 10)) * 10).toLocaleString('en-US');
    el.spd.textContent = Math.round(t.speed);
    el.range.textContent = t.scroll > 2.5 && t.scroll < 3.5 ? `LOCK ${(t.range * 0.03).toFixed(2)}NM` : `TRK ${(t.range * 0.03).toFixed(2)}NM`;
    el.thr.textContent = `${Math.round(t.throttle * 100)}%`;
    el.g.textContent = t.g.toFixed(1);
    el.bank.textContent = `${Math.round(t.roll)}°`;
  }

  return { update, setSection };
}
