// Keyboard + mouse input. Desktop browser, keyboard and mouse only.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered, consumed each step
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.clicked = false; // left click edge
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.canvas = canvas;
    this._attach();
  }

  _attach() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.dragging = false; });
    this.canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.dragging = true;
      this.lastX = e.clientX; this.lastY = e.clientY;
      if (e.button === 0) this.clicked = true;
    });
    addEventListener('mouseup', () => { this.mouseDown = false; this.dragging = false; });
    addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.mouseDX += e.clientX - this.lastX;
      this.mouseDY += e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  axis(neg, pos) { return (this.keys.has(pos) ? 1 : 0) - (this.keys.has(neg) ? 1 : 0); }

  // Consume per-frame edge state after the simulation step.
  endStep() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.clicked = false;
  }
}
