import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { buildComputer, buildDesk, SCREEN } from './computer.js';
import { createInside } from './inside.js';

// Two scenes share one renderer. The room holds the computer; the inside world lives
// "behind the glass". While diving, the inside world renders into a texture shown on
// the CRT; once the screen fills the view, the renderer switches over to it.

export function createWorld(canvas, { mobile, terminalCanvas, reduced = false }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.3 : 1.6));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  RectAreaLightUniformsLib.init();

  /* ---------------- Room ---------------- */
  const room = new THREE.Scene();
  room.background = new THREE.Color('#050403');
  room.fog = new THREE.Fog('#050403', 3.5, 9);
  const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.02, 60);

  room.add(buildDesk());
  const computer = buildComputer();
  room.add(computer.group);

  // Terminal canvas → texture
  const termTex = new THREE.CanvasTexture(terminalCanvas);
  termTex.colorSpace = THREE.SRGBColorSpace;
  termTex.minFilter = THREE.LinearFilter;
  termTex.generateMipmaps = false;

  // Inside world rendered to a texture for the portal moment
  const inside = createInside({ mobile });
  const portalRT = new THREE.WebGLRenderTarget(mobile ? 640 : 1024, mobile ? 480 : 768, { type: THREE.HalfFloatType });

  // CRT glass: barrel distortion, scanlines, phosphor bloom, flicker, power-on collapse.
  const screenUniforms = {
    uTerm: { value: termTex },
    uPortal: { value: portalRT.texture },
    uMix: { value: 0 },
    uTime: { value: 0 },
    uPower: { value: 0 },
    uBright: { value: 1.6 },
  };
  const screenGeo = new THREE.PlaneGeometry(SCREEN.width, SCREEN.height, 48, 36);
  const sp = screenGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i) / (SCREEN.width / 2), y = sp.getY(i) / (SCREEN.height / 2);
    sp.setZ(i, SCREEN.bulge * (1 - x * x * 0.6) * (1 - y * y * 0.6));
  }
  screenGeo.computeVertexNormals();
  const screen = new THREE.Mesh(screenGeo, new THREE.ShaderMaterial({
    uniforms: screenUniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D uTerm; uniform sampler2D uPortal;
      uniform float uMix, uTime, uPower, uBright;
      varying vec2 vUv;
      vec2 barrel(vec2 uv, float k){ vec2 c = uv - 0.5; return 0.5 + c * (1.0 + k * dot(c, c)); }
      void main(){
        float k = mix(0.22, 0.0, uMix);
        vec2 uv = barrel(vUv, k);
        vec3 col = vec3(0.0);
        if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
          vec2 px = vec2(1.0 / 1024.0, 1.0 / 768.0);
          vec3 t = texture2D(uTerm, uv).rgb;
          vec3 glow = texture2D(uTerm, uv + px * vec2(2.5, 0.0)).rgb + texture2D(uTerm, uv - px * vec2(2.5, 0.0)).rgb
                    + texture2D(uTerm, uv + px * vec2(0.0, 2.5)).rgb + texture2D(uTerm, uv - px * vec2(0.0, 2.5)).rgb;
          t = t + glow * 0.18;
          float scan = 0.78 + 0.22 * sin(uv.y * 768.0 * 3.14159);
          float mask = 0.92 + 0.08 * sin(uv.x * 1024.0 * 2.0944);
          float flicker = 0.97 + 0.03 * sin(uTime * 110.0) + 0.015 * sin(uTime * 7.0);
          vec2 vc = uv - 0.5;
          float vig = smoothstep(0.85, 0.2, length(vc * vec2(1.0, 1.15)));
          vec3 crt = t * scan * mask * flicker * vig * uBright + vec3(0.035, 0.018, 0.006) * vig;
          vec3 portal = texture2D(uPortal, vUv).rgb;
          col = mix(crt, portal * 1.15, smoothstep(0.0, 1.0, uMix));
          col += vec3(1.0, 0.7, 0.4) * pow(uMix, 14.0) * 0.35;
        }
        // Power-on: the picture grows from a bright horizontal line.
        float band = smoothstep(uPower * 0.52, uPower * 0.52 - 0.01, abs(vUv.y - 0.5));
        float line = smoothstep(0.012, 0.0, abs(vUv.y - 0.5)) * (1.0 - smoothstep(0.2, 0.5, uPower)) * step(0.001, uPower);
        col = col * band + vec3(1.0, 0.85, 0.6) * line * 3.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  screen.position.copy(SCREEN.center);
  room.add(screen);

  // Light from the screen itself is the key light of the whole room.
  const screenLight = new THREE.RectAreaLight('#ffad55', 0, SCREEN.width, SCREEN.height);
  screenLight.position.copy(SCREEN.center).add(new THREE.Vector3(0, 0, 0.05));
  screenLight.lookAt(SCREEN.center.x, SCREEN.center.y - 0.25, 2);
  room.add(screenLight);
  const glow = new THREE.PointLight('#ff9a3c', 0, 2.6, 1.6);
  glow.position.set(0, 0.62, 0.7);
  room.add(glow);
  const rim = new THREE.DirectionalLight('#6f8cff', 0.0);
  rim.position.set(-2.5, 2.2, -2);
  room.add(rim);
  const top = new THREE.SpotLight('#ffe6c4', 0, 6, 0.42, 0.6, 1.2);
  top.position.set(1.2, 3.2, 1.4);
  top.target.position.set(0.1, 0.3, 0.2);
  room.add(top, top.target);
  room.add(new THREE.HemisphereLight('#3a3140', '#120d09', 0.0));
  const hemi = room.children[room.children.length - 1];

  // Fake volumetric beam from the top light, with dust drifting through it
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(1.25, 3.4, 48, 1, true),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uOn: { value: 0 } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uOn; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); float a = vY * vY * edge * 0.09 * uOn; gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * a, a); }',
    })
  );
  // Apex at the lamp, base on the desk.
  const beamDir = top.position.clone().sub(top.target.position);
  beam.scale.y = beamDir.length() / 3.4;
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDir.clone().normalize());
  beam.position.copy(top.target.position).addScaledVector(beamDir, 0.5);
  room.add(beam);

  const DUST = mobile ? 300 : 700;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) dustPos.set([(Math.random() - 0.5) * 3, Math.random() * 2.4, (Math.random() - 0.5) * 2.4 + 0.6], i * 3);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: screenUniforms.uTime, uOn: { value: 0 } },
    vertexShader: 'uniform float uTime; varying float vA; void main(){ vec3 p = position; p.y = mod(p.y + uTime * 0.03 + sin(uTime*0.3 + p.x*4.0)*0.02, 2.4); p.x += sin(uTime * 0.2 + p.z * 5.0) * 0.05; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = 2.2 * (3.0 / -mv.z); vA = 0.5 + 0.5 * sin(uTime + p.x * 30.0); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uOn; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA * 0.5 * uOn; gl_FragColor = vec4(vec3(1.0, 0.85, 0.6) * a, a); }',
  });
  room.add(new THREE.Points(dustGeo, dustMat));

  // Steam from the mug
  const STEAM = 140;
  const steamGeo = new THREE.BufferGeometry();
  const steamSeed = new Float32Array(STEAM);
  for (let i = 0; i < STEAM; i++) steamSeed[i] = Math.random();
  steamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STEAM * 3), 3));
  steamGeo.setAttribute('aSeed', new THREE.BufferAttribute(steamSeed, 1));
  const steam = new THREE.Points(steamGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: screenUniforms.uTime },
    vertexShader: 'uniform float uTime; attribute float aSeed; varying float vA; void main(){ float t = fract(uTime * 0.12 + aSeed); vec3 p = vec3(-0.86 + sin(t * 9.0 + aSeed * 20.0) * 0.03 * t, 0.13 + t * 0.4, 0.55 + cos(t * 7.0 + aSeed * 10.0) * 0.02 * t); vA = sin(t * 3.14159) * 0.08; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = (20.0 + t * 60.0) * (1.0 / -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(0.85, 0.78, 0.7), a); }',
  }));
  steam.frustumCulled = false;
  room.add(steam);

  /* ---------------- Post ---------------- */
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(room, camera);
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.75);
  composer.addPass(bloom);
  const lens = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAberr: { value: 0.0015 }, uFlash: { value: 0 }, uGrain: { value: 0.045 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform float uTime, uAberr, uFlash, uGrain; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 3.7) * 43758.5453); }
      void main(){
        vec2 c = vUv - 0.5;
        vec2 off = c * uAberr * length(c) * 4.0;
        vec3 col = vec3(texture2D(tDiffuse, vUv - off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + off).b);
        col *= smoothstep(1.05, 0.35, length(c * vec2(1.0, 0.9)));
        col += (hash(vUv) - 0.5) * uGrain;
        col = mix(col, vec3(1.6, 1.05, 0.6), uFlash);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  composer.addPass(lens);
  composer.addPass(new OutputPass());

  /* ---------------- Camera rail ---------------- */
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // Hero framing keeps the computer on the right so the type can sit on the left.
  const heroPos = mobile ? V(0, 1.35, 4.3) : V(-0.82, 1.0, 3.05);
  const heroLook = mobile ? V(0, -0.05, 0) : V(-0.62, 0.55, 0);
  const divePath = new THREE.CatmullRomCurve3([
    heroPos,
    mobile ? V(0, 0.9, 2.2) : V(-0.35, 0.86, 1.8),
    V(0, SCREEN.center.y + 0.02, 1.0),
    V(0, SCREEN.center.y, SCREEN.center.z + SCREEN.bulge + 0.4),
  ]);
  const diveLook = new THREE.CatmullRomCurve3([heroLook, mobile ? V(0, 0.55, 0) : V(-0.3, 0.6, 0), V(0, SCREEN.center.y, 0), V(0, SCREEN.center.y, 0)]);

  const state = {
    power: 0, // room lights + CRT power, 0..1
    dive: 0, // 0 hero → 1 through the glass
    inside: false,
    mx: 0, my: 0, sx: 0, sy: 0, pointer: false,
    insideCam: { pos: V(0, 0, 15), look: V(0, 0, 0) },
    flash: 0,
  };
  const tmpP = new THREE.Vector3(), tmpL = new THREE.Vector3();
  const insideLook = new THREE.Vector3();
  addEventListener('pointermove', (e) => {
    state.pointer = e.pointerType === 'mouse';
    state.mx = (e.clientX / innerWidth) * 2 - 1;
    state.my = -(e.clientY / innerHeight) * 2 + 1;
  });

  const clock = new THREE.Clock();
  const stats = { fps: 60, frames: 0, acc: 0 };
  let onFrame = null;

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    stats.frames++; stats.acc += dt;
    if (stats.acc > 0.5) { stats.fps = Math.round(stats.frames / stats.acc); stats.frames = 0; stats.acc = 0; }
    screenUniforms.uTime.value = t;
    inside.uniforms.uTime.value = t;
    lens.uniforms.uTime.value = t;
    state.sx += (state.mx - state.sx) * 0.05;
    state.sy += (state.my - state.sy) * 0.05;
    onFrame?.(dt, t);

    // Lights follow power
    const p = state.power;
    screenUniforms.uPower.value = p;
    screenLight.intensity = 9 * p * (0.97 + 0.03 * Math.sin(t * 110));
    glow.intensity = 1.6 * p;
    rim.intensity = 0.55 * p;
    top.intensity = 14 * p;
    hemi.intensity = 0.25 * p;
    beam.material.uniforms.uOn.value = p;
    dustMat.uniforms.uOn.value = p;
    computer.update(dt);
    computer.led.material.emissiveIntensity = 2 + Math.sin(t * 3) * 1.5;

    const d = THREE.MathUtils.clamp(state.dive, 0, 1);
    const ease = d * d * (3 - 2 * d);
    divePath.getPointAt(ease, tmpP);
    diveLook.getPointAt(ease, tmpL);
    const par = 1 - ease;
    tmpP.x += state.sx * 0.12 * par;
    tmpP.y += state.sy * 0.06 * par;
    camera.position.copy(tmpP);
    camera.lookAt(tmpL);
    camera.fov = 36 - ease * 6;
    camera.updateProjectionMatrix();
    screenUniforms.uMix.value = THREE.MathUtils.smoothstep(d, 0.55, 0.97);
    lens.uniforms.uAberr.value = 0.0015 + Math.sin(d * Math.PI) * 0.01;

    // Inside camera
    const ic = inside.camera;
    tmpP.copy(state.insideCam.pos);
    tmpP.x += state.sx * 0.8;
    tmpP.y += state.sy * 0.5;
    ic.position.lerp(tmpP, 0.06);
    insideLook.lerp(state.insideCam.look, 0.06);
    ic.lookAt(insideLook);
    if (state.inside && state.pointer) inside.setPointer(state.mx, state.my);

    const wantInside = d >= 0.985;
    if (wantInside !== state.inside) {
      state.inside = wantInside;
      renderPass.scene = wantInside ? inside.scene : room;
      renderPass.camera = wantInside ? inside.camera : camera;
      bloom.strength = wantInside ? 0.9 : 0.55;
      bloom.threshold = wantInside ? 0.15 : 0.75;
      state.flash = 1;
    }
    state.flash *= 0.9;
    lens.uniforms.uFlash.value = reduced ? 0 : state.flash * 0.55;

    if (!state.inside && d > 0.4) {
      // Render at the screen's own 4:3 aspect so the picture isn't stretched on the glass.
      const ic = inside.camera, aspect = ic.aspect, px = inside.uniforms.uPixel.value;
      ic.aspect = portalRT.width / portalRT.height;
      ic.updateProjectionMatrix();
      inside.uniforms.uPixel.value = portalRT.height * 0.5;
      renderer.setRenderTarget(portalRT);
      renderer.render(inside.scene, ic);
      renderer.setRenderTarget(null);
      ic.aspect = aspect;
      ic.updateProjectionMatrix();
      inside.uniforms.uPixel.value = px;
    }
    composer.render(dt);
  }
  renderer.setAnimationLoop(frame);

  // Phones fire resize whenever the address bar slides; ignore small height-only changes.
  let lastW = innerWidth, lastH = innerHeight, resizeTimer;
  addEventListener('resize', () => {
    if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 140) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyResize, 120);
  });
  function applyResize() {
    lastW = innerWidth; lastH = innerHeight;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    inside.resize();
  }

  return {
    state,
    stats,
    inside,
    computer,
    termTex,
    renderer,
    project(v, cam) { return v.clone().project(cam); },
    camera,
    onFrame(fn) { onFrame = fn; },
  };
}
