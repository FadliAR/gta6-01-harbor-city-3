// NEON HARBOR — the city itself. A seeded procedural build of the 7x7 grid:
// roads, sidewalks, towers with lit windows, the central plaza, the 78 m
// Harbor Spire, the south marina with a pier and boats, and the bay.
// Returns the scene group plus collision boxes, the road graph for traffic,
// parked-car spots, cash-pickup spots and the player spawn.

import {
  BLOCK, ROAD, GRID, HALF, WATER_Z, SPIRE_HEIGHT, COLORS, SEED,
} from './config.js';
import { makeRng, clamp } from './rng.js';

export function roadCenters() {
  const centers = [];
  for (let j = 0; j <= GRID; j++) centers.push(-HALF + ROAD / 2 + j * (BLOCK + ROAD));
  return centers;
}

export function blockCenters() {
  const centers = [];
  for (let i = 0; i < GRID; i++) centers.push(-HALF + ROAD + BLOCK / 2 + i * (BLOCK + ROAD));
  return centers;
}

function facadeTexture(rng, baseColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `#${baseColor.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, 128, 256);
  const cols = 6;
  const rows = 12;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = rng.chance(0.45);
      ctx.fillStyle = lit ? (rng.chance(0.7) ? '#ffd98a' : '#9ad8ff') : '#1a1a2e';
      ctx.fillRect(8 + c * 19, 10 + r * 20, 13, 12);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function neonSignTexture(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101018';
  ctx.fillRect(0, 0, 256, 64);
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#141a3d');
  grad.addColorStop(0.45, '#5e2a6e');
  grad.addColorStop(0.72, '#c94f5e');
  grad.addColorStop(1, '#ff8a3d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWorld() {
  const rng = makeRng(SEED);
  const group = new THREE.Group();
  group.name = 'NeonHarborCity';
  const colliders = [];
  const parkedCars = [];
  const cashSpots = [];

  // --- Sky dome + lights -------------------------------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  group.add(sky);
  const hemi = new THREE.HemisphereLight(0xffb37a, 0x2a1e4a, 0.75);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc27a, 1.6);
  sun.position.set(-180, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 700;
  group.add(sun);
  group.add(new THREE.AmbientLight(0x404060, 0.5));

  // --- Ground, roads, sidewalks ------------------------------------------
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x2e2a33 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 80, HALF * 2 + 80), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 40;
  ground.receiveShadow = true;
  group.add(ground);

  const roads = roadCenters();
  const blocks = blockCenters();
  const roadMat = new THREE.MeshLambertMaterial({ color: COLORS.road });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8c832 });
  const walkMat = new THREE.MeshLambertMaterial({ color: COLORS.sidewalk });
  const cityLen = HALF * 2;
  roads.forEach((c) => {
    if (c > WATER_Z) return; // the far south road is the waterfront, not asphalt
    const h = new THREE.Mesh(new THREE.PlaneGeometry(cityLen, ROAD), roadMat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.02, c);
    h.receiveShadow = true;
    group.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, cityLen), roadMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(c, 0.02, 0);
    v.receiveShadow = true;
    group.add(v);
    // dashed centre lines
    for (let t = -HALF + 10; t < HALF - 10; t += 12) {
      const dashH = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.5), lineMat);
      dashH.rotation.x = -Math.PI / 2;
      dashH.position.set(t, 0.04, c);
      group.add(dashH);
      const dashV = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 6), lineMat);
      dashV.rotation.x = -Math.PI / 2;
      dashV.position.set(c, 0.04, t);
      group.add(dashV);
    }
  });
  // Sidewalk slabs per block.
  blocks.forEach((bx) => {
    blocks.forEach((bz) => {
      if (bz > WATER_Z - BLOCK) return;
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK + 4, BLOCK + 4), walkMat);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(bx, 0.03, bz);
      slab.receiveShadow = true;
      group.add(slab);
    });
  });

  // --- Water, beach, pier, marina ----------------------------------------
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 320),
    new THREE.MeshLambertMaterial({ color: COLORS.water, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.05, WATER_Z + 160);
  group.add(water);
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(cityLen, 24),
    new THREE.MeshLambertMaterial({ color: COLORS.sand }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.04, WATER_Z - 4);
  beach.receiveShadow = true;
  group.add(beach);
  // Pier: wooden deck reaching into the bay, with lamps.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2e });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 70), pierMat);
  pier.position.set(-60, 0.6, WATER_Z + 32);
  pier.castShadow = true;
  group.add(pier);
  colliders.push({ minX: -65, maxX: -55, minZ: WATER_Z - 2, maxZ: WATER_Z + 66 });
  for (let i = 0; i < 5; i++) {
    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 5, 6),
      new THREE.MeshLambertMaterial({ color: 0x333340 }),
    );
    lamp.position.set(i % 2 === 0 ? -64 : -56, 3, WATER_Z + 6 + i * 13);
    group.add(lamp);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe6a0 }),
    );
    bulb.position.set(lamp.position.x, 5.6, lamp.position.z);
    group.add(bulb);
  }
  // Moored boats.
  for (let i = 0; i < 6; i++) {
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(4, 1.6, 11),
      new THREE.MeshLambertMaterial({ color: COLORS.carPalette[i % COLORS.carPalette.length] }),
    );
    hull.position.set(-120 + i * 42, 0.6, WATER_Z + 26 + (i % 2) * 18);
    hull.rotation.y = rng.range(-0.15, 0.15);
    group.add(hull);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 1.4, 4),
      new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }),
    );
    cabin.position.set(hull.position.x, 2, hull.position.z - 1);
    group.add(cabin);
  }

  // --- Central plaza + Harbor Spire --------------------------------------
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(34, 32),
    new THREE.MeshLambertMaterial({ color: COLORS.plaza }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.05, 0);
  plaza.receiveShadow = true;
  group.add(plaza);
  // Fountain.
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 7, 1.2, 20),
    new THREE.MeshLambertMaterial({ color: 0x8a8aa0 }),
  );
  fountain.position.set(0, 0.6, 0);
  group.add(fountain);
  const fountainWater = new THREE.Mesh(
    new THREE.CylinderGeometry(5.4, 5.4, 0.4, 20),
    new THREE.MeshLambertMaterial({ color: 0x2a9ad8, transparent: true, opacity: 0.85 }),
  );
  fountainWater.position.set(0, 1.2, 0);
  group.add(fountainWater);
  colliders.push({ minX: -7, maxX: 7, minZ: -7, maxZ: 7 });

  // Harbor Spire: 78 m tower just north of the plaza, with a neon crown.
  const spireMat = new THREE.MeshLambertMaterial({ color: 0x3a3a55 });
  const spire = new THREE.Mesh(new THREE.BoxGeometry(16, SPIRE_HEIGHT, 16), spireMat);
  spire.position.set(0, SPIRE_HEIGHT / 2, -40);
  spire.castShadow = true;
  group.add(spire);
  const crown = new THREE.Mesh(
    new THREE.BoxGeometry(17, 3, 17),
    new THREE.MeshBasicMaterial({ color: 0xff2a7a }),
  );
  crown.position.set(0, SPIRE_HEIGHT + 1.5, -40);
  group.add(crown);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xff2040 }),
  );
  beacon.position.set(0, SPIRE_HEIGHT + 5, -40);
  beacon.name = 'spireBeacon';
  group.add(beacon);
  colliders.push({ minX: -9, maxX: 9, minZ: -49, maxZ: -31 });
  // Neon sign on the spire.
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 3.5),
    new THREE.MeshBasicMaterial({ map: neonSignTexture('NEON HARBOR', '#ff2a7a'), transparent: true }),
  );
  sign.position.set(0, 62, -31.8);
  group.add(sign);

  // --- Buildings -----------------------------------------------------------
  const signWords = ['HOTEL', 'CASINO', 'PIER 9', 'NEON', 'DINER', 'CLUB', 'BAR', 'MOTEL', 'ARCADE', 'TACOS'];
  let signIndex = 0;
  blocks.forEach((bx) => {
    blocks.forEach((bz) => {
      if (bx === 0 && bz === 0) return; // plaza block
      if (bz > WATER_Z - BLOCK) return; // marina row: beach, not towers
      const n = rng.int(1, 2);
      for (let k = 0; k < n; k++) {
        const w = rng.range(16, 26);
        const d = rng.range(16, 26);
        const h = rng.range(12, 46);
        const ox = k === 0 ? -BLOCK / 4 + 4 : BLOCK / 4 - 4;
        const oz = rng.range(-8, 8);
        const px = bx + ox + rng.range(-3, 3);
        const pz = bz + oz;
        const color = rng.pick(COLORS.buildingPalette);
        const mat = new THREE.MeshLambertMaterial({ map: facadeTexture(rng, color) });
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        tower.position.set(px, h / 2, pz);
        tower.castShadow = true;
        tower.receiveShadow = true;
        group.add(tower);
        colliders.push({ minX: px - w / 2, maxX: px + w / 2, minZ: pz - d / 2, maxZ: pz + d / 2 });
        // Rooftop neon edge on some towers.
        if (rng.chance(0.4)) {
          const neon = rng.pick(COLORS.neonPalette);
          const edge = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4),
            new THREE.MeshBasicMaterial({ color: neon }),
          );
          edge.position.set(px, h + 0.25, pz);
          group.add(edge);
        }
        // Big neon sign on some towers.
        if (rng.chance(0.35) && signIndex < signWords.length) {
          const word = signWords[signIndex++];
          const neon = `#${rng.pick(COLORS.neonPalette).toString(16).padStart(6, '0')}`;
          const panel = new THREE.Mesh(
            new THREE.PlaneGeometry(12, 3),
            new THREE.MeshBasicMaterial({ map: neonSignTexture(word, neon), transparent: true }),
          );
          panel.position.set(px, h * 0.75, pz + d / 2 + 0.1);
          group.add(panel);
        }
      }
    });
  });

  // --- Street lamps + palms ------------------------------------------------
  roads.forEach((c) => {
    if (c > WATER_Z) return;
    for (let t = -HALF + 20; t < HALF - 10; t += 60) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 7, 6),
        new THREE.MeshLambertMaterial({ color: 0x2a2a33 }),
      );
      pole.position.set(c + ROAD / 2 + 1, 3.5, t);
      group.add(pole);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffe6a0 }),
      );
      bulb.position.set(c + ROAD / 2 + 1, 7.1, t);
      group.add(bulb);
    }
  });
  // Palms along the beachfront.
  for (let x = -180; x <= 180; x += 30) {
    if (Math.abs(x + 60) < 8) continue; // keep the pier clear
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.45, 7, 6),
      new THREE.MeshLambertMaterial({ color: 0x6a4a2e }),
    );
    trunk.position.set(x, 3.5, WATER_Z - 16);
    trunk.rotation.z = rng.range(-0.12, 0.12);
    group.add(trunk);
    const fronds = new THREE.Mesh(
      new THREE.ConeGeometry(3.2, 3.5, 7),
      new THREE.MeshLambertMaterial({ color: 0x2a8a4a }),
    );
    fronds.position.set(trunk.position.x, 8.2, WATER_Z - 16);
    group.add(fronds);
  }

  // --- Parked cars (stealable) ---------------------------------------------
  const parkedSpots = [
    { x: -26, z: -150, color: 0xd83a2a, model: 'coupe' },
    { x: -106, z: -106, color: 0xd83a2a, model: 'coupe', mission: true },
    { x: 34, z: -90, color: 0x2a7ad8, model: 'sedan' },
    { x: -90, z: 34, color: 0xe8c832, model: 'sedan' },
    { x: 90, z: -34, color: 0x2ad83a, model: 'sedan' },
    { x: 150, z: 90, color: 0xe8e8e8, model: 'van' },
    { x: -150, z: -30, color: 0x222222, model: 'sedan' },
    { x: 30, z: 150, color: 0xd86a2a, model: 'sedan' },
    { x: -34, z: 90, color: 0x7a2ad8, model: 'coupe' },
  ];
  parkedSpots.forEach((spot) => {
    parkedCars.push({ ...spot, angle: rng.range(0, Math.PI * 2), taken: false });
  });

  // --- Cash pickups ----------------------------------------------------------
  const cashCandidates = [
    { x: 12, z: 12 }, { x: -24, z: -60 }, { x: 60, z: 24 }, { x: -90, z: -24 },
    { x: 120, z: -90 }, { x: -120, z: 60 }, { x: 24, z: 120 }, { x: -60, z: 132 },
    { x: 90, z: -120 }, { x: -150, z: -120 },
  ];
  cashCandidates.forEach((p) => cashSpots.push({ x: p.x, z: p.z, taken: false }));

  // --- Road graph for traffic ------------------------------------------------
  const nodes = [];
  roads.forEach((x) => {
    roads.forEach((z) => {
      if (z > WATER_Z) return;
      nodes.push({ x, z });
    });
  });
  const nodeAt = (x, z) => nodes.find((n) => n.x === x && n.z === z);

  return {
    group,
    colliders,
    parkedCars,
    cashSpots,
    roads,
    blocks,
    nodes,
    nodeAt,
    playerSpawn: { x: 14, z: 20, angle: Math.PI },
    spirePos: { x: 0, z: -40 },
    plazaPos: { x: 0, z: 0 },
  };
}

// Push a circle (x,z,r) out of every AABB it overlaps. Returns true on hit.
export function resolveCollisions(pos, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const cx = clamp(pos.x, c.minX, c.maxX);
    const cz = clamp(pos.z, c.minZ, c.maxZ);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const pl = pos.x - c.minX;
        const pr = c.maxX - pos.x;
        const pt = pos.z - c.minZ;
        const pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - radius;
        else if (m === pr) pos.x = c.maxX + radius;
        else if (m === pt) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  return hit;
}

export function insideCity(x, z) {
  return x > -HALF - 10 && x < HALF + 10 && z > -HALF - 10 && z < WATER_Z + 90;
}
