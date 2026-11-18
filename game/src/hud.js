// HUD: DOM readouts + a live 2D minimap canvas.
// The minimap redraws every frame: ocean and blocks, road lines, the pulsing
// mission marker, pedestrians, traffic, flashing police dots and the player arrow.
import { HALF } from './config.js';

export class HUD {
  constructor(city) {
    this.city = city;
    this.el = {
      money: document.getElementById('money'),
      stars: document.getElementById('stars'),
      health: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      objective: document.getElementById('objective'),
      speed: document.getElementById('speed'),
      speedVal: document.getElementById('speed-val'),
      clock: document.getElementById('clock'),
      msg: document.getElementById('msg'),
      msgTitle: document.getElementById('msg-title'),
      msgSub: document.getElementById('msg-sub'),
      minimap: document.getElementById('minimap'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.msgTimer = 0;
    this.lastWanted = -1;
  }

  message(title, sub = '') {
    this.el.msgTitle.textContent = title;
    this.el.msgSub.textContent = sub;
    this.el.msg.classList.remove('hidden');
    this.msgTimer = 3.2;
  }

  update(dt, game) {
    this.el.money.textContent = '$' + Math.floor(game.money).toLocaleString('en-US');
    const w = game.wanted;
    if (w !== this.lastWanted) {
      this.lastWanted = w;
      this.el.stars.textContent = w > 0 ? '★'.repeat(w) + '☆'.repeat(5 - w) : '☆☆☆☆☆';
      this.el.stars.classList.toggle('hot', w > 0);
    }
    const hp = Math.max(0, Math.round(game.player.health));
    this.el.health.style.width = hp + '%';
    this.el.healthText.textContent = hp;
    this.el.objective.textContent = game.objectiveText;
    const car = game.player.inCar;
    if (car) {
      this.el.speed.classList.remove('hidden');
      this.el.speedVal.textContent = Math.round(Math.abs(car.speed) * 3.6);
    } else {
      this.el.speed.classList.add('hidden');
    }
    // In-game clock: one game hour per 2 real minutes, starting 18:24 (sunset).
    const mins = 18 * 60 + 24 + Math.floor(game.elapsed / 120 * 60);
    const hh = String(Math.floor(mins / 60) % 24).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    this.el.clock.textContent = `${hh}:${mm}`;
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.el.msg.classList.add('hidden');
    }
    this._drawMinimap(game);
  }

  _drawMinimap(game) {
    const ctx = this.mapCtx;
    const S = 220;
    const extent = 270;
    const toMap = (x, z) => [((x + extent) / (extent * 2)) * S, ((z + extent) / (extent * 2)) * S];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#10131c';
    ctx.fillRect(0, 0, S, S);
    // Ocean (south edge).
    const [, oy] = toMap(0, HALF);
    ctx.fillStyle = '#1d5f7a';
    ctx.fillRect(0, oy, S, S - oy);
    // Blocks.
    ctx.fillStyle = '#3a3f4a';
    for (const b of this.city.buildings) {
      const [x, y] = toMap(b.x - b.w / 2, b.z - b.d / 2);
      const w = (b.w / (extent * 2)) * S;
      const h = (b.d / (extent * 2)) * S;
      ctx.fillRect(x, y, Math.max(1, w), Math.max(1, h));
    }
    // Roads.
    ctx.strokeStyle = '#6a6f7a';
    ctx.lineWidth = 3;
    for (const c of this.city.roadX) {
      const [x1] = toMap(c, 0);
      ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, S); ctx.stroke();
    }
    for (const c of this.city.roadZ) {
      const [, y1] = toMap(0, c);
      ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(S, y1); ctx.stroke();
    }
    const dot = (x, z, color, r = 2.5) => {
      const [mx, my] = toMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
    };
    // Mission / taxi target: pulsing pink.
    const t = game.missions ? game.missions.target : null;
    if (t) {
      const pulse = 3 + Math.sin(game.elapsed * 5) * 1.5;
      dot(t.x, t.z, '#ff2e88', pulse);
    }
    for (const p of game.peds.peds) if (p.alive) dot(p.x, p.z, '#9a9aa2', 1.5);
    for (const c of game.traffic.allCars()) {
      if (c === game.player.inCar) continue;
      dot(c.x, c.z, '#e8b93a', 2.2);
    }
    const flash = Math.floor(game.elapsed * 3) % 2 === 0;
    for (const c of game.police.cars) dot(c.x, c.z, flash ? '#ff2222' : '#2244ff', 3);
    // Player arrow.
    const [px, py] = toMap(game.player.x, game.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - game.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText('N', S / 2 - 3, 11);
  }
}
