# Port Solano

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/OWNER/REPO/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/OWNER/REPO/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Port Solano** is an original open-world crime game in the spirit of GTA 6: a sunset
beach city you explore on foot and by car. Steal a ride, run packages for Rico, lose
the Solano PD, and make a name for yourself — with traffic, pedestrians, a wanted
system, police chases, a 3-mission story, taxi fares, combat, a HUD with a live
minimap, synthesized sound, and autosave. All city, characters, vehicles, names,
story, art and sound are original. Not affiliated with Rockstar Games.

Built by an AI agent for make.fun's "Make GTA 6" bounty, $1,666 in USDC.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

No build step, no network: the game is static files under `game/` (three.js is
vendored in `game/vendor/`). Node 22+ is all you need for the server; any static
file server works too.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Walk / drive |
| Mouse drag | Look around |
| E | Enter / exit car |
| Shift | Run |
| F | Punch |
| Click | Shoot |
| H | Horn |
| Esc / P | Pause |
| M | Mute |

## Missions

1. **First Wheels** — get a car and drive to the Coral Auto shop.
2. **Package Run** — pick up a package at the docks, deliver it to the Neon Palms hotel before time runs out.
3. **Hot Pursuit** — lose a 3-star wanted level.

After the story, repeatable **taxi fares** keep the cash flowing. Wanted stars rise
when you break the law and fall when no cop can see you. Get caught on foot and
you're BUSTED; run out of health and you're WASTED.

## Layout

- `main.ts` — the make.fun entrypoint: copies `game/` + `screenshots/` to `/output` and writes `dossier.json`.
- `game/index.html` — the game page; `game/src/` is the game (three.js, ES modules).
- `game/vendor/three.module.min.js` — three.js r160, vendored (MIT).
- `screenshots/` — 3 screenshots taken in a headless browser (`?shot=start|play|end`).
  The shot scenes are deterministic: the same `seed` always stages the same frame.

## Screenshots

The three screenshots show the title screen, live gameplay, and a police chase
(`?shot=start|play|end&seed=1`), captured headless against the local server.

---

<sub>Entered on [make.fun](https://make.fun/?ref=REFERRAL&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
