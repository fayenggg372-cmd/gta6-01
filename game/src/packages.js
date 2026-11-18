// Hidden Packages — twenty glowing parcels tucked around Port Solano.
// A soft golden beacon marks the nearest parcel still out there. Spots
// come from the game seed; each pickup pays $50, all twenty pay $500.
import * as THREE from '../vendor/three.module.min.js';

const TOTAL = 20;
const PAY = 50;
const BONUS = 500;
const RADIUS = 3;
const PARCEL_COLOR = 0xff7a3d;
const BEACON_COLOR = 0xffc94d;

// Small seeded generator of my own (an LCG), so placement never eats
// numbers from the game's shared random stream.
function makeRand(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class HiddenPackages {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.found = 0;
    this.spots = this._place();
    this.geo = new THREE.BoxGeometry(0.55, 0.4, 0.55);
    this.mat = new THREE.MeshStandardMaterial({ color: PARCEL_COLOR, emissive: PARCEL_COLOR, emissiveIntensity: 0.9, roughness: 0.45 });
    this.groups = this.spots.map((s, i) => {
      const g = new THREE.Group();
      g.position.set(s.x, 0, s.z);
      const box = new THREE.Mesh(this.geo, this.mat);
      box.position.y = 0.45;
      g.add(box);
      const light = new THREE.PointLight(0xffa050, 0.55, 6, 2);
      light.position.y = 1.0;
      g.add(light);
      s.mesh = box; s.group = g; s.phase = i * 0.7;
      scene.add(g);
      return g;
    });
    // Golden beacon: a light column and a ground ring over the nearest uncollected parcel.
    this.beacon = new THREE.Group();
    this._colGeo = new THREE.CylinderGeometry(0.9, 0.9, 26, 12, 1, true);
    this.beaconMat = new THREE.MeshBasicMaterial({ color: BEACON_COLOR, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
    const column = new THREE.Mesh(this._colGeo, this.beaconMat);
    column.position.y = 13;
    this.beacon.add(column);
    this._ringGeo = new THREE.RingGeometry(1.6, 2.3, 32);
    this.ringMat = new THREE.MeshBasicMaterial({ color: BEACON_COLOR, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(this._ringGeo, this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    this.beacon.add(ring);
    this.beacon.visible = false;
    scene.add(this.beacon);
  }

  // Twenty spots: 8 beside buildings, 6 at road crossings, 3 on the beach, 3 at the marina.
  _place() {
    const rand = makeRand((this.game.seed * 2654435761 + 7919) >>> 0);
    const city = this.game.city;
    const spots = [];
    const taken = new Set();
    const farEnough = (x, z) => !spots.some((s) => {
      const dx = s.x - x, dz = s.z - z;
      return dx * dx + dz * dz < 36;
    });
    const add = (x, z) => {
      const key = Math.round(x / 6) + ':' + Math.round(z / 6);
      if (taken.has(key) || !farEnough(x, z)) return false;
      taken.add(key);
      spots.push({ x, z, found: false });
      return true;
    };
    let guard = 0;
    while (spots.length < 8 && guard++ < 200) {
      const b = city.buildings[Math.floor(rand() * city.buildings.length)];
      const offs = [[b.w / 2 + 3, 0], [-b.w / 2 - 3, 0], [0, b.d / 2 + 3], [0, -b.d / 2 - 3]];
      const o = offs[Math.floor(rand() * 4)];
      add(b.x + o[0], b.z + o[1]);
    }
    guard = 0;
    while (spots.length < 14 && guard++ < 200) {
      const x = city.roadX[Math.floor(rand() * city.roadX.length)] + (rand() * 6 - 3);
      const z = city.roadZ[Math.floor(rand() * city.roadZ.length)] + (rand() * 6 - 3);
      add(x, z);
    }
    guard = 0;
    while (spots.length < 17 && guard++ < 200) add(-170 + rand() * 340, 220 + rand() * 30);
    guard = 0;
    while (spots.length < 20 && guard++ < 200) add(-150 + rand() * 300, 200 + rand() * 10);
    // Last resort, so the count is always exactly twenty.
    while (spots.length < TOTAL) {
      const n = spots.length;
      spots.push({ x: -170 + n * 17, z: 236, found: false });
    }
    return spots;
  }

  update(dt) {
    const game = this.game;
    const px = game.player.x, pz = game.player.z;
    let nearest = null, nd = Infinity;
    for (const s of this.spots) {
      if (s.found) continue;
      const dx = px - s.x, dz = pz - s.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < RADIUS * RADIUS) this._collect(s);
      else if (d2 < nd) { nd = d2; nearest = s; }
    }
    // The beacon follows the nearest parcel still out there.
    if (nearest) {
      this.beacon.visible = true;
      this.beacon.position.set(nearest.x, 0, nearest.z);
      const pulse = Math.sin(game.elapsed * 2.4);
      this.beaconMat.opacity = 0.12 + 0.07 * pulse;
      this.ringMat.opacity = 0.55 + 0.25 * pulse;
    } else {
      this.beacon.visible = false;
    }
    // Gentle bob and spin so the parcels catch the eye.
    for (const s of this.spots) {
      if (s.found) continue;
      s.mesh.rotation.y += dt * 0.9;
      s.mesh.position.y = 0.45 + Math.sin(game.elapsed * 2 + s.phase) * 0.08;
    }
    // Objective line, only while no story mission or taxi is running.
    const m = game.missions;
    if (this.found < TOTAL && m && !m.active && !m.taxi) {
      game.setObjective('Hidden packages ' + this.found + '/' + TOTAL + ' — follow the golden beacon.');
    }
  }

  _collect(s) {
    s.found = true;
    this.found += 1;
    this.scene.remove(s.group);
    const game = this.game;
    game.money += PAY;
    game.audio.cash();
    if (this.found >= TOTAL) {
      game.money += BONUS;
      game.audio.missionOk();
      game.message('All hidden packages found!', '+$' + (PAY + BONUS) + ' — the $500 bonus is yours.');
    } else {
      game.message('Hidden package ' + this.found + '/' + TOTAL, '+$' + PAY + ' — follow the golden beacon.');
    }
  }

  dispose() {
    for (const g of this.groups) this.scene.remove(g);
    this.scene.remove(this.beacon);
    this.geo.dispose(); this.mat.dispose();
    this._colGeo.dispose(); this._ringGeo.dispose();
    this.beaconMat.dispose(); this.ringMat.dispose();
  }
}
