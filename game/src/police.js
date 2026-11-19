// NEON HARBOR — the wanted system and the Harbor PD response.
// Heat 0-5: foot cops chase from 1 star, cruisers join at 2, and a police
// helicopter with a searchlight circles the player from 4 stars. Heat decays
// when the player stays out of sight; getting caught on foot means BUSTED.

import { BALANCE } from './config.js';
import { makeRng } from './rng.js';
import { angleDiff, clamp, distance2D } from './rng.js';
import { buildCarMesh } from './vehicles.js';
import { resolveCollisions } from './world.js';

const COP_COLORS = [0x1a2a6a, 0x1a2a6a, 0x2a3a8a];

function buildCopMesh() {
  const group = new THREE.Group();
  const uniform = new THREE.MeshLambertMaterial({ color: 0x1a2a6a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), new THREE.MeshLambertMaterial({ color: 0x141a2a }));
  legs.position.y = 0.4;
  group.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), uniform);
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02), new THREE.MeshBasicMaterial({ color: 0xffd832 }));
  badge.position.set(0.18, 1.3, 0.19);
  group.add(badge);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), skin);
  head.position.y = 1.75;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 10), uniform);
  cap.position.y = 1.95;
  group.add(cap);
  return group;
}

function buildHeliMesh() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a2a6a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 5.2), bodyMat);
  body.castShadow = true;
  group.add(body);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.9, 1.6),
    new THREE.MeshLambertMaterial({ color: 0x182838 }),
  );
  glass.position.set(0, 0.1, 1.8);
  group.add(glass);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 4.5), bodyMat);
  tail.position.set(0, 0.3, -4.2);
  group.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 1.2), bodyMat);
  fin.position.set(0, 0.9, -6.2);
  group.add(fin);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  rotor.position.y = 1.0;
  rotor.name = 'rotor';
  group.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.4), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  tailRotor.position.set(0.35, 0.9, -6.2);
  tailRotor.name = 'tailRotor';
  group.add(tailRotor);
  // Searchlight: a spotlight aimed down at the player, plus a visible cone.
  const light = new THREE.SpotLight(0xfff2b0, 900, 90, 0.35, 0.5, 1.2);
  light.position.set(0, -0.8, 0);
  const lightTarget = new THREE.Object3D();
  light.target = lightTarget;
  group.add(light);
  group.add(lightTarget);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(7, 34, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }),
  );
  cone.position.y = -18;
  cone.rotation.x = Math.PI;
  cone.name = 'beam';
  group.add(cone);
  group.userData.light = light;
  group.userData.lightTarget = lightTarget;
  group.userData.rotor = rotor;
  group.userData.tailRotor = tailRotor;
  return group;
}

export class PoliceSystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.wanted = 0;
    this.heat = 0; // 0..100 within the current star level
    this.decayTimer = 0;
    this.cops = [];
    this.cruisers = [];
    this.heli = null;
    this.heliAngle = 0;
    this.bustedTimer = 0;
    this.onBusted = null;
    this._rng = makeRng(99);
    this._spawnTimer = 0;
  }

  addHeat(amount) {
    this.heat = clamp(this.heat + amount, 0, 500);
    const level = Math.min(5, Math.floor(this.heat / 100));
    if (level > this.wanted) {
      this.wanted = level;
      this._syncUnits();
    }
    this.decayTimer = BALANCE.wantedDecaySeconds;
  }

  setWanted(level) {
    this.wanted = clamp(level, 0, 5);
    this.heat = this.wanted * 100;
    this.decayTimer = BALANCE.wantedDecaySeconds;
    this._syncUnits();
  }

  clearWanted() {
    this.wanted = 0;
    this.heat = 0;
    this._syncUnits();
  }

  _syncUnits() {
    const wantCops = this.wanted >= 1 ? Math.min(2 + this.wanted, 6) : 0;
    const wantCruisers = this.wanted >= 2 ? Math.min(this.wanted - 1, 3) : 0;
    while (this.cops.length < wantCops) this._spawnCop();
    while (this.cops.length > wantCops) this._removeCop();
    while (this.cruisers.length < wantCruisers) this._spawnCruiser();
    while (this.cruisers.length > wantCruisers) this._removeCruiser();
    if (this.wanted >= 4 && !this.heli) {
      this.heli = buildHeliMesh();
      this.scene.add(this.heli);
      this.heliAngle = 0;
    } else if (this.wanted < 4 && this.heli) {
      this.scene.remove(this.heli);
      this.heli = null;
    }
  }

  _spawnCop() {
    const mesh = buildCopMesh();
    this.scene.add(mesh);
    this.cops.push({ mesh, pos: new THREE.Vector3(0, 0, 0), angle: 0, placed: false, down: false, downTime: 0 });
  }

  _removeCop() {
    const cop = this.cops.pop();
    if (cop) this.scene.remove(cop.mesh);
  }

  _spawnCruiser() {
    const mesh = buildCarMesh(0x1a2a6a, 'sedan');
    // Light bar.
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2040 }));
    bar.position.set(0, 1.55, -0.2);
    bar.name = 'lightbar';
    mesh.add(bar);
    this.scene.add(mesh);
    this.cruisers.push({ mesh, pos: new THREE.Vector3(0, 0, 0), angle: 0, speed: 0, placed: false });
  }

  _removeCruiser() {
    const cruiser = this.cruisers.pop();
    if (cruiser) this.scene.remove(cruiser.mesh);
  }

  // Place unplaced units near the player, just out of direct view.
  _placeNear(unit, playerPos, radius) {
    const a = this._rng.range(0, Math.PI * 2);
    unit.pos.set(
      playerPos.x + Math.sin(a) * radius,
      0,
      playerPos.z + Math.cos(a) * radius,
    );
    unit.pos.x = clamp(unit.pos.x, -200, 200);
    unit.pos.z = clamp(unit.pos.z, -200, 140);
    unit.placed = true;
  }

  update(dt, playerPos, playerSpeed, inCar) {
    // Heat decay when the player is not actively committing crimes.
    if (this.wanted > 0) {
      this.decayTimer -= dt;
      if (this.decayTimer <= 0) {
        this.heat = Math.max(0, this.heat - 20 * dt);
        const level = Math.floor(this.heat / 100);
        if (level < this.wanted) {
          this.wanted = level;
          this._syncUnits();
        }
      }
    }
    // Spawn pacing so the response ramps up instead of appearing at once.
    this._spawnTimer -= dt;

    // Foot cops: run at the player; touch them long enough and it is BUSTED.
    let nearestCopDist = 999;
    for (const cop of this.cops) {
      if (cop.down) {
        cop.downTime -= dt;
        cop.mesh.rotation.x = -Math.PI / 2;
        if (cop.downTime <= 0) {
          cop.down = false;
          cop.mesh.rotation.x = 0;
        }
        continue;
      }
      if (!cop.placed) this._placeNear(cop, playerPos, 34);
      const dist = distance2D(cop.pos.x, cop.pos.z, playerPos.x, playerPos.z);
      nearestCopDist = Math.min(nearestCopDist, dist);
      const dx = playerPos.x - cop.pos.x;
      const dz = playerPos.z - cop.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      const speed = 5.4;
      cop.pos.x += (dx / len) * speed * dt;
      cop.pos.z += (dz / len) * speed * dt;
      cop.angle = Math.atan2(dx, dz);
      resolveCollisions(cop.pos, 0.5, this.world.colliders);
      cop.mesh.position.set(cop.pos.x, Math.abs(Math.sin(performance.now() / 160)) * 0.05, cop.pos.z);
      cop.mesh.rotation.y = cop.angle;
    }
    // Busted: a foot cop holds the player on foot.
    if (!inCar && this.wanted > 0 && nearestCopDist < 1.6) {
      this.bustedTimer += dt;
      if (this.bustedTimer >= BALANCE.bustedHoldSeconds && this.onBusted) {
        this.bustedTimer = 0;
        this.onBusted();
      }
    } else {
      this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);
    }

    // Cruisers: pursuit steering; ramming the player's car slows it.
    for (const cruiser of this.cruisers) {
      if (!cruiser.placed) this._placeNear(cruiser, playerPos, 44);
      const dx = playerPos.x - cruiser.pos.x;
      const dz = playerPos.z - cruiser.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const targetAngle = Math.atan2(dx, dz);
      cruiser.angle += angleDiff(cruiser.angle, targetAngle) * Math.min(1, dt * 2.2);
      const targetSpeed = dist > 26 ? 26 : 15;
      cruiser.speed += (targetSpeed - cruiser.speed) * Math.min(1, dt * 1.5);
      cruiser.pos.x += Math.sin(cruiser.angle) * cruiser.speed * dt;
      cruiser.pos.z += Math.cos(cruiser.angle) * cruiser.speed * dt;
      resolveCollisions(cruiser.pos, 1.6, this.world.colliders);
      cruiser.mesh.position.set(cruiser.pos.x, 0, cruiser.pos.z);
      cruiser.mesh.rotation.y = cruiser.angle;
      const bar = cruiser.mesh.getObjectByName('lightbar');
      if (bar) bar.material.color.setHex(Math.floor(performance.now() / 300) % 2 === 0 ? 0xff2040 : 0x2040ff);
    }

    // Helicopter: orbits above the player, searchlight pinned on them.
    if (this.heli) {
      this.heliAngle += dt * 0.45;
      const hx = playerPos.x + Math.sin(this.heliAngle) * 26;
      const hz = playerPos.z + Math.cos(this.heliAngle) * 26;
      this.heli.position.set(hx, 42, hz);
      this.heli.rotation.y = Math.atan2(playerPos.x - hx, playerPos.z - hz);
      this.heli.userData.rotor.rotation.y += dt * 28;
      this.heli.userData.tailRotor.rotation.z += dt * 30;
      const target = this.heli.userData.lightTarget;
      target.position.set(playerPos.x - hx, -42, playerPos.z - hz);
      target.updateMatrixWorld();
      // The beam cone follows the same line.
      const beam = this.heli.getObjectByName('beam');
      if (beam) {
        beam.lookAt(playerPos.x, 0, playerPos.z);
        beam.rotateX(-Math.PI / 2);
      }
    }
  }

  knockDownCop(cop) {
    cop.down = true;
    cop.downTime = 8;
  }

  nearestCop(x, z, radius) {
    let best = null;
    let bestDist = radius;
    for (const cop of this.cops) {
      if (cop.down) continue;
      const d = distance2D(x, z, cop.pos.x, cop.pos.z);
      if (d < bestDist) {
        bestDist = d;
        best = cop;
      }
    }
    return best;
  }
}
