import * as THREE from 'three';
import { projects } from './data.js';

// The world inside the monitor. One particle system morphs through five shapes:
//   S scatter → A name → B B+tree → C project planets → D galaxy (contact)
// uMorph runs from -1 to 3: -1..0 is S→A, 0..1 A→B, 1..2 B→C, 2..3 C→D.

export const PROJECT_COUNT = projects.length;

function rand(a, b) { return a + Math.random() * (b - a); }
function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }

function sampleName(count, mobile) {
  const W = 1600, H = mobile ? 700 : 400;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if ('fontStretch' in g) g.fontStretch = 'expanded';
  if (mobile) {
    g.font = '800 300px "Archivo", sans-serif';
    g.fillText('IBRAHIM', W / 2, H * 0.28);
    g.fillText('RAZA', W / 2, H * 0.74);
  } else {
    g.font = '800 210px "Archivo", sans-serif';
    g.fillText('IBRAHIM RAZA', W / 2, H / 2);
  }
  const data = g.getImageData(0, 0, W, H).data;
  const pts = [];
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) if (data[(y * W + x) * 4 + 3] > 128) pts.push([x, y]);
  const worldW = mobile ? 9 : 17;
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const [x, y] = pts[(Math.random() * pts.length) | 0];
    out[i * 3] = ((x - W / 2) / W) * worldW + rand(-0.03, 0.03);
    out[i * 3 + 1] = (-(y - H / 2) / W) * worldW + rand(-0.03, 0.03);
    out[i * 3 + 2] = gauss() * 0.18;
  }
  return out;
}

// A three-level B+tree: root, three internal nodes, nine leaf pages chained left to right.
function buildBTree(count, sx = 1) {
  const segs = [];
  const fills = [];
  const nodes = [];
  const addRect = (x, y, z, w, h, keys) => {
    x *= sx; w *= sx;
    const l = x - w / 2, r = x + w / 2, t = y + h / 2, b = y - h / 2;
    segs.push([l, b, z, r, b, z], [r, b, z, r, t, z], [r, t, z, l, t, z], [l, t, z, l, b, z]);
    for (let k = 1; k <= keys; k++) { const kx = l + (w * k) / (keys + 1); segs.push([kx, b, z, kx, t, z]); }
    fills.push([l, r, b, t, z]);
    nodes.push({ x, y, z, w, h, keys });
  };
  const root = { x: 0, y: 3.4, z: -1.2, w: 2.6, h: 0.62, keys: 2 };
  addRect(root.x, root.y, root.z, root.w, root.h, root.keys);
  const internals = [-5.7, 0, 5.7].map((x) => ({ x, y: 0.9, z: 0, w: 2.4, h: 0.6, keys: 2 }));
  const leaves = [];
  internals.forEach((n, i) => {
    addRect(n.x, n.y, n.z, n.w, n.h, n.keys);
    const px = (root.x - root.w / 2 + (root.w * (i + 0.5)) / 3) * sx;
    segs.push([px, root.y - root.h / 2, root.z, n.x * sx, n.y + n.h / 2, n.z]);
    [-1.9, 0, 1.9].forEach((dx, j) => {
      const leaf = { x: n.x + dx, y: -1.9, z: 1.1, w: 1.6, h: 0.56, keys: 3 };
      leaves.push(leaf);
      addRect(leaf.x, leaf.y, leaf.z, leaf.w, leaf.h, leaf.keys);
      const cx = (n.x - n.w / 2 + (n.w * (j + 0.5)) / 3) * sx;
      segs.push([cx, n.y - n.h / 2, n.z, leaf.x * sx, leaf.y + leaf.h / 2, leaf.z]);
    });
  });
  // Sibling pointers between leaves: the detail that makes it a B+tree.
  for (let i = 0; i < leaves.length - 1; i++) {
    const a = leaves[i], b = leaves[i + 1];
    const x0 = (a.x + a.w / 2) * sx + 0.03, x1 = (b.x - b.w / 2) * sx - 0.03, y = a.y;
    segs.push([x0, y, a.z, x1, y, b.z]);
    segs.push([x1 - 0.08, y + 0.06, b.z, x1, y, b.z], [x1 - 0.08, y - 0.06, b.z, x1, y, b.z]);
  }

  const lens = segs.map((s) => Math.hypot(s[3] - s[0], s[4] - s[1], s[5] - s[2]));
  const total = lens.reduce((a, b) => a + b, 0);
  const cum = [];
  lens.reduce((acc, l, i) => (cum[i] = acc + l), 0);
  const out = new Float32Array(count * 3);
  const lineCount = Math.floor(count * 0.82);
  for (let i = 0; i < count; i++) {
    let x, y, z;
    if (i < lineCount) {
      const pick = Math.random() * total;
      let k = cum.findIndex((c) => c >= pick);
      if (k < 0) k = segs.length - 1;
      const s = segs[k], t = Math.random();
      x = s[0] + (s[3] - s[0]) * t; y = s[1] + (s[4] - s[1]) * t; z = s[2] + (s[5] - s[2]) * t;
      x += gauss() * 0.012; y += gauss() * 0.012; z += gauss() * 0.03;
    } else {
      const f = fills[(Math.random() * fills.length) | 0];
      x = rand(f[0], f[1]); y = rand(f[2], f[3]); z = f[4] + gauss() * 0.05;
    }
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
  }
  const labels = {
    root: new THREE.Vector3((root.x + root.w / 2) * sx + 0.25, root.y, root.z),
    internal: new THREE.Vector3((internals[2].x + 1.2) * sx + 0.25, internals[2].y, 0),
    leaves: new THREE.Vector3(leaves[4].x * sx, leaves[4].y - 0.75, leaves[4].z),
  };
  return { positions: out, labels };
}

export function projectLayout(mobile) {
  return Array.from({ length: PROJECT_COUNT }, (_, i) => ({
    center: new THREE.Vector3((i - 3) * (mobile ? 4.2 : 5.4), Math.sin(i * 1.3) * 1.1, Math.cos(i * 0.9) * 1.4),
    radius: i === 0 ? 1.55 : 0.85 + ((i * 37) % 5) * 0.08,
  }));
}

function buildPlanets(count, layout) {
  const out = new Float32Array(count * 3);
  const group = new Float32Array(count);
  const weights = layout.map((p) => p.radius * p.radius);
  const wsum = weights.reduce((a, b) => a + b, 0);
  let i = 0;
  layout.forEach((p, gi) => {
    const n = gi === layout.length - 1 ? count - i : Math.floor((weights[gi] / wsum) * count);
    const ringN = Math.floor(n * 0.24);
    const tilt = 0.35 + gi * 0.21;
    for (let k = 0; k < n; k++, i++) {
      let x, y, z;
      if (k < n - ringN) {
        // Fibonacci sphere shell with a little thickness
        const t = k / (n - ringN);
        const phi = Math.acos(1 - 2 * t), th = Math.PI * (1 + Math.sqrt(5)) * k;
        const r = p.radius * (1 + gauss() * 0.03);
        x = r * Math.sin(phi) * Math.cos(th); y = r * Math.cos(phi); z = r * Math.sin(phi) * Math.sin(th);
      } else {
        const a = Math.random() * Math.PI * 2, r = p.radius * rand(1.45, 1.75);
        x = Math.cos(a) * r; y = gauss() * 0.02; z = Math.sin(a) * r;
        const cy = Math.cos(tilt), sy = Math.sin(tilt);
        [y, z] = [y * cy - z * sy, y * sy + z * cy];
      }
      out[i * 3] = p.center.x + x; out[i * 3 + 1] = p.center.y + y; out[i * 3 + 2] = p.center.z + z;
      group[i] = gi;
    }
  });
  return { positions: out, group };
}

function buildGalaxy(count) {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const arm = i % 3;
    const r = 0.4 + Math.pow(Math.random(), 0.75) * 10;
    const a = arm * ((Math.PI * 2) / 3) + r * 0.55 + gauss() * (0.5 / (r * 0.25 + 0.6));
    out[i * 3] = Math.cos(a) * r;
    out[i * 3 + 1] = gauss() * 0.35 * (1 - r / 11);
    out[i * 3 + 2] = Math.sin(a) * r;
  }
  return out;
}

function buildScatter(count) {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3(gauss(), gauss(), gauss()).normalize().multiplyScalar(rand(6, 34));
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z - 10;
  }
  return out;
}

export function createInside({ mobile }) {
  const count = mobile ? 9000 : 22000;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#060403');
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 400);
  camera.position.set(0, 0, 15);

  const layout = projectLayout(mobile);
  const tree = buildBTree(count, mobile ? 0.55 : 1);
  const planets = buildPlanets(count, layout);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(sampleName(count, mobile), 3));
  geo.setAttribute('aS', new THREE.BufferAttribute(buildScatter(count), 3));
  geo.setAttribute('aA', new THREE.BufferAttribute(sampleName(count, mobile), 3));
  geo.setAttribute('aB', new THREE.BufferAttribute(tree.positions, 3));
  geo.setAttribute('aC', new THREE.BufferAttribute(planets.positions, 3));
  geo.setAttribute('aD', new THREE.BufferAttribute(buildGalaxy(count), 3));
  geo.setAttribute('aGroup', new THREE.BufferAttribute(planets.group, 1));
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = Math.random();
  geo.setAttribute('aRand', new THREE.BufferAttribute(seeds, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);

  const uniforms = {
    uMorph: { value: -1 },
    uTime: { value: 0 },
    uPixel: { value: Math.min(devicePixelRatio, 1.5) * innerHeight * 0.5 },
    uSize: { value: mobile ? 0.11 : 0.085 },
    uActive: { value: 0 },
    uMouse: { value: new THREE.Vector3(999, 999, 0) },
    uRepel: { value: 1 },
    uBurst: { value: 1.8 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aS; attribute vec3 aA; attribute vec3 aB; attribute vec3 aC; attribute vec3 aD;
      attribute float aRand; attribute float aGroup;
      uniform float uMorph, uTime, uPixel, uSize, uActive, uRepel, uBurst; uniform vec3 uMouse;
      varying vec3 vColor; varying float vAlpha;
      void main(){
        float m = uMorph; vec3 p0; vec3 p1; float t;
        if (m < 0.0) { p0 = aS; p1 = aA; t = m + 1.0; }
        else if (m < 1.0) { p0 = aA; p1 = aB; t = m; }
        else if (m < 2.0) { p0 = aB; p1 = aC; t = m - 1.0; }
        else { p0 = aC; p1 = aD; t = min(m - 2.0, 1.0); }
        float lt = smoothstep(0.0, 1.0, clamp((t - aRand * 0.4) / 0.6, 0.0, 1.0));
        vec3 pos = mix(p0, p1, lt);
        float burst = sin(lt * 3.14159);
        vec3 n = vec3(sin(pos.y * 0.9 + uTime * 0.7 + aRand * 6.0), sin(pos.z * 1.1 + uTime * 0.6 + aRand * 5.0), sin(pos.x * 0.8 + uTime * 0.5 + aRand * 4.0));
        pos += n * (0.025 + burst * uBurst);
        if (m > 2.0) {
          float r = length(pos.xz);
          float a = uTime * 0.16 * (4.0 / (r + 1.5)) * lt;
          pos.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * pos.xz;
        }
        vec3 d = pos - uMouse; float rr = length(d.xy);
        float push = smoothstep(1.7, 0.0, rr) * uRepel;
        pos.xy += normalize(d.xy + 1e-4) * push * 1.3;
        pos.z += push * 0.9;
        float planets = (m > 1.4 && m < 2.4) ? 1.0 : 0.0;
        float act = planets * (1.0 - step(0.5, abs(aGroup - uActive)));
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = uSize * (0.55 + aRand * 0.9) * (1.0 + act * 0.5 + push) * uPixel / -mv.z;
        gl_Position = projectionMatrix * mv;
        vec3 amber = vec3(1.0, 0.42, 0.08);
        vec3 hot = vec3(1.0, 0.82, 0.6);
        vColor = mix(amber, hot, clamp(aRand * aRand + burst * 0.7 + act * 0.6 + push, 0.0, 1.0)) * 1.25;
        vAlpha = (0.55 + 0.45 * sin(uTime * 2.2 + aRand * 40.0)) * mix(1.0, 0.35 + act * 0.65, planets);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor; varying float vAlpha;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a *= a;
        gl_FragColor = vec4(vColor * a * vAlpha, a * vAlpha);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  // A faint data-plane grid far below, so the space has a floor and a horizon.
  const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: uniforms.uTime },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec3 vW;
        void main(){
          vec2 g = abs(fract(vW.xz / 2.0 + vec2(0.0, uTime * 0.05)) - 0.5) / fwidth(vW.xz / 2.0);
          float line = 1.0 - min(min(g.x, g.y), 1.0);
          float fade = exp(-length(vW.xz) * 0.03);
          gl_FragColor = vec4(vec3(1.0, 0.45, 0.1) * line * fade * 0.35, line * fade * 0.6);
        }`,
    })
  );
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = -7;
  scene.add(grid);

  // Sparse distant stars for depth
  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(1500 * 3);
  for (let i = 0; i < 1500; i++) {
    const v = new THREE.Vector3(gauss(), gauss() * 0.6, gauss()).normalize().multiplyScalar(rand(80, 160));
    sp.set([v.x, v.y, v.z], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#c8b49a', size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.55 })));

  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  const ndc = new THREE.Vector2();

  return {
    scene,
    camera,
    uniforms,
    count,
    layout,
    treeLabels: tree.labels,
    setPointer(x, y) {
      ndc.set(x, y);
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(plane, hit)) uniforms.uMouse.value.lerp(hit, 0.25);
    },
    resize() {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      uniforms.uPixel.value = Math.min(devicePixelRatio, 1.5) * innerHeight * 0.5;
    },
  };
}
