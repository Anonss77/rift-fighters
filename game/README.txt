RIFT FIGHTERS — an original 3D fighting game for make.fun best-game-01.
Six elemental warriors, best of 3 rounds, 60-second timer, skill meter,
ultimates, three bot difficulties. Single-player vs bot. No network.

PLAY (needs a static server — ES modules do not load from file://):
  node serve.ts        (or: python3 -m http.server)
  open http://localhost:8080

CONTROLS
  J Punch · K Kick · L (hold) Block · Space Jump · Shift Dash
  Q / E / R Skills · F Ultimate (needs full meter) · A / D or arrows Move
  Click the left / right half of the arena to walk that way.
  All nine actions are also on-screen buttons (Block is hold-to-guard).

HOW A MATCH WORKS
  Pick a hero and a bot difficulty, press START. Win 2 rounds to take the
  match. A round ends on KO or when the 60 s timer runs out (more HP wins;
  a draw replays once at 30 s). Landing hits builds meter; blocking builds
  a little. At 100% meter press F for your Ultimate.

CHARACTERS (Quaternius Ultimate Animated Character Pack, CC0)
  Kael (fire), Lyra (wind), Bram (earth), Voltan (lightning),
  Mira (ice), Thorne (nature). Two base rigs (Adventurer, Worker) are
  re-tinted per hero; punch/kick/hit/death clips come from the pack.
  three.js is vendored under game/vendor (MIT).

FILES
  game/index.html + css/game.css + js/*.js + data/moves.json
  game/vendor/three/three.module.min.js (MIT)
  game/vendor/loaders/GLTFLoader.js, game/vendor/utils/SkeletonUtils.js (MIT)
  game/assets/characters/Adventurer.glb, Worker.glb (CC0)
