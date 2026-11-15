// main.ts — RIFT FIGHTERS entry program (Node 22, stdlib only).
// Copies game/ and screenshots/ beside this file into /output (or
// MAKEFUN_OUTPUT_DIR) and writes /output/dossier.json with the vendored
// make.fun library. Run twice: both runs must write identical bytes.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const dossier = buildDossier(out, caps);
writeFileSync(join(out, 'dossier.json'), dossier);

// Determinism guard: rebuild and compare BYTES (buildDossier returns a
// Uint8Array, so compare contents, not object identity).
const again = buildDossier(out, caps);
const b1 = Buffer.from(dossier);
const b2 = Buffer.from(again);
if (!b1.equals(b2)) {
  throw new Error('dossier is not deterministic across runs');
}
const size = readFileSync(join(out, 'dossier.json')).length;
console.log(`RIFT FIGHTERS: wrote ${out}/dossier.json (${size} bytes), deterministic OK`);
