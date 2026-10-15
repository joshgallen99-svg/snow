// ============================================================================
//  config — the resort: world size, lifts, runs, cosmetics
//  Coordinates: x east, z south (+z = toward the valley), y up. Meters.
//  Layout is modelled on a Japanese volcano resort: a single cone with an
//  open snowfield above treeline, runs fanning down through birch and fir to a
//  village in the south-west, a second base to the east, and an off-limits
//  ravine on the west flank.
// ============================================================================
const WORLD = { half: 1536, res: 2 };
WORLD.N = Math.round((WORLD.half * 2) / WORLD.res) + 1;
const RESORT_NAME = 'Kitakaze Peak';
const SUMMIT = [100, -950];

// Japanese trail-map convention: green / red / black.
const DIFF = {
  green:  { label: 'Beginner',     color: '#2fa84f', minG: 0.035, maxG: 0.28, rank: 0 },
  red:    { label: 'Intermediate', color: '#d8332b', minG: 0.06,  maxG: 0.44, rank: 1 },
  park:   { label: 'Terrain Park', color: '#ff8a1f', minG: 0.08,  maxG: 0.32, rank: 1 },
  black:  { label: 'Advanced',     color: '#15171b', minG: 0.12,  maxG: 0.75, rank: 2 },
  double: { label: 'Expert',       color: '#15171b', minG: 0.14,  maxG: 0.95, rank: 3 },
};

// Lift types drive the generated model and the ride cinematic.
const LIFT_TYPES = {
  platter: { label: 'Platter surface lift',        speed: 2.6, carrierGap: 14, towerGap: 55,  surface: true },
  tbar:    { label: 'T-bar surface lift',          speed: 2.8, carrierGap: 16, towerGap: 60,  surface: true },
  pair:    { label: 'Fixed-grip pair lift',        speed: 2.3, carrierGap: 16, towerGap: 95,  seats: 2 },
  quad:    { label: 'High-speed quad',             speed: 5.0, carrierGap: 30, towerGap: 115, seats: 4 },
  six:     { label: 'Hooded six-seat chair',       speed: 5.0, carrierGap: 34, towerGap: 120, seats: 6, hood: true },
  gondola: { label: '10-passenger gondola',        speed: 6.0, carrierGap: 55, towerGap: 150, cabin: true },
};

const LIFTS = [
  { id: 'family',   name: 'Family Platter',    type: 'platter', a: [-860, 1060], b: [-800, 850],   unlock: 0, color: 0x3d7d4a },
  { id: 'century',  name: 'Century Express',   type: 'quad',    a: [-470, 1000], b: [-300, 280],   unlock: 0, color: 0x2f5fb0 },
  { id: 'gondola',  name: 'Kitakaze Gondola',  type: 'gondola', a: [-600, 960],  b: [-130, -240],  unlock: 1, color: 0xc0392b },
  { id: 'railyard', name: 'Railyard T-Bar',    type: 'tbar',    a: [-40, 760],   b: [-90, 420],    unlock: 2, color: 0xd9652b },
  { id: 'birch',    name: 'Birch Hooded Six',  type: 'six',     a: [-170, 430],  b: [110, -430],   unlock: 3, color: 0x1f6f8b },
  { id: 'peak',     name: 'Peak Pair Lift',    type: 'pair',    a: [-60, -300],  b: [70, -690],    unlock: 5, color: 0x6b4f9a },
  { id: 'east',     name: 'East Ridge Quad',   type: 'quad',    a: [880, 620],   b: [470, -260],   unlock: 6, color: 0x2b7f86 },
  { id: 'summit',   name: 'Summit T-Bar',      type: 'tbar',    a: [60, -700],   b: [100, -905],   unlock: 7, color: 0x8a6d3b },
];

// Feature positions use t = fraction of run length.
const RUNS = [
  {
    id: 'firsttracks', name: 'First Tracks', diff: 'green', lift: 'family', w: 30, groomed: true, bank: 0.2,
    blurb: 'Wide and mellow beside the village. Everyone starts here.',
    pts: [[-805, 870], [-770, 930], [-800, 990], [-850, 1048]],
    features: [
      { k: 'kicker', t: 0.6, size: 0, lat: 8 },
      { k: 'forest', t0: 0, t1: 1, d: 0.3 },
      { k: 'lamps', t0: 0, t1: 1, gap: 50 },
    ],
  },
  {
    id: 'family', name: 'Family Course', diff: 'green', lift: 'century', w: 22, groomed: true, bank: 0.5,
    blurb: 'A gentle cruiser under the lights, with snowmaking all the way down.',
    pts: [[-305, 298], [-390, 430], [-470, 560], [-445, 700], [-520, 840], [-482, 985]],
    features: [
      { k: 'forest', t0: 0, t1: 1, d: 0.75 },
      { k: 'guns', t0: 0.3, t1: 0.95, gap: 65 },
      { k: 'lamps', t0: 0, t1: 1, gap: 55 },
      { k: 'rollers', t0: 0.55, t1: 0.7, amp: 0.7, wl: 30 },
    ],
  },
  {
    id: 'banzai', name: 'Banzai', diff: 'red', lift: 'century', w: 17, groomed: true, bank: 1.4,
    blurb: 'Banked turns, rollers and two booters straight back to the village.',
    pts: [[-288, 302], [-222, 430], [-240, 580], [-300, 720], [-362, 860], [-445, 990]],
    features: [
      { k: 'forest', t0: 0, t1: 1, d: 0.9 },
      { k: 'rollers', t0: 0.12, t1: 0.35, amp: 1.2, wl: 30 },
      { k: 'kicker', t: 0.45, size: 1, lat: -4 },
      { k: 'kicker', t: 0.75, size: 2, lat: 3 },
      { k: 'lamps', t0: 0, t1: 1, gap: 55 },
    ],
  },
  {
    id: 'holiday', name: 'Holiday Course', diff: 'green', lift: 'gondola', w: 15, groomed: true, bank: 0.6,
    blurb: 'The long way home: a cat track along the ravine rim with views over the valley.',
    pts: [[-142, -222], [-262, -178], [-392, -82], [-470, 80], [-560, 250], [-622, 430], [-682, 620], [-662, 800], [-602, 942]],
    features: [
      { k: 'forest', t0: 0, t1: 0.25, d: 0.4 },
      { k: 'forest', t0: 0.25, t1: 1, d: 0.85 },
      { k: 'guns', t0: 0.6, t1: 0.95, gap: 70 },
      { k: 'lamps', t0: 0.55, t1: 1, gap: 60 },
    ],
  },
  {
    id: 'wonderland', name: 'Wonderland', diff: 'red', lift: 'gondola', w: 20, groomed: true, bank: 0.9,
    blurb: 'Fast, rolling groomer from the gondola through the birch forest.',
    pts: [[-112, -218], [-152, -62], [-118, 120], [-160, 282], [-176, 412]],
    features: [
      { k: 'forest', t0: 0, t1: 1, d: 0.9 },
      { k: 'rollers', t0: 0.25, t1: 0.6, amp: 1.4, wl: 36 },
      { k: 'kicker', t: 0.7, size: 1, lat: 0 },
      { k: 'lamps', t0: 0.5, t1: 1, gap: 55 },
    ],
  },
  {
    id: 'railyard', name: 'The Railyard', diff: 'park', lift: 'railyard', w: 26, groomed: true, bank: 0,
    blurb: 'Kicker lines, boxes and rails. Lit for night sessions.',
    pts: [[-88, 438], [-72, 540], [-56, 650], [-46, 742]],
    features: [
      { k: 'forest', t0: 0, t1: 1, d: 0.6 },
      { k: 'box', t: 0.12, len: 10, lat: -9 },
      { k: 'rail', t: 0.13, len: 9, lat: 9, h: 0.9 },
      { k: 'kicker', t: 0.3, size: 1, lat: -8 },
      { k: 'kicker', t: 0.32, size: 2, lat: 8 },
      { k: 'box', t: 0.5, len: 12, lat: 0 },
      { k: 'kicker', t: 0.64, size: 2, lat: -7 },
      { k: 'kicker', t: 0.66, size: 3, lat: 9 },
      { k: 'rail', t: 0.86, len: 11, lat: -8, h: 1.0 },
      { k: 'box', t: 0.87, len: 9, lat: 8 },
      { k: 'lamps', t0: 0, t1: 1, gap: 40 },
    ],
  },
  {
    id: 'center', name: 'Center Course', diff: 'red', lift: 'birch', w: 26, groomed: true, bank: 0.7,
    blurb: 'The big wide groomer down the middle of the mountain. Let it run.',
    pts: [[105, -410], [80, -250], [30, -80], [-20, 100], [-90, 262], [-158, 416]],
    features: [
      { k: 'forest', t0: 0, t1: 1, d: 0.75 },
      { k: 'kicker', t: 0.55, size: 2, lat: 6 },
      { k: 'lamps', t0: 0.6, t1: 1, gap: 55 },
    ],
  },
  {
    id: 'birchglades', name: 'Birch Glades', diff: 'black', lift: 'birch', w: 32, groomed: false, bank: 0.2,
    blurb: 'Open birch stands and soft snow. Pick a line and keep your eyes up.',
    pts: [[140, -405], [160, -250], [130, -60], [80, 120], [-10, 300], [-140, 428]],
    features: [
      { k: 'forest', t0: 0, t1: 1, d: 0.9 },
      { k: 'glade', t0: 0.1, t1: 0.9, d: 0.5 },
      { k: 'powder', t0: 0, t1: 1 },
      { k: 'rocks', t0: 0.2, t1: 0.7, n: 5 },
    ],
  },
  {
    id: 'dynamic', name: 'Dynamic', diff: 'black', lift: 'peak', w: 20, groomed: false, bank: 0,
    blurb: 'Steep fall-line moguls right under the pair lift.',
    pts: [[52, -676], [22, -560], [-18, -440], [-52, -318]],
    features: [
      { k: 'forest', t0: 0, t1: 1, d: 0.35 },
      { k: 'moguls', t0: 0.1, t1: 0.9, amp: 0.9 },
    ],
  },
  {
    id: 'superridge', name: 'Super Ridge', diff: 'red', lift: 'peak', w: 20, groomed: true, bank: 0.8,
    blurb: 'Rides the east spur from treeline to the east base. Big views the whole way.',
    pts: [[82, -676], [240, -640], [400, -560], [560, -450], [700, -300], [800, -80], [860, 150], [900, 380], [886, 598]],
    features: [
      { k: 'forest', t0: 0, t1: 0.3, d: 0.1 },
      { k: 'forest', t0: 0.3, t1: 1, d: 0.7 },
      { k: 'rollers', t0: 0.45, t1: 0.6, amp: 1.5, wl: 40 },
      { k: 'kicker', t: 0.8, size: 2, lat: 0 },
    ],
  },
  {
    id: 'summitbowl', name: 'Summit Bowl', diff: 'double', lift: 'summit', w: 40, groomed: false, bank: 0.1,
    blurb: 'Drop the cornice off the summit into the open cone. Deep, wind-blown and committing.',
    pts: [[88, -888], [10, -850], [-80, -760], [-150, -620], [-170, -470], [-122, -332], [-76, -306]],
    features: [
      { k: 'forest', t0: 0, t1: 0.7, d: 0.0 },
      { k: 'forest', t0: 0.7, t1: 1, d: 0.3 },
      { k: 'powder', t0: 0, t1: 1 },
      { k: 'cornice', t: 0.06 },
      { k: 'rocks', t0: 0.15, t1: 0.6, n: 14 },
      { k: 'drop', t: 0.45, h: 4 },
    ],
  },
  {
    id: 'couloir', name: 'North Couloir', diff: 'black', lift: 'summit', w: 12, groomed: false, bank: 0.3,
    blurb: 'A rock-walled chute off the summit that opens into a fall-line rip.',
    pts: [[112, -890], [175, -815], [215, -690], [232, -550], [242, -400], [252, -200], [230, 0], [170, 200], [60, 360], [-118, 446]],
    features: [
      { k: 'forest', t0: 0, t1: 0.3, d: 0.0 },
      { k: 'forest', t0: 0.3, t1: 1, d: 0.85 },
      { k: 'rocks', t0: 0.03, t1: 0.22, n: 8 },
      { k: 'powder', t0: 0, t1: 0.35 },
      { k: 'drop', t: 0.12, h: 3.5 },
      { k: 'kicker', t: 0.6, size: 2, lat: 0 },
    ],
  },
  {
    id: 'hanaglades', name: 'Hanagawa Glades', diff: 'black', lift: 'east', w: 34, groomed: false, bank: 0.1,
    blurb: 'The east side stash. Deep, untracked and full of pillows.',
    pts: [[470, -238], [470, -60], [520, 120], [610, 300], [720, 460], [860, 606]],
    features: [
      { k: 'forest', t0: 0, t1: 1, d: 0.7 },
      { k: 'powder', t0: 0, t1: 1 },
      { k: 'glade', t0: 0.1, t1: 0.9, d: 0.3 },
      { k: 'rocks', t0: 0.15, t1: 0.75, n: 10 },
      { k: 'drop', t: 0.35, h: 3 },
    ],
  },
];
const RUN_BY_ID = Object.fromEntries(RUNS.map((r, i) => [r.id, Object.assign(r, { index: i })]));
const LIFT_BY_ID = Object.fromEntries(LIFTS.map((l, i) => [l.id, Object.assign(l, { index: i })]));

// kicker sizes: [length, lip height, width, landing drop, landing length]
const KICKER_SIZES = [
  [6, 0.9, 5, 1.4, 14],
  [9, 1.9, 7, 3.0, 24],
  [12, 2.9, 8, 4.6, 32],
  [15, 3.8, 9, 6.2, 40],
];

// Village and base buildings: [x, z, kind, rotation]
const VILLAGE = { center: [-640, 1080], east: [905, 660] };

// Gear locker. cost = snowflake tokens needed to unlock.
const BOARDS = [
  { id: 'birch',   name: 'Birch',       cost: 0,  top: ['#f2ede4', '#1e2a38'], pattern: 'stripe' },
  { id: 'ember',   name: 'Ember',       cost: 0,  top: ['#ff6b35', '#2b1d3a'], pattern: 'chevron' },
  { id: 'glacier', name: 'Glacier',     cost: 6,  top: ['#bfe6ff', '#1f5d8c'], pattern: 'facets' },
  { id: 'pine',    name: 'Pine Line',   cost: 12, top: ['#24553b', '#e8d9b0'], pattern: 'trees' },
  { id: 'aurora',  name: 'Aurora',      cost: 20, top: ['#5ef2c2', '#6a3cff'], pattern: 'wave' },
  { id: 'sunset',  name: 'Golden Hour', cost: 30, top: ['#ffcf5c', '#e0486e'], pattern: 'sun' },
  { id: 'night',   name: 'Night Shift', cost: 42, top: ['#11131c', '#ffd23f'], pattern: 'stars' },
  { id: 'kaze',    name: 'Kaze Pro',    cost: 55, top: ['#f4f4f4', '#c0392b'], pattern: 'circle' },
];
const JACKETS = [
  { id: 'tangerine', name: 'Tangerine', cost: 0,  c: '#ff7a2f' },
  { id: 'glacier',   name: 'Glacier',   cost: 0,  c: '#3f86d8' },
  { id: 'moss',      name: 'Moss',      cost: 4,  c: '#5d7d3a' },
  { id: 'plum',      name: 'Plum',      cost: 10, c: '#7a3d82' },
  { id: 'signal',    name: 'Signal',    cost: 16, c: '#e8d23a' },
  { id: 'storm',     name: 'Storm',     cost: 24, c: '#3a4552' },
  { id: 'cherry',    name: 'Cherry',    cost: 34, c: '#c8243b' },
  { id: 'mint',      name: 'Mint',      cost: 46, c: '#7fe0c0' },
];
const PANTS = [
  { id: 'charcoal', name: 'Charcoal', cost: 0,  c: '#2c3036' },
  { id: 'sand',     name: 'Sand',     cost: 0,  c: '#c9b48e' },
  { id: 'navy',     name: 'Navy',     cost: 8,  c: '#1f2d4d' },
  { id: 'olive',    name: 'Olive',    cost: 14, c: '#4b5130' },
  { id: 'white',    name: 'Snow',     cost: 28, c: '#e6e9ee' },
  { id: 'rust',     name: 'Rust',     cost: 38, c: '#8c3b1e' },
];
const HELMETS = [
  { id: 'white', name: 'White', cost: 0,  c: '#eef0f2' },
  { id: 'black', name: 'Black', cost: 0,  c: '#1b1d21' },
  { id: 'red',   name: 'Red',   cost: 8,  c: '#c43a31' },
  { id: 'teal',  name: 'Teal',  cost: 18, c: '#1f8a8a' },
  { id: 'gold',  name: 'Gold',  cost: 36, c: '#d8a93a' },
];
