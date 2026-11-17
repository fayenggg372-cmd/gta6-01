// Deterministic screenshot scenes behind ?shot=start|play|end (same seed => same frame).
// Each one plays the real rules forward with a simple autopilot, then returns the
// screen the renderer should draw over the staged world.
import { STEP } from './config.js';
import { SCREEN_TITLE, SCREEN_PLAY, SCREEN_OVER } from './render.js';

const START_STEPS = Math.floor(4 / STEP);
const PLAY_STEPS = Math.floor(24 / STEP);
const END_STEPS = Math.floor(150 / STEP);

function autopilot(game) {
  const p = game.player;
  const t = game.missions.target;
  if (p.driving) {
    const car = p.inCar;
    const tx = t ? t.x : 0, tz = t ? t.z : 0;
    const want = Math.atan2(tx - car.x, tz - car.z);
    let dh = want - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, dh * 1.5));
    return { throttle: Math.abs(dh) > 1.9 ? -0.6 : 1, steer };
  }
  // On foot: get into the nearest car first (mission 1 needs wheels),
  // then drive to the target.
  const car = game.traffic.nearest(p.x, p.z, 500, game.traffic.allCars());
  if (car) {
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    if (d < 4.5) return { enter: true };
    p.camYaw = Math.atan2(car.x - p.x, car.z - p.z);
    return { forward: 1 };
  }
  const tx = t ? t.x : 0, tz = t ? t.z : 0;
  p.camYaw = Math.atan2(tx - p.x, tz - p.z);
  return { forward: Math.hypot(tx - p.x, tz - p.z) > 2 ? 1 : 0 };
}

// Drive the simulation without rendering; returns the screen to show.
export function stageShot(name, game) {
  game.reset();
  const input = game.input;
  const drive = (steps, pilot) => {
    for (let i = 0; i < steps; i++) {
      if (pilot) {
        const a = autopilot(game);
        input.keys.clear();
        if (a.forward) input.keys.add('KeyW');
        if (a.enter) input.pressed.add('KeyE');
        if (game.player.driving) {
          if (a.throttle > 0) input.keys.add('KeyW');
          else if (a.throttle < 0) input.keys.add('KeyS');
          if (a.steer > 0.2) input.keys.add('KeyD');
          else if (a.steer < -0.2) input.keys.add('KeyA');
        }
      }
      game.step(STEP);
      input.endStep();
      if (game.over) break;
    }
  };
  if (name !== 'play' && name !== 'end') {
    drive(START_STEPS, false);
    return SCREEN_TITLE;
  }
  if (name === 'play') {
    game.startGame(false);
    drive(PLAY_STEPS, true);
    return game.over ? SCREEN_OVER : SCREEN_PLAY;
  }
  // end: start with heat and let the autopilot run; busted if caught, else a live chase.
  game.startGame(false);
  game.setWanted(3, true);
  drive(END_STEPS, true);
  return game.over ? SCREEN_OVER : SCREEN_PLAY;
}
