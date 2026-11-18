// Round 2: race entry fees and harbour-job pay are tuned against the economy values defined here.
// Port Solano — an original open-world crime game (not affiliated with Rockstar Games).
// All tuning numbers, colours and mission definitions live in this one file,
// so the feel of the game can be retuned without touching the simulation.
export const STEP = 1 / 60;

export const CITY = {
  blocks: 7,          // blocks per side
  block: 44,          // block size (m)
  road: 14,           // road width (m)
  beach: 46,          // beach strip depth on the south edge
};
// Derived: road centre lines sit at multiples of (block+road).
export const PITCH = CITY.block + CITY.road;
export const HALF = (CITY.blocks * PITCH + CITY.road) / 2; // half city width
export const WORLD = HALF + CITY.beach + 40; // incl. ocean

export const PLAYER = {
  radius: 0.55,
  walkSpeed: 5.2,
  runSpeed: 9.0,
  accel: 40,
  healthMax: 100,
  punchDamage: 12,
  punchRange: 2.2,
  punchCooldown: 0.45,
};

export const CAR = {
  length: 4.6,
  width: 2.0,
  accel: 14,
  brake: 30,
  maxSpeed: 34,       // ~122 km/h
  maxReverse: 10,
  steer: 0.55,        // rad/s at full lock, scaled by speed
  grip: 6,
};

export const TRAFFIC_COUNT = 16;
export const PED_COUNT = 26;
export const POLICE_MAX = 5;

export const WANTED = {
  decayDelay: 18,     // s without crime before stars start falling
  decayStep: 14,      // s per star lost while hidden
  bustDist: 2.6,      // police touching the player on foot
  bustTime: 1.2,      // s of contact before BUSTED
};

export const ECONOMY = {
  startCash: 250,
  bustedFine: 200,
  wastedFine: 150,
  pickupCash: 25,
  taxiFare: 60,
};

export const PALETTE = {
  sky: 0xff9a5c,        // sunset
  skyTop: 0x2b3a6e,
  fog: 0xe08a5a,
  ocean: 0x1d5f7a,
  sand: 0xd9b380,
  road: 0x2e2f36,
  roadLine: 0xd8c95a,
  sidewalk: 0x8d8578,
  grass: 0x4d7a45,
  buildingGlass: 0xffe9a8,
};

export const SAVE_KEY = 'portsolano.save.v1';
export const BEST_KEY = 'portsolano.best.v1';

// Missions: a short story chain, then repeatable taxi work.
export const MISSIONS = [
  {
    id: 'm1',
    name: 'First Wheels',
    brief: 'Rico needs wheels. Get in any car and drive to the auto shop on Coral Ave.',
    hint: 'Walk up to a car and press E to get in. Drive with W A S D.',
    reward: 150,
    type: 'driveTo',
    target: { x: -PITCH * 2, z: -PITCH * 1 },
    needCar: true,
  },
  {
    id: 'm2',
    name: 'Package Run',
    brief: 'Pick up the package at the docks, then deliver it to the Neon Palms hotel. 100 seconds — don\'t dawdle.',
    hint: 'On foot or by car: stand on the glowing marker and press E.',
    reward: 300,
    type: 'fetch',
    pickup: { x: PITCH * 3, z: PITCH * 3 },
    target: { x: -PITCH * 3, z: PITCH * 2 },
    timeLimit: 100,
  },
  {
    id: 'm3',
    name: 'Hot Pursuit',
    brief: 'The Solano PD is onto you. Lose the heat: stay out of sight until your wanted level drops to zero.',
    hint: 'Break line of sight, then keep moving. Wanted stars fall when no cop can see you.',
    reward: 500,
    type: 'evade',
    startWanted: 3,
    timeLimit: 120,
  },
];

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// Hidden Packages pay $50 per parcel, $500 bonus for all 20 (see packages.js).
