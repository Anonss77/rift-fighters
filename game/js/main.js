// main.js — boot, renderer, procedural Shattercourt arena, fixed 60 Hz loop,
// input (keyboard + pointer), state machine, and ?shot= staging for screenshots.
import * as THREE from 'three';
import { loadModels, makeFighterRig, playLoop } from './chars.js';
import { Match } from './combat.js';
import { Bot } from './ai.js';
import { FX } from './fx.js';
import { AudioSys } from './audio.js';
import { UI } from './ui.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || '';
const $ = (id) => document.getElementById(id);

let moves = null;
let renderer, scene, camera, fx, audio, ui, match, bot;
let heroes = [];
let frame = 0, acc = 0, lastT = 0;
let frozen = false; // staged screenshot: render without advancing anything
let playerRig = null, botRig = null;
let rocks = [];
const keys = {};
const events = [];
const clock = { now: 0 };

async function boot() {
  moves = await (await fetch('data/moves.json')).json();
  heroes = moves.heroes;
  await loadModels();

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  $('stage').appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b16);
  scene.fog = new THREE.Fog(0x0b0b16, 14, 30);
  camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 1.9, 7.8);
  camera.lookAt(0, 1.2, 0);

  buildLights();
  buildArena();
  fx = new FX(scene, camera);
  audio = new AudioSys();

  ui = new UI({
    onAction: (id, down) => onAction(id, down),
    onSelect: () => { audio.init(); audio.play('confirm'); showSelect(); },
    onHeroPick: (i) => { audio.init(); audio.play('ui'); previewHero(i); },
    onStart: () => { audio.init(); audio.play('confirm'); startMatch(); },
    onRematch: () => { audio.play('confirm'); startMatch(true); },
    onChangeFighter: () => { audio.play('cancel'); showSelect(); },
    onMenu: () => { audio.play('cancel'); showTitle(); },
    onToggleAudio: () => { audio.init(); return audio.toggle(); },
    onSound: (n) => { audio.init(); audio.play(n); },
  });
  ui.buildSelect(heroes, heroes);
  ui.difficulty = 'normal';

  match = new Match(moves, events);
  wireInput();
  addEventListener('resize', onResize);

  showTitle();
  if (SHOT) stageShot();
  else window.__shotReady = true;
  requestAnimationFrame(loop);
}

function buildLights() {
  scene.add(new THREE.AmbientLight(0x8a8fb0, 0.55));
  const key = new THREE.DirectionalLight(0xfff2dd, 1.6);
  key.position.set(3, 8, 6);
  scene.add(key);
  const rift = new THREE.PointLight(0xff6a22, 60, 18, 1.8);
  rift.position.set(0, 3.2, -4.5);
  scene.add(rift);
  const rim = new THREE.PointLight(0x2ad4ff, 18, 12, 2);
  rim.position.set(0, 1.0, 3.5);
  scene.add(rim);
}

function crackTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#2e2e36'; g.fillRect(0, 0, 512, 512);
  // stone noise
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${20 + Math.random() * 40 | 0},${20 + Math.random() * 40 | 0},${24 + Math.random() * 44 | 0},0.5)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 5, 2 + Math.random() * 5);
  }
  // radial cracks from center
  g.strokeStyle = '#14141c'; g.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
    g.beginPath();
    g.moveTo(256, 256);
    let x = 256, y = 256;
    for (let s = 0; s < 5; s++) {
      x += Math.cos(a + (Math.random() - 0.5) * 0.5) * 42;
      y += Math.sin(a + (Math.random() - 0.5) * 0.5) * 42;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // glowing rift veins
  g.strokeStyle = 'rgba(255,106,34,0.85)'; g.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    g.beginPath(); g.moveTo(256, 256);
    g.lineTo(256 + Math.cos(a) * 120, 256 + Math.sin(a) * 120);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildArena() {
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6.5, 0.5, 48),
    new THREE.MeshStandardMaterial({ map: crackTexture(), roughness: 0.9, metalness: 0.05 }));
  floor.position.y = -0.25;
  scene.add(floor);
  const rimRing = new THREE.Mesh(
    new THREE.TorusGeometry(6.05, 0.09, 10, 64),
    new THREE.MeshStandardMaterial({ color: 0x2ad4ff, emissive: 0x2ad4ff, emissiveIntensity: 1.4 }));
  rimRing.rotation.x = Math.PI / 2; rimRing.position.y = 0.02;
  scene.add(rimRing);
  // broken arch framing the rift
  const archMat = new THREE.MeshStandardMaterial({ color: 0x4a4a58, roughness: 0.85 });
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5.2, 0.8), archMat);
  p1.position.set(-3.4, 2.6, -4.6); p1.rotation.z = 0.06; scene.add(p1);
  const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.4, 0.8), archMat);
  p2.position.set(3.4, 2.2, -4.6); p2.rotation.z = -0.1; scene.add(p2);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.8, 0.8), archMat);
  beam.position.set(0.3, 5.0, -4.6); beam.rotation.z = -0.08; scene.add(beam);
  // the rift: glowing vertical plane + core
  const riftMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.9 });
  const rift = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 4.6), riftMat);
  rift.position.set(0, 2.6, -5.2); scene.add(rift);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
  core.position.set(0, 2.6, -5.0); scene.add(core);
  // floating rocks
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a3a48, roughness: 0.95 });
  for (let i = 0; i < 9; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + Math.random() * 0.5, 0), rockMat);
    const a = Math.random() * Math.PI * 2, d = 8 + Math.random() * 6;
    r.position.set(Math.cos(a) * d, 1 + Math.random() * 4, -3 - Math.random() * 6);
    r.userData = { y0: r.position.y, sp: 0.3 + Math.random() * 0.5, ph: Math.random() * 6 };
    scene.add(r); rocks.push(r);
  }
  // distant stars
  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(120 * 3);
  for (let i = 0; i < 120; i++) {
    sp[i * 3] = (Math.random() - 0.5) * 50;
    sp[i * 3 + 1] = 3 + Math.random() * 18;
    sp[i * 3 + 2] = -8 - Math.random() * 14;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xaac4ff, size: 0.12 })));
}

// blob shadow under a fighter
function makeShadow() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02;
  scene.add(m);
  return m;
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function wireInput() {
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    audio.init();
    if (e.code === 'Space') e.preventDefault();
    if (match.phase !== 'fight') {
      if (e.code === 'Enter') {
        if ($('screen-title').classList.contains('show')) ui.cb.onSelect();
        else if ($('screen-select').classList.contains('show')) ui.cb.onStart();
      }
      return;
    }
    const map = { KeyJ: 'punch', KeyK: 'kick', KeyQ: 'skill1', KeyE: 'skill2', KeyR: 'skill3', KeyF: 'ult' };
    if (map[e.code]) match.queue(match.a, map[e.code]);
    if (e.code === 'Space') match.queue(match.a, 'jump');
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') match.queue(match.a, 'dash');
    if (e.code === 'KeyL') match.setBlock(match.a, true);
  });
  addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'KeyL') match.setBlock(match.a, false);
  });
  // hold-to-walk: press left/right half of the 3D stage
  const stage = $('stage');
  let walkDir = 0;
  stage.addEventListener('pointerdown', (e) => {
    audio.init();
    if (match.phase !== 'fight') return;
    walkDir = e.clientX < innerWidth / 2 ? -1 : 1;
  });
  const stopWalk = () => { walkDir = 0; };
  stage.addEventListener('pointerup', stopWalk);
  stage.addEventListener('pointerleave', stopWalk);
  stage.addEventListener('pointercancel', stopWalk);
  window.__walkDir = () => walkDir;
}

function onAction(id, down) {
  audio.init();
  if (!match || match.phase !== 'fight') return;
  if (id === 'block') { match.setBlock(match.a, down); return; }
  if (down) match.queue(match.a, id);
}

// ---- screens ----
let titleRigs = [];
function clearRigs() {
  for (const r of [...titleRigs, playerRig, botRig]) {
    if (r) scene.remove(r.root);
  }
  titleRigs = []; playerRig = null; botRig = null;
}
function showTitle() {
  clearRigs();
  const kael = makeFighterRig(heroes[0], moves);
  const mira = makeFighterRig(heroes[4], moves);
  kael.root.position.set(-2.2, 0, 0); kael.root.rotation.y = Math.PI / 2;
  mira.root.position.set(2.2, 0, 0); mira.root.rotation.y = -Math.PI / 2;
  playLoop(kael, 'Idle'); playLoop(mira, 'Idle');
  scene.add(kael.root); scene.add(mira.root);
  titleRigs = [kael, mira];
  ui.show('screen-title');
}
function showSelect() {
  clearRigs();
  previewHero(ui.selHero);
  ui.show('screen-select');
}
function previewHero(i) {
  if (playerRig) { scene.remove(playerRig.root); playerRig = null; }
  playerRig = makeFighterRig(heroes[i], moves);
  playerRig.root.position.set(0, 0, -0.5);
  playerRig.root.rotation.y = Math.PI / 2;
  playLoop(playerRig, 'Idle');
  scene.add(playerRig.root);
}
function startMatch(rematch = false) {
  clearRigs();
  const hA = heroes[ui.selHero];
  const hB = heroes[ui.selBot];
  match.start(hA, hB);
  playerRig = makeFighterRig(hA, moves);
  botRig = makeFighterRig(hB, moves);
  match.a.rig = playerRig; match.b.rig = botRig;
  match.a.shadow = makeShadow(); match.b.shadow = makeShadow();
  scene.add(playerRig.root); scene.add(botRig.root);
  bot = new Bot(ui.difficulty);
  ui.setIntro(hA, hB);
  ui.show('screen-intro');
  audio.play('confirm');
}

// ---- events from the sim ----
const seenEvents = new Set();
function drainEvents(persist) {
  while (events.length) {
    const e = events.shift();
    seenEvents.add(e.type);
    switch (e.type) {
      case 'spark': fx.spark(e.x, e.y, e.color, e.big); break;
      case 'text': fx.damageNumber(e.x, e.y, e.txt, e.color); break;
      case 'proj': fx.projMarker(e.x, e.y, e.color); break;
      case 'wave': fx.waveMarker(e.x, e.color); break;
      case 'wall': fx.showWall(e.x, e.color); break;
      case 'wallgone': fx.hideWall(); break;
      case 'ult': fx.ultFlash(e.color); fx.shake(6, 0.18); break;
      case 'sound': audio.play(e.name, e.el); break;
      case 'round': ui.setIntro(match.a.hero, match.b.hero); ui.show('screen-intro'); break;
      case 'fight': ui.show(null); break;
      case 'roundEnd': {
        const w = e.winner === 0 ? 'ROUND WON' : 'ROUND LOST';
        ui.setRoundEnd(w, `${e.rounds[0]} — ${e.rounds[1]}`);
        ui.show('screen-roundend');
        break;
      }
      case 'match': {
        const win = e.winner.side === 0;
        ui.setMatchEnd(win, `${match.a.rounds} — ${match.b.rounds}`, match.a.damageDealt);
        ui.show('screen-matchend');
        audio.play(win ? 'win' : 'lose');
        break;
      }
    }
  }
  if (match.shake > 0) { fx.shake(match.shake, 0.12); match.shake = 0; }
}

// ---- per-frame ----
function stepSim() {
  if (match.phase === 'fight') {
    // player walk
    const p = match.a;
    let dir = 0;
    if (keys.KeyA || keys.ArrowLeft) dir -= 1;
    if (keys.KeyD || keys.ArrowRight) dir += 1;
    dir += window.__walkDir ? window.__walkDir() : 0;
    dir = Math.max(-1, Math.min(1, dir));
    if (dir !== 0 && p.canAct && !p.blocking) {
      p.x = Math.max(-5.2, Math.min(5.2, p.x + dir * p.speed() * (dir === p.facing ? 1 : 0.75) / 60));
      if (p.mode === 'idle') { p.mode = 'walk'; if (p.rig) playLoop(p.rig, 'Walk', 1.2, 0.15); }
    } else if (p.mode === 'walk') { p.mode = 'idle'; if (p.rig) playLoop(p.rig, 'Idle'); }
    // bot walk (skipped while staging a screenshot: the bot stands still)
    if (bot && !staging) {
      bot.update(match, match.b, match.a, frame);
      const b = match.b;
      if (bot.walk && b.canAct && !b.blocking) {
        b.x = Math.max(-5.2, Math.min(5.2, b.x + bot.walk * b.speed() / 60));
        if (b.mode === 'idle') { b.mode = 'walk'; if (b.rig) playLoop(b.rig, 'Walk', 1.2, 0.15); }
      } else if (b.mode === 'walk') { b.mode = 'idle'; if (b.rig) playLoop(b.rig, 'Idle'); }
    }
  }
  match.step();
  drainEvents();
  // intro countdown
  if (match.phase === 'intro') {
    const n = 3 - Math.floor(match.phaseFrame / 60);
    ui.setCount(n > 0 ? n : 'FIGHT!');
  }
}

function syncRigs() {
  for (const f of [match.a, match.b]) {
    if (!f || !f.rig) continue;
    f.rig.root.position.set(f.x, f.y, 0);
    f.rig.root.rotation.y = f.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (f.shadow) f.shadow.position.set(f.x, 0.02, 0);
  }
  for (const r of titleRigs) {
    if (r) r.mixer.update(1 / 60);
  }
}

function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (t - lastT) / 1000 || 0.016);
  lastT = t;
  frame++;
  if (!frozen) {
    acc += dt;
    let n = 0;
    while (acc >= 1 / 60 && n < 20) { stepSim(); acc -= 1 / 60; n++; }
    if (n === 20) acc = 0;
    // mixers
    for (const f of [match.a, match.b]) {
      if (f && f.rig) f.rig.mixer.update(match.hitstop > 0 ? 0 : dt);
    }
    for (const r of titleRigs) if (r) r.mixer.update(dt);
    if (playerRig && match.phase !== 'fight' && !match.a) playerRig.mixer.update(dt);
    syncRigs();
    // rocks bob
    for (const r of rocks) r.position.y = r.userData.y0 + Math.sin(frame / 60 * r.userData.sp + r.userData.ph) * 0.3;
    fx.update();
    ui.updateHUD(match);
  }
  renderer.render(scene, camera);
}

// ---- screenshot staging (?shot=) ----
let staging = false;
function stageShot() {
  // run after first render so GLBs are in the scene
  const run = () => {
    if (SHOT === 'select') {
      showSelect();
      window.__shotReady = true;
      return;
    }
    // fight / ult / win: start a Kael vs Mira Normal match, skip intro.
    // The bot is frozen during staging so the shot stays clean.
    staging = true;
    ui.selHero = 0; ui.selBot = 4; ui.difficulty = 'normal';
    startMatch();
    events.length = 0; // drop the queued 'round' event (intro is skipped)
    match.phase = 'fight'; match.phaseFrame = 0;
    ui.show(null);
    const a = match.a, b = match.b;
    a.x = -1.0; b.x = 1.0; // 2.0 apart: inside punch (2.3) and Flame Jab (2.5) range
    if (SHOT === 'fight') {
      match.queue(a, 'skill1'); // Flame Jab
      stageUntil(() => seenEvents.has('spark') || b.hp < b.maxHp, () => {
        fx.damageNumber(b.x, b.y + 1.0, '13', a.hero.color, true);
        freezeShot();
      });
    } else if (SHOT === 'ult') {
      a.meter = 100;
      match.queue(a, 'ult');
      // freeze at the ult's IMPACT (spark), not at move start
      stageUntil(() => seenEvents.has('ult') && seenEvents.has('spark'), () => {
        fx.damageNumber(b.x, b.y + 1.0, '30', a.hero.color, true);
        fx.ultFlash(a.hero.color, true);
        freezeShot();
      });
    } else if (SHOT === 'win') {
      a.rounds = 1; // this KO wins the match (first to 2)
      a.damageDealt = 79; // staged prior-round damage; final punch (+8) -> 87
      b.hp = 1;
      match.queue(a, 'punch');
      stageUntil(() => match.phase === 'matchEnd', () => {
        freezeShot();
      });
    } else {
      window.__shotReady = true;
    }
  };
  setTimeout(run, 600);
}
function stageUntil(cond, done) {
  let n = 0;
  const iv = setInterval(() => {
    for (let i = 0; i < 10 && n < 600; i++, n++) {
      stepSim();
      if (cond()) { clearInterval(iv); done(); return; }
    }
    if (n >= 600) { clearInterval(iv); done(); }
  }, 16);
}
function freezeShot() {
  // advance mixers/fx one last time so poses + sparks are visible, then freeze
  for (const f of [match.a, match.b]) if (f && f.rig) f.rig.mixer.update(0.12);
  fx.update();
  syncRigs();
  ui.updateHUD(match);
  frozen = true;
  window.__shotReady = true;
}

boot().catch((err) => {
  document.getElementById('fatal').textContent = 'Failed to load: ' + err.message;
  console.error(err);
});
