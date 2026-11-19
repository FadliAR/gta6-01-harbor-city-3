// NEON HARBOR — pedestrians. 24 citizens with a tiny FSM: stroll the
// sidewalks, idle and chat, and panic-flee when a car screams past or the
// wanted level spikes. They give the city life and the wanted system
// witnesses: stealing a car in front of one raises the heat.

import { BALANCE } from './config.js';
import { makeRng } from './rng.js';
import { distance2D } from './rng.js';
import { resolveCollisions } from './world.js';

const SHIRT_COLORS = [0xd83a6a, 0x3a8ad8, 0x3ad86a, 0xe8c832, 0x8a5ad8, 0xe8e8e8, 0x2a2a2a, 0xd86a2a];
const PANTS_COLORS = [0x2a3a5a, 0x3a3a3a, 0x5a4a3a, 0x2a4a3a];

function buildPedMesh(rng) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: rng.pick(SHIRT_COLORS) });
  const pants = new THREE.MeshLambertMaterial({ color: rng.pick(PANTS_COLORS) });
  const skin = new THREE.MeshLambertMaterial({ color: rng.pick([0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0]) });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), pants);
  legs.position.y = 0.4;
  group.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.35), shirt);
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), skin);
  head.position.y = 1.75;
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: rng.pick([0x1a1a1a, 0x5a3a1a, 0x8a8a8a, 0x2a2a4a]) }),
  );
  hair.position.y = 1.78;
  group.add(hair);
  return group;
}

export class PedestrianSystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.peds = [];
    const rng = makeRng(777);
    for (let i = 0; i < BALANCE.pedCount; i++) {
      const mesh = buildPedMesh(rng);
      scene.add(mesh);
      const x = rng.range(-180, 180);
      const z = rng.range(-180, 130);
      this.peds.push({
        mesh,
        pos: new THREE.Vector3(x, 0, z),
        target: { x, z },
        state: 'walk',
        stateTime: rng.range(0, 3),
        speed: rng.range(1.1, 1.9),
        angle: rng.range(0, Math.PI * 2),
        down: false,
        downTime: 0,
      });
    }
  }

  _pickTarget(ped, rng) {
    // Prefer a sidewalk spot near a road, anywhere in the city.
    const roads = this.world.roads.filter((c) => c <= 150);
    const road = roads[Math.floor(rng.next() * roads.length)];
    if (rng.chance(0.5)) {
      return { x: road + (rng.chance(0.5) ? 9 : -9), z: rng.range(-190, 135) };
    }
    return { x: rng.range(-190, 190), z: road + (rng.chance(0.5) ? 9 : -9) };
  }

  update(dt, player, wanted) {
    // A fresh seeded stream per frame is wasteful; one throwaway stream is
    // enough for target picks (city layout itself uses the fixed seed).
    const rng = makeRng((Math.random() * 1000000000) | 0);
    for (const ped of this.peds) {
      if (ped.down) {
        ped.downTime -= dt;
        ped.mesh.rotation.x = -Math.PI / 2;
        if (ped.downTime <= 0) {
          ped.down = false;
          ped.mesh.rotation.x = 0;
          ped.state = 'walk';
          ped.target = this._pickTarget(ped, rng);
        }
        continue;
      }
      ped.stateTime -= dt;
      const playerDist = player ? distance2D(ped.pos.x, ped.pos.z, player.x, player.z) : 999;
      const playerSpeed = player ? Math.abs(player.speed || 0) : 0;
      const scared = (playerDist < 6 && playerSpeed > 8) || (wanted >= 3 && playerDist < 14);
      if (scared && ped.state !== 'flee') {
        ped.state = 'flee';
        ped.stateTime = 2.5;
        const away = Math.atan2(ped.pos.x - player.x, ped.pos.z - player.z);
        ped.target = {
          x: ped.pos.x + Math.sin(away) * 26,
          z: ped.pos.z + Math.cos(away) * 26,
        };
      }
      if (ped.state === 'idle' && ped.stateTime <= 0) {
        ped.state = 'walk';
        ped.target = this._pickTarget(ped, rng);
      } else if (ped.state === 'walk' && (ped.stateTime <= 0 || distance2D(ped.pos.x, ped.pos.z, ped.target.x, ped.target.z) < 1.5)) {
        ped.state = 'idle';
        ped.stateTime = rng.next() * 4 + 1;
      } else if (ped.state === 'flee' && ped.stateTime <= 0) {
        ped.state = 'walk';
        ped.target = this._pickTarget(ped, rng);
      }
      if (ped.state !== 'idle') {
        const speed = ped.state === 'flee' ? 5.2 : ped.speed;
        const dx = ped.target.x - ped.pos.x;
        const dz = ped.target.z - ped.pos.z;
        const dist = Math.hypot(dx, dz) || 1;
        const step = Math.min(dist, speed * dt);
        ped.pos.x += (dx / dist) * step;
        ped.pos.z += (dz / dist) * step;
        ped.angle = Math.atan2(dx, dz);
        resolveCollisions(ped.pos, 0.5, this.world.colliders);
        // Gentle bob while walking.
        ped.mesh.position.y = Math.abs(Math.sin(performance.now() / 180 + ped.pos.x)) * 0.06;
      }
      ped.mesh.position.x = ped.pos.x;
      ped.mesh.position.z = ped.pos.z;
      ped.mesh.rotation.y = ped.angle;
    }
  }

  // Nearest pedestrian to a point, within a radius. Used by combat + stealing.
  nearest(x, z, radius) {
    let best = null;
    let bestDist = radius;
    for (const ped of this.peds) {
      if (ped.down) continue;
      const d = distance2D(x, z, ped.pos.x, ped.pos.z);
      if (d < bestDist) {
        bestDist = d;
        best = ped;
      }
    }
    return best;
  }

  knockDown(ped) {
    ped.down = true;
    ped.downTime = 6;
  }
}
