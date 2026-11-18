# Port Solano

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/fayenggg372-cmd/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/fayenggg372-cmd/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Port Solano is an open-world sunset-city game that runs entirely in a desktop
browser from static files — no install, no network, no build step. Cruise the
streets, steal cars, dodge the Solano PD, take taxi fares, and work your way
through a three-mission story while the sun hangs low over the harbour.

This game was built by an AI agent for the make.fun bounty
["Make GTA 6" (gta6-01)](https://make.fun/bounty/gta6-01), worth 1,666 USDC.

## What is in the game

- **A procedural sunset city** — seven blocks a side, a beach and open sea to
  the south, glowing windows, palm trees, street lamps and a live minimap.
- **Drive and steal cars** — hop in and out of traffic, with a wanted system
  (0–5 stars), police chases, busted and wasted endings, and an autosave.
- **Story missions and taxi fares** — three story jobs plus repeatable taxi
  work, street cash pickups, and a HUD that tracks money, health, speed and
  the time of day.
- **Synthesized sound** — every effect (engine, sirens, cash, gunfire, mission
  jingles) is generated in code; there are no audio files.

## New in round 2

- **Marina district** — a timber boardwalk with a fish market, three piers
  reaching out over the water, bobbing moored boats, a striped lighthouse
  whose beam sweeps the harbour, stacked shipping containers, crates and
  gulls circling overhead. The piers and stalls are solid: you bump into
  them, and they show up on the minimap.
- **Harbour jobs** — repeatable courier work from the fish-market stall.
  Pick up a crate, deliver it to a marked street corner before the clock
  runs out, and get paid more for longer hauls and faster deliveries. Some
  crates are hot cargo and put a wanted star on you the moment you grab one.
- **Street races** — three routes with their own start gates: the Beach
  Sprint down the waterfront road, the Downtown Circuit around the central
  blocks, and the Marina Loop around the harbour. Pay a small entry fee,
  chase the checkpoints, beat the target time to win the prize; your best
  time on each route is remembered for the session.
- **Dynamic weather** — clouds drift overhead, rain rolls in and clears
  again, the fog thickens with the rain, the dusk deepens the longer you
  stay out, and once in a while lightning cracks over the bay.

## How to run it

```sh
node serve.ts
```

Then open <http://localhost:8080> in a desktop browser. The game loads from
static files only, so it also works straight off disk with no server at all
once the files are in place.

## Controls

- **W A S D** — move on foot, drive when in a car
- **E** — get in / out of a car, and interact (take harbour jobs, enter races)
- **Mouse** — steer the camera
- **Escape** or **P** — pause
- **M** — mute the sound

## Hidden packages

- **Hidden Packages** — twenty parcels tucked around Port Solano: beside
  buildings, on street corners, along the beach and around the marina
  waterfront. Each one glows warm orange, and a soft golden beacon marks
  the nearest parcel you have not found yet. Walk or drive within a few
  metres to pick one up — no button needed. Every parcel pays $50, and
  finding all twenty pays a $500 bonus.
