// Round 2: the dossier now covers the marina, harbour jobs, street races and dynamic weather.
// Port Solano — the gta6-01 entry (Node 22, standard library only).
//
// The game is this directory's game/ folder: plain static files a desktop
// browser loads offline (game/index.html and its ES modules, three.js vendored
// under game/vendor/, no network request). This entrypoint hands it in: it
// copies game/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library.
//
// Port Solano is a procedural sunset city: on foot and by car, traffic and
// pedestrians, stealing cars, a wanted system and police chases, a 3-mission
// story plus taxi fares, combat, a HUD with a live minimap, synthesized sound
// and an autosave.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
// Fail loudly (instead of a bare cpSync error) if the game folder is missing:
// without game/ there is nothing for the judge to play.
if (!existsSync(join(here, 'game'))) {
  throw new Error(`Port Solano: game/ not found next to main.ts (${here})`);
}
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json). Keep these in one named constant so a cap
// change is a one-line edit instead of a hunt through the call below.
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_LIMITS));

// Hidden Packages (round 3): 20 seed-placed parcels, $50 each + $500 bonus.
