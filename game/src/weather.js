// Port Solano — Dynamic Weather (round 2).
//
// A living sky over the sunset city: drifting clouds, occasional rain that
// rolls in and clears again, fog that thickens and thins with the rain, a
// dusk that deepens the longer the player stays out, and rare lightning
// with a low crack of thunder. This module only touches the scene fog and
// its own meshes (clouds and rain); the sun and hemisphere lights belong
// to the city builder and are never modified here.
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32, range } from './random.js';

const FOG_CLEAR = { near: 180, far: 520 };
const FOG_RAIN = { near: 110, far: 360 };
const FOG_DUSK = 0x9a4a5e;
const FOG_DAY = 0xe08a5a;
const RAIN_COUNT = 900;
const RAIN_AREA = 260;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class Weather {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.rng = mulberry32((game.seed ^ 0xea7) >>> 0);
    this._time = 0;
    this.rainLevel = 0; // 0 = dry, 1 = full rain
    this._phase = 'clear'; // clear | raining
    this._phaseTimer = range(this.rng, 25, 50);
    this._flash = 0;
    this._flashStage = 0;
    this._lightningTimer = range(this.rng, 20, 45);
    this._baseFog = { near: FOG_CLEAR.near, far: FOG_CLEAR.far };
    this._fogColor = new THREE.Color(FOG_DAY);
    this._duskColor = new THREE.Color(FOG_DUSK);

    // Clouds: soft white clusters of flattened spheres, high overhead.
    this.clouds = new THREE.Group();
    this.clouds.name = 'weather-clouds';
    this._cloudList = [];
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xf6e8dc, transparent: true, opacity: 0.85 });
    const cloudDark = new THREE.MeshLambertMaterial({ color: 0xd8b8a8, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 10; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + Math.floor(this.rng() * 3);
      for (let j = 0; j < puffs; j++) {
        const s = range(this.rng, 7, 15);
        const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), j % 2 ? cloudDark : cloudMat);
        puff.scale.y = 0.42;
        puff.position.set(j * range(this.rng, 8, 14) - puffs * 5, range(this.rng, -1.5, 1.5), range(this.rng, -6, 6));
        cloud.add(puff);
      }
      cloud.position.set(range(this.rng, -280, 280), range(this.rng, 55, 85), range(this.rng, -260, 260));
      this.clouds.add(cloud);
      this._cloudList.push({ mesh: cloud, speed: range(this.rng, 1.2, 3.0) });
    }
    scene.add(this.clouds);

    // Rain: a single Points cloud of falling streaks around the player.
    const pos = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      pos[i * 3] = range(this.rng, -RAIN_AREA, RAIN_AREA);
      pos[i * 3 + 1] = range(this.rng, 0, 32);
      pos[i * 3 + 2] = range(this.rng, -RAIN_AREA, RAIN_AREA);
    }
    this._rainPos = pos;
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._rainGeo = rainGeo;
    this.rain = new THREE.Points(
      rainGeo,
      new THREE.PointsMaterial({ color: 0x9fc4e8, size: 0.22, transparent: true, opacity: 0 }),
    );
    this.rain.name = 'weather-rain';
    this.rain.frustumCulled = false;
    scene.add(this.rain);
  }

  _setFog() {
    const fog = this.scene.fog;
    if (!fog) return;
    // Dusk deepens with the in-game clock: over ten minutes the fog colour
    // slides from sunset orange toward a deeper dusk mauve.
    const dusk = Math.min(1, this.game.elapsed / 600);
    const c = this._fogColor.clone().lerp(this._duskColor, dusk * 0.55);
    if (this._flash > 0) c.lerp(new THREE.Color(0xfff2cc), Math.min(1, this._flash * 6));
    fog.color.copy(c);
    fog.near = lerp(this._baseFog.near, FOG_RAIN.near, this.rainLevel);
    fog.far = lerp(this._baseFog.far, FOG_RAIN.far, this.rainLevel);
  }

  update(dt) {
    this._time += dt;
    const g = this.game;
    if (!g) return;

    // Rain comes and goes in seeded spells.
    this._phaseTimer -= dt;
    if (this._phaseTimer <= 0) {
      if (this._phase === 'clear') {
        this._phase = 'raining';
        this._phaseTimer = range(this.rng, 12, 26);
      } else {
        this._phase = 'clear';
        this._phaseTimer = range(this.rng, 25, 55);
      }
    }
    const target = this._phase === 'raining' ? 1 : 0;
    this.rainLevel += Math.max(-1, Math.min(1, target - this.rainLevel)) * dt * 0.5;
    this.rainLevel = Math.max(0, Math.min(1, this.rainLevel));
    this.rain.material.opacity = this.rainLevel * 0.75;

    // Rain falls around the player and wraps back to the top.
    if (this.rainLevel > 0.02 && g.player) {      const px = g.player.x;
      const pz = g.player.z;
      const pos = this._rainPos;
      const fall = 26 * dt;
      for (let i = 0; i < RAIN_COUNT; i++) {
        let y = pos[i * 3 + 1] - fall;
        if (y < 0) {
          y = 30 + range(this.rng, 0, 2);
          pos[i * 3] = px + range(this.rng, -RAIN_AREA, RAIN_AREA);
          pos[i * 3 + 2] = pz + range(this.rng, -RAIN_AREA, RAIN_AREA);
        }
        pos[i * 3 + 1] = y;
      }
      this._rainGeo.attributes.position.needsUpdate = true;
      this.rain.position.set(0, 0, 0);
    }

    // Clouds drift east and wrap around the world.
    for (const c of this._cloudList) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 320) c.mesh.position.x = -320;
    }

    // Rare lightning while it rains: a double flash and a low crack.
    if (this._phase === 'raining') {
      this._lightningTimer -= dt;
      if (this._lightningTimer <= 0) {
        this._flash = 0.35;
        this._flashStage = 2;
        this._lightningTimer = range(this.rng, 25, 60);
        if (g.audio && typeof g.audio.crash === 'function') g.audio.crash();
      }
    }
    if (this._flash > 0) {
      this._flash -= dt;
      if (this._flash <= 0 && this._flashStage > 0) {
        this._flashStage -= 1;
        if (this._flashStage > 0) this._flash = 0.18; // second, fainter flash
      }
    }

    this._setFog();
  }

  dispose() {
    if (!this.scene) return;
    this.scene.remove(this.clouds);
    this.scene.remove(this.rain);
    // Hand the sky back to the city builder's sunset.
    if (this.scene.fog) {
      this.scene.fog.near = this._baseFog.near;
      this.scene.fog.far = this._baseFog.far;
      this.scene.fog.color.set(FOG_DAY);
    }
  }
}

// Hidden Packages sit at ground level, so rain and fog never hide their glow.
