// NEON HARBOR — shared constants: city layout, balance, missions, radio.
// All numbers are original design values for this game; seed 1337 fixes the
// procedural city so every run builds the same Neon Harbor.

export const SEED = 1337;

// City grid: 7 x 7 blocks. Block pitch 46 m, road width 14 m.
export const BLOCK = 46;
export const ROAD = 14;
export const GRID = 7;
export const HALF = (GRID * BLOCK + (GRID + 1) * ROAD) / 2; // ~186 m half-extent
export const WATER_Z = 150; // south of this line (positive z) is the bay
export const SPIRE_HEIGHT = 78;

export const COLORS = {
  skyTop: 0x1b2a5e,
  skyBottom: 0xff7a3d,
  fog: 0x2a1e4a,
  road: 0x23232e,
  sidewalk: 0x3a3a48,
  plaza: 0x4a3a5e,
  water: 0x0a4a6e,
  sand: 0xc9a86a,
  buildingPalette: [0x5a4a8a, 0x8a4a6a, 0x3d6a8a, 0x8a6a3d, 0x4a8a5a, 0x6a4a9a, 0x9a5a3d],
  neonPalette: [0xff2a7a, 0x2affd8, 0xffe62a, 0x7a2aff, 0x2aff7a, 0xff7a2a],
  carPalette: [0xd83a2a, 0x2a7ad8, 0xe8c832, 0x2ad83a, 0xe8e8e8, 0x222222, 0xd86a2a, 0x7a2ad8],
};

export const BALANCE = {
  walkSpeed: 7,
  runSpeed: 11,
  carAccel: 16,
  carBrake: 30,
  carMaxSpeed: 42,
  carMaxReverse: 10,
  carTurn: 1.9,
  trafficCount: 14,
  pedCount: 24,
  cashPickupCount: 10,
  cashPickupValue: 50,
  maxHealth: 100,
  bustedHoldSeconds: 1.5,
  wantedDecaySeconds: 14,
  missionReward: [200, 350, 500, 750, 1000, 2000],
};

// Six chained story missions. Each one points at a place in the city;
// reaching the beacon advances the chain. Rewards are paid in cash.
export const MISSIONS = [
  {
    id: 'm1',
    title: 'First Light',
    brief: 'Meet Rook at the plaza fountain. He has a job for you.',
    target: { x: 0, z: 0 },
    radius: 6,
    text: 'Rook: "Harbor Spire owns this town. We take a slice. Drive to the marina and grab the drop."',
  },
  {
    id: 'm2',
    title: 'Marina Drop',
    brief: 'Pick up the package at the south pier. Any car will do — borrow one.',
    target: { x: -60, z: 138 },
    radius: 6,
    text: 'Package secured. The Harbor crew is watching the docks — stay sharp.',
  },
  {
    id: 'm3',
    title: 'Neon Run',
    brief: 'Deliver the package to the Spire garage before the timer runs out.',
    target: { x: 60, z: -60 },
    radius: 7,
    timed: 75,
    text: 'Delivered with seconds to spare. Rook is impressed.',
  },
  {
    id: 'm4',
    title: 'Hot Wheels',
    brief: 'The crew needs a fast car. Steal the red coupe parked by the north plaza.',
    target: { x: -106, z: -106 },
    radius: 5,
    needCar: true,
    text: 'Nice wheels. The owner will not miss it. Probably.',
  },
  {
    id: 'm5',
    title: 'Shake the Tail',
    brief: 'The Harbor PD is on you. Lose the heat — get your wanted level to zero.',
    target: { x: 106, z: 106 },
    radius: 8,
    loseHeat: true,
    text: 'Clean. The harbor forgets fast when the money is right.',
  },
  {
    id: 'm6',
    title: 'King of the Harbor',
    brief: 'Final drop at the Spire rooftop plaza. Finish the job.',
    target: { x: 0, z: -138 },
    radius: 6,
    text: 'Done. Neon Harbor is yours now, kid. The Spire lights spell your name tonight.',
  },
];

// Three original synth radio stations. Each station is a loop of note patterns
// played by the WebAudio engine; no audio files are shipped.
export const RADIO_STATIONS = [
  { id: 'wave', name: 'NEON WAVE 88.4', desc: 'synthwave drive', bpm: 112, wave: 'sawtooth', minor: true },
  { id: 'bay', name: 'BAY FM 101.1', desc: 'coastal chill', bpm: 84, wave: 'triangle', minor: false },
  { id: 'pulse', name: 'PULSE 96.7', desc: 'night electro', bpm: 128, wave: 'square', minor: true },
];

export const SAVE_KEY = 'neon-harbor-save-v1';
