// Round 2: race checkpoints are placed on the same road grid the traffic in this file drives on.
// Vehicles, pedestrians, police and pickups — everyone who shares the streets
// with the player. Cars are simple box-built meshes; traffic follows the road
// grid, pedestrians wander the sidewalks and flee from danger, and police
// cruisers chase the player while the wanted level is up.
import * as THREE from '../vendor/three.module.min.js';
import { CAR, TRAFFIC_COUNT, PED_COUNT, POLICE_MAX, PITCH } from './config.js';
import { mulberry32, pick, range, clamp, angleLerp, dist2 } from './random.js';
import { resolveCircleColliders } from './city.js';

const CAR_COLORS = [0xd23c2e, 0x2e7ad2, 0xe8b93a, 0x37b268, 0x8a5fc0, 0xd8d8d8, 0x222226, 0xe07a2e, 0x3ab8c8];

export function makeCarMesh(color, isPolice = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x14161c : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR.width, 0.75, CAR.length), bodyMat);
  body.position.y = 0.65; body.castShadow = true;
  g.add(body);
  const cabinMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0xe8e8e8 : 0x1a2028 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(CAR.width - 0.35, 0.65, CAR.length * 0.45), cabinMat);
  cabin.position.set(0, 1.3, -0.25); cabin.castShadow = true;
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w); wheels.push(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const sx of [-0.7, 0.7]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), lightMat);
    l.position.set(sx, 0.7, CAR.length / 2 + 0.02);
    g.add(l);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const sx of [-0.7, 0.7]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), tailMat);
    l.position.set(sx, 0.7, -CAR.length / 2 - 0.02);
    g.add(l);
  }
  let barL = null, barR = null;
  if (isPolice) {
    barL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    barL.position.set(-0.4, 1.7, -0.25); g.add(barL);
    barR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    barR.position.set(0.4, 1.7, -0.25); g.add(barR);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    door.position.set(-CAR.width / 2 - 0.01, 0.7, 0); g.add(door);
  }
  return { group: g, wheels, barL, barR };
}

export class Car {
  constructor(scene, x, z, heading, color, isPolice = false) {
    this.scene = scene;
    this.isPolice = isPolice;
    this.color = color;
    const { group, wheels, barL, barR } = makeCarMesh(color, isPolice);
    this.mesh = group; this.wheels = wheels; this.barL = barL; this.barR = barR;
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.occupied = false;   // has a driver (traffic) or the player
    this.driverFled = false;
    this.flash = 0;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
  }

  get pos() { return { x: this.x, z: this.z }; }

  // Player driving: throttle -1..1, steer -1..1.
  drive(dt, throttle, steerInput, colliders, others) {
    if (throttle > 0) this.speed += CAR.accel * throttle * dt;
    else if (throttle < 0) {
      this.speed += (this.speed > 0.5 ? -CAR.brake : CAR.accel * 0.7 * throttle) * dt;
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 8 * dt);
    }
    this.speed = clamp(this.speed, -CAR.maxReverse, CAR.maxSpeed);
    const spd = Math.abs(this.speed);
    const steerTarget = steerInput * CAR.steer * clamp(spd / 8, 0, 1) * (this.speed < 0 ? -1 : 1);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);
    this.heading += (this.steer * this.speed * 0.12) * dt;
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const [rx, rz] = resolveCircleColliders(nx, nz, 1.9, colliders);
    if (rx !== nx || rz !== nz) {
      if (spd > 6) this.speed *= 0.4;
      else this.speed *= 0.2;
    }
    this.x = rx; this.z = rz;
    this._separate(others);
    this._sync(dt);
  }

  _separate(others) {
    for (const o of others) {
      if (o === this) continue;
      const d2 = dist2(this.x, this.z, o.x, o.z);
      if (d2 < 16 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (4 - d) / 2;
        const ux = (this.x - o.x) / d, uz = (this.z - o.z) / d;
        this.x += ux * push; this.z += uz * push;
        this.speed *= 0.92;
      }
    }
  }

  _sync(dt) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    for (const w of this.wheels) w.rotation.x += this.speed * dt * 2.2;
    if (this.isPolice) {
      this.flash += dt;
      const on = Math.floor(this.flash / 0.28) % 2 === 0;
      this.barL.material.color.setHex(on ? 0xff2222 : 0x551111);
      this.barR.material.color.setHex(on ? 0x111155 : 0x2244ff);
    }
  }

  dispose() { this.scene.remove(this.mesh); }
}

export class Traffic {
  constructor(scene, city, seed = 1) {
    this.scene = scene; this.city = city;
    this.rng = mulberry32(seed + 77);
    this.cars = [];
    const lines = city.roadX;
    for (let i = 0; i < TRAFFIC_COUNT; i++) {
      const axis = this.rng() < 0.5 ? 'x' : 'z';
      const line = pick(this.rng, lines.slice(1, -1));
      const along = range(this.rng, -180, 180);
      const dir = this.rng() < 0.5 ? 1 : -1;
      const lane = dir > 0 ? 3.2 : -3.2;
      const x = axis === 'x' ? line + lane : along;
      const z = axis === 'x' ? along : line + lane;
      const car = new Car(scene, x, z, axis === 'x' ? (dir > 0 ? Math.PI : 0) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2), pick(this.rng, CAR_COLORS));
      car.occupied = true;
      car.axis = axis; car.line = line; car.dir = dir; car.lane = lane;
      car.cruise = range(this.rng, 9, 14);
      this.cars.push(car);
    }
    // Parked cars the player can steal.
    this.parked = [];
    for (const s of city.carSpawns) {
      const car = new Car(scene, s.x, s.z, s.heading, pick(this.rng, CAR_COLORS));
      this.parked.push(car);
    }
  }

  allCars() { return [...this.cars, ...this.parked]; }

  nearest(x, z, maxD, list) {
    let best = null, bestD = maxD * maxD;
    for (const c of list) {
      const d = dist2(x, z, c.x, c.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  update(dt, playerCar) {
    const lines = this.city.roadX;
    for (const car of this.cars) {
      if (car === playerCar) continue;
      // Slow down for a car ahead in the same lane.
      let target = car.cruise;
      for (const o of this.cars) {
        if (o === car) continue;
        const dx = o.x - car.x, dz = o.z - car.z;
        const fwd = car.axis === 'x' ? (car.dir > 0 ? dz : -dz) : (car.dir > 0 ? dx : -dx);
        const side = car.axis === 'x' ? dx : dz;
        if (fwd > 0 && fwd < 11 && Math.abs(side) < 3.5) { target = 0; break; }
      }
      if (playerCar && dist2(car.x, car.z, playerCar.x, playerCar.z) < 121) target = Math.min(target, 2);
      car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
      const step = car.speed * car.dir * dt;
      if (car.axis === 'x') car.z += step; else car.x += step;
      // At an intersection, sometimes turn onto the crossing road.
      const along = car.axis === 'x' ? car.z : car.x;
      for (const line of lines) {
        if (Math.abs(along - line) < 1.2 && this.rng() < 0.35) {
          const newAxis = car.axis === 'x' ? 'z' : 'x';
          const newDir = this.rng() < 0.5 ? 1 : -1;
          const lane = newDir > 0 ? 3.2 : -3.2;
          if (newAxis === 'x') { car.z = line + lane; car.heading = newDir > 0 ? Math.PI : 0; }
          else { car.x = line + lane; car.heading = newDir > 0 ? Math.PI / 2 : -Math.PI / 2; }
          car.axis = newAxis; car.line = line; car.dir = newDir; car.lane = lane;
          break;
        }
      }
      // Wrap around the city edge.
      const a = car.axis === 'x' ? car.z : car.x;
      if (a > 205 || a < -205) {
        if (car.axis === 'x') car.z = -car.z; else car.x = -car.x;
      }
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      for (const w of car.wheels) w.rotation.x += car.speed * dt * 2.2;
    }
  }
}

function makePedMesh(shirt, pants) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.3), new THREE.MeshLambertMaterial({ color: shirt }));
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd9a986 }));
  head.position.y = 1.62; head.castShadow = true; g.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: pants });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.22), legMat);
  legL.position.set(-0.14, 0.33, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.14; g.add(legR);
  return { group: g, legL, legR };
}

export class PedCrowd {
  constructor(scene, city, seed = 1) {
    this.scene = scene; this.city = city;
    this.rng = mulberry32(seed + 31);
    this.peds = [];
    const shirts = [0xd23c2e, 0x2e7ad2, 0xe8b93a, 0x37b268, 0xe8e8e8, 0x8a5fc0, 0x222226];
    for (let i = 0; i < PED_COUNT; i++) {
      const s = pick(this.rng, city.pedSpawns);
      const { group, legL, legR } = makePedMesh(pick(this.rng, shirts), pick(this.rng, [0x222226, 0x3a4a6a, 0x6a5a3a]));
      const p = {
        mesh: group, legL, legR,
        x: s.x + range(this.rng, -6, 6), z: s.z + range(this.rng, -6, 6),
        heading: range(this.rng, 0, Math.PI * 2),
        speed: range(this.rng, 0.8, 1.6),
        target: null, wait: range(this.rng, 0, 3),
        health: 30, alive: true, flee: 0, fade: 0, walkPhase: range(this.rng, 0, 6),
      };
      p.mesh.position.set(p.x, 0, p.z);
      scene.add(p.mesh);
      this.peds.push(p);
    }
  }

  nearestAlive(x, z, maxD) {
    let best = null, bestD = maxD * maxD;
    for (const p of this.peds) {
      if (!p.alive) continue;
      const d = dist2(x, z, p.x, p.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  update(dt, danger) {
    for (const p of this.peds) {
      if (!p.alive) {
        if (p.fade > 0) {
          p.fade -= dt;
          p.mesh.rotation.x = Math.min(Math.PI / 2, p.mesh.rotation.x + dt * 2);
          if (p.fade <= 0) p.mesh.visible = false;
        }
        continue;
      }
      if (danger) {
        const d = Math.hypot(p.x - danger.x, p.z - danger.z);
        if (d < danger.r) p.flee = 3;
      }
      let speed = p.speed;
      if (p.flee > 0) {
        p.flee -= dt; speed = 5.5;
        const away = Math.atan2(p.x - danger.x, p.z - danger.z);
        p.heading = angleLerp(p.heading, away, dt * 6);
      } else if (p.wait > 0) {
        p.wait -= dt; speed = 0;
      } else {
        if (!p.target || dist2(p.x, p.z, p.target.x, p.target.z) < 4) {
          const s = pick(this.rng, this.city.pedSpawns);
          p.target = { x: s.x + range(this.rng, -8, 8), z: s.z + range(this.rng, -8, 8) };
          if (this.rng() < 0.25) p.wait = range(this.rng, 1, 4);
        }
        const want = Math.atan2(p.target.x - p.x, p.target.z - p.z);
        p.heading = angleLerp(p.heading, want, dt * 4);
      }
      p.x += Math.sin(p.heading) * speed * dt;
      p.z += Math.cos(p.heading) * speed * dt;
      p.x = clamp(p.x, -205, 205); p.z = clamp(p.z, -205, 240);
      p.walkPhase += dt * speed * 2.4;
      const swing = Math.sin(p.walkPhase) * 0.5 * Math.min(1, speed);
      p.legL.rotation.x = swing; p.legR.rotation.x = -swing;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
    }
  }

  kill(p) {
    p.alive = false; p.fade = 12;
    p.mesh.rotation.x = 0;
  }
}

export class Police {
  constructor(scene, city) {
    this.scene = scene; this.city = city;
    this.cars = [];
    this.spawnTimer = 0;
  }

  update(dt, wanted, target, colliders) {
    const want = Math.min(wanted, POLICE_MAX);
    this.spawnTimer -= dt;
    if (this.cars.length < want && this.spawnTimer <= 0) {
      this.spawnTimer = 2.5;
      const a = Math.atan2(target.x, target.z) + Math.PI + range(Math.random, -0.6, 0.6);
      const x = clamp(target.x + Math.sin(a) * 55, -200, 200);
      const z = clamp(target.z + Math.cos(a) * 55, -200, 200);
      const car = new Car(this.scene, x, z, Math.atan2(target.x - x, target.z - z), 0x14161c, true);
      car.cruise = 30;
      this.cars.push(car);
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      if (wanted === 0) {
        // Disengage: drive off and despawn when far away.
        car.speed += (12 - car.speed) * Math.min(1, dt);
        car.x += Math.sin(car.heading) * car.speed * dt;
        car.z += Math.cos(car.heading) * car.speed * dt;
        if (Math.hypot(car.x - target.x, car.z - target.z) > 120) {
          car.dispose(); this.cars.splice(i, 1);
        }
        car._sync(dt);
        continue;
      }
      const d = Math.hypot(target.x - car.x, target.z - car.z);
      const wantHeading = Math.atan2(target.x - car.x, target.z - car.z);
      car.heading = angleLerp(car.heading, wantHeading, dt * 1.8);
      const targetSpeed = d > 6 ? 30 + wanted * 1.5 : 8;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.2);
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      const [rx, rz] = resolveCircleColliders(nx, nz, 1.9, colliders);
      car.x = rx; car.z = rz;
      car._sync(dt);
    }
  }
}

export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.geo = new THREE.BoxGeometry(0.7, 0.5, 0.25);
    this.mat = new THREE.MeshBasicMaterial({ color: 0x37d67a });
  }

  spawn(x, z, amount) {
    const m = new THREE.Mesh(this.geo, this.mat);
    m.position.set(x, 0.6, z);
    this.scene.add(m);
    this.items.push({ mesh: m, x, z, amount, t: 0 });
  }

  update(dt, px, pz) {
    let gained = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.mesh.rotation.y += dt * 3;
      it.mesh.position.y = 0.6 + Math.sin(it.t * 3) * 0.15;
      if (dist2(px, pz, it.x, it.z) < 9) {
        gained += it.amount;
        this.scene.remove(it.mesh);
        this.items.splice(i, 1);
      }
    }
    return gained;
  }
}
