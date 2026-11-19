// NEON HARBOR — combat. Click (or F) fires a hitscan shot from the player
// toward the mouse ray. Hitting a cop knocks them down; hitting a pedestrian
// knocks them down too and raises the heat — the city fights back with the
// wanted system, not with hit points.

import { distance2D } from './rng.js';

export class Combat {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.cooldown = 0;
    this.tracer = null;
    this.tracerTime = 0;
    this.muzzle = null;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.tracer) {
      this.tracerTime -= dt;
      if (this.tracerTime <= 0) {
        this.scene.remove(this.tracer);
        this.tracer.geometry.dispose();
        this.tracer.material.dispose();
        this.tracer = null;
      }
    }
  }

  get ready() {
    return this.cooldown <= 0;
  }

  // Fires one shot from the player's position toward the camera's forward
  // ray. Returns 'cop' | 'ped' | 'miss'.
  fire(playerPos, playerAngle, police, peds, onShot) {
    if (!this.ready) return 'wait';
    this.cooldown = 0.28;
    if (onShot) onShot();
    const dir = new THREE.Vector3(Math.sin(playerAngle), 0, Math.cos(playerAngle));
    const range = 42;
    const end = new THREE.Vector3(
      playerPos.x + dir.x * range,
      1.2,
      playerPos.z + dir.z * range,
    );
    let hit = 'miss';
    let hitDist = range;
    // Test cops and peds: a hit if the target is close to the shot line.
    const testTarget = (tx, tz) => {
      const dx = tx - playerPos.x;
      const dz = tz - playerPos.z;
      const along = dx * dir.x + dz * dir.z;
      if (along < 0 || along > range) return;
      const perp = Math.abs(dx * dir.z - dz * dir.x);
      if (perp < 1.1 && along < hitDist) {
        hitDist = along;
        return true;
      }
      return false;
    };
    let hitCop = null;
    let hitPed = null;
    for (const cop of police.cops) {
      if (!cop.down && testTarget(cop.pos.x, cop.pos.z)) hitCop = cop;
    }
    for (const ped of peds.peds) {
      if (!ped.down && testTarget(ped.pos.x, ped.pos.z)) hitPed = ped;
    }
    if (hitCop) {
      police.knockDownCop(hitCop);
      hit = 'cop';
    } else if (hitPed) {
      peds.knockDown(hitPed);
      hit = 'ped';
    }
    end.set(
      playerPos.x + dir.x * hitDist,
      1.2,
      playerPos.z + dir.z * hitDist,
    );
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(playerPos.x, 1.4, playerPos.z),
      end,
    ]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffe62a, transparent: true, opacity: 0.9 });
    if (this.tracer) {
      this.scene.remove(this.tracer);
      this.tracer.geometry.dispose();
      this.tracer.material.dispose();
    }
    this.tracer = new THREE.Line(geo, mat);
    this.scene.add(this.tracer);
    this.tracerTime = 0.09;
    return hit;
  }
}
