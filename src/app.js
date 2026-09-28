/* Buzz — makes an Android phone vibrate, with a choice of intensity, pattern, speed and time.
   A web page can't change the motor's power, so lower intensities are made of short pulses with
   gaps, which the hand feels as a lighter buzz. Everything runs on the phone; nothing is sent anywhere. */
(function () {
  'use strict';
  const B = (window.Buzz = {});
  const $ = (s) => document.querySelector(s);

  const PERIOD = 80; /* ms per on/off cycle when simulating intensity */
  const MAX_PAIRS = 49; /* Chrome allows 99 pattern entries, each up to 10 s */
  const CHUNK = 3000; /* ms of pattern handed to the phone at a time */
  const MODES = [
    { v: 'steady', label: 'Steady' },
    { v: 'pulse', label: 'Pulse' },
    { v: 'heartbeat', label: 'Heartbeat' },
    { v: 'waves', label: 'Waves' },
    { v: 'random', label: 'Random' }
  ];
  const SPEEDS = [
    { v: 'slow', label: 'Slow', k: 0.6 },
    { v: 'medium', label: 'Medium', k: 1 },
    { v: 'fast', label: 'Fast', k: 1.8 }
  ];
  const TIMES = [
    { v: 0, label: 'Until I stop it' },
    { v: 1, label: '1 min' },
    { v: 5, label: '5 min' },
    { v: 15, label: '15 min' },
    { v: 30, label: '30 min' },
    { v: 60, label: '1 hour' }
  ];
  const canBuzz = typeof navigator.vibrate === 'function';
  const KEY = 'buzz.settings';

  const st = { level: 70, mode: 'steady', speed: 'medium', minutes: 0, awake: true };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') Object.assign(st, saved);
  } catch (e) {
    /* private mode or blocked storage: defaults are fine */
  }
  if (!MODES.some((m) => m.v === st.mode)) st.mode = 'steady';
  if (!SPEEDS.some((s) => s.v === st.speed)) st.speed = 'medium';
  if (!TIMES.some((t) => t.v === st.minutes)) st.minutes = 0;
  st.level = Math.min(100, Math.max(10, Math.round(Number(st.level) / 5) * 5 || 70));
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch (e) {
      /* ignore */
    }
  }

  /* ---------- patterns ----------
     A pattern is a list of [on, off] pairs in milliseconds. */
  B.stretch = (ms, level) => {
    ms = Math.round(ms);
    if (ms <= 0) return [];
    if (level >= 0.97) return [[ms, 0]];
    if (level <= 0.02) return [[0, ms]];
    const on = Math.max(10, Math.round(PERIOD * level));
    const off = PERIOD - on;
    const out = [];
    const cycles = Math.max(1, Math.round(ms / PERIOD));
    for (let i = 0; i < cycles; i++) out.push([on, off]);
    /* The last pause absorbs the difference, so the stretch still adds up to its length and no pulse
       is ever a sliver too short for the motor to notice. */
    const last = out[out.length - 1];
    last[1] += ms - cycles * PERIOD;
    if (last[1] < 0) {
      last[0] = Math.max(10, last[0] + last[1]);
      last[1] = 0;
    }
    return out;
  };
  const builders = {
    steady: (l) => B.stretch(CHUNK, l),
    pulse: (l, k) => {
      const burst = Math.round(500 / k);
      const out = [];
      for (let t = 0; t < CHUNK; t += burst * 2) out.push(...B.stretch(burst, l), [0, burst]);
      return out;
    },
    heartbeat: (l, k) => {
      const beat = Math.round(1000 / k);
      const out = [];
      for (let t = 0; t < CHUNK; t += beat) out.push(...B.stretch(100, l), [0, 100], ...B.stretch(180, l), [0, Math.max(120, beat - 380)]);
      return out;
    },
    waves: (l, k, phase) => {
      const cycle = 3000 / k;
      const out = [];
      for (let t = 0; t < CHUNK; t += PERIOD) {
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * (phase + t)) / cycle);
        out.push(...B.stretch(PERIOD, l * (0.12 + 0.88 * w)));
      }
      return out;
    },
    random: (l, k) => {
      const out = [];
      let t = 0;
      while (CHUNK - t >= 60) {
        const on = Math.min(CHUNK - t, Math.round((80 + Math.random() * 420) / k));
        const off = Math.min(CHUNK - t - on, Math.round((60 + Math.random() * 400) / k));
        out.push(...B.stretch(on, l * (0.4 + 0.6 * Math.random())), [0, off]);
        t += on + off;
      }
      if (t < CHUNK) out.push([0, CHUNK - t]);
      return out;
    }
  };
  /* The next few seconds of vibration for these settings, flattened for navigator.vibrate. */
  B.chunk = (o) => {
    const k = (SPEEDS.find((s) => s.v === o.speed) || SPEEDS[1]).k;
    const pairs = (builders[o.mode] || builders.steady)(Math.min(1, Math.max(0, o.level / 100)), k, o.phase || 0).slice(0, MAX_PAIRS);
    const pattern = [];
    let ms = 0;
    for (const [on, off] of pairs) {
      pattern.push(on, off);
      ms += on + off;
    }
    return { pattern, ms };
  };

  /* ---------- running ---------- */
  let running = false;
  let phase = 0;
  let endAt = 0;
  let tickT = null;
  let endT = null;
  let clockT = null;
  let lock = null;
  B.vibrate = (p) => {
    try {
      return navigator.vibrate(p);
    } catch (e) {
      return false;
    }
  };
  B.running = () => running;

  function tick() {
    if (!running) return;
    const c = B.chunk({ level: st.level, mode: st.mode, speed: st.speed, phase });
    B.vibrate(c.pattern);
    phase += c.ms;
    /* Hand the phone the next stretch just before this one runs out, so the buzz doesn't stop. */
    tickT = setTimeout(tick, Math.max(50, c.ms - 20));
  }
  async function keepAwake() {
    if (!st.awake || !('wakeLock' in navigator)) return;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => (lock = null));
    } catch (e) {
      lock = null;
    }
  }
  function letSleep() {
    if (lock) lock.release().catch(() => {});
    lock = null;
  }
  B.start = () => {
    if (running || !canBuzz) return false;
    running = true;
    phase = 0;
    endAt = st.minutes ? Date.now() + st.minutes * 60000 : 0;
    if (endAt) endT = setTimeout(() => B.stop('Finished'), st.minutes * 60000);
    keepAwake();
    tick();
    clockT = setInterval(paintStatus, 500);
    paint();
    return true;
  };
  B.stop = (why) => {
    if (!running) return;
    running = false;
    clearTimeout(tickT);
    clearTimeout(endT);
    clearInterval(clockT);
    tickT = endT = clockT = null;
    B.vibrate(0);
    letSleep();
    paint(why || 'Stopped');
  };
  /* Android silences the motor while the screen is off or another app is in front; carry on when we're back. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !running) return;
    if (!lock) keepAwake();
    clearTimeout(tickT);
    tick();
  });
  /* A change while buzzing takes effect straight away. */
  function restart() {
    if (!running) return;
    clearTimeout(tickT);
    phase = 0;
    tick();
  }

  /* ---------- screen ---------- */
  function chips(box, options, get, set) {
    box.innerHTML = '';
    for (const o of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('role', 'radio');
      b.dataset.value = String(o.v);
      b.textContent = o.label;
      b.addEventListener('click', () => {
        set(o.v);
        save();
        paint();
      });
      box.appendChild(b);
    }
    const mark = () => {
      for (const b of box.children) b.setAttribute('aria-checked', String(b.dataset.value === String(get())));
    };
    mark();
    return mark;
  }
  const marks = [];
  const level = $('#level');
  const levelOut = $('#level-out');
  const go = $('#go');
  const goLabel = $('#go-label');
  const status = $('#status');
  const awake = $('#awake');
  const speedRow = $('#speed-row');

  function mmss(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function paintStatus(note) {
    if (!canBuzz) {
      status.textContent = 'This browser can’t vibrate the phone.';
      return;
    }
    if (running) {
      const left = endAt ? endAt - Date.now() : 0;
      status.textContent = 'Buzzing' + (endAt ? ' · ' + mmss(left) + ' left' : '') + ' · ' + st.level + '% ' + (MODES.find((m) => m.v === st.mode) || MODES[0]).label.toLowerCase();
    } else status.textContent = note || 'Ready';
  }
  function paint(note) {
    level.value = String(st.level);
    levelOut.textContent = st.level + '%';
    level.style.setProperty('--fill', st.level + '%');
    for (const m of marks) m();
    speedRow.hidden = st.mode === 'steady';
    awake.checked = !!st.awake;
    go.setAttribute('aria-pressed', String(running));
    go.classList.toggle('running', running);
    goLabel.textContent = running ? 'Stop' : 'Start';
    document.body.classList.toggle('buzzing', running);
    paintStatus(note);
  }

  marks.push(
    chips($('#mode'), MODES, () => st.mode, (v) => {
      st.mode = v;
      restart();
    }),
    chips($('#speed'), SPEEDS, () => st.speed, (v) => {
      st.speed = v;
      restart();
    }),
    chips($('#minutes'), TIMES, () => st.minutes, (v) => {
      st.minutes = v;
      if (running) {
        clearTimeout(endT);
        endAt = v ? Date.now() + v * 60000 : 0;
        if (endAt) endT = setTimeout(() => B.stop('Finished'), v * 60000);
      }
    })
  );
  level.addEventListener('input', () => {
    st.level = Number(level.value);
    levelOut.textContent = st.level + '%';
    level.style.setProperty('--fill', st.level + '%');
    if (running) {
      clearTimeout(tickT);
      tickT = setTimeout(restart, 150);
    }
  });
  /* Letting go of the slider gives a short taste of that intensity. */
  level.addEventListener('change', () => {
    save();
    if (!running && canBuzz) {
      const { pattern } = B.chunk({ level: st.level, mode: 'steady', speed: 'medium' });
      B.vibrate(pattern.slice(0, 12));
    }
    paint();
  });
  awake.addEventListener('change', () => {
    st.awake = awake.checked;
    save();
    if (running) {
      if (st.awake) keepAwake();
      else letSleep();
    }
  });
  go.addEventListener('click', () => {
    if (running) B.stop();
    else B.start();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && running) B.stop();
  });

  if (!canBuzz) {
    const nope = $('#nope');
    nope.hidden = false;
    nope.textContent = /iPhone|iPad|iPod/.test(navigator.userAgent)
      ? 'Buzz can’t work on an iPhone or iPad: Apple doesn’t let web pages use the vibration motor. It needs an Android phone.'
      : 'This browser can’t vibrate the phone. On Android, open Buzz in Chrome, Samsung Internet or Firefox.';
    go.disabled = true;
  }
  paint();
})();
