// Port Solano — Street Races (round 2).
//
// Three street races, each with a start gate, a chain of checkpoint rings,
// a countdown, a target time and a prize: Beach Sprint (waterfront road),
// Downtown Circuit (loop around the central blocks) and Marina Loop
// (around the harbour and boardwalk). Entry costs a small fee; finish under
// the target time and the prize is yours; the best time on each route is
// remembered for the session. The objective line is only written while no
// story mission and no taxi fare is running. Checkpoint visuals are cyan
// rings, distinct from the story beacon's pink and the harbour job's amber.
import * as THREE from '../vendor/three.module.min.js';

const CYAN = 0x22d3ee;
const GATE_RADIUS = 7;
const START_RADIUS = 6;

const ROUTES = [
  {
    id: 'sprint',
    name: 'Beach Sprint',
    fee: 20,
    prize: 180,
    target: 40,
    start: { x: -160, z: 203 },
    points: [{ x: -87, z: 203 }, { x: 0, z: 203 }, { x: 87, z: 203 }, { x: 160, z: 203 }],
  },
  {
    id: 'circuit',
    name: 'Downtown Circuit',
    fee: 30,
    prize: 300,
    target: 90,
    start: { x: 29, z: 29 },
    points: [{ x: 145, z: 29 }, { x: 145, z: 145 }, { x: 29, z: 145 }, { x: -87, z: 145 }, { x: -87, z: 29 }, { x: 29, z: 29 }],
  },
  {
    id: 'marina',
    name: 'Marina Loop',
    fee: 25,
    prize: 240,
    target: 75,
    start: { x: 0, z: 203 },
    points: [{ x: 145, z: 203 }, { x: 145, z: 145 }, { x: -145, z: 145 }, { x: -145, z: 203 }, { x: 0, z: 203 }],
  },
];

function near(px, pz, mx, mz, r) {
  return Math.hypot(px - mx, pz - mz) < r;
}

export class StreetRaces {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.state = 'idle'; // idle | countdown | racing
    this.route = null;
    this.checkpoint = 0;
    this.raceTime = 0;
    this.countdown = 0;
    this._countShown = 4;
    this._blink = 0;
    this.best = { sprint: null, circuit: null, marina: null };

    // One start gate per route: two posts, a floating cyan ring and a
    // ground ring so the gate reads clearly from the street.
    this.gates = [];
    for (const route of ROUTES) {
      const gate = new THREE.Group();
      const postMat = new THREE.MeshLambertMaterial({ color: 0x222831 });
      for (const sx of [-3.4, 3.4]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 4.6, 8), postMat);
        post.position.set(sx, 2.3, 0);
        gate.add(post);
      }
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.0, 0.22, 10, 32),
        new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.9 }),
      );
      ring.position.y = 3.2;
      gate.add(ring);
      const ground = new THREE.Mesh(
        new THREE.RingGeometry(3.2, 3.9, 32),
        new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 0.12;
      gate.add(ground);
      gate.position.set(route.start.x, 0, route.start.z);
      scene.add(gate);
      this.gates.push(gate);
    }

    // The active checkpoint: a tall cyan ring the player drives or runs
    // through, with a ground ring underneath it.
    this.checkpointGroup = new THREE.Group();
    const cpRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.4, 0.3, 10, 32),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.95 }),
    );
    cpRing.position.y = 3.4;
    this.checkpointGroup.add(cpRing);
    const cpGround = new THREE.Mesh(
      new THREE.RingGeometry(3.6, 4.4, 32),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    cpGround.rotation.x = -Math.PI / 2;
    cpGround.position.y = 0.12;
    this.checkpointGroup.add(cpGround);
    this.checkpointRing = cpRing;
    this.checkpointGroup.visible = false;
    scene.add(this.checkpointGroup);
  }

  _storyBusy() {
    const m = this.game.missions;
    return !!m && ((m.active !== null && m.active !== undefined) || (m.taxi !== null && m.taxi !== undefined));
  }

  _setObjective(text) {
    if (!this._storyBusy()) this.game.setObjective(text);
  }

  _blip() {
    if (this.game.audio && typeof this.game.audio.blip === 'function') this.game.audio.blip();
  }

  _startRace(route) {
    if (this.game.money < route.fee) {
      this.game.message('Not enough cash', `${route.name} costs $${route.fee} to enter.`);
      return;
    }
    this.game.money -= route.fee;
    this.route = route;
    this.state = 'countdown';
    this.countdown = 3.2;
    this._countShown = 4;
    this.raceTime = 0;
    this.checkpoint = 0;
    this._placeCheckpoint();
    this.game.message(`${route.name} — $${route.fee} entry`, `Beat ${route.target}s to win $${route.prize}.`);
    this._blip();
  }

  _placeCheckpoint() {
    const p = this.route.points[this.checkpoint];
    this.checkpointGroup.position.set(p.x, 0, p.z);
    this.checkpointGroup.visible = true;
  }

  _finish() {
    const route = this.route;
    const t = this.raceTime;
    const best = this.best[route.id];
    const isBest = best === null || t < best;
    if (isBest) this.best[route.id] = t;
    if (t <= route.target) {
      this.game.money += route.prize;
      if (this.game.audio && typeof this.game.audio.cash === 'function') this.game.audio.cash();
      this.game.message(
        `${route.name} — YOU WIN $${route.prize}`,
        `Finished in ${t.toFixed(1)}s (target ${route.target}s)${isBest ? ' — new best!' : ` — best ${best.toFixed(1)}s`}.`,
      );
    } else {
      if (this.game.audio && typeof this.game.audio.missionFail === 'function') this.game.audio.missionFail();
      this.game.message(
        `${route.name} — too slow`,
        `Finished in ${t.toFixed(1)}s, target was ${route.target}s${isBest ? ' — still a new best!' : ''}.`,
      );
    }
    this.state = 'idle';
    this.route = null;
    this.checkpointGroup.visible = false;
    this._setObjective('Street races run from the cyan gates. Press E at a gate to enter.');
    if (typeof this.game.save === 'function') this.game.save();
  }

  _cancel() {
    this.game.message('Race abandoned', 'You left the route.');
    this.state = 'idle';
    this.route = null;
    this.checkpointGroup.visible = false;
    this._setObjective('Street races run from the cyan gates. Press E at a gate to enter.');
  }

  update(dt) {
    const g = this.game;
    if (!g || g.mode !== 'play' || !g.player) return;
    this._blink += dt;
    // Idle gate shimmer so the start lines catch the eye.
    if (this.state === 'idle') {
      for (const gate of this.gates) {
        gate.children[1].rotation.z += dt * 0.6;
        gate.children[1].material.opacity = 0.7 + Math.sin(this._blink * 3) * 0.2;
      }
    }
    if (this.state !== 'idle' && this.checkpointGroup.visible) {
      this.checkpointRing.rotation.z += dt * 1.5;
      const s = 1 + Math.sin(this._blink * 5) * 0.08;
      this.checkpointRing.scale.set(s, s, 1);
    }
    const p = g.player;
    const pressedE = g.input && typeof g.input.wasPressed === 'function' && g.input.wasPressed('KeyE');

    if (this.state === 'idle') {
      for (const route of ROUTES) {
        if (near(p.x, p.z, route.start.x, route.start.z, START_RADIUS)) {
          const best = this.best[route.id];
          this._setObjective(
            `${route.name} — press E to race ($${route.fee} entry, $${route.prize} prize, target ${route.target}s${best !== null ? `, best ${best.toFixed(1)}s` : ''}).`,
          );
          if (pressedE) this._startRace(route);
          break;
        }
      }
      return;
    }

    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this._countShown && n > 0) {
        this._countShown = n;
        this.game.message(String(n), this.route.name);
        this._blip();
      }
      this._setObjective(`${this.route.name} — get ready…`);
      if (this.countdown <= 0) {
        this.state = 'racing';
        this.game.message('GO!', this.route.name);
        this._blip();
      }
      return;
    }

    // Racing: the clock runs and checkpoints must be hit in order.
    this.raceTime += dt;
    const cp = this.route.points[this.checkpoint];
    this._setObjective(
      `${this.route.name} — checkpoint ${this.checkpoint + 1}/${this.route.points.length} · ${this.raceTime.toFixed(1)}s / ${this.route.target}s`,
    );
    if (near(p.x, p.z, cp.x, cp.z, GATE_RADIUS)) {
      this.checkpoint += 1;
      this._blip();
      if (this.checkpoint >= this.route.points.length) {
        this._finish();
      } else {
        this._placeCheckpoint();
      }
      return;
    }
    // Wandered a long way off the route: call it off.
    const dCp = Math.hypot(p.x - cp.x, p.z - cp.z);
    if (Math.hypot(p.x - this.route.start.x, p.z - this.route.start.z) > 420 && dCp > 420) this._cancel();
  }

  dispose() {
    if (!this.scene) return;
    for (const gate of this.gates) this.scene.remove(gate);
    this.scene.remove(this.checkpointGroup);
  }
}
