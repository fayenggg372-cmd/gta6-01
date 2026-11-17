// Port Solano: a procedural sunset city. All original geometry, textures and names.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, PITCH, HALF, WORLD, PALETTE } from './config.js';
import { mulberry32, pick, range, rangeInt, chance } from './random.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildingTexture(rng, base) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // Subtle vertical shading.
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.25)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.06)'); grad.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    // Lit / dark windows.
    for (let y = 10; y < h - 10; y += 18) {
      for (let x = 10; x < w - 10; x += 16) {
        const lit = rng() < 0.45;
        g.fillStyle = lit ? (rng() < 0.7 ? '#ffd98a' : '#9fd8ff') : 'rgba(10,14,24,0.85)';
        g.fillRect(x, y, 10, 12);
      }
    }
  });
}

function signTexture(text, bg, fg) {
  return canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

export function buildCity(scene, seed = 1) {
  const rng = mulberry32(seed);
  const colliders = [];   // {minX,maxX,minZ,maxZ}
  const buildings = [];   // {x,z,w,d} for the minimap
  const roadX = [];
  const roadZ = [];
  for (let k = 0; k <= CITY.blocks; k++) {
    const c = -HALF + CITY.road / 2 + k * PITCH;
    roadX.push(c); roadZ.push(c);
  }

  // --- Lights: sunset sun + warm hemisphere.
  const sun = new THREE.DirectionalLight(0xffb070, 2.2);
  sun.position.set(-120, 90, -60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 500;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x8a7bd8, 0x3a2a1a, 0.9));
  scene.fog = new THREE.Fog(PALETTE.fog, 180, 520);

  // --- Ground: city slab + beach + ocean.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD * 2, WORLD * 2),
    new THREE.MeshLambertMaterial({ color: 0x5d6b52 }),
  );
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);

  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD * 2, CITY.beach + 6),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.02, HALF + (CITY.beach + 6) / 2 - 3);
  beach.receiveShadow = true;
  scene.add(beach);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD * 2, 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.ocean }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.01, HALF + CITY.beach + 27);
  scene.add(ocean);

  // --- Roads + sidewalks (flat boxes so the minimap and physics agree).
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.roadLine });
  for (const c of roadX) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(CITY.road, 0.1, HALF * 2), roadMat);
    r.position.set(c, 0.05, 0); r.receiveShadow = true; scene.add(r);
    for (let z = -HALF + 8; z < HALF; z += 16) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 5), lineMat);
      dash.position.set(c, 0.11, z); scene.add(dash);
    }
  }
  for (const c of roadZ) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.1, CITY.road), roadMat);
    r.position.set(0, 0.05, c); r.receiveShadow = true; scene.add(r);
    for (let x = -HALF + 8; x < HALF; x += 16) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(5, 0.12, 0.5), lineMat);
      dash.position.set(x, 0.11, c); scene.add(dash);
    }
  }
  // Sidewalk skirts around every block.
  for (let i = 0; i < CITY.blocks; i++) {
    for (let j = 0; j < CITY.blocks; j++) {
      const x0 = -HALF + CITY.road + i * PITCH;
      const z0 = -HALF + CITY.road + j * PITCH;
      const w = new THREE.Mesh(new THREE.BoxGeometry(CITY.block + 6, 0.12, CITY.block + 6), walkMat);
      w.position.set(x0 + CITY.block / 2, 0.06, z0 + CITY.block / 2);
      w.receiveShadow = true;
      scene.add(w);
    }
  }

  // --- Buildings: 1-3 per block, heights grow toward the centre.
  const facadeCols = ['#6b5a8a', '#7a6a9a', '#5a6a8a', '#8a6a5a', '#4a5a6a', '#9a7a5a', '#6a7a6a'];
  const facadeTex = facadeCols.map((c) => buildingTexture(mulberry32(rangeInt(rng, 1, 99999)), c));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3a44 });
  for (let i = 0; i < CITY.blocks; i++) {
    for (let j = 0; j < CITY.blocks; j++) {
      const x0 = -HALF + CITY.road + i * PITCH;
      const z0 = -HALF + CITY.road + j * PITCH;
      const cx = x0 + CITY.block / 2, cz = z0 + CITY.block / 2;
      const centreDist = Math.hypot(i - 3, j - 3);
      const n = chance(rng, 0.55) ? 2 : 1;
      for (let b = 0; b < n; b++) {
        const w = range(rng, 12, 18), d = range(rng, 12, 18);
        const h = range(rng, 9, 34) * (1 + (3 - centreDist) * 0.22);
        const ox = n === 1 ? 0 : (b === 0 ? -9 : 9);
        const oz = n === 1 ? 0 : (b === 0 ? -9 : 9);
        const x = cx + ox, z = cz + oz;
        const mat = new THREE.MeshLambertMaterial({ map: pick(rng, facadeTex) });
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, h / 2 + 0.1, z);
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 1.6, d * 0.55), roofMat);
        roof.position.set(x, h + 0.9, z); roof.castShadow = true;
        scene.add(roof);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        buildings.push({ x, z, w, d });
      }
    }
  }

  // --- Landmark signs (original names only).
  const signs = [
    { text: 'NEON PALMS', bg: '#ff2e88', fg: '#ffffff', x: -PITCH * 3, z: PITCH * 2, y: 16 },
    { text: 'CORAL AUTO', bg: '#1e90ff', fg: '#ffffff', x: -PITCH * 2, z: -PITCH * 1, y: 12 },
    { text: 'SOLANO DOCKS', bg: '#0a7a5a', fg: '#ffffff', x: PITCH * 3, z: PITCH * 3, y: 12 },
    { text: 'PORT SOLANO', bg: '#222233', fg: '#ffd98a', x: 0, z: HALF + CITY.beach - 8, y: 10 },
  ];
  for (const s of signs) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 5.5),
      new THREE.MeshBasicMaterial({ map: signTexture(s.text, s.bg, s.fg), side: THREE.DoubleSide }),
    );
    m.position.set(s.x, s.y, s.z);
    scene.add(m);
  }

  // --- Lamp posts along roads + palm trees on the beach.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x222226 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lampGeo = new THREE.BoxGeometry(0.3, 6, 0.3);
  const bulbGeo = new THREE.SphereGeometry(0.45, 8, 6);
  const lampSpots = [];
  for (const c of roadX) for (const z of [-HALF + 30, -29, 29, HALF - 30]) lampSpots.push([c + 8, z]);
  for (const c of roadZ) for (const x of [-HALF + 30, -29, 29, HALF - 30]) lampSpots.push([x, c + 8]);
  for (const [x, z] of lampSpots) {
    const p = new THREE.Mesh(lampGeo, poleMat);
    p.position.set(x, 3, z); scene.add(p);
    const b = new THREE.Mesh(bulbGeo, lampMat);
    b.position.set(x, 6.2, z); scene.add(b);
  }
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3a });
  for (let i = 0; i < 26; i++) {
    const x = range(rng, -HALF + 10, HALF - 10);
    const z = range(rng, HALF + 4, HALF + CITY.beach - 6);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 5, 6), trunkMat);
    trunk.position.set(x, 2.5, z); trunk.castShadow = true; scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.4, 7), leafMat);
    crown.position.set(x, 6, z); crown.castShadow = true; scene.add(crown);
  }
  // A few palms scattered in the city too.
  for (let i = 0; i < 14; i++) {
    const x = pick(rng, roadX) + 10;
    const z = range(rng, -HALF + 20, HALF - 20);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 4.4, 6), trunkMat);
    trunk.position.set(x, 2.2, z); trunk.castShadow = true; scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.1, 7), leafMat);
    crown.position.set(x, 5.2, z); scene.add(crown);
  }

  // Waterline: keep everyone out of the deep water.
  colliders.push({ minX: -WORLD, maxX: WORLD, minZ: HALF + CITY.beach - 2, maxZ: WORLD + 60 });

  return {
    colliders,
    buildings,
    roadX,
    roadZ,
    playerSpawn: { x: 0, z: 29, heading: Math.PI },
    // Parked cars near the spawn, on road edges.
    carSpawns: [
      { x: 4.2, z: 29, heading: 0 }, { x: -4.2, z: -29, heading: Math.PI },
      { x: 29, z: 4.2, heading: Math.PI / 2 }, { x: -87, z: -4.2, heading: -Math.PI / 2 },
      { x: 87, z: 33.2, heading: 0 }, { x: -29, z: -33.2, heading: Math.PI },
      { x: 145, z: 4.2, heading: Math.PI / 2 }, { x: -145, z: -4.2, heading: -Math.PI / 2 },
    ],
    pedSpawns: roadX.slice(1, -1).flatMap((x) => [{ x: x + 9, z: -87 }, { x: x - 9, z: 87 }]),
  };
}

// Circle (player/car) vs AABB colliders: push the circle out. Returns corrected x,z.
export function resolveCircleColliders(x, z, r, colliders) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - r;
        else if (m === pr) x = c.maxX + r;
        else if (m === pt) z = c.minZ - r;
        else z = c.maxZ + r;
      }
    }
  }
  return [x, z];
}
