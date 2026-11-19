// NEON HARBOR — keyboard + mouse input. One shared key table; the game loop
// polls it every frame. Also tracks "pressed this frame" edges for actions.

const KEY_ALIASES = {
  ArrowUp: 'KeyW',
  ArrowDown: 'KeyS',
  ArrowLeft: 'KeyA',
  ArrowRight: 'KeyD',
};

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.mouseDown = false;
    this.mousePressed = false;
    this.anyKey = false;
    this._onKeyDown = (event) => {
      const code = KEY_ALIASES[event.code] || event.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
        event.preventDefault();
      }
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
      this.anyKey = true;
    };
    this._onKeyUp = (event) => {
      const code = KEY_ALIASES[event.code] || event.code;
      this.down.delete(code);
    };
    this._onMouseDown = (event) => {
      if (event.button === 0) {
        if (!this.mouseDown) this.mousePressed = true;
        this.mouseDown = true;
      }
    };
    this._onMouseUp = (event) => {
      if (event.button === 0) this.mouseDown = false;
    };
    this._onBlur = () => {
      this.down.clear();
      this.mouseDown = false;
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', this._onBlur);
  }

  isDown(code) {
    return this.down.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  wasMousePressed() {
    return this.mousePressed;
  }

  // Call once at the end of each frame so edges last exactly one frame.
  endFrame() {
    this.pressed.clear();
    this.mousePressed = false;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('blur', this._onBlur);
  }
}
