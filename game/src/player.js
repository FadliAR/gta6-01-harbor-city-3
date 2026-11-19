// NEON HARBOR — the player on foot: third-person walking/running with a
// chase camera, entering and leaving cars, and the cash-pickup magnet.
// Driving itself lives in vehicles.js (PlayerCar).

import { BALANCE } from './config.js';
import { clamp, distance2D } from './rng.js';
import { resolveCollisions } from './world.js';

function buildPlayerMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xff2a7a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2a3a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.3), pants);
  legs.position.y = 0.42;
  group.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), jacket);
  torso.position.y = 1.2;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 12), skin);
  head.position.y = 1.8;
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x14141a }),
  );
  hair.position.y = 1.83;
  group.add(hair);
  // A neon jacket stripe so the player reads at a glance.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.1, 0.38), new THREE.MeshBasicMaterial({ color: 0x2affd8 }));
  stripe.position.y = 1.35;
  group.add(stripe);
  return group;
}

export class Player {
  constructor(scene, spawn) {
    this.mesh = buildPlayerMesh();
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.angle = spawn.angle;
    this.camAngle = spawn.angle;
    this.health = BALANCE.maxHealth;
    this.cash = 0;
    this.speed = 0;
    this.inCar = null; // PlayerCar instance or null
    this.mesh.position.copy(this.pos);
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  update(dt, input, colliders) {
    if (this.inCar) {
      this.pos.copy(this.inCar.pos);
      this.angle = this.inCar.angle;
      this.speed = this.inCar.speed;
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const forward = input.isDown('KeyW') ? 1 : 0;
    const back = input.isDown('KeyS') ? 1 : 0;
    const left = input.isDown('KeyA') ? 1 : 0;
    const right = input.isDown('KeyD') ? 1 : 0;
    const run = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    // Camera-relative movement: W runs away from the camera.
    let mx = 0;
    let mz = 0;
    const sin = Math.sin(this.camAngle);
    const cos = Math.cos(this.camAngle);
    mx += sin * (forward - back);
    mz += cos * (forward - back);
    mx += cos * (right - left);
    mz += -sin * (right - left);
    const len = Math.hypot(mx, mz);
    const speed = run ? BALANCE.runSpeed : BALANCE.walkSpeed;
    if (len > 0.01) {
      mx /= len;
      mz /= len;
      const nx = this.pos.x + mx * speed * dt;
      const nz = this.pos.z + mz * speed * dt;
      const trial = { x: nx, z: nz };
      if (!resolveCollisions(trial, 0.55, colliders)) {
        this.pos.x = nx;
        this.pos.z = nz;
      }
      this.angle = Math.atan2(mx, mz);
      this.speed = speed;
    } else {
      this.speed = 0;
    }
    if (this.pos.z > 148) this.pos.z = 148; // the bay stops you on foot too
    this.mesh.position.set(this.pos.x, Math.abs(Math.sin(performance.now() / 170)) * (this.speed > 0 ? 0.05 : 0), this.pos.z);
    this.mesh.rotation.y = this.angle;
  }

  // Third-person camera: behind and above the player/car, smoothed.
  updateCamera(dt, camera) {
    const target = this.inCar ? this.inCar : this;
    const dist = this.inCar ? 11 : 8;
    const height = this.inCar ? 4.6 : 3.6;
    // Camera follows behind the movement heading on foot, behind the car when driving.
    const followAngle = this.inCar ? this.inCar.angle : this.camAngle;
    const desired = new THREE.Vector3(
      target.pos.x - Math.sin(followAngle) * dist,
      height,
      target.pos.z - Math.cos(followAngle) * dist,
    );
    camera.position.lerp(desired, Math.min(1, dt * 5));
    camera.lookAt(target.pos.x, 1.6, target.pos.z + (this.inCar ? Math.sin(this.inCar.angle) * 2 : 0));
  }

  // On foot the camera eases behind the direction the player walks in,
  // so no camera key is needed; E stays free for entering cars.
  updateCameraAngle(dt) {
    if (this.inCar) return;
    if (this.speed > 0.5) {
      let d = (this.angle - this.camAngle) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.camAngle += d * Math.min(1, dt * 2.2);
    }
  }

  enterCar(car) {
    this.inCar = car;
    car.stolen = true;
    this.mesh.visible = false;
  }

  exitCar() {
    if (!this.inCar) return;
    const car = this.inCar;
    this.inCar = null;
    const side = 2.2;
    this.pos.set(
      car.pos.x + Math.cos(car.angle) * side,
      0,
      car.pos.z - Math.sin(car.angle) * side,
    );
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
    this.speed = 0;
  }

  damage(amount) {
    this.health = clamp(this.health - amount, 0, BALANCE.maxHealth);
    return this.health <= 0;
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, BALANCE.maxHealth);
  }
}
