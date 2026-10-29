'use strict';

const $app = document.getElementById('app');

// ---------- Storage (fails silently in private mode) ----------
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};

let players = store.get('players', []);
let tally = store.get('tally', {});
let currentGame = null;

// ---------- Helpers ----------
const MAX_PLAYERS = 12;
// Falls from the sky on the loser screen.
const DROPS = ['💀', '🫵', '😂', '🤡', '🔥', '🍺', '🍕'];

const ROASTS = [
  'Nobody wants to hear it.',
  'The group has spoken.',
  'Walk of shame starts now.',
  'Should\'ve picked better.',
  'Your legs work. Use them.',
  'Skill issue.',
  'Everyone saw that. Go.',
  'Hurry up, we\'re waiting.',
  'Don\'t complain, just go.',
  'Loser energy detected.',
  'It was never going to be anyone else.',
  'Thank you for your service.',
];
const COLORS = ['#ff3d6e', '#ffb800', '#21d19f', '#3d8bff', '#b04dff', '#ff7a1a', '#00c2d1', '#ff4dd2'];

const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rand = (min, max) => min + Math.random() * (max - min);
const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Timers and listeners belong to the current screen and are cleared on every render.
let timers = [];
let teardown = [];
function later(fn, ms) {
  const id = setTimeout(fn, ms);
  timers.push(id);
  return id;
}
function render(html) {
  timers.forEach(clearTimeout);
  timers = [];
  teardown.forEach(fn => fn());
  teardown = [];
  $app.innerHTML = html;
  window.scrollTo(0, 0);
}
const $ = sel => $app.querySelector(sel);

// ---------- Sound and vibration ----------
let audio;
function beep(freq, dur, type = 'square', vol = 0.12) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + dur);
  } catch {}
}
function buzz(pattern) {
  try { navigator.vibrate && navigator.vibrate(pattern); } catch {}
}

const topBar = (title, sub = '') => `
  <header class="bar">
    <button class="back" data-nav="menu" aria-label="Back to games">←</button>
    <div><h2>${title}</h2>${sub ? `<p class="who">${sub}</p>` : ''}</div>
  </header>`;

// ---------- Screens ----------
function showSetup() {
  currentGame = null;
  const hasTally = Object.values(tally).some(n => n > 0);
  render(`
    <header class="hero">
      <h1>Ur<br>Fucked</h1>
      <p>Play. Lose. You're fucked.</p>
    </header>
    <form class="add" id="add">
      <input id="name" maxlength="16" placeholder="Add a player" autocomplete="off" enterkeyhint="done" aria-label="Player name">
      <button class="btn" type="submit">Add</button>
    </form>
    ${players.length ? `<ul class="players">${players.map((p, i) => `
      <li>
        <span>${esc(p)}</span>
        ${tally[p] ? `<small>💀 ×${tally[p]}</small>` : ''}
        <button class="x" data-remove="${i}" aria-label="Remove ${esc(p)}">×</button>
      </li>`).join('')}</ul>`
      : `<p class="empty">Who's playing? Add everyone who could lose.</p>`}
    <div class="spacer"></div>
    <button class="btn big" data-nav="menu" ${players.length < 2 ? 'disabled' : ''}>
      ${players.length < 2 ? 'Add at least 2 players' : 'Pick a game →'}
    </button>
    ${hasTally ? `<button class="link" id="reset">Reset loss counts</button>` : ''}
  `);

  const input = $('#name');
  $('#add').addEventListener('submit', e => {
    e.preventDefault();
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (players.some(p => p.toLowerCase() === name.toLowerCase())) {
      input.value = '';
      input.placeholder = `${name} is already in`;
      return;
    }
    if (players.length >= MAX_PLAYERS) {
      input.value = '';
      input.placeholder = `Max ${MAX_PLAYERS} players`;
      return;
    }
    players.push(name);
    store.set('players', players);
    showSetup();
    $('#name').focus();
  });
  $('.players')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    players.splice(+btn.dataset.remove, 1);
    store.set('players', players);
    showSetup();
  });
  $('#reset')?.addEventListener('click', () => {
    tally = {};
    store.set('tally', tally);
    showSetup();
  });
}

function showMenu() {
  if (players.length < 2) return showSetup();
  currentGame = null;
  render(`
    <header class="bar">
      <button class="back" data-nav="setup" aria-label="Edit players">←</button>
      <div><h2>Pick a game</h2><p class="who">${players.map(esc).join(' · ')}</p></div>
    </header>
    <p class="label">Loser is fucked.</p>
    <div class="games">
      ${GAMES.map(g => `
        <button class="game" data-game="${g.id}">
          <span class="ico">${g.icon}</span>
          <span><b>${g.name}</b><small>${g.desc}</small></span>
        </button>`).join('')}
    </div>
    <button class="btn ghost big" data-random>🎲 Random game</button>
  `);
  $('[data-random]').addEventListener('click', () => startGame(pickOne(GAMES).id));
}

function startGame(id) {
  currentGame = GAMES.find(g => g.id === id);
  currentGame.run();
}

function showLoser(name) {
  tally[name] = (tally[name] || 0) + 1;
  store.set('tally', tally);
  buzz([120, 60, 120, 60, 300]);

  const trips = tally[name];
  render(`
    <div class="result">
      <p class="kicker">Get up,</p>
      <h1 class="loser-name">${esc(name)}</h1>
      <p class="sub">You're fucked.</p>
      <p class="roast">${pickOne(ROASTS)}</p>
      <p class="count">${trips === 1 ? 'First loss.' : `That's loss #${trips}.`}</p>
      <div class="stack">
        <button class="btn big" data-again>Play again</button>
        <button class="btn ghost big" data-nav="menu">Other game</button>
      </div>
    </div>
    <div class="rain" aria-hidden="true">
      ${Array.from({ length: 24 }, () => `<span style="left:${rand(0, 95)}%;animation-duration:${rand(2.2, 4).toFixed(2)}s;animation-delay:${rand(0, 1.2).toFixed(2)}s">${pickOne(DROPS)}</span>`).join('')}
    </div>
  `);
  beep(330, 0.15, 'triangle', 0.2);
  later(() => beep(220, 0.4, 'triangle', 0.2), 160);
  const game = currentGame;
  $('[data-again]').addEventListener('click', () => game ? startGame(game.id) : showMenu());
}

// ---------- Game 1: Shortest Straw ----------
function playStraw() {
  const n = players.length;
  // Distinct lengths between 25% and 82%; the shortest one loses.
  const lengths = shuffle(Array.from({ length: n }, (_, i) => Math.round(25 + i * 57 / (n - 1))));
  const owner = Array(n).fill(null);
  let turn = 0;

  render(`
    ${topBar('Shortest Straw')}
    <p class="prompt" id="prompt"></p>
    <div class="straws" id="straws">
      ${lengths.map((_, i) => `<button class="straw" data-i="${i}" aria-label="Straw ${i + 1}"><span class="stick"></span><span class="tag"></span></button>`).join('')}
    </div>
    <p class="hint">They all look the same. They're not.</p>
  `);

  const prompt = $('#prompt');
  const straws = $('#straws');
  const update = () => {
    prompt.innerHTML = turn < n ? `<b>${esc(players[turn])}</b>, pick a straw` : 'Revealing…';
  };
  update();

  straws.addEventListener('click', e => {
    const btn = e.target.closest('.straw');
    if (!btn || turn >= n) return;
    const i = +btn.dataset.i;
    if (owner[i] !== null) return;
    owner[i] = turn;
    btn.classList.add('taken');
    btn.querySelector('.tag').textContent = players[turn];
    beep(520 + turn * 40, 0.06);
    buzz(15);
    turn++;
    update();
    if (turn === n) later(reveal, 700);
  });

  function reveal() {
    straws.classList.add('revealed');
    [...straws.children].forEach((btn, i) => btn.style.setProperty('--h', lengths[i] + '%'));
    beep(180, 0.5, 'sawtooth', 0.08);
    const shortest = lengths.indexOf(Math.min(...lengths));
    later(() => {
      straws.children[shortest].classList.add('loser');
      prompt.innerHTML = `<b>${esc(players[owner[shortest]])}</b> drew the short one`;
    }, 1400);
    later(() => showLoser(players[owner[shortest]]), 3000);
  }
}

// ---------- Game 2: Hot Potato ----------
function playPotato() {
  render(`
    ${topBar('Hot Potato')}
    <div class="center">
      <button class="potato" id="bomb" aria-label="Start the bomb">💣</button>
      <p class="prompt" id="prompt">Tap the bomb, then pass the phone.<br>Don't be holding it when it blows.</p>
    </div>
  `);

  const bomb = $('#bomb');
  const prompt = $('#prompt');
  let started = false;

  bomb.addEventListener('click', () => {
    if (started) return;
    started = true;
    const fuse = rand(12000, 30000);
    const t0 = performance.now();
    prompt.innerHTML = '<b>PASS IT!</b>';

    const tick = () => {
      const left = fuse - (performance.now() - t0);
      if (left <= 0) return explode();
      beep(900, 0.04, 'square', 0.08);
      bomb.classList.remove('pulse');
      void bomb.offsetWidth; // restart the animation
      bomb.classList.add('pulse');
      later(tick, Math.max(110, Math.min(800, left / 12)));
    };
    tick();
  });

  function explode() {
    beep(70, 0.8, 'sawtooth', 0.25);
    buzz([400, 100, 400]);
    render(`
      ${topBar('Hot Potato')}
      <div class="boom">💥</div>
      <p class="prompt">BOOM. Who was holding it?</p>
      <div class="pick">
        ${players.map((p, i) => `<button class="btn ghost" data-i="${i}">${esc(p)}</button>`).join('')}
      </div>
    `);
    $('.pick').addEventListener('click', e => {
      const btn = e.target.closest('[data-i]');
      if (btn) showLoser(players[+btn.dataset.i]);
    });
  }
}

// ---------- Game 3: Wheel of Doom ----------
function playWheel() {
  render(`
    ${topBar('Wheel of Doom')}
    <div class="wheel-wrap"><div class="pointer"></div><canvas id="wheel"></canvas></div>
    <div class="spacer"></div>
    <button class="btn big" id="spin">Spin it</button>
  `);

  const canvas = $('#wheel');
  const ctx = canvas.getContext('2d');
  const size = Math.min(window.innerWidth - 32, 360);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.height = size * dpr;
  canvas.style.width = canvas.style.height = size + 'px';
  ctx.scale(dpr, dpr);

  const n = players.length;
  const seg = 2 * Math.PI / n;
  const colorFor = i => (i === n - 1 && n % COLORS.length === 1) ? COLORS[1] : COLORS[i % COLORS.length];
  let rot = rand(0, 2 * Math.PI);
  let raf = 0;
  teardown.push(() => cancelAnimationFrame(raf));

  // The pointer sits at the top (angle -90°).
  const indexAt = r => Math.floor((((1.5 * Math.PI - r) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / seg);

  function draw() {
    const r = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(r, r);
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r - 4, rot + i * seg, rot + (i + 1) * seg);
      ctx.closePath();
      ctx.fillStyle = colorFor(i);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#14101f';
      ctx.stroke();

      ctx.save();
      ctx.rotate(rot + (i + 0.5) * seg);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#14101f';
      ctx.font = `800 ${Math.max(12, Math.min(20, 150 / n + 6))}px system-ui, sans-serif`;
      const name = players[i].length > 11 ? players[i].slice(0, 10) + '…' : players[i];
      ctx.fillText(name, r - 18, 0);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, 2 * Math.PI);
    ctx.fillStyle = '#14101f';
    ctx.fill();
    ctx.restore();
  }
  draw();

  const spinBtn = $('#spin');
  spinBtn.addEventListener('click', () => {
    spinBtn.disabled = true;
    spinBtn.textContent = 'Spinning…';
    const start = rot;
    const delta = 2 * Math.PI * rand(5, 8);
    const duration = rand(4200, 5600);
    const t0 = performance.now();
    let last = indexAt(rot);

    const step = now => {
      const t = Math.min(1, (now - t0) / duration);
      rot = start + delta * (1 - Math.pow(1 - t, 4));
      draw();
      const idx = indexAt(rot);
      if (idx !== last) {
        last = idx;
        beep(1400, 0.015, 'square', 0.06);
      }
      if (t < 1) raf = requestAnimationFrame(step);
      else later(() => showLoser(players[idx]), 800);
    };
    raf = requestAnimationFrame(step);
  });
}

// ---------- Game 4: Reaction Duel ----------
function playReaction() {
  const times = [];
  let turn = 0;
  let state = 'intro';
  let goAt = 0;
  let waitTimer = 0;

  render(`${topBar('Reaction Duel', 'Slowest tap loses')}<button class="pad" id="pad"></button>`);
  const pad = $('#pad');
  const show = (cls, html) => { pad.className = 'pad ' + cls; pad.innerHTML = html; };

  const intro = () => {
    state = 'intro';
    show('ready', `<b>${esc(players[turn])}</b><span>Your turn. Tap to start,<br>then tap again when it turns green.</span>`);
  };
  const next = () => {
    state = 'done';
    later(() => {
      turn++;
      turn < players.length ? intro() : results();
    }, 1400);
  };

  pad.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (state === 'intro') {
      state = 'wait';
      show('wait', '<b>Wait for it…</b><span>Tap when it turns green</span>');
      waitTimer = later(() => {
        state = 'go';
        goAt = performance.now();
        show('go', '<b>TAP!</b>');
      }, rand(1500, 4500));
    } else if (state === 'wait') {
      clearTimeout(waitTimer);
      times[turn] = Infinity;
      show('bad', '<b>Too early!</b><span>False start counts as slowest</span>');
      beep(120, 0.3, 'sawtooth', 0.12);
      buzz(250);
      next();
    } else if (state === 'go') {
      const ms = Math.round(performance.now() - goAt);
      times[turn] = ms;
      show('ok', `<b>${ms} ms</b>`);
      beep(880, 0.08);
      next();
    }
  });

  function results() {
    const worst = Math.max(...times);
    const loserIdx = pickOne(times.map((t, i) => t === worst ? i : -1).filter(i => i >= 0));
    const order = players.map((p, i) => ({ p, t: times[i], i })).sort((a, b) => a.t - b.t);
    render(`
      ${topBar('Reaction Duel', 'Results')}
      <ul class="results">
        ${order.map(r => `<li class="${r.i === loserIdx ? 'worst' : ''}"><span>${esc(r.p)}</span><span>${r.t === Infinity ? 'False start' : r.t + ' ms'}</span></li>`).join('')}
      </ul>
      <div class="spacer"></div>
      <button class="btn big" id="reveal">See who's going →</button>
    `);
    $('#reveal').addEventListener('click', () => showLoser(players[loserIdx]));
  }

  intro();
}

// ---------- Game 5: Doom Card ----------
function playCards() {
  const count = Math.min(16, Math.max(8, players.length * 2));
  const doom = Math.floor(Math.random() * count);
  let turn = 0;
  let over = false;

  render(`
    ${topBar('Doom Card', 'One card seals your fate')}
    <p class="prompt" id="prompt"></p>
    <div class="cards" id="cards">
      ${Array.from({ length: count }, (_, i) => `
        <button class="card" data-i="${i}" aria-label="Card ${i + 1}">
          <span class="face front">?</span><span class="face backside"></span>
        </button>`).join('')}
    </div>
  `);

  const prompt = $('#prompt');
  const update = () => { prompt.innerHTML = `<b>${esc(players[turn])}</b>, flip a card`; };
  update();

  $('#cards').addEventListener('click', e => {
    const card = e.target.closest('.card');
    if (!card || over || card.classList.contains('flipped')) return;
    const back = card.querySelector('.backside');
    card.classList.add('flipped');
    if (+card.dataset.i === doom) {
      over = true;
      card.classList.add('doom');
      back.textContent = '💀';
      prompt.innerHTML = `<b>${esc(players[turn])}</b> found the doom card`;
      beep(110, 0.6, 'sawtooth', 0.15);
      buzz([300, 80, 300]);
      later(() => showLoser(players[turn]), 1800);
    } else {
      back.textContent = '😮‍💨';
      beep(660, 0.06, 'triangle');
      buzz(15);
      turn = (turn + 1) % players.length;
      later(update, 450);
    }
  });
}

const GAMES = [
  { id: 'straw', icon: '🥢', name: 'Shortest Straw', desc: 'Everyone picks a straw. Shortest one gets up.', run: playStraw },
  { id: 'potato', icon: '💣', name: 'Hot Potato', desc: 'Pass the phone. Holding it when it blows? You lose.', run: playPotato },
  { id: 'wheel', icon: '🎡', name: 'Wheel of Doom', desc: 'Spin the wheel and let fate decide.', run: playWheel },
  { id: 'reaction', icon: '⚡', name: 'Reaction Duel', desc: 'Tap when it turns green. Slowest loses.', run: playReaction },
  { id: 'cards', icon: '🃏', name: 'Doom Card', desc: 'Take turns flipping. Find the doom card, you lose.', run: playCards },
];

// ---------- Navigation ----------
$app.addEventListener('click', e => {
  const nav = e.target.closest('[data-nav]');
  if (nav) return nav.dataset.nav === 'menu' ? showMenu() : showSetup();
  const game = e.target.closest('[data-game]');
  if (game) startGame(game.dataset.game);
});

players.length >= 2 ? showMenu() : showSetup();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
