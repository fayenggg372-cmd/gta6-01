// Port Solano — game wiring: loop, wanted system, save, screens, screenshots.
// The Game owns every subsystem (city, traffic, peds, police, player, missions,
// HUD, audio) and steps them at a fixed 60 Hz; rendering and input run on top.
import * as THREE from '../vendor/three.module.min.js';
import { STEP, CITY, HALF, ECONOMY, WANTED, SAVE_KEY, MISSIONS } from './config.js';
import { mulberry32, range } from './random.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { buildCity } from './city.js';
import { Traffic, PedCrowd, Police, Pickups } from './entities.js';
import { Player } from './player.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { Renderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_OVER, SCREEN_PAUSED } from './render.js';
import { stageShot } from './shots.js';

const $ = (id) => document.getElementById(id);

export class Game {
  constructor(canvas) {
    const params = new URLSearchParams(location.search);
    this.seed = Number(params.get('seed') || 1) || 1;
    this.shot = params.get('shot') || null;
    this.renderer = new Renderer(canvas);
    this.scene = this.renderer.scene;
    this.city = buildCity(this.scene, this.seed);
    this.input = new Input(canvas);
    this.audio = new AudioSys();
    this.hud = new HUD(this.city);
    this.mode = 'title';
    this.money = ECONOMY.startCash;
    this.wanted = 0;
    this.objectiveText = 'Welcome to Port Solano.';
    this.elapsed = 0;
    this.over = false;
    this.overReason = '';
    this.danger = null;
    this._lastCrime = -999;
    this._decayTimer = 0;
    this._bustTimer = 0;
    this._acc = 0;
    this._last = performance.now();
    this._shotDone = false;
    this.reset();
    this._wireScreens();
    window.addEventListener('error', (e) => {
      const el = $('err');
      if (el) { el.textContent = 'ERROR: ' + e.message; el.classList.remove('hidden'); }
    });
    if (this.shot) {
      this._runShot();
    } else {
      this.showScreen(SCREEN_TITLE);
      requestAnimationFrame((t) => this._loop(t));
    }
    window.__game = this;
  }

  // ---- setup / teardown -------------------------------------------------
  reset() {
    this._disposeDynamic();
    this.rng = mulberry32(this.seed);
    this.player = new Player(this.scene, this.city.playerSpawn);
    this.traffic = new Traffic(this.scene, this.city, this.seed);
    this.peds = new PedCrowd(this.scene, this.city, this.seed);
    this.police = new Police(this.scene, this.city);
    this.pickups = new Pickups(this.scene);
    this.missions = new Missions(this.scene, this);
    for (let i = 0; i < 8; i++) {
      this.pickups.spawn(range(this.rng, -180, 180), range(this.rng, -180, 180), ECONOMY.pickupCash);
    }
    this.wanted = 0;
    this._lastCrime = -999;
    this._decayTimer = 0;
    this._bustTimer = 0;
    this.elapsed = 0;
    this.over = false;
    this.overReason = '';
    this.money = ECONOMY.startCash;
    this.objectiveText = 'Welcome to Port Solano.';
  }

  _disposeDynamic() {
    if (!this.traffic) return;
    for (const c of this.traffic.allCars()) this.scene.remove(c.mesh);
    for (const c of this.police.cars) this.scene.remove(c.mesh);
    for (const p of this.peds.peds) this.scene.remove(p.mesh);
    for (const it of this.pickups.items) this.scene.remove(it.mesh);
    this.scene.remove(this.player.mesh);
    if (this.missions) this.scene.remove(this.missions.beacon.group);
  }

  _world() {
    return {
      colliders: this.city.colliders,
      traffic: this.traffic,
      police: this.police,
      peds: this.peds,
      pickups: this.pickups,
      allCars: [...this.traffic.allCars(), ...this.police.cars],
      addWanted: (n, why) => this.addWanted(n, why),
      audio: this.audio,
      game: this,
      wanted: this.wanted,
      danger: this.danger,
    };
  }

  // ---- screens -----------------------------------------------------------
  _wireScreens() {
    const save = this.loadSave();
    $('btn-continue').classList.toggle('hidden', !save);
    $('btn-play').addEventListener('click', () => { this.audio.ensure(); this.startGame(false); });
    $('btn-continue').addEventListener('click', () => { this.audio.ensure(); this.startGame(true); });
    $('btn-restart').addEventListener('click', () => this.respawn());
    $('btn-resume').addEventListener('click', () => this.togglePause(false));
    $('btn-retry-mission').addEventListener('click', () => {
      this.togglePause(false);
      this.missions.retry();
      this.message('Mission restarted', this.missions.currentDef ? this.missions.currentDef.brief : '');
    });
    $('btn-quit').addEventListener('click', () => {
      this.save();
      this.mode = 'title';
      this.showScreen(SCREEN_TITLE);
    });
    $('btn-mute').addEventListener('click', () => this.toggleMute());
    $('hud-mute').addEventListener('click', () => this.toggleMute());
  }

  toggleMute() {
    this.audio.ensure();
    this.audio.muted = !this.audio.muted;
    $('btn-mute').textContent = this.audio.muted ? '🔇 Sound: Off' : '🔊 Sound: On';
    $('hud-mute').textContent = this.audio.muted ? '🔇' : '🔊';
  }

  showScreen(name) {
    $('screen-title').classList.toggle('hidden', name !== SCREEN_TITLE);
    $('screen-over').classList.toggle('hidden', name !== SCREEN_OVER);
    $('screen-pause').classList.toggle('hidden', name !== SCREEN_PAUSED);
    $('hud').classList.toggle('hidden', name === SCREEN_TITLE);
    if (name === SCREEN_OVER) {
      $('over-title').textContent = this.overReason;
      $('over-sub').textContent = this.overReason === 'BUSTED'
        ? `The Solano PD took $${ECONOMY.bustedFine} off you.`
        : `You woke up at St. Marina Hospital, $${ECONOMY.wastedFine} lighter.`;
    }
    if (name === SCREEN_TITLE) {
      const save = this.loadSave();
      $('btn-continue').classList.toggle('hidden', !save);
      if (save) $('save-info').textContent = `Save: $${Math.floor(save.money)} · ${save.done} mission${save.done === 1 ? '' : 's'} done`;
    }
  }

  // ---- game flow ---------------------------------------------------------
  startGame(fromSave) {
    this.reset();
    if (fromSave) {
      const s = this.loadSave();
      if (s) {
        this.money = s.money;
        this.missions.index = s.missionIndex;
        this.missions.done = s.done;
        this.player.x = s.px; this.player.z = s.pz;
        this.player.health = s.health;
        this.player.mesh.position.set(s.px, 0, s.pz);
      }
    }
    this.mode = 'play';
    this.showScreen(SCREEN_PLAY);
    this.message('Port Solano', fromSave ? 'Welcome back.' : 'Make a name for yourself.');
    this.missions.startStory();
    this.audio.ensure();
  }

  togglePause(force) {
    if (this.mode === 'play' && force !== false) {
      this.mode = 'paused';
      this.showScreen(SCREEN_PAUSED);
    } else if (this.mode === 'paused' && force !== true) {
      this.mode = 'play';
      this.showScreen(SCREEN_PLAY);
    }
  }

  respawn() {
    this.player.health = 100;
    this.player.x = this.city.playerSpawn.x;
    this.player.z = this.city.playerSpawn.z;
    this.player.heading = this.city.playerSpawn.heading;
    this.player.camYaw = this.city.playerSpawn.heading;
    if (this.player.inCar) this.player.exitCar(this.city.colliders);
    this.player.mesh.visible = true;
    this.player.mesh.position.set(this.player.x, 0, this.player.z);
    this.wanted = 0;
    this._bustTimer = 0;
    this.over = false;
    this.mode = 'play';
    this.showScreen(SCREEN_PLAY);
    this.save();
  }

  onPlayerDown() {
    if (this.over) return;
    this.over = true;
    if (this.wanted > 0) {
      this.overReason = 'BUSTED';
      this.money = Math.max(0, this.money - ECONOMY.bustedFine);
      this.audio.busted();
    } else {
      this.overReason = 'WASTED';
      this.money = Math.max(0, this.money - ECONOMY.wastedFine);
      this.audio.missionFail();
    }
    this.mode = 'over';
    this.showScreen(SCREEN_OVER);
    this.save();
  }

  addWanted(n, why) {
    if (this.mode !== 'play') return;
    this.wanted = Math.min(5, this.wanted + n);
    this._lastCrime = this.elapsed;
    this._decayTimer = 0;
    if (why && this.wanted >= 1) this.hud.message('Wanted level up', 'The Solano PD is on you — break line of sight!');
  }

  setWanted(n, force = false) {
    this.wanted = Math.max(0, Math.min(5, n));
    if (force) this._lastCrime = this.elapsed;
  }

  setObjective(text) { this.objectiveText = text; }
  message(title, sub) { this.hud.message(title, sub); }

  // ---- save --------------------------------------------------------------
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: this.money,
        missionIndex: this.missions.index,
        done: this.missions.done,
        px: this.player.x, pz: this.player.z,
        health: Math.max(1, Math.round(this.player.health)),
        savedAt: Date.now(),
      }));
    } catch { /* storage unavailable (file://): ignore */ }
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  // ---- simulation --------------------------------------------------------
  step(dt) {
    if (this.mode !== 'play') return;
    this.elapsed += dt;
    const w = this._world();
    this.player.update(dt, this.input, w);
    this.traffic.update(dt, this.player.inCar);
    this.peds.update(dt, this.danger);
    this.danger = null;
    this.police.update(dt, this.wanted, this.player.pos, this.city.colliders);
    const gained = this.pickups.update(dt, this.player.x, this.player.z);
    if (gained > 0) {
      this.money += gained;
      this.audio.cash();
      this.message(`+$${gained}`, 'Street cash');
    }
    this.missions.update(dt);

    // Wanted decay: stars fall only while hidden from the police.
    if (this.wanted > 0 && this.elapsed - this._lastCrime > WANTED.decayDelay) {
      const seen = this.police.cars.some((c) => Math.hypot(c.x - this.player.x, c.z - this.player.z) < 70);
      if (!seen) {
        this._decayTimer += dt;
        if (this._decayTimer > WANTED.decayStep) {
          this._decayTimer = 0;
          this.wanted -= 1;
          if (this.wanted === 0) this.message('Clean getaway', 'The heat is off — for now.');
        }
      } else this._decayTimer = 0;
    }
    // Busted: a police car sits on the player on foot.
    if (this.wanted > 0 && !this.player.driving && !this.over) {
      const near = this.police.cars.some((c) => Math.hypot(c.x - this.player.x, c.z - this.player.z) < WANTED.bustDist);
      this._bustTimer = near ? this._bustTimer + dt : 0;
      if (this._bustTimer > WANTED.bustTime) this.onPlayerDown();
    }
    // Police sirens when any cruiser is near.
    const sirenNear = this.police.cars.some((c) => Math.hypot(c.x - this.player.x, c.z - this.player.z) < 90);
    this.audio.siren(dt, sirenNear);
    // Autosave every ~20 s.
    if (Math.floor(this.elapsed) % 20 === 0 && Math.floor((this.elapsed - dt)) % 20 !== 0) this.save();
    this.input.endStep();
  }

  _loop(t) {
    requestAnimationFrame((nt) => this._loop(nt));
    const dt = Math.min(0.1, (t - this._last) / 1000);
    this._last = t;
    if (this.input.wasPressed('Escape') || this.input.wasPressed('KeyP')) this.togglePause();
    if (this.input.wasPressed('KeyM')) this.toggleMute();
    if (this.mode === 'play') {
      this._acc += dt;
      let n = 0;
      while (this._acc >= STEP && n < 5) {
        this.step(STEP);
        this._acc -= STEP;
        n += 1;
      }
      if (n === 5) this._acc = 0;
      this.hud.update(dt, this);
    } else {
      this.input.endStep();
    }
    this.renderer.render(this);
  }

  _runShot() {
    const screen = stageShot(this.shot, this);
    this.renderer.snapCamera(this);
    this.hud.update(0, this);
    if (screen === SCREEN_TITLE) this.showScreen(SCREEN_TITLE);
    else if (screen === SCREEN_OVER) this.showScreen(SCREEN_OVER);
    else this.showScreen(SCREEN_PLAY);
    this.renderer.render(this);
    this._shotDone = true;
    // Keep rendering the staged frame so a slow screenshot still catches it.
    const hold = () => { this.renderer.render(this); requestAnimationFrame(hold); };
    requestAnimationFrame(hold);
  }
}

new Game(document.getElementById('game'));
