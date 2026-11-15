// fx.js — hit sparks, projectiles, shockwaves, walls, camera shake,
// floating damage numbers (DOM), and the ultimate flash overlay.
import * as THREE from 'three';

export class FX {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.bursts = []; // {points, life}
    this.projs = new Map(); // key -> mesh
    this.waveMeshes = [];
    this.wallMesh = null;
    this.shakeT = 0; this.shakeMag = 0;
    this.flashEl = document.getElementById('flash');
    this.numLayer = document.getElementById('dmg-layer');
    this.ultEl = document.getElementById('ult-banner');
  }
  spark(x, y, color, big) {
    const n = big ? 26 : 12;
    const pos = new Float32Array(n * 3);
    const vel = [];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = 0.3;
      const a = Math.random() * Math.PI * 2, s = (big ? 3.2 : 2.0) * (0.4 + Math.random());
      vel.push([Math.cos(a) * s, Math.sin(a) * s + 1.2, (Math.random() - 0.5) * 1.5]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: new THREE.Color(color), size: big ? 0.26 : 0.17, transparent: true, opacity: 1, depthWrite: false });
    const pts = new THREE.Points(g, m);
    this.scene.add(pts);
    this.bursts.push({ pts, vel, life: 12, max: 12 });
  }
  projMarker(x, y, color) {
    const key = 'p' + Math.round(x * 10);
    let mesh = this.projs.get(key);
    if (!mesh) {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color) }));
      this.scene.add(mesh); this.projs.set(key, mesh);
    }
    mesh.position.set(x, y, 0.4);
    mesh.material.color.set(color);
    mesh.userData.life = 6;
  }
  waveMarker(x, color) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.55, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    mesh.position.set(x, 0.06, 0.4);
    mesh.rotation.x = -Math.PI / 2;
    this.scene.add(mesh);
    this.waveMeshes.push({ mesh, life: 10 });
  }
  showWall(x, color) {
    this.hideWall();
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.38, emissive: 0x4a8cff, emissiveIntensity: 0.35 });
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.2 + (i % 2) * 0.4, 0.3), mat);
      b.position.set((i - 2) * 0.36, 0.7 + (i % 2) * 0.2, 0);
      g.add(b);
    }
    g.position.set(x, 0, 0);
    this.scene.add(g);
    this.wallMesh = g;
  }
  hideWall() { if (this.wallMesh) { this.scene.remove(this.wallMesh); this.wallMesh = null; } }
  shake(frames, mag = 0.12) { this.shakeT = Math.max(this.shakeT, frames); this.shakeMag = mag; }
  ultFlash(color, persist = false) {
    if (this.flashT) { clearTimeout(this.flashT); this.flashT = null; }
    if (this.bannerT) { clearTimeout(this.bannerT); this.bannerT = null; }
    if (this.flashEl) {
      this.flashEl.style.background = `radial-gradient(circle, ${color}66 0%, transparent 70%)`;
      this.flashEl.classList.add('on');
      if (!persist) this.flashT = setTimeout(() => this.flashEl.classList.remove('on'), 450);
    }
    if (this.ultEl) {
      this.ultEl.classList.add('on');
      if (!persist) this.bannerT = setTimeout(() => this.ultEl.classList.remove('on'), 900);
    }
  }
  damageNumber(worldX, worldY, txt, color, persist = false) {
    if (!this.numLayer) return;
    const v = new THREE.Vector3(worldX, worldY, 0).project(this.camera);
    const el = document.createElement('div');
    el.className = 'dmg-num' + (persist ? ' persist' : '');
    el.textContent = txt;
    el.style.color = color;
    el.style.left = ((v.x * 0.5 + 0.5) * 100).toFixed(1) + '%';
    el.style.top = ((-v.y * 0.5 + 0.5) * 100).toFixed(1) + '%';
    this.numLayer.appendChild(el);
    if (!persist) setTimeout(() => el.remove(), 700);
  }
  update() {
    for (const b of this.bursts) {
      b.life--;
      const p = b.pts.geometry.attributes.position;
      for (let i = 0; i < b.vel.length; i++) {
        p.array[i * 3] += b.vel[i][0] * 0.016;
        p.array[i * 3 + 1] += b.vel[i][1] * 0.016;
        p.array[i * 3 + 2] += b.vel[i][2] * 0.016;
        b.vel[i][1] -= 0.12;
      }
      p.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, b.life / b.max);
      if (b.life <= 0) { this.scene.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose(); }
    }
    this.bursts = this.bursts.filter((b) => b.life > 0);
    for (const [k, m] of this.projs) {
      m.userData.life = (m.userData.life || 0) - 1;
      if (m.userData.life <= 0) { this.scene.remove(m); this.projs.delete(k); }
    }
    for (const w of this.waveMeshes) {
      w.life--;
      w.mesh.scale.multiplyScalar(1.12);
      w.mesh.material.opacity = Math.max(0, w.life / 10) * 0.85;
      if (w.life <= 0) this.scene.remove(w.mesh);
    }
    this.waveMeshes = this.waveMeshes.filter((w) => w.life > 0);
    if (this.shakeT > 0) {
      this.shakeT--;
      const s = this.shakeMag * (this.shakeT / 6);
      this.camera.position.x = (Math.random() - 0.5) * s;
      this.camera.position.y = 1.9 + (Math.random() - 0.5) * s;
      if (this.shakeT === 0) { this.camera.position.x = 0; this.camera.position.y = 1.9; }
    }
  }
}
