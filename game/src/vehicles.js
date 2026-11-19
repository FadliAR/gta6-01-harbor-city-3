// NEON HARBOR — vehicles: the car factory, the 14-car traffic AI that drives
// the road graph, parked cars you can steal, and the arcade driving model
// for the player's car (accelerate, brake, steer, handbrake slide).

import { BALANCE } from './config.js';
import { makeRng } from './rng.js';
import { angleDiff, clamp, distance2D } from './rng.js';
import { resolveCollisions } from './world.js';

export function buildCarMesh(color, model = 'sedan') {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x182838 });
  const bodyLen = model === 'van' ? 5.4 : 4.4;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, bodyLen), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabinH = model === 'van' ? 1.0 : 0.6;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, cabinH, model === 'van' ? 3.4 : 2.2), glassMat);
  cabin.position.set(0, 1.15, model === 'van' ? -0.3 : -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  // Headlights + taillights.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  [-0.7, 0.7].forEach((x) => {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), lightMat);
    lamp.position.set(x, 0.55, bodyLen / 2 + 0.02);
    group.add(lamp);
  });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
  [-0.7, 0.7].forEach((x) => {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), tailMat);
    lamp.position.set(x, 0.55, -bodyLen / 2 - 0.02);
    group.add(lamp);
  });
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  [[-0.95, 1.5], [0.95, 1.5], [-0.95, -1.5], [0.95, -1.5]].forEach(([x, z]) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.38, z);
    group.add(wheel);
    wheels.push(wheel);
  });
  group.userData.wheels = wheels;
  group.userData.bodyLen = bodyLen;
  return group;
}

export class TrafficSystem {
  constructor(scene, world, rng) {
    this.scene = scene;
    this.world = world;
    this.cars = [];
    const carRng = makeRng(4242);
    for (let i = 0; i < BALANCE.trafficCount; i++) {
      const mesh = buildCarMesh(carRng.pick([0xd83a2a, 0x2a7ad8, 0xe8c832, 0x2ad83a, 0xe8e8e8, 0x222222, 0xd86a2a]));
      scene.add(mesh);
      const node = world.nodes[Math.floor(carRng.next() * world.nodes.length)];
      const next = this._pickNext(node, carRng);
      this.cars.push({
        mesh,
        pos: new THREE.Vector3(node.x, 0, node.z),
        node,
        next,
        speed: carRng.range(7, 11),
        angle: 0,
        lane: carRng.chance(0.5) ? 3.2 : -3.2,
        wait: 0,
      });
    }
  }

  _pickNext(node, rng) {
    const roads = this.world.roads.filter((c) => c <= 150);
    const options = [];
    if (node.x > Math.min(...roads)) options.push(this.world.nodeAt(node.x - 60, node.z));
    if (node.x < Math.max(...roads)) options.push(this.world.nodeAt(node.x + 60, node.z));
    if (node.z > Math.min(...roads)) options.push(this.world.nodeAt(node.x, node.z - 60));
    if (node.z < 150) options.push(this.world.nodeAt(node.x, node.z + 60));
    const valid = options.filter(Boolean);
    return valid.length ? valid[Math.floor(rng.next() * valid.length)] : node;
  }

  update(dt, playerPos) {
    const rng = Math.random;
    for (const car of this.cars) {
      // Lane offset: right-hand side of the road relative to travel direction.
      const dx = car.next.x - car.node.x;
      const dz = car.next.z - car.node.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = dx / len;
      const nz = dz / len;
      const tx = car.next.x + (-nz) * car.lane;
      const tz = car.next.z + nx * car.lane;
      const dist = distance2D(car.pos.x, car.pos.z, tx, tz);
      // Slow down for the player's car ahead.
      const playerAhead = playerPos && distance2D(car.pos.x, car.pos.z, playerPos.x, playerPos.z) < 9;
      const speed = playerAhead ? car.speed * 0.25 : car.speed;
      if (dist < 1.2) {
        car.node = car.next;
        car.next = this._pickNext(car.node, { next: rng });
      } else {
        const step = (speed * dt) / dist;
        car.pos.x += (tx - car.pos.x) * Math.min(1, step);
        car.pos.z += (tz - car.pos.z) * Math.min(1, step);
        const targetAngle = Math.atan2(tx - car.pos.x, tz - car.pos.z);
        car.angle += angleDiff(car.angle, targetAngle) * Math.min(1, dt * 6);
      }
      car.mesh.position.set(car.pos.x, 0, car.pos.z);
      car.mesh.rotation.y = car.angle;
      const spin = speed * dt * 2.6;
      car.mesh.userData.wheels.forEach((w) => { w.rotation.x += spin; });
    }
  }
}

// Arcade driving for the player's current car.
export class PlayerCar {
  constructor(mesh, spot) {
    this.mesh = mesh;
    this.spot = spot || null;
    this.pos = new THREE.Vector3(mesh.position.x, 0, mesh.position.z);
    this.angle = mesh.rotation.y;
    this.speed = 0;
    this.stolen = false;
  }

  update(dt, input, colliders, onCrash) {
    const forward = input.isDown('KeyW') || input.isDown('ArrowUp');
    const back = input.isDown('KeyS') || input.isDown('ArrowDown');
    const left = input.isDown('KeyA') || input.isDown('ArrowLeft');
    const right = input.isDown('KeyD') || input.isDown('ArrowRight');
    const handbrake = input.isDown('Space');
    if (forward) this.speed += BALANCE.carAccel * dt;
    if (back) {
      this.speed -= this.speed > 0.5 ? BALANCE.carBrake * dt : BALANCE.carAccel * 0.6 * dt;
    }
    if (!forward && !back) this.speed -= Math.sign(this.speed) * 6 * dt;
    if (handbrake) this.speed -= Math.sign(this.speed) * 18 * dt;
    this.speed = clamp(this.speed, -BALANCE.carMaxReverse, BALANCE.carMaxSpeed);
    if (Math.abs(this.speed) < 0.05) this.speed = 0;
    const steer = (left ? 1 : 0) - (right ? 1 : 0);
    const grip = handbrake ? 2.6 : 1;
    this.angle += steer * BALANCE.carTurn * grip * dt * clamp(Math.abs(this.speed) / 8, 0, 1) * Math.sign(this.speed || 1);
    const nx = this.pos.x + Math.sin(this.angle) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.angle) * this.speed * dt;
    const trial = { x: nx, z: nz };
    const hitWall = resolveCollisions(trial, 1.6, colliders);
    const wasFast = Math.abs(this.speed) > 14;
    if (hitWall) {
      if (wasFast && onCrash) onCrash(Math.abs(this.speed));
      this.speed *= 0.35;
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
    }
    // Keep the car out of the bay.
    if (this.pos.z > 148) {
      this.pos.z = 148;
      this.speed *= 0.4;
    }
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.angle;
    const spin = this.speed * dt * 2.6;
    this.mesh.userData.wheels.forEach((w) => { w.rotation.x += spin; });
    return Math.abs(this.speed) / BALANCE.carMaxSpeed;
  }
}
