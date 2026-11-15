// chars.js — load Quaternius GLBs once, clone per fighter (SkeletonUtils),
// tint per hero, drive AnimationMixer with contact-aligned attack clips.
// Clip durations measured from the GLB JSON (60 fps frames). Contact frames
// are estimates (punch ~40%, kick ~47%, slash ~47% of clip); the combat
// sim, not the animation, decides hits — animation is aligned so its
// contact lands mid-active-window.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../vendor/utils/SkeletonUtils.js';

const PREFIX = 'CharacterArmature|';
const loader = new GLTFLoader();
const cache = {}; // model name -> { scene, clips: Map<name, clip> }

export async function loadModels() {
  for (const name of ['Adventurer', 'Worker']) {
    const gltf = await loader.loadAsync(`assets/characters/${name}.glb`);
    const clips = new Map();
    for (const c of gltf.animations) clips.set(c.name.replace(PREFIX, ''), c);
    cache[name] = { scene: gltf.scene, clips };
  }
}

export function heroClipSet() {
  return cache.Adventurer.clips; // both models share clip names
}

// Build one fighter's visible rig: clone, tint, scale, mixer + actions.
export function makeFighterRig(hero, moves) {
  const src = cache[hero.model];
  const root = SkeletonUtils.clone(src.scene);
  const tint = new THREE.Color(hero.tint);
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.material = o.material.clone();
      o.material.color.multiply(tint);
    }
  });
  root.scale.setScalar(hero.scale || 1);
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map();
  for (const [name, clip] of src.clips) {
    actions.set(name, mixer.clipAction(clip));
  }
  const anim = moves.anim;
  return { root, mixer, actions, anim, cur: null, curName: '', locked: false };
}

// Play a looping clip (idle/walk). rate scales playback speed.
export function playLoop(rig, name, rate = 1, fade = 0.2) {
  if (rig.curName === name && rig.cur && rig.cur.getEffectiveTimeScale() === rate) return;
  const next = rig.actions.get(name);
  if (!next) return;
  next.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveTimeScale(rate);
  if (rig.cur && rig.cur !== next) rig.cur.fadeOut(fade);
  next.fadeIn(fade).play();
  rig.cur = next; rig.curName = name; rig.locked = false;
}

// Play a one-shot attack clip aligned so its contact frame lands at
// `contactSimFrame` (sim frames after move start). Returns the action.
// contact = clip contact frame, dur = clip length in frames (both 60fps).
export function playAttack(rig, clipName, contactSimFrame, totalSimFrames, fade = 0.06) {
  const clip = rig.actions.get(clipName);
  if (!clip) { playLoop(rig, 'Idle'); return null; }
  const meta = rig.anim[clipName.toLowerCase().replace('_right', '').replace('_left', '')]
    || rig.anim.punch;
  // rate so the clip's contact frame arrives at contactSimFrame
  const rate = Math.max(0.75, Math.min(2.6, meta.contact / Math.max(1, contactSimFrame)));
  clip.reset().setLoop(THREE.LoopOnce, 1).setEffectiveTimeScale(rate);
  clip.clampWhenFinished = true;
  if (rig.cur && rig.cur !== clip) rig.cur.fadeOut(fade);
  clip.fadeIn(fade).play();
  rig.cur = clip; rig.curName = clipName; rig.locked = true;
  return clip;
}

// Frozen guard pose: hold Idle_Sword at `freeze` seconds, timeScale 0.
export function playBlock(rig) {
  const a = rig.actions.get('Idle_Sword');
  if (!a) { playLoop(rig, 'Idle'); return; }
  if (rig.curName === 'Idle_Sword' && rig.locked) return;
  a.reset().setLoop(THREE.LoopRepeat, Infinity);
  a.time = rig.anim.block.freeze;
  a.setEffectiveTimeScale(0);
  if (rig.cur && rig.cur !== a) rig.cur.fadeOut(0.08);
  a.fadeIn(0.08).play();
  rig.cur = a; rig.curName = 'Idle_Sword'; rig.locked = true;
}

// One-shot non-looping clip (hit react, death, win). onDone fires via mixer event.
export function playOnce(rig, clipName, rate = 1) {
  const a = rig.actions.get(clipName);
  if (!a) return null;
  a.reset().setLoop(THREE.LoopOnce, 1).setEffectiveTimeScale(rate);
  a.clampWhenFinished = true;
  if (rig.cur && rig.cur !== a) rig.cur.fadeOut(0.06);
  a.fadeIn(0.06).play();
  rig.cur = a; rig.curName = clipName; rig.locked = true;
  return a;
}

export function unlock(rig) { rig.locked = false; }
