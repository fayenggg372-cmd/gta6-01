// Round 2: harbour jobs and street races only write the objective line while no mission or taxi is active here.
// Missions: a 3-job story chain, then repeatable taxi fares.
// The beacon is a pink light column + ground ring marking the current target;
// the story advances on completion and hands over to taxi work when done.
import * as THREE from '../vendor/three.module.min.js';
import { MISSIONS, STEP } from './config.js';
import { pick, range } from './random.js';

function makeBeacon(scene) {
  const group = new THREE.Group();
  const col = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  col.position.y = 30;
  group.add(col);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.8, 2.6, 24),
    new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  group.add(ring);
  group.visible = false;
  scene.add(group);
  return { group, ring };
}

export class Missions {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.beacon = makeBeacon(scene);
    this.index = 0;          // next story mission
    this.done = 0;
    this.active = null;      // {def, stage, timer, target, label}
    this.taxi = null;        // repeatable fare state
    this.rng = game.rng;
    this.time = 0;
  }

  get currentDef() { return MISSIONS[this.index] ?? null; }
  get target() {
    if (this.active) return this.active.target;
    if (this.taxi) return this.taxi.target;
    return null;
  }

  startStory() {
    const def = this.currentDef;
    if (!def) { this.startTaxi(); return; }
    this.active = { def, stage: def.type === 'fetch' ? 'pickup' : 'go', timer: def.timeLimit ?? 0, target: def.type === 'fetch' ? def.pickup : def.target };
    if (def.type === 'evade') {
      this.game.setWanted(def.startWanted || 3, true);
      this.game.message(def.name, 'Lose the cops!');
    } else {
      this.game.message(def.name, def.brief);
    }
    this.game.audio.blip();
    this._placeBeacon();
  }

  startTaxi() {
    // Pick a waiting pedestrian as the fare.
    const ped = this.game.peds.peds.find((p) => p.alive);
    const spot = ped
      ? { x: ped.x, z: ped.z }
      : { x: range(this.rng, -150, 150), z: range(this.rng, -150, 150) };
    this.taxi = { stage: 'pickup', target: spot, fare: null, timer: 0, ped };
    this.game.setObjective('Taxi fare: pick up the passenger at the pink marker.');
    this._placeBeacon();
  }

  _placeBeacon() {
    const t = this.target;
    if (!t) { this.beacon.group.visible = false; return; }
    this.beacon.group.visible = true;
    this.beacon.group.position.set(t.x, 0, t.z);
  }

  complete(text, reward) {
    this.game.money += reward;
    this.game.audio.missionOk();
    this.game.message(text, `+$${reward}`);
    this.game.save();
  }

  fail(text) {
    this.game.audio.missionFail();
    this.game.message(text, 'Mission failed — try again from the pause menu.');
    this.active = null;
    this.beacon.group.visible = false;
    this.game.setObjective('Press M for the mission list, or keep exploring Port Solano.');
  }

  retry() {
    this.taxi = null;
    this.startStory();
  }

  update(dt) {
    this.time += dt;
    const pulse = 1 + Math.sin(this.time * 4) * 0.25;
    this.beacon.ring.scale.set(pulse, pulse, 1);
    const p = this.game.player;
    const t = this.target;
    if (!t) return;

    if (this.active) {
      const m = this.active;
      if (m.timer > 0) {
        m.timer -= dt;
        if (m.timer <= 0) { this.fail(`${m.def.name} — out of time`); return; }
      }
      const d = Math.hypot(p.x - t.x, p.z - t.z);
      if (m.def.type === 'driveTo') {
        this.game.setObjective(`${m.def.name}: drive to the marker (${Math.round(d)}m)${m.timer ? ` — ${Math.ceil(m.timer)}s` : ''}`);
        if (d < 6 && p.driving) {
          this.complete(`${m.def.name} complete!`, m.def.reward);
          this.index += 1; this.done += 1; this.active = null;
          this.beacon.group.visible = false;
          if (this.currentDef) this.startStory(); else this.startTaxi();
        } else if (d < 6 && !p.driving) {
          this.game.setObjective(`${m.def.name}: you need to be in a car!`);
        }
      } else if (m.def.type === 'fetch') {
        if (m.stage === 'pickup') {
          this.game.setObjective(`${m.def.name}: pick up the package (${Math.round(d)}m) — press E on the marker${m.timer ? ` — ${Math.ceil(m.timer)}s` : ''}`);
          if (d < 5 && this.game.input.wasPressed('KeyE')) {
            m.stage = 'deliver';
            m.target = m.def.target;
            this._placeBeacon();
            this.game.audio.cash();
            this.game.message('Package collected', 'Now deliver it to the Neon Palms hotel.');
          }
        } else {
          this.game.setObjective(`${m.def.name}: deliver the package (${Math.round(d)}m)${m.timer ? ` — ${Math.ceil(m.timer)}s` : ''}`);
          if (d < 6) {
            this.complete(`${m.def.name} complete!`, m.def.reward);
            this.index += 1; this.done += 1; this.active = null;
            this.beacon.group.visible = false;
            if (this.currentDef) this.startStory(); else this.startTaxi();
          }
        }
      } else if (m.def.type === 'evade') {
        this.game.setObjective(`${m.def.name}: lose the wanted level! Stars: ${'★'.repeat(this.game.wanted)}${m.timer ? ` — ${Math.ceil(m.timer)}s` : ''}`);
        if (this.game.wanted === 0) {
          this.complete(`${m.def.name} complete!`, m.def.reward);
          this.index += 1; this.done += 1; this.active = null;
          this.beacon.group.visible = false;
          if (this.currentDef) this.startStory(); else this.startTaxi();
        }
      }
      return;
    }

    // Taxi fares.
    if (this.taxi) {
      const tx = this.taxi;
      const d = Math.hypot(p.x - t.x, p.z - t.z);
      if (tx.stage === 'pickup') {
        this.game.setObjective(`Taxi: pick up the passenger (${Math.round(d)}m).`);
        if (d < 6 && p.driving) {
          tx.stage = 'dropoff';
          tx.target = { x: pick(this.rng, this.game.city.roadX.slice(1, -1)), z: pick(this.rng, this.game.city.roadZ.slice(1, -1)) };
          tx.fare = 60;
          this._placeBeacon();
          this.game.message('Passenger aboard', 'Drive them to the pink marker.');
          this.game.audio.blip();
        } else if (d < 6 && !p.driving) {
          this.game.setObjective('Taxi: you need a car to pick up the fare!');
        }
      } else {
        this.game.setObjective(`Taxi: drop off the passenger (${Math.round(d)}m).`);
        if (d < 6) {
          const fare = tx.fare || 60;
          this.complete('Fare complete!', fare);
          this.taxi = null;
          this.beacon.group.visible = false;
          this.startTaxi();
        }
      }
    }
  }
}

// Hidden Packages only write the objective line while no story mission or taxi is active.
