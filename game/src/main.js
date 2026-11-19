// NEON HARBOR — entry point. Boots the renderer, builds the city, wires the
// player, traffic, pedestrians, police, missions, combat, HUD and radio into
// one frame loop, and owns the screens: title, pause, busted, wasted, done.
//
// ?scene=city|mission|heli|radio&autostart=1 starts straight into a staged
// scene (used for the screenshots); window.__NH exposes live state for tests.

import * as THREE from 'three';
import { SEED, BALANCE, RADIO_STATIONS } from './config.js';
import { buildWorld, resolveCollisions, insideCity } from './world.js';
import { TrafficSystem, PlayerCar, buildCarMesh } from './vehicles.js';
import { PedestrianSystem } from './pedestrians.js';
import { PoliceSystem } from './police.js';
import { MissionSystem } from './missions.js';
import { Player } from './player.js';
import { Combat } from './combat.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { clamp, distance2D } from './rng.js';

// The game modules use the bare THREE namespace; expose the vendored build
// on window before any of them constructs a mesh.
window.THREE = THREE;

const params = new URLSearchParams(window.location.search);
const SCENE = params.get('scene') || '';
const AUTOSTART = params.get('autostart') === '1';

function cashTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1a8a4a';
  ctx.fillRect(8, 28, 112, 72);
  ctx.strokeStyle = '#e8ffd8';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 28, 112, 72);
  ctx.fillStyle = '#e8ffd8';
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', 64, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class Game {
  constructor() {
    this.state = 'title'; // title | playing | paused | busted | wasted | complete
    this.clockMinutes = 20 * 60; // sunset start
    this.shake = 0;
    this.autosaveTimer = 0;
    this.input = new Input();
    this.audio = new AudioEngine();
    this.hud = new Hud();

    const canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x2a1e4a, 120, 620);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(30, 12, 60);

    this.world = buildWorld();
    this.scene.add(this.world.group);
    this.player = new Player(this.scene, this.world.playerSpawn);
    this.traffic = new TrafficSystem(this.scene, this.world);
    this.peds = new PedestrianSystem(this.scene, this.world);
    this.police = new PoliceSystem(this.scene, this.world);
    this.missions = new MissionSystem(this.scene);
    this.combat = new Combat(this.scene, this.camera);

    this.police.onBusted = () => this._onBusted();
    this.missions.onMissionComplete = (mission, reward) => {
      this.player.cash += reward;
      this.audio.missionDone();
      this.hud.message(`Mission complete: ${mission.title}  +$${reward}`);
      this._save();
    };
    this.missions.onGameComplete = () => {
      this.state = 'complete';
      this._show('complete');
      clearSave();
    };
    this.missions.onObjective = (mission) => {
      this.hud.setMission(mission);
      if (mission.failed) {
        this.hud.message(`Time up! ${mission.title} restarted — hurry.`);
      } else {
        this.hud.message(`New mission: ${mission.title}`);
        if (mission.text) this.hud.message(mission.text, 6000);
      }
    };

    // Parked cars: meshes from the world's spots.
    this.parked = [];
    for (const spot of this.world.parkedCars) {
      const mesh = buildCarMesh(spot.color, spot.model);
      mesh.position.set(spot.x, 0, spot.z);
      mesh.rotation.y = spot.angle;
      this.scene.add(mesh);
      this.parked.push({ spot, mesh });
    }
    // Cash pickups: floating green $ sprites.
    this.cashMeshes = [];
    const tex = cashTexture();
    for (const spot of this.world.cashSpots) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      sprite.scale.set(2.2, 2.2, 1);
      sprite.position.set(spot.x, 1.6, spot.z);
      this.scene.add(sprite);
      this.cashMeshes.push({ spot, sprite });
    }

    this._bindScreens();
    window.addEventListener('resize', () => this._onResize());
    this._last = performance.now();
    this.renderer.setAnimationLoop(() => this._frame());
    this._refreshTitle();
    if (AUTOSTART) this.startGame(SCENE);
  }

  // --- Screens -------------------------------------------------------------
  _bindScreens() {
    document.getElementById('btnNew').addEventListener('click', () => {
      this.audio.ensure();
      clearSave();
      this.startGame('');
    });
    document.getElementById('btnContinue').addEventListener('click', () => {
      this.audio.ensure();
      this.startGame('', true);
    });
    document.getElementById('btnResume').addEventListener('click', () => this._resume());
    document.getElementById('btnRestart').addEventListener('click', () => {
      this.audio.ensure();
      clearSave();
      this.startGame('');
    });
    document.getElementById('btnTitle').addEventListener('click', () => this._toTitle());
    document.getElementById('btnFreeRoamBusted').addEventListener('click', () => {
      this._hideAll();
      this.state = 'playing';
    });
    document.getElementById('btnFreeRoamWasted').addEventListener('click', () => {
      this._hideAll();
      this.state = 'playing';
    });
    document.getElementById('btnAgain').addEventListener('click', () => {
      this.audio.ensure();
      clearSave();
      this.startGame('');
    });
  }

  _show(id) {
    this._hideAll();
    document.getElementById(id).classList.remove('hidden');
    document.getElementById('hud').classList.toggle('hidden', id !== 'pause');
  }

  _hideAll() {
    for (const id of ['title', 'pause', 'busted', 'wasted', 'complete']) {
      document.getElementById(id).classList.add('hidden');
    }
    document.getElementById('hud').classList.remove('hidden');
  }

  _refreshTitle() {
    const btn = document.getElementById('btnContinue');
    btn.disabled = !hasSave();
    const save = loadGame();
    document.getElementById('saveInfo').textContent = save
      ? `Save found: $${save.cash} · mission ${save.missionIndex + 1}/6 · ${new Date(save.savedAt).toLocaleString()}`
      : 'No save yet — start a new game.';
  }

  _toTitle() {
    this.state = 'title';
    this._refreshTitle();
    this._show('title');
  }

  _resume() {
    this._hideAll();
    this.state = 'playing';
  }

  // --- Starting --------------------------------------------------------------
  startGame(scene, fromSave = false) {
    this._hideAll();
    this.state = 'playing';
    this.audio.ensure();
    if (fromSave) {
      const save = loadGame();
      if (save) {
        this.player.cash = save.cash;
        this.player.health = save.health || BALANCE.maxHealth;
        this.player.pos.set(save.player.x, 0, save.player.z);
        this.player.mesh.position.copy(this.player.pos);
        this.police.setWanted(save.wanted || 0);
        this.missions.setIndex(save.missionIndex || 0);
        this.hud.setMission(this.missions.current);
        this.hud.message('Save loaded — welcome back to Neon Harbor.');
      }
    } else {
      this.player.cash = 0;
      this.player.health = BALANCE.maxHealth;
      this.police.clearWanted();
      this.missions.setIndex(0);
      this.missions.start();
      this.hud.setMission(this.missions.current);
    }
    this._applyScene(scene);
    this._save();
  }

  // Stage a screenshot scene: mission / heli / radio / city.
  _applyScene(scene) {
    if (scene === 'mission') {
      this.missions.setIndex(2);
      this.hud.setMission(this.missions.current);
      this.player.pos.set(-20, 0, -90);
      this.player.mesh.position.copy(this.player.pos);
      this._giveCarNearPlayer();
    } else if (scene === 'heli') {
      this.police.setWanted(4);
      this.player.pos.set(30, 0, 40);
      this.player.mesh.position.copy(this.player.pos);
      this._giveCarNearPlayer();
      this.player.cash = 1250;
    } else if (scene === 'radio') {
      this._giveCarNearPlayer();
      this.audio.ensure();
      this.hud.setRadio(this.audio.station, true);
      this.player.cash = 850;
      this.missions.setIndex(1);
      this.hud.setMission(this.missions.current);
    }
    // 'city' and anything else: plain start at the spawn.
  }

  _giveCarNearPlayer() {
    const spot = this.parked.find((p) => !p.spot.taken);
    if (!spot) return;
    spot.mesh.position.set(this.player.pos.x + 3, 0, this.player.pos.z + 2);
    spot.mesh.rotation.y = this.player.angle;
    spot.spot.taken = true;
    const car = new PlayerCar(spot.mesh, spot.spot);
    this.player.enterCar(car);
  }

  _save() {
    saveGame({
      cash: this.player.cash,
      missionIndex: this.missions.index,
      player: this.player,
      wanted: this.police.wanted,
      health: this.player.health,
    });
  }

  // --- Crime, stealing, pickups ----------------------------------------------
  _nearestParked(maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const p of this.parked) {
      if (p.spot.taken) continue;
      const d = distance2D(this.player.pos.x, this.player.pos.z, p.mesh.position.x, p.mesh.position.z);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  _nearestTrafficCar(maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const car of this.traffic.cars) {
      const d = distance2D(this.player.pos.x, this.player.pos.z, car.pos.x, car.pos.z);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    return best;
  }

  _tryEnterCar() {
    const parked = this._nearestParked(4);
    if (parked) {
      parked.spot.taken = true;
      const car = new PlayerCar(parked.mesh, parked.spot);
      this.player.enterCar(car);
      this._onSteal();
      return;
    }
    const traffic = this._nearestTrafficCar(4);
    if (traffic && traffic.speed < 2) {
      this.traffic.cars.splice(this.traffic.cars.indexOf(traffic), 1);
      const car = new PlayerCar(traffic.mesh, null);
      this.player.enterCar(car);
      this.hud.message('You jacked a car in traffic!');
      this._onSteal();
    }
  }

  _onSteal() {
    const witnessed = this.peds.nearest(this.player.pos.x, this.player.pos.z, 30)
      || this.police.nearestCop(this.player.pos.x, this.player.pos.z, 30);
    if (witnessed) {
      this.police.addHeat(70);
      this.hud.message('Car stolen — a witness called the Harbor PD!');
    } else {
      this.hud.message('Car stolen. No one saw a thing.');
    }
  }

  _collectCash() {
    for (const entry of this.cashMeshes) {
      if (entry.spot.taken) continue;
      const d = distance2D(this.player.pos.x, this.player.pos.z, entry.spot.x, entry.spot.z);
      if (d < (this.player.inCar ? 3.2 : 2.4)) {
        entry.spot.taken = true;
        entry.sprite.visible = false;
        this.player.cash += BALANCE.cashPickupValue;
        this.audio.pickup();
        this.hud.message(`+$${BALANCE.cashPickupValue} street cash`);
      }
    }
  }

  _onCrash(speed) {
    this.audio.crash();
    this.shake = Math.min(0.6, speed / 60);
    if (this.player.damage(speed * 0.9)) this._onWasted();
    else this.hud.message('Crash! Watch the road.');
  }

  _onBusted() {
    if (this.state !== 'playing') return;
    this.audio.busted();
    const fine = Math.floor(this.player.cash * 0.2);
    this.player.cash -= fine;
    this.police.clearWanted();
    if (this.player.inCar) {
      this.player.exitCar();
    }
    this.player.pos.set(this.world.playerSpawn.x, 0, this.world.playerSpawn.z);
    this.player.mesh.position.copy(this.player.pos);
    this.player.health = BALANCE.maxHealth;
    document.getElementById('bustedFine').textContent = `Bail posted: -$${fine}. The Harbor PD let you walk.`;
    this.state = 'busted';
    this._show('busted');
    this._save();
  }

  _onWasted() {
    if (this.state !== 'playing') return;
    const lost = Math.floor(this.player.cash * 0.1);
    this.player.cash -= lost;
    this.police.clearWanted();
    if (this.player.inCar) this.player.exitCar();
    this.player.pos.set(this.world.playerSpawn.x, 0, this.world.playerSpawn.z);
    this.player.mesh.position.copy(this.player.pos);
    this.player.health = BALANCE.maxHealth;
    document.getElementById('wastedLoss').textContent = `Hospital bill: -$${lost}. You wake up at the plaza.`;
    this.state = 'wasted';
    this._show('wasted');
    this._save();
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // --- Frame -------------------------------------------------------------------
  _frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    if (this.state !== 'playing') {
      // Title screen: slow orbit around the Spire so the city shows itself.
      if (this.state === 'title') {
        const t = now / 1000;
        this.camera.position.set(Math.sin(t * 0.05) * 130, 55, Math.cos(t * 0.05) * 130 - 20);
        this.camera.lookAt(0, 20, -20);
        this.traffic.update(dt, null);
        this.missions.updateVisuals(dt);
        this.renderer.render(this.scene, this.camera);
      }
      this.input.endFrame();
      return;
    }

    const input = this.input;
    // Pause.
    if (input.wasPressed('Escape') || input.wasPressed('KeyP')) {
      this.state = 'paused';
      document.getElementById('pauseStats').textContent =
        `Cash $${this.player.cash} · Mission ${Math.min(this.missions.index + 1, 6)}/6 · Wanted ${'★'.repeat(this.police.wanted) || '—'}`;
      this._show('pause');
      input.endFrame();
      return;
    }
    // Radio.
    if (input.wasPressed('KeyR')) {
      this.audio.ensure();
      const on = this.audio.toggleRadio();
      this.hud.setRadio(this.audio.station, on);
    }
    if (input.wasPressed('KeyN')) {
      this.audio.ensure();
      const station = this.audio.nextStation();
      this.hud.setRadio(station, this.audio.radioOn);
    }

    // Enter / exit car.
    if (input.wasPressed('KeyE')) {
      this.audio.ensure();
      if (this.player.inCar) this.player.exitCar();
      else this._tryEnterCar();
    }
    // Shoot (on foot only).
    if ((input.wasMousePressed() || input.wasPressed('KeyF')) && !this.player.inCar) {
      this.audio.ensure();
      const result = this.combat.fire(this.player.pos, this.player.angle, this.police, this.peds, () => this.audio.shot());
      if (result === 'cop') {
        this.police.addHeat(120);
        this.hud.message('You dropped a cop! The whole harbor is coming.');
      } else if (result === 'ped') {
        this.police.addHeat(60);
        this.hud.message('A pedestrian is down — someone called it in.');
      }
    }

    // Driving vs walking.
    if (this.player.inCar) {
      const speedNorm = this.player.inCar.update(dt, input, this.world.colliders, (s) => this._onCrash(s));
      this.audio.setEngine(speedNorm, true);
      // Keep the player's own position on the car: missions, pickups, the
      // minimap and the police all read player.pos.
      this.player.pos.copy(this.player.inCar.pos);
      this.player.angle = this.player.inCar.angle;
      this.player.speed = this.player.inCar.speed;
      // Cruisers ramming the player.
      for (const cruiser of this.police.cruisers) {
        if (distance2D(cruiser.pos.x, cruiser.pos.z, this.player.pos.x, this.player.pos.z) < 3.4) {
          if (this.player.damage(9 * dt)) this._onWasted();
          this.player.inCar.speed *= 1 - 0.4 * dt;
        }
      }
    } else {
      this.player.update(dt, input, this.world.colliders);
      this.audio.setEngine(0, false);
    }
    this.player.updateCameraAngle(dt);
    this.player.updateCamera(dt, this.camera);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }

    // World systems.
    const playerSpeed = this.player.inCar ? Math.abs(this.player.inCar.speed) : this.player.speed;
    this.traffic.update(dt, this.player.inCar ? this.player.pos : null);
    this.peds.update(dt, { x: this.player.pos.x, z: this.player.pos.z, speed: playerSpeed }, this.police.wanted);
    this.police.update(dt, this.player.pos, playerSpeed, !!this.player.inCar);
    this.audio.setSiren(this.police.wanted > 0);
    const reward = this.missions.update(dt, this.player.pos, !!this.player.inCar, this.police.wanted);
    if (reward) this.hud.setMission(this.missions.current);
    this.missions.updateVisuals(dt);
    this.combat.update(dt);
    this._collectCash();

    // Cash pickup bobbing.
    const t = now / 1000;
    for (const entry of this.cashMeshes) {
      if (entry.spot.taken) continue;
      entry.sprite.position.y = 1.6 + Math.sin(t * 2 + entry.spot.x) * 0.25;
    }
    // Spire beacon pulse.
    const beacon = this.scene.getObjectByName('spireBeacon');
    if (beacon) beacon.material.color.setHex(Math.floor(t * 2) % 2 === 0 ? 0xff2040 : 0x801020);

    // Clock: one game minute every two real seconds.
    this.clockMinutes += dt * 0.5;
    this.autosaveTimer += dt;
    if (this.autosaveTimer > 15) {
      this.autosaveTimer = 0;
      this._save();
    }

    // HUD.
    this.hud.setStars(this.police.wanted);
    this.hud.setCash(this.player.cash);
    this.hud.setHealth(this.player.health);
    this.hud.setSpeed(playerSpeed * 3.6, !!this.player.inCar);
    this.hud.setMissionTimer(this.missions.current && this.missions.current.timed ? this.missions.timer : 0);
    this.hud.setClock(this.clockMinutes);
    this.hud.update(dt);
    this.hud.drawMinimap({
      roads: this.world.roads,
      blocks: this.world.blocks,
      spire: this.world.spirePos,
      cash: this.world.cashSpots,
      mission: this.missions.current,
      traffic: this.traffic.cars,
      cops: this.police.cops,
      cruisers: this.police.cruisers,
      heli: this.police.heli ? { x: this.police.heli.position.x, z: this.police.heli.position.z } : null,
      player: { x: this.player.pos.x, z: this.player.pos.z, angle: this.player.angle },
    });

    this.renderer.render(this.scene, this.camera);
    input.endFrame();
  }
}

const game = new Game();

// Debug / test hook: live state for the interaction test.
window.__NH = {
  game,
  get state() { return game.state; },
  get wanted() { return game.police.wanted; },
  get cash() { return game.player.cash; },
  get missionIndex() { return game.missions.index; },
  get inCar() { return !!game.player.inCar; },
  get playerPos() { return { x: game.player.pos.x, z: game.player.pos.z }; },
  get health() { return game.player.health; },
  start(scene) { game.startGame(scene || ''); },
};
