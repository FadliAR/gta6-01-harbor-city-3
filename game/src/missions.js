// NEON HARBOR — the six-mission story chain. A beacon marks the current
// objective; reaching it (in a car when the mission says so, or with the
// heat gone when it says so) pays the reward and opens the next mission.
// Finishing all six completes the game.

import { MISSIONS, BALANCE } from './config.js';
import { distance2D } from './rng.js';

export class MissionSystem {
  constructor(scene) {
    this.scene = scene;
    this.index = 0;
    this.active = false;
    this.timer = 0;
    this.completed = false;
    this.onMissionComplete = null;
    this.onGameComplete = null;
    this.onObjective = null;
    // Beacon: a glowing cylinder + a floating diamond over the target.
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xffd832, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
    });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 60, 20, 1, true), beaconMat);
    this.beacon.visible = false;
    scene.add(this.beacon);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.4),
      new THREE.MeshBasicMaterial({ color: 0xffd832 }),
    );
    diamond.name = 'missionDiamond';
    this.diamond = diamond;
    this.diamond.visible = false;
    scene.add(this.diamond);
    this._pulse = 0;
  }

  get current() {
    return MISSIONS[this.index] || null;
  }

  start() {
    this.active = true;
    this._placeBeacon();
    if (this.onObjective) this.onObjective(this.current);
  }

  _placeBeacon() {
    const mission = this.current;
    if (!mission) {
      this.beacon.visible = false;
      this.diamond.visible = false;
      return;
    }
    this.beacon.position.set(mission.target.x, 30, mission.target.z);
    this.beacon.visible = true;
    this.diamond.position.set(mission.target.x, 9, mission.target.z);
    this.diamond.visible = true;
    this.timer = mission.timed || 0;
  }

  // Returns the reward paid (0 when nothing completed this frame).
  update(dt, playerPos, inCar, wanted) {
    if (!this.active || this.completed) return 0;
    const mission = this.current;
    if (!mission) return 0;
    if (mission.timed) {
      this.timer -= dt;
      if (this.timer <= 0) {
        // Out of time: restart this mission at the beacon with a fresh timer.
        this.timer = mission.timed;
        if (this.onObjective) this.onObjective({ ...mission, failed: true });
      }
    }
    const dist = distance2D(playerPos.x, playerPos.z, mission.target.x, mission.target.z);
    let done = dist < mission.radius;
    if (done && mission.needCar && !inCar) done = false;
    if (done && mission.loseHeat && wanted > 0) done = false;
    if (done) {
      const reward = BALANCE.missionReward[this.index];
      this.index += 1;
      if (this.index >= MISSIONS.length) {
        this.completed = true;
        this.active = false;
        this.beacon.visible = false;
        this.diamond.visible = false;
        if (this.onMissionComplete) this.onMissionComplete(mission, reward);
        if (this.onGameComplete) this.onGameComplete();
      } else {
        this._placeBeacon();
        if (this.onMissionComplete) this.onMissionComplete(mission, reward);
        if (this.onObjective) this.onObjective(this.current);
      }
      return reward;
    }
    return 0;
  }

  updateVisuals(dt) {
    this._pulse += dt;
    if (this.diamond.visible) {
      this.diamond.rotation.y += dt * 1.5;
      this.diamond.position.y = 9 + Math.sin(this._pulse * 2) * 0.8;
    }
    if (this.beacon.visible) {
      this.beacon.material.opacity = 0.2 + Math.sin(this._pulse * 2.4) * 0.08;
    }
  }

  // Jump the chain to a mission index (used by Continue / scene setups).
  setIndex(index) {
    this.index = Math.max(0, Math.min(index, MISSIONS.length - 1));
    this.completed = false;
    this.active = true;
    this._placeBeacon();
  }
}
