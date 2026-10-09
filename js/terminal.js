// A small VT-style terminal drawn to a canvas. The canvas becomes the texture on the
// CRT in the 3D scene, so everything here is pixels: no DOM text.

const TONES = {
  normal: '#ffb547',
  bright: '#ffe2a8',
  dim: '#9a6528',
  error: '#ff6a3d',
  ok: '#fff3d6',
};

export class Terminal {
  constructor({ width = 1024, height = 768, fontSize = 22, font = 'VT323' } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.fontSize = fontSize;
    this.font = `${fontSize}px "${font}", "IBM Plex Mono", monospace`;
    this.pad = 34;
    this.lineH = Math.round(fontSize * 1.08);
    this.lines = [];
    this.input = '';
    this.prompt = 'guest@ibrahim:~$ ';
    this.history = [];
    this.histPos = 0;
    this.busy = false;
    this.dirty = true;
    this.effect = null;
    this.handler = null;
    this.onKey = null;
    this.listeners = new Set();
    this.measure();
  }

  measure() {
    this.ctx.font = this.font;
    this.charW = this.ctx.measureText('M').width;
    this.cols = Math.floor((this.canvas.width - this.pad * 2) / this.charW);
    this.rows = Math.floor((this.canvas.height - this.pad * 2) / this.lineH);
  }

  onCommand(fn) { this.handler = fn; }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  print(text = '', tone = 'normal') {
    for (const raw of String(text).split('\n')) {
      if (raw.length <= this.cols) { this.lines.push({ text: raw, tone }); continue; }
      for (let i = 0; i < raw.length; i += this.cols) this.lines.push({ text: raw.slice(i, i + this.cols), tone });
    }
    if (this.lines.length > 600) this.lines.splice(0, this.lines.length - 600);
    this.dirty = true;
  }

  clear() { this.lines = []; this.dirty = true; }

  setPrompt(p) { this.prompt = p; this.dirty = true; }

  async submit() {
    const line = this.input;
    this.print(this.prompt + line, 'bright');
    this.input = '';
    if (line.trim()) {
      this.history.push(line);
      this.histPos = this.history.length;
    }
    this.busy = true;
    this.dirty = true;
    try {
      await this.handler?.(line.trim());
    } catch (err) {
      this.print(`panic: ${err.message}`, 'error');
    }
    this.busy = false;
    this.dirty = true;
    this.listeners.forEach((fn) => fn(line.trim()));
  }

  // Type a command as if a person were at the keyboard, then run it.
  async type(text, speed = 42) {
    if (this.busy) return;
    this.busy = true;
    this.input = '';
    const run = (this.typing = { cancelled: false });
    for (const ch of text) {
      if (run.cancelled) { this.busy = false; return; }
      this.input += ch;
      this.dirty = true;
      this.onKey?.(ch);
      await wait(speed + Math.random() * speed * 0.8);
    }
    await wait(180);
    if (run.cancelled) { this.busy = false; return; }
    this.onKey?.('enter');
    this.busy = false;
    await this.submit();
  }

  // Returns true when the key was used, so the caller can preventDefault.
  handleKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) {
      const plain = e.ctrlKey && !e.metaKey && !e.altKey && getSelection().isCollapsed;
      if (plain && e.key.toLowerCase() === 'l') { this.clear(); return true; }
      if (plain && e.key.toLowerCase() === 'c') {
        if (this.typing) this.typing.cancelled = true;
        this.print(this.prompt + this.input + '^C', 'dim');
        this.input = '';
        this.effect = null;
        return true;
      }
      return false;
    }
    if (this.busy) return e.key.length === 1 || e.key === 'Enter';
    const k = e.key;
    if (k === 'Enter') { this.onKey?.('enter'); this.submit(); return true; }
    if (k === 'Backspace') { this.input = this.input.slice(0, -1); this.onKey?.('backspace'); this.dirty = true; return true; }
    if (k === 'ArrowUp') { this.recall(-1); return true; }
    if (k === 'ArrowDown') { this.recall(1); return true; }
    if (k === 'Tab') { this.complete(); this.onKey?.('tab'); return true; }
    if (k === 'Escape') { this.effect = null; this.dirty = true; return true; }
    if (k.length === 1) {
      if (this.input.length < 240) this.input += k;
      this.onKey?.(k);
      this.dirty = true;
      return true;
    }
    return false;
  }

  recall(dir) {
    if (!this.history.length) return;
    this.histPos = Math.max(0, Math.min(this.history.length, this.histPos + dir));
    this.input = this.history[this.histPos] ?? '';
    this.dirty = true;
  }

  complete() {
    const words = this.completions || [];
    const match = words.filter((w) => w.startsWith(this.input.toLowerCase()));
    if (match.length === 1) this.input = match[0] + ' ';
    else if (match.length > 1) this.print(match.join('   '), 'dim');
    this.dirty = true;
  }

  startMatrix(seconds = 5) {
    const cols = Math.floor(this.canvas.width / this.charW);
    this.effect = { type: 'matrix', until: performance.now() + seconds * 1000, drops: Array.from({ length: cols }, () => Math.random() * -40) };
  }

  // Draws only when something changed; the cursor blink and effects force redraws.
  render(now) {
    const blink = Math.floor(now / 530) % 2 === 0;
    if (blink !== this.lastBlink) { this.lastBlink = blink; this.dirty = true; }
    if (this.effect && now > this.effect.until) { this.effect = null; this.dirty = true; }
    if (!this.dirty && !this.effect) return false;
    this.dirty = false;

    const { ctx, canvas } = this;
    ctx.fillStyle = '#0b0703';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (this.effect?.type === 'matrix') {
      this.drawMatrix();
      return true;
    }

    ctx.font = this.font;
    ctx.textBaseline = 'top';
    const promptLine = this.prompt + this.input;
    const visible = this.lines.slice(-(this.rows - 1));
    let y = this.pad;
    for (const l of visible) {
      ctx.fillStyle = TONES[l.tone] || TONES.normal;
      ctx.fillText(l.text, this.pad, y);
      y += this.lineH;
    }
    const shown = promptLine.length > this.cols - 1 ? '…' + promptLine.slice(-(this.cols - 2)) : promptLine;
    ctx.fillStyle = TONES.bright;
    ctx.fillText(shown, this.pad, y);
    if (blink && !this.busy) {
      ctx.fillStyle = TONES.normal;
      ctx.fillRect(this.pad + shown.length * this.charW + 2, y + 2, this.charW - 2, this.fontSize - 2);
    }
    return true;
  }

  drawMatrix() {
    const { ctx } = this;
    const glyphs = 'ｱｲｳｴｵｶｷｸｹｺ0123456789SELECTFROMWHERE<>{}#';
    ctx.font = this.font;
    ctx.textBaseline = 'top';
    this.effect.drops.forEach((d, i) => {
      for (let j = 0; j < 14; j++) {
        const row = Math.floor(d) - j;
        if (row < 0) continue;
        ctx.fillStyle = j === 0 ? TONES.ok : `rgba(255, 181, 71, ${1 - j / 14})`;
        ctx.fillText(glyphs[(Math.random() * glyphs.length) | 0], i * this.charW, row * this.lineH);
      }
      this.effect.drops[i] = d > this.rows + 16 ? Math.random() * -10 : d + 0.35 + (i % 3) * 0.12;
    });
  }
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
