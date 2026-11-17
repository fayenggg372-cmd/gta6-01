// The player: on foot (third person) and behind the wheel.
import * as THREE from '../vendor/three.module.min.js';
import { PLAYER, CAR } from './config.js';
import { clamp, angleLerp, dist2 } from './random.js';
import { resolveCircleColliders } from './city.js';

function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2e9e6b });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.34), jacket);
  body.position.y = 1.1; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshLambertMaterial({ color: 0xd9a986 }));
  head.position.y = 1.72; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  hair.position.y = 1.76; g.add(hair);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2a3550 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.24), legMat);
  legL.position.set(-0.16, 0.35, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const armMat = new THREE.MeshLambertMaterial({ color: 0x2e9e6b });
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.2), armMat);
  armL.position.set(-0.42, 1.1, 0); g.add(legL.clone()); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  return { group: g, legL, legR, armL, armR };
}

export class Player {
  constructor(scene, spawn) {
    const { group, legL, legR, armL, armR } = makePlayerMesh();
    this.mesh = group; this.legL = legL; this.legR = legR; this.armL = armL; this.armR = armR;
    this.x = spawn.x; this.z = spawn.z;
    this.heading = spawn.heading;
    this.camYaw = spawn.heading;
    this.camPitch = 0.32;
    this.speed = 0;
    this.health = PLAYER.healthMax;
    this.inCar = null;
    this.walkPhase = 0;
    this.punchCd = 0;
    this.shootCd = 0;
    this.hurtCd = 0;
    this.regenDelay = 0;
    this.lastShot = null; // {from:{x,y,z}, to:{x,y,z}, t}
    this.mesh.position.set(this.x, 0, this.z);
    scene.add(this.mesh);
  }

  get pos() { return { x: this.x, z: this.z }; }
  get driving() { return this.inCar !== null; }

  enterCar(car) {
    this.inCar = car;
    car.occupied = true;
    this.mesh.visible = false;
    this.x = car.x; this.z = car.z;
  }

  exitCar(colliders) {
    const car = this.inCar;
    if (!car) return;
    this.inCar = null;
    car.occupied = false;
    car.speed = 0;
    // Step out on the driver's side.
    const sx = car.x - Math.cos(car.heading) * 2.2;
    const sz = car.z + Math.sin(car.heading) * 2.2;
    const [rx, rz] = resolveCircleColliders(sx, sz, PLAYER.radius, colliders);
    this.x = rx; this.z = rz;
    this.heading = car.heading;
    this.camYaw = car.heading;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
  }

  damage(amount, game) {
    if (this.hurtCd > 0) return;
    this.hurtCd = 0.6;
    this.health -= amount;
    this.regenDelay = 5;
    game.audio.thud();
    if (this.health <= 0) {
      this.health = 0;
      game.onPlayerDown();
    }
  }

  update(dt, input, w) {
    this.punchCd -= dt; this.shootCd -= dt; this.hurtCd -= dt;
    this.regenDelay -= dt;
    if (this.regenDelay <= 0 && w.wanted === 0 && this.health > 0 && this.health < PLAYER.healthMax) {
      this.health = Math.min(PLAYER.healthMax, this.health + 2.5 * dt);
    }
    // Camera orbit (drag with mouse).
    this.camYaw -= input.mouseDX * 0.005;
    this.camPitch = clamp(this.camPitch + input.mouseDY * 0.003, 0.05, 1.1);

    if (this.inCar) {
      const car = this.inCar;
      const throttle = input.axis('KeyS', 'KeyW') + input.axis('ArrowDown', 'ArrowUp');
      const steer = input.axis('KeyA', 'KeyD') + input.axis('ArrowLeft', 'ArrowRight');
      car.drive(dt, throttle, steer, w.colliders, w.allCars);
      this.x = car.x; this.z = car.z;
      this.heading = car.heading;
      this.camYaw = angleLerp(this.camYaw, car.heading, Math.min(1, dt * 1.2));
      w.audio.setEngine(Math.abs(car.speed) / CAR.maxSpeed, true);
      // Running over pedestrians.
      const ped = w.peds.nearestAlive(this.x, this.z, 2.4);
      if (ped && Math.abs(car.speed) > 3) {
        w.peds.kill(ped);
        w.pickups.spawn(ped.x, ped.z, 20);
        w.addWanted(1, 'pedestrian');
        w.audio.thud();
        car.speed *= 0.7;
      }
      if (input.wasPressed('KeyE')) this.exitCar(w.colliders);
      if (input.wasPressed('KeyH')) w.audio.horn();
      return;
    }

    w.audio.setEngine(0, false);
    // On-foot movement, camera-relative.
    const fwd = input.axis('KeyS', 'KeyW') + input.axis('ArrowDown', 'ArrowUp');
    const strafe = input.axis('KeyA', 'KeyD') + input.axis('ArrowLeft', 'ArrowRight');
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    const maxSpd = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
    let mx = sin * fwd + cos * strafe;
    let mz = cos * fwd - sin * strafe;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const target = len > 0.1 ? maxSpd : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * 10);
    const nx = this.x + mx * this.speed * dt;
    const nz = this.z + mz * this.speed * dt;
    let fx = rx, fz = rz;
    // Soft push from cars (they don't run the player over by physics alone).
    for (const car of w.allCars) {
      const d2 = dist2(fx, fz, car.x, car.z);
      if (d2 < 5.3) {
        const d = Math.sqrt(d2) || 0.01;
        const push = 2.3 - d;
        fx = fx + ((fx - car.x) / d) * push;
        fz = fz + ((fz - car.z) / d) * push;
        if (Math.abs(car.speed) > 4) this.damage(18, w.game);
        break;
      }
    }
    this.x = clamp(fx, -258, 258);
    this.z = clamp(fz, -258, 252);
    if (len > 0.1) {
      this.heading = angleLerp(this.heading, Math.atan2(mx, mz), Math.min(1, dt * 12));
    }
    this.walkPhase += dt * this.speed * 1.6;
    const swing = Math.sin(this.walkPhase) * 0.6 * clamp(this.speed / PLAYER.walkSpeed, 0, 1);
    this.legL.rotation.x = swing; this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8; this.armR.rotation.x = swing * 0.8;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;

    // Enter a car.
    if (input.wasPressed('KeyE')) {
      const car = w.traffic.nearest(this.x, this.z, 4.5, w.allCars);
      if (car) {
        const wasOccupied = car.occupied;
        this.enterCar(car);
        if (wasOccupied && !car.isPolice) {
          w.addWanted(1, 'carjacking');
          w.game.message('Car jacked!', 'The owner ran off — the cops noticed.');
          w.audio.horn();
        }
      }
    }
    // Punch.
    if (input.wasPressed('KeyF') && this.punchCd <= 0) {
      this.punchCd = PLAYER.punchCooldown;
      const ped = w.peds.nearestAlive(this.x, this.z, PLAYER.punchRange);
      if (ped) {
        ped.health -= PLAYER.punchDamage;
        w.audio.punch();
        if (ped.health <= 0) {
          w.peds.kill(ped);
          w.pickups.spawn(ped.x, ped.z, 20);
          w.addWanted(1, 'assault');
        }
      } else w.audio.punch();
    }
    // Shoot (hitscan, camera-forward cone).
    if (input.clicked && this.shootCd <= 0) {
      this.shootCd = 0.28;
      w.audio.gunshot();
      const from = { x: this.x, y: 1.5, z: this.z };
      const dirX = Math.sin(this.camYaw), dirZ = Math.cos(this.camYaw);
      let best = null, bestD = 34;
      const consider = (tx, tz, obj, kind) => {
        const dx = tx - this.x, dz = tz - this.z;
        const along = dx * dirX + dz * dirZ;
        if (along < 1 || along > bestD) return;
        const perp = Math.abs(dx * dirZ - dz * dirX);
        if (perp < 1.6 + along * 0.03) { bestD = along; best = { obj, kind, x: tx, z: tz }; }
      };
      for (const p of w.peds.peds) if (p.alive) consider(p.x, p.z, p, 'ped');
      for (const c of w.allCars) consider(c.x, c.z, c, 'car');
      for (const c of w.police.cars) consider(c.x, c.z, c, 'police');
      const to = best
        ? { x: best.x, y: 1.2, z: best.z }
        : { x: this.x + dirX * 34, y: 1.5, z: this.z + dirZ * 34 };
      this.lastShot = { from, to, t: 0.12 };
      if (best) {
        if (best.kind === 'ped') {
          w.peds.kill(best.obj);
          w.pickups.spawn(best.obj.x, best.obj.z, 20);
          w.addWanted(1, 'shooting');
        } else if (best.kind === 'police') {
          w.addWanted(1, 'shooting police');
        }
      }
      // Everyone nearby runs.
      w.danger = { x: this.x, z: this.z, r: 30 };
    }
    if (this.lastShot) {
      this.lastShot.t -= dt;
      if (this.lastShot.t <= 0) this.lastShot = null;
    }
  }

  // Third-person camera placement. Returns {pos, lookAt}.
  camera(dt) {
    const dist = this.inCar ? 11 : 8.5;
    const height = this.inCar ? 4.2 : 3.4;
    const back = {
      x: this.x - Math.sin(this.camYaw) * dist,
      z: this.z - Math.cos(this.camYaw) * dist,
    };
    return {
      pos: { x: back.x, y: height + this.camPitch * 3, z: back.z },
      look: { x: this.x + Math.sin(this.camYaw) * 4, y: 1.6, z: this.z + Math.cos(this.camYaw) * 4 },
    };
  }
}
