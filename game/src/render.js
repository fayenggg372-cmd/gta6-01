// Round 2: the weather module only retunes the fog this renderer draws, never the city lights.
// Screens + the three.js renderer (scene, camera, tracer line).
// The renderer owns the WebGL canvas; the game only asks it to follow the
// player and to draw the brief hitscan tracer after a shot.
import * as THREE from '../vendor/three.module.min.js';
import { PALETTE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_OVER = 'over';
export const SCREEN_PAUSED = 'paused';

export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
    this.tracer = null;
    this._resize();
    addEventListener('resize', () => this._resize());
  }

  _resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(game) {
    const cam = game.player.camera(0);
    // Smooth camera follow: exponential ease toward the target spot.
    const k = 1 - Math.pow(0.0001, 1 / 60);
    this.camera.position.x += (cam.pos.x - this.camera.position.x) * k;
    this.camera.position.y += (cam.pos.y - this.camera.position.y) * k;
    this.camera.position.z += (cam.pos.z - this.camera.position.z) * k;
    this.camera.lookAt(cam.look.x, cam.look.y, cam.look.z);
    this._drawTracer(game);
    this.renderer.render(this.scene, this.camera);
  }

  snapCamera(game) {
    const cam = game.player.camera(0);
    this.camera.position.set(cam.pos.x, cam.pos.y, cam.pos.z);
    this.camera.lookAt(cam.look.x, cam.look.y, cam.look.z);
  }

  _drawTracer(game) {
    const shot = game.player.lastShot;
    if (shot) {
      if (!this.tracer) {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(), new THREE.Vector3(),
        ]);
        this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8 }));
        this.scene.add(this.tracer);
      }
      const pos = this.tracer.geometry.attributes.position;
      pos.setXYZ(0, shot.from.x, shot.from.y, shot.from.z);
      pos.setXYZ(1, shot.to.x, shot.to.y, shot.to.z);
      pos.needsUpdate = true;
      this.tracer.visible = true;
    } else if (this.tracer) {
      this.tracer.visible = false;
    }
  }
}

// Hidden Packages add a soft golden light column for the nearest uncollected parcel.
