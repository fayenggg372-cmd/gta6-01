// Port Solano — Marina District (round 2).
//
// A wooden harbour district along the southern beach: a boardwalk with a
// fish market, three piers over the water, moored boats that bob on the
// swell, a lighthouse with a sweeping beam, stacked containers, crates,
// bollards and circling gulls. Solid pieces register in the city colliders
// (player and cars bump into them) and in the city buildings (minimap).
// Layout is deterministic: every position comes from a seeded generator.
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32, range } from './random.js';

const WOOD = 0x8a6238;
const WOOD_DARK = 0x6b4a26;
const WOOD_PALE = 0xa97c50;
const ROPE = 0xd8c49a;
const HULL_WHITE = 0xe8e2d4;
const HULL_BLUE = 0x2e5f8a;
const HULL_RED = 0x9a3b2e;
const CANOPY = 0xe07840;
const CANOPY_ALT = 0x3f7d6b;

function lambert(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

function box(w, h, d, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color, opts));
  m.position.set(x, y, z);
  return m;
}

export class MarinaDistrict {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.group = new THREE.Group();
    this.group.name = 'marina';
    this._colliders = [];
    this._buildings = [];
    this._boats = [];
    this._gulls = [];
    this._time = 0;
    this.rng = mulberry32((seed ^ 0x5a17a) >>> 0);

    this._buildBoardwalk();
    this._buildPiers();
    this._buildLighthouse();
    this._buildMarket();
    this._buildContainers();
    this._buildBoats();
    this._buildGulls();
    scene.add(this.group);
  }

  // Register one solid box with the city so players and cars collide with it,
  // and remember it so dispose() can take it back out again.
  _solid(cx, cz, hw, hd, w, d) {
    const c = { minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd };
    this.city.colliders.push(c);
    this._colliders.push(c);
    if (w !== undefined) {
      const b = { x: cx, z: cz, w, d };
      this.city.buildings.push(b);
      this._buildings.push(b);
    }
  }

  _buildBoardwalk() {
    // A long timber deck hugging the sand at the top of the beach.
    const deck = box(340, 0.6, 9, WOOD, 0, 0.3, 210);
    this.group.add(deck);
    // Pale plank seams across the deck.
    for (let x = -165; x <= 165; x += 10) {
      this.group.add(box(0.35, 0.08, 8.6, WOOD_PALE, x, 0.62, 210));
    }
    // Low rail along the sea edge, with posts every ten metres.
    this.group.add(box(340, 0.18, 0.18, WOOD_DARK, 0, 1.1, 214.4));
    for (let x = -165; x <= 165; x += 10) {
      this.group.add(box(0.22, 1.1, 0.22, WOOD_DARK, x, 0.6, 214.4));
    }
  }

  _buildPiers() {
    // Three piers walk out from the boardwalk toward the open water. The
    // middle one is the longest and carries the lighthouse.
    this.piers = [];
    const defs = [
      { x: -90, len: 32 },
      { x: 0, len: 38 },
      { x: 90, len: 30 },
    ];
    for (const def of defs) {
      const jx = def.x + range(this.rng, -6, 6);
      const z0 = 214;
      const z1 = z0 + def.len;
      const mid = (z0 + z1) / 2;
      const pier = new THREE.Group();
      pier.add(box(6, 0.5, def.len, WOOD, 0, 0.5, mid - 214));
      // Side rails and the posts that stand in the water.
      for (const sx of [-2.9, 2.9]) {
        pier.add(box(0.16, 0.16, def.len, WOOD_DARK, sx, 1.25, mid - 214));
        for (let z = z0 + 2; z <= z1; z += 8) {
          pier.add(box(0.18, 1.0, 0.18, WOOD_DARK, sx, 0.9, z - 214));
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 6), lambert(WOOD_DARK));
          post.position.set(sx, -0.4, z - 214);
          pier.add(post);
        }
      }
      pier.position.set(jx, 0, 214);
      this.group.add(pier);
      this.piers.push({ x: jx, zEnd: z1, len: def.len });
    }
  }

  _buildLighthouse() {
    // Striped tower on the end of the longest (middle) pier, with a lamp room
    // and a beam that sweeps the water at nightfall.
    const pier = this.piers[1];
    const lx = pier.x;
    const lz = pier.zEnd - 1;
    const tower = new THREE.Group();
    const bands = [0xf2ead8, 0xc23b2e, 0xf2ead8, 0xc23b2e, 0xf2ead8];
    let y = 0.8;
    for (const color of bands) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 3.2, 12), lambert(color));
      seg.position.y = y + 1.6;
      tower.add(seg);
      y += 3.2;
    }
    // Lamp room: dark glass ring, a warm lamp, and a cap.
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 1.8, 12),
      new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffc860, transparent: true, opacity: 0.9 }),
    );
    glass.position.y = y + 0.9;
    tower.add(glass);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.4, 12), lambert(0x2e2e2e));
    cap.position.y = y + 2.5;
    tower.add(cap);
    // The beam: a long translucent wedge that rotates around the lamp.
    this.beam = new THREE.Mesh(
      new THREE.ConeGeometry(3.2, 46, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.beam.rotation.z = Math.PI / 2;
    this.beam.position.set(23, 0, 0);
    const beamPivot = new THREE.Group();
    beamPivot.position.y = y + 0.9;
    beamPivot.add(this.beam);
    tower.add(beamPivot);
    this.beamPivot = beamPivot;
    tower.position.set(lx, 0, lz);
    this.group.add(tower);
    this._solid(lx, lz, 2.0, 2.0, 4.5, 4.5);
    this.lighthouse = { x: lx, z: lz };
  }

  _buildMarket() {
    // Fish-market stalls in a row along the boardwalk: counter, striped
    // canopy, crates of the morning catch, and a hanging lamp each.
    const stallXs = [-48, -29, -10, 9, 28, 47];
    this.stalls = [];
    stallXs.forEach((sx, i) => {
      const sz = 211;
      const stall = new THREE.Group();
      stall.add(box(5.4, 1.1, 2.4, WOOD_DARK, 0, 0.55, 0));
      stall.add(box(5.0, 0.35, 2.0, i % 2 === 0 ? 0x7fb3a0 : 0xd8d0b8, 0, 1.25, 0));
      // Slanted canopy on four poles.
      const canopy = box(6.0, 0.12, 3.4, i % 2 === 0 ? CANOPY : CANOPY_ALT, 0, 3.1, 0);
      canopy.rotation.x = 0.18;
      stall.add(canopy);
      for (const [px, pz] of [[-2.7, -1.4], [2.7, -1.4], [-2.7, 1.4], [2.7, 1.4]]) {
        stall.add(box(0.14, 3.0, 0.14, WOOD_DARK, px, 1.5, pz));
      }
      // Crates of catch beside the counter.
      stall.add(box(1.1, 0.7, 1.1, WOOD_PALE, -3.4, 0.35, 0.6));
      stall.add(box(0.9, 0.6, 0.9, WOOD, 3.5, 0.3, -0.5));
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 8),
        new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffb840 }),
      );
      lamp.position.set(0, 2.7, 0);
      stall.add(lamp);
      stall.position.set(sx, 0, sz);
      this.group.add(stall);
      this._solid(sx, sz, 3.0, 1.6, 6, 3.4);
      this.stalls.push({ x: sx, z: sz });
    });
    // The harbour-job pickup stall is the third one from the west.
    this.marketStall = this.stalls[2];
  }

  _buildContainers() {
    // A small container yard at the west end of the boardwalk: rust-red,
    // sea-blue and moss-green boxes, two of them stacked.
    const defs = [
      { x: -138, z: 211, y: 1.3, color: 0x9a4a2e, ry: 0.06 },
      { x: -126, z: 212, y: 1.3, color: 0x2e5f8a, ry: -0.04 },
      { x: -138, z: 211, y: 3.9, color: 0x5a7d4a, ry: 0.06 },
      { x: -118, z: 208, y: 1.1, color: 0x8a6d2f, ry: 0.3 },
    ];
    for (const d of defs) {
      const c = box(9, 2.5, 2.6, d.color, d.x, d.y, d.z);
      c.rotation.y = d.ry;
      this.group.add(c);
      // Ribbed doors on the long side.
      for (let i = -3; i <= 3; i++) {
        this.group.add(box(0.12, 2.3, 0.12, 0x000000, d.x + i * 1.2, d.y, d.z + 1.32));
      }
      this._solid(d.x, d.z, 4.6, 1.5, 9, 2.8);
    }
    // Loose crates near the market, solid enough to hide behind.
    const crates = [
      { x: -58, z: 214, s: 1.4 },
      { x: 58, z: 214, s: 1.2 },
      { x: 66, z: 209, s: 1.6 },
    ];
    for (const cr of crates) {
      this.group.add(box(cr.s, cr.s, cr.s, WOOD_PALE, cr.x, cr.s / 2, cr.z));
      this._solid(cr.x, cr.z, cr.s / 2 + 0.1, cr.s / 2 + 0.1);
    }
  }

  _buildBoats() {
    // Moored boats alongside the piers, plus two decorative boats out past
    // the deep-water line where the player can never reach them.
    const hullColors = [HULL_WHITE, HULL_BLUE, HULL_RED, 0x3f7d6b, 0xd8c49a];
    let bi = 0;
    for (const pier of this.piers) {
      for (const side of [-1, 1]) {
        if (bi >= 5) break;
        const bx = pier.x + side * 6.5;
        const bz = 226 + range(this.rng, 0, 16);
        const boat = this._makeBoat(hullColors[bi % hullColors.length], range(this.rng, 0, Math.PI * 2));
        boat.position.set(bx, 0.4, bz);
        this.group.add(boat);
        this._boats.push({ mesh: boat, phase: range(this.rng, 0, Math.PI * 2), speed: range(this.rng, 0.7, 1.3) });
        bi++;
      }
    }
    for (const [bx, bz] of [[-40, 262], [70, 266]]) {
      const boat = this._makeBoat(HULL_WHITE, range(this.rng, 0, Math.PI * 2));
      boat.scale.setScalar(1.6);
      boat.position.set(bx, 0.4, bz);
      this.group.add(boat);
      this._boats.push({ mesh: boat, phase: range(this.rng, 0, Math.PI * 2), speed: range(this.rng, 0.5, 0.9) });
    }
  }

  _makeBoat(hullColor, yaw) {
    const boat = new THREE.Group();
    const hull = box(2.2, 0.9, 5.2, hullColor, 0, 0.45, 0);
    boat.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.8, 4), lambert(hullColor));
    bow.rotation.x = Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.45, 3.4);
    boat.add(bow);
    boat.add(box(1.4, 0.8, 1.6, 0x6b4a26, 0, 1.2, -0.4));
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 6), lambert(WOOD_DARK));
    mast.position.set(0, 2.4, 0.4);
    boat.add(mast);
    boat.rotation.y = yaw;
    return boat;
  }

  _buildGulls() {
    // Six gulls circling the harbour on wide, lazy loops.
    for (let i = 0; i < 6; i++) {
      const gull = new THREE.Group();
      const wingMat = lambert(0xf2f2f2);
      const wl = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.28), wingMat);
      wl.position.x = -0.55;
      const wr = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.28), wingMat);
      wr.position.x = 0.55;
      gull.add(wl, wr);
      gull.userData.wings = [wl, wr];
      this.group.add(gull);
      this._gulls.push({
        mesh: gull,
        cx: range(this.rng, -80, 80),
        cz: range(this.rng, 218, 244),
        r: range(this.rng, 12, 26),
        h: range(this.rng, 16, 26),
        speed: range(this.rng, 0.25, 0.5) * (i % 2 === 0 ? 1 : -1),
        phase: range(this.rng, 0, Math.PI * 2),
      });
    }
  }

  update(dt, game) {
    this._time += dt;
    const t = this._time;
    // Boats ride the swell: gentle heave and roll.
    for (const b of this._boats) {
      b.mesh.position.y = 0.4 + Math.sin(t * b.speed + b.phase) * 0.16;
      b.mesh.rotation.z = Math.sin(t * b.speed * 0.8 + b.phase) * 0.05;
      b.mesh.rotation.x = Math.cos(t * b.speed * 0.6 + b.phase) * 0.03;
    }
    // The lighthouse beam sweeps a slow circle over the water.
    if (this.beamPivot) this.beamPivot.rotation.y = t * 0.55;
    // Gulls circle their patch of sky, wings flapping slowly.
    for (const g of this._gulls) {
      const a = g.phase + t * g.speed;
      g.mesh.position.set(g.cx + Math.cos(a) * g.r, g.h + Math.sin(t * 0.7 + g.phase) * 1.2, g.cz + Math.sin(a) * g.r);
      g.mesh.rotation.y = -a - (g.speed > 0 ? 0 : Math.PI);
      const flap = Math.sin(t * 5 + g.phase) * 0.45;
      g.mesh.userData.wings[0].rotation.z = flap;
      g.mesh.userData.wings[1].rotation.z = -flap;
    }
  }

  dispose() {
    if (this.scene) this.scene.remove(this.group);
    // Take the marina's solids back out of the city so a fresh reset does
    // not stack the same colliders and minimap buildings twice.
    if (this.city) {
      for (const c of this._colliders) {
        const i = this.city.colliders.indexOf(c);
        if (i !== -1) this.city.colliders.splice(i, 1);
      }
      for (const b of this._buildings) {
        const i = this.city.buildings.indexOf(b);
        if (i !== -1) this.city.buildings.splice(i, 1);
      }
    }
  }
}
