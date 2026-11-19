// NEON HARBOR — the HUD: wanted stars, cash, health, speed, mission
// objective, radio readout, message feed, and the canvas minimap with the
// city, the player arrow, traffic, police, the helicopter and the beacon.

import { HALF, WATER_Z } from './config.js';

export class Hud {
  constructor() {
    this.el = {
      stars: document.getElementById('wanted'),
      cash: document.getElementById('cash'),
      health: document.getElementById('healthFill'),
      healthText: document.getElementById('healthText'),
      speed: document.getElementById('speed'),
      missionTitle: document.getElementById('missionTitle'),
      missionBrief: document.getElementById('missionBrief'),
      missionTimer: document.getElementById('missionTimer'),
      radio: document.getElementById('radio'),
      radioPanel: document.getElementById('radioPanel'),
      messages: document.getElementById('messages'),
      minimap: document.getElementById('minimap'),
      clock: document.getElementById('clock'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this._messageCount = 0;
    this._radioHide = 0;
  }

  setStars(level) {
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < level ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.classList.toggle('hot', level >= 3);
  }

  setCash(cash) {
    this.el.cash.textContent = `$${cash.toLocaleString('en-US')}`;
  }

  setHealth(health) {
    this.el.health.style.width = `${health}%`;
    this.el.healthText.textContent = `${Math.round(health)}`;
    this.el.health.style.background = health > 50 ? '#2aff7a' : health > 25 ? '#ffe62a' : '#ff2a4a';
  }

  setSpeed(kmh, inCar) {
    this.el.speed.textContent = inCar ? `${Math.round(kmh)} km/h` : '';
  }

  setMission(mission) {
    if (!mission) {
      this.el.missionTitle.textContent = 'NEON HARBOR';
      this.el.missionBrief.textContent = 'Free roam — explore the city.';
      this.el.missionTimer.textContent = '';
      return;
    }
    this.el.missionTitle.textContent = mission.title;
    this.el.missionBrief.textContent = mission.brief;
  }

  setMissionTimer(seconds) {
    this.el.missionTimer.textContent = seconds > 0 ? `⏱ ${Math.ceil(seconds)}s` : '';
  }

  setRadio(station, on) {
    this.el.radio.textContent = on ? `♪ ${station.name} — ${station.desc}` : '♪ RADIO OFF';
    this.el.radioPanel.classList.add('show');
    this._radioHide = 3;
  }

  setClock(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    this.el.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  message(text, ms = 4200) {
    const div = document.createElement('div');
    div.className = 'msg';
    div.textContent = text;
    this.el.messages.appendChild(div);
    this._messageCount += 1;
    while (this.el.messages.children.length > 4) {
      this.el.messages.removeChild(this.el.messages.firstChild);
    }
    window.setTimeout(() => {
      if (div.parentNode) div.parentNode.removeChild(div);
    }, ms);
  }

  update(dt) {
    if (this._radioHide > 0) {
      this._radioHide -= dt;
      if (this._radioHide <= 0) this.el.radioPanel.classList.remove('show');
    }
  }

  // Top-down minimap: roads, water, blocks, beacon, pickups, cars, cops.
  drawMinimap(state) {
    const ctx = this.mapCtx;
    const size = 190;
    const scale = size / (HALF * 2 + 40);
    const toMap = (x, z) => [size / 2 + x * scale, size / 2 + z * scale];
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(10, 10, 24, 0.85)';
    ctx.fillRect(0, 0, size, size);
    // Water (south).
    ctx.fillStyle = '#0a4a6e';
    const [, wy] = toMap(0, WATER_Z);
    ctx.fillRect(0, wy, size, size - wy);
    // Roads.
    ctx.strokeStyle = '#55555f';
    ctx.lineWidth = 4;
    for (const c of state.roads) {
      if (c > WATER_Z) continue;
      const [x1, y1] = toMap(-HALF, c);
      const [x2] = toMap(HALF, c);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y1); ctx.stroke();
      const [vx, vy1] = toMap(c, -HALF);
      const [, vy2] = toMap(c, HALF);
      ctx.beginPath(); ctx.moveTo(vx, vy1); ctx.lineTo(vx, vy2); ctx.stroke();
    }
    // Blocks.
    ctx.fillStyle = '#3a3a48';
    for (const bx of state.blocks) {
      for (const bz of state.blocks) {
        if (bz > WATER_Z - 46) continue;
        const [x, y] = toMap(bx - 23, bz - 23);
        ctx.fillRect(x, y, 46 * scale, 46 * scale);
      }
    }
    // Spire.
    const [sx, sy] = toMap(state.spire.x, state.spire.z);
    ctx.fillStyle = '#ff2a7a';
    ctx.fillRect(sx - 3, sy - 3, 6, 6);
    // Cash pickups.
    ctx.fillStyle = '#2aff7a';
    for (const c of state.cash) {
      if (c.taken) continue;
      const [x, y] = toMap(c.x, c.z);
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    // Mission beacon.
    if (state.mission) {
      const [x, y] = toMap(state.mission.target.x, state.mission.target.z);
      ctx.fillStyle = '#ffd832';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffd832';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Traffic.
    ctx.fillStyle = '#e8e8e8';
    for (const car of state.traffic) {
      const [x, y] = toMap(car.pos.x, car.pos.z);
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    // Cops.
    ctx.fillStyle = '#4a7aff';
    for (const cop of state.cops) {
      const [x, y] = toMap(cop.pos.x, cop.pos.z);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    for (const cruiser of state.cruisers) {
      const [x, y] = toMap(cruiser.pos.x, cruiser.pos.z);
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
    // Helicopter.
    if (state.heli) {
      const [x, y] = toMap(state.heli.x, state.heli.z);
      ctx.fillStyle = '#ff2040';
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow.
    const [px, py] = toMap(state.player.x, state.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.player.angle);
    ctx.fillStyle = '#ff2a7a';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North marker.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', size / 2 - 4, 12);
  }
}
