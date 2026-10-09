import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// A late-80s beige desktop: CRT monitor on a pizza-box case, keyboard, mouse, mug and a
// sticky note. Units are metres; the desk surface sits at y = 0.

// Screen glass: centre of the flat base plane; the glass bulges 0.025 towards the viewer.
export const SCREEN = { width: 0.8, height: 0.6, center: new THREE.Vector3(0, 0.695, 0.236), bulge: 0.025 };

const beige = new THREE.MeshStandardMaterial({ color: '#d6cdb8', roughness: 0.58, metalness: 0.0 });
const beigeDark = new THREE.MeshStandardMaterial({ color: '#b9ae96', roughness: 0.62 });
const keyMat = new THREE.MeshStandardMaterial({ color: '#cfc5ad', roughness: 0.5 });
const keyGrey = new THREE.MeshStandardMaterial({ color: '#8f8a80', roughness: 0.5 });
const black = new THREE.MeshStandardMaterial({ color: '#141210', roughness: 0.8 });

function rounded(w, h, d, r, mat) {
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), mat);
}

function labelTexture(draw, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildDesk() {
  const group = new THREE.Group();

  // Desk: dark oiled wood that only the screen really lights.
  const deskMat = new THREE.MeshStandardMaterial({ color: '#2b2119', roughness: 0.72 });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.08, 2.4), deskMat);
  desk.position.set(0, -0.04, 0.3);
  group.add(desk);

  // Back wall, far enough to fall into shadow.
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.MeshStandardMaterial({ color: '#16120e', roughness: 1 }));
  wall.position.set(0, 2, -1.6);
  group.add(wall);

  return group;
}

export function buildComputer() {
  const group = new THREE.Group();

  // --- System unit (pizza box)
  const caseBody = rounded(1.24, 0.16, 0.92, 0.022, beige);
  caseBody.position.set(0, 0.08, -0.12);
  group.add(caseBody);
  const slot = rounded(0.32, 0.018, 0.02, 0.006, black);
  slot.position.set(0.32, 0.095, 0.341);
  group.add(slot);
  const slotFlap = rounded(0.36, 0.05, 0.012, 0.006, beigeDark);
  slotFlap.position.set(0.32, 0.095, 0.336);
  group.add(slotFlap);
  for (let i = 0; i < 9; i++) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.07, 0.01), black);
    vent.position.set(-0.52 + i * 0.024, 0.08, 0.341);
    group.add(vent);
  }
  const caseLed = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.01), new THREE.MeshStandardMaterial({ color: '#2b1a08', emissive: '#ffb547', emissiveIntensity: 2.5 }));
  caseLed.position.set(0.56, 0.06, 0.343);
  group.add(caseLed);

  // --- Monitor stand
  const neck = rounded(0.36, 0.05, 0.34, 0.02, beigeDark);
  neck.position.set(0, 0.185, -0.08);
  group.add(neck);

  // --- Monitor: front shell + tapered tube housing
  const monitor = new THREE.Group();
  monitor.position.set(0, 0.665, 0);
  group.add(monitor);

  const shell = rounded(1.06, 0.9, 0.3, 0.05, beige);
  shell.position.z = 0.08;
  monitor.add(shell);

  const hoodGeo = new THREE.BoxGeometry(0.94, 0.78, 0.6, 1, 1, 1);
  const pos = hoodGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) < 0) {
      pos.setX(i, pos.getX(i) * 0.6);
      pos.setY(i, pos.getY(i) * 0.6 - 0.04);
    }
  }
  hoodGeo.computeVertexNormals();
  const hood = new THREE.Mesh(hoodGeo, beige);
  hood.position.z = -0.36;
  monitor.add(hood);
  for (let i = 0; i < 7; i++) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.004, 0.03), black);
    v.position.set(0, 0.315 - i * 0.012, -0.18 - i * 0.05);
    v.rotation.x = -0.22;
    monitor.add(v);
  }

  // Recessed bezel: a frame with a hole, extruded so the glass sits inside a lip.
  const bw = 0.9, bh = 0.7, hw = SCREEN.width + 0.02, hh = SCREEN.height + 0.02;
  const frame = new THREE.Shape();
  frame.moveTo(-bw / 2, -bh / 2); frame.lineTo(bw / 2, -bh / 2); frame.lineTo(bw / 2, bh / 2); frame.lineTo(-bw / 2, bh / 2); frame.lineTo(-bw / 2, -bh / 2);
  const hole = new THREE.Path();
  const r = 0.035;
  hole.moveTo(-hw / 2 + r, -hh / 2);
  hole.lineTo(hw / 2 - r, -hh / 2); hole.quadraticCurveTo(hw / 2, -hh / 2, hw / 2, -hh / 2 + r);
  hole.lineTo(hw / 2, hh / 2 - r); hole.quadraticCurveTo(hw / 2, hh / 2, hw / 2 - r, hh / 2);
  hole.lineTo(-hw / 2 + r, hh / 2); hole.quadraticCurveTo(-hw / 2, hh / 2, -hw / 2, hh / 2 - r);
  hole.lineTo(-hw / 2, -hh / 2 + r); hole.quadraticCurveTo(-hw / 2, -hh / 2, -hw / 2 + r, -hh / 2);
  frame.holes.push(hole);
  const bezel = new THREE.Mesh(new THREE.ExtrudeGeometry(frame, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3 }), beigeDark);
  bezel.position.set(0, 0.03, 0.218);
  monitor.add(bezel);
  // Dark cavity behind the glass so the curved edges read as depth.
  const cavity = new THREE.Mesh(new THREE.PlaneGeometry(hw, hh), black);
  cavity.position.set(0, 0.03, 0.225);
  monitor.add(cavity);

  // Badge, power button and LED under the screen
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.03), new THREE.MeshStandardMaterial({
    roughness: 0.4,
    map: labelTexture((g, w, h) => {
      g.fillStyle = '#c9bfa7'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#4a4237'; g.font = '600 40px "IBM Plex Mono", monospace'; g.textBaseline = 'middle';
      g.fillText('IR-2027', 18, h / 2 + 2);
      g.fillStyle = '#c2562b'; g.fillRect(w - 60, 18, 36, h - 36);
    }, 320, 64),
  }));
  badge.position.set(-0.32, -0.385, 0.232);
  monitor.add(badge);
  const button = rounded(0.05, 0.03, 0.02, 0.006, beigeDark);
  button.position.set(0.38, -0.385, 0.232);
  monitor.add(button);
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.007, 16), new THREE.MeshStandardMaterial({ color: '#2b1a08', emissive: '#ffb547', emissiveIntensity: 4 }));
  led.position.set(0.32, -0.385, 0.232);
  monitor.add(led);

  // Sticky note on the bezel corner
  const note = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshStandardMaterial({
    roughness: 0.9,
    map: labelTexture((g, w, h) => {
      g.fillStyle = '#f2d36b'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, 0, w, 26);
      g.fillStyle = '#2b2620'; g.font = '30px "Caveat", "Comic Sans MS", cursive';
      g.fillText('SELECT *', 22, 92);
      g.fillText('FROM me;', 22, 136);
      g.font = '22px "Caveat", cursive'; g.fillText('← try it', 70, 196);
    }, 256, 256),
  }));
  note.position.set(0.47, 0.34, 0.266);
  note.rotation.z = -0.12;
  monitor.add(note);

  // --- Keyboard with real QWERTY layout so typed characters press the right keys
  const kb = new THREE.Group();
  kb.position.set(0, 0.03, 0.78);
  kb.rotation.x = 0.07;
  group.add(kb);
  const kbBase = rounded(1.04, 0.045, 0.36, 0.015, beige);
  kb.add(kbBase);

  const rows = ['`1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'];
  const rowShift = [0, 0.03, 0.045, 0.07];
  const pitch = 0.064;
  const keyGeo = new RoundedBoxGeometry(0.056, 0.026, 0.056, 2, 0.008);
  const count = rows.join('').length;
  const keys = new THREE.InstancedMesh(keyGeo, keyMat, count);
  const keyIndex = new Map();
  const keyBase = [];
  const m = new THREE.Matrix4();
  let n = 0;
  rows.forEach((row, ri) => {
    [...row].forEach((ch, ci) => {
      const x = -0.44 + rowShift[ri] + ci * pitch;
      const z = -0.11 + ri * pitch;
      keyBase.push(new THREE.Vector3(x, 0.034, z));
      m.makeTranslation(x, 0.034, z);
      keys.setMatrixAt(n, m);
      keyIndex.set(ch, n);
      n++;
    });
  });
  kb.add(keys);
  const special = {};
  const addSpecial = (name, w, x, z, mat = keyGrey) => {
    const k = rounded(w, 0.026, 0.056, 0.008, mat);
    k.position.set(x, 0.034, z);
    k.userData.base = k.position.y;
    kb.add(k);
    special[name] = k;
  };
  addSpecial('space', 0.38, 0.0, -0.11 + 4 * pitch, keyMat);
  addSpecial('enter', 0.11, 0.425, -0.11 + 2 * pitch);
  addSpecial('backspace', 0.11, 0.425, -0.11);
  addSpecial('tab', 0.08, -0.455, -0.11 + pitch);
  addSpecial('shift', 0.12, -0.44, -0.11 + 3 * pitch);
  addSpecial('shiftR', 0.12, 0.395, -0.11 + 3 * pitch);

  // --- Mouse
  const mouse = rounded(0.07, 0.035, 0.11, 0.025, beige);
  mouse.position.set(0.72, 0.02, 0.8);
  mouse.rotation.y = -0.15;
  group.add(mouse);

  // --- Mug, steam is added by the scene
  const mugMat = new THREE.MeshStandardMaterial({ color: '#7a2f1c', roughness: 0.35 });
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.13, 32), mugMat);
  mug.position.set(-0.86, 0.065, 0.55);
  group.add(mug);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.011, 12, 24), mugMat);
  handle.position.set(-0.92, 0.07, 0.55);
  handle.rotation.y = Math.PI / 2;
  group.add(handle);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.052, 24), new THREE.MeshStandardMaterial({ color: '#1a0e07', roughness: 0.2 }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.set(-0.86, 0.12, 0.55);
  group.add(coffee);

  // --- Floppy disks by the case
  const floppyMat = new THREE.MeshStandardMaterial({ color: '#1c1c22', roughness: 0.5 });
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.004, 0.094), floppyMat);
    f.position.set(0.86 + i * 0.01, 0.003 + i * 0.0045, 0.32 - i * 0.012);
    f.rotation.y = 0.3 + i * 0.12;
    group.add(f);
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.03), new THREE.MeshStandardMaterial({ color: '#e9e2d0', roughness: 0.9 }));
    lbl.rotation.x = -Math.PI / 2;
    lbl.position.set(0, 0.0025, -0.025);
    f.add(lbl);
  }

  // Key press animation: call press(char) on each keystroke and update(dt) per frame.
  const pressed = new Float32Array(count);
  const specialPressed = {};
  const tmp = new THREE.Matrix4();
  return {
    group,
    led,
    caseLed,
    press(key) {
      const k = key.length === 1 ? key.toLowerCase() : key;
      if (k === ' ') specialPressed.space = 1;
      else if (special[k]) specialPressed[k] = 1;
      else if (keyIndex.has(k)) pressed[keyIndex.get(k)] = 1;
      else if (k.length === 1) pressed[(Math.random() * count) | 0] = 1;
    },
    update(dt) {
      let dirty = false;
      for (let i = 0; i < count; i++) {
        if (pressed[i] <= 0) continue;
        pressed[i] = Math.max(0, pressed[i] - dt * 7);
        const b = keyBase[i];
        tmp.makeTranslation(b.x, b.y - Math.sin(pressed[i] * Math.PI) * 0.012, b.z);
        keys.setMatrixAt(i, tmp);
        dirty = true;
      }
      if (dirty) keys.instanceMatrix.needsUpdate = true;
      for (const name in specialPressed) {
        const v = (specialPressed[name] = Math.max(0, specialPressed[name] - dt * 7));
        special[name].position.y = special[name].userData.base - Math.sin(v * Math.PI) * 0.012;
      }
    },
  };
}
