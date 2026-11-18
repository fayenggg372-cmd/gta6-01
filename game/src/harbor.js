// Port Solano — Harbour Jobs (round 2).
//
// A repeatable courier job from the marina fish market: take a job at the
// stall, pick up a crate there, deliver it to a marked street corner against
// the clock. Pay grows with distance and time left; some crates are "hot
// cargo" and add a wanted star on pickup. The job writes the objective line
// only while no story mission and no taxi fare is running, so it never
// fights the mission system for the HUD. Its beacon is amber, distinct
// from the story beacon's pink.
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32, range } from './random.js';

const AMBER = 0xffb020;
const PICKUP_RADIUS = 4;
const DELIVER_RADIUS = 5;
const BASE_PAY = 40;
const PER_METRE = 0.35;
const TIME_BONUS_RATE = 1.5;

function near(px, pz, mx, mz, r) {
  return Math.hypot(px - mx, pz - mz) < r;
}

export class HarborJobs {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.rng = mulberry32((game.seed ^ 0xba120) >>> 0);
    this.state = 'idle'; // idle | toPickup | toDeliver
    this.job = null;
    this.timeLeft = 0;
    this._blink = 0;

    // The pickup stall is the fish-market stall on the boardwalk.
    this.stall = { x: -10, z: 211 };
    if (game.marina && game.marina.marketStall) this.stall = game.marina.marketStall;

    // Amber beacon: a pulsing ring on the ground plus a floating diamond.
    this.beacon = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.2, 32),
      new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    this.beacon.add(ring);
    this.beaconRing = ring;
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55),
      new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.9 }),
    );
    diamond.position.y = 2.6;
    this.beacon.add(diamond);
    this.beaconDiamond = diamond;
    this.beacon.visible = false;
    scene.add(this.beacon);
  }

  _roads() {
    const c = this.game.city;
    const xs = Array.isArray(c.roadX) && c.roadX.length ? c.roadX : [-145, -87, -29, 29, 87, 145];
    const zs = Array.isArray(c.roadZ) && c.roadZ.length ? c.roadZ : [-145, -87, -29, 29, 87, 145];
    return { xs, zs };
  }

  _storyBusy() {
    const m = this.game.missions;
    return !!m && (m.active !== null && m.active !== undefined || m.taxi !== null && m.taxi !== undefined);
  }

  _setObjective(text) {
    if (!this._storyBusy()) this.game.setObjective(text);
  }

  _moveBeacon(x, z) {
    this.beacon.position.set(x, 0, z);
    this.beacon.visible = true;
  }

  _hideBeacon() {
    this.beacon.visible = false;
  }

  _newJob() {
    const { xs, zs } = this._roads();
    // A delivery corner somewhere in the city, away from the marina.
    let dx;
    let dz;
    do {
      dx = xs[Math.floor(this.rng() * xs.length)];
      dz = zs[Math.floor(this.rng() * zs.length)];
    } while (dz > 145);
    const dist = Math.hypot(dx - this.stall.x, dz - this.stall.z);
    const hot = this.rng() < 0.3;
    const timeLimit = Math.max(45, Math.min(150, dist / 9 + 30));
    this.job = {
      dest: { x: dx, z: dz },
      dist,
      hot,
      pay: Math.round(BASE_PAY + dist * PER_METRE + (hot ? 60 : 0)),
      timeLimit,
    };
    this.state = 'toPickup';
    this.timeLeft = timeLimit;
    this._moveBeacon(this.stall.x, this.stall.z);
    this.game.message(
      hot ? 'Hot cargo — handle it fast' : 'Harbour job: pick up the crate',
      hot ? 'This crate is wanted cargo. The cops will notice.' : `Deliver to the marked corner — ${Math.round(dist)}m away.`);
    if (this.game.audio && typeof this.game.audio.blip === 'function') this.game.audio.blip();
  }

  _pickup() {
    this.state = 'toDeliver';
    this._moveBeacon(this.job.dest.x, this.job.dest.z);
    if (this.job.hot) {
      this.game.addWanted(1, 'hot cargo');
      this.game.message('Hot cargo!', 'One star — the Solano PD is watching the docks.');
    } else {
      this.game.message('Crate collected', 'Get it to the marked corner before the clock runs out.');
    }
  }

  _deliver() {
    const bonus = Math.round(this.timeLeft * TIME_BONUS_RATE);
    const total = this.job.pay + bonus;
    this.game.money += total;
    if (this.game.audio && typeof this.game.audio.cash === 'function') this.game.audio.cash();
    this.game.message(`+$${total} — delivery done`, `Job pay $${this.job.pay} + $${bonus} time bonus.`);
    this.job = null;
    this.state = 'idle';
    this._hideBeacon();
    this._setObjective('Harbour jobs pay at the fish market. Press E at the stall to take one.');
    if (typeof this.game.save === 'function') this.game.save();
  }

  _fail(reason) {
    this.game.message('Job failed', reason);
    if (this.game.audio && typeof this.game.audio.missionFail === 'function') this.game.audio.missionFail();
    this.job = null;
    this.state = 'idle';
    this._hideBeacon();
    this._setObjective('Harbour jobs pay at the fish market. Press E at the stall to take one.');
  }

  update(dt) {
    const g = this.game;
    if (!g || g.mode !== 'play' || !g.player) return;
    this._blink += dt;
    if (this.beacon.visible) {
      const s = 1 + Math.sin(this._blink * 4) * 0.12;
      this.beaconRing.scale.set(s, s, 1);
      this.beaconDiamond.rotation.y += dt * 2;
      this.beaconDiamond.position.y = 2.6 + Math.sin(this._blink * 2.5) * 0.25;
    }
    const p = g.player;
    const pressedE = g.input && typeof g.input.wasPressed === 'function' && g.input.wasPressed('KeyE');

    if (this.state === 'idle') {
      if (near(p.x, p.z, this.stall.x, this.stall.z, PICKUP_RADIUS)) {
        this._setObjective('Harbour job available — press E at the fish-market stall.');
        if (pressedE) this._newJob();
      }
      return;
    }

    // A job is running: the clock always ticks.
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this._fail(this.state === 'toPickup' ? 'Too slow to collect the crate.' : 'The delivery window closed.');
      return;
    }
    if (this.state === 'toPickup') {
      this._setObjective(`Pick up the crate at the market stall — ${Math.ceil(this.timeLeft)}s left.`);
      if (near(p.x, p.z, this.stall.x, this.stall.z, PICKUP_RADIUS) && pressedE) this._pickup();
    } else if (this.state === 'toDeliver') {
      const d = Math.round(Math.hypot(p.x - this.job.dest.x, p.z - this.job.dest.z));
    this._setObjective(
      `${this.job.hot ? 'HOT CARGO — ' : ''}Deliver the crate: ${d}m to go, ${Math.ceil(this.timeLeft)}s left.`);
      if (near(p.x, p.z, this.job.dest.x, this.job.dest.z, DELIVER_RADIUS) && pressedE) this._deliver();
    }
  }

  dispose() {
    if (this.scene) this.scene.remove(this.beacon);
  }
}
