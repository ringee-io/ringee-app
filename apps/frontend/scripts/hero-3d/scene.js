/**
 * The hero render: a Ringee teammate on a headset and a Ringee AI voice agent,
 * modelled, lit and shot as one scene.
 *
 * This is a build-time tool, not application code — nothing here ships to the
 * browser. `render.sh` opens it in headless Chrome, screenshots the canvas on
 * a transparent background, and writes the cropped WebP that
 * `human-ai-calling.tsx` imports. See docs/engineering/MARKETING_VISUALS.md
 * for the why and the full recipe.
 *
 * Shots: `?shot=pair` (the one the hero uses), `?shot=human`, `?shot=robot`.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || 'pair';
const W = Number(params.get('w') || 1300);
const H = Number(params.get('h') || 950);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(W, H, false);
renderer.setPixelRatio(2);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const canvas = renderer.domElement;
canvas.style.width = W + 'px';
canvas.style.height = H + 'px';
document.body.appendChild(canvas);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.42;

const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);

/* ---------------------------------------------------------------- lights */
const key = new THREE.DirectionalLight(0xfff4e6, 4.1);
key.position.set(2.4, 7.8, 3.1);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.radius = 5;
key.shadow.bias = -0.0012;
const c = key.shadow.camera;
c.near = 1;
c.far = 26;
c.left = -7;
c.right = 7;
c.top = 7;
c.bottom = -5;
scene.add(key);

const top = new THREE.DirectionalLight(0xffffff, 1.1);
top.position.set(0.4, 9, 0.8);
top.castShadow = true;
top.shadow.mapSize.set(2048, 2048);
top.shadow.radius = 6;
top.shadow.bias = -0.0016;
const tc = top.shadow.camera;
tc.near = 2;
tc.far = 16;
tc.left = -4.5;
tc.right = 4.5;
tc.top = 4.5;
tc.bottom = -4.5;
scene.add(top);

const fill = new THREE.DirectionalLight(0x7dd3fc, 1.0);
fill.position.set(-6.5, 3.4, 4.5);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xc4b5fd, 1.7);
rim.position.set(-3.5, 4.6, -6.5);
scene.add(rim);

const rim2 = new THREE.DirectionalLight(0x5eead4, 1.15);
rim2.position.set(5.5, 3.2, -5.5);
scene.add(rim2);

scene.add(new THREE.HemisphereLight(0xbcd9f5, 0x04070d, 0.32));

// One accent spot per operator: the human is lit cyan, the agent violet, so
// the two sides of the stack separate before any label is read.
const humanSpot = new THREE.PointLight(0x38bdf8, 9, 7, 2);
humanSpot.position.set(-2.7, 3.4, 2.0);
scene.add(humanSpot);
const agentSpot = new THREE.PointLight(0x8b5cf6, 10, 7, 2);
agentSpot.position.set(2.8, 3.6, 1.8);
scene.add(agentSpot);

const uplight = new THREE.PointLight(0x10b981, 9, 7, 2);
uplight.position.set(0, 0.75, 1.1);
scene.add(uplight);

/* ------------------------------------------------------------ materials */
const M = {
  skin: new THREE.MeshPhysicalMaterial({
    color: 0xdf9d72,
    roughness: 0.66,
    clearcoat: 0.12,
    clearcoatRoughness: 0.8,
    sheen: 0.35,
    sheenColor: 0xffc9a6
  }),
  hair: new THREE.MeshPhysicalMaterial({
    color: 0x30201a,
    roughness: 0.5,
    clearcoat: 0.35,
    clearcoatRoughness: 0.5
  }),
  shirt: new THREE.MeshPhysicalMaterial({
    color: 0x2a4a6e,
    roughness: 0.8,
    sheen: 0.7,
    sheenColor: 0x6fa8d6
  }),
  collar: new THREE.MeshPhysicalMaterial({ color: 0x1f3c5c, roughness: 0.72 }),
  pants: new THREE.MeshPhysicalMaterial({ color: 0x17223a, roughness: 0.82 }),
  shoe: new THREE.MeshPhysicalMaterial({
    color: 0x0b1220,
    roughness: 0.45,
    clearcoat: 0.7
  }),
  eye: new THREE.MeshPhysicalMaterial({
    color: 0x15202e,
    roughness: 0.12,
    clearcoat: 1
  }),
  sclera: new THREE.MeshPhysicalMaterial({ color: 0xf6f2ee, roughness: 0.3 }),
  mouth: new THREE.MeshPhysicalMaterial({ color: 0xb5715a, roughness: 0.5 }),
  headsetDark: new THREE.MeshPhysicalMaterial({
    color: 0x222b3a,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.1
  }),
  headsetPad: new THREE.MeshPhysicalMaterial({
    color: 0x39465c,
    roughness: 0.85
  }),
  white: new THREE.MeshPhysicalMaterial({
    color: 0xeef3fa,
    roughness: 0.26,
    clearcoat: 1,
    clearcoatRoughness: 0.06
  }),
  shell: new THREE.MeshPhysicalMaterial({
    color: 0xe4eaf4,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.1
  }),
  metal: new THREE.MeshPhysicalMaterial({
    color: 0x8e9cb0,
    metalness: 0.96,
    roughness: 0.26
  }),
  darkMetal: new THREE.MeshPhysicalMaterial({
    color: 0x39445a,
    metalness: 0.6,
    roughness: 0.45
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x070b14,
    roughness: 0.05,
    metalness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.03
  }),
  violet: new THREE.MeshStandardMaterial({
    color: 0x241147,
    emissive: 0x8b5cf6,
    emissiveIntensity: 1.9,
    roughness: 0.3
  }),
  cyan: new THREE.MeshStandardMaterial({
    color: 0x083344,
    emissive: 0x67e8f9,
    emissiveIntensity: 3.4,
    roughness: 0.3
  }),
  emerald: new THREE.MeshStandardMaterial({
    color: 0x03261c,
    emissive: 0x10b981,
    emissiveIntensity: 2.6,
    roughness: 0.35
  }),
  slab: new THREE.MeshPhysicalMaterial({
    color: 0x0c1422,
    metalness: 0.75,
    roughness: 0.3,
    clearcoat: 0.7
  }),
  slabTop: new THREE.MeshPhysicalMaterial({
    color: 0x131e33,
    metalness: 0.12,
    roughness: 0.5
  })
};

function add(parent, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const G = {
  cap: (r, l) => new THREE.CapsuleGeometry(r, l, 10, 28),
  sph: (r) => new THREE.SphereGeometry(r, 44, 34),
  cyl: (rt, rb, h) => new THREE.CylinderGeometry(rt, rb, h, 48),
  box: (w, h, d, r = 0.08) => new RoundedBoxGeometry(w, h, d, 6, r),
  tor: (r, t, arc) => new THREE.TorusGeometry(r, t, 16, 64, arc)
};

/* Contact shadow — a radial falloff in a shader. A CanvasTexture-based decal
   uploaded as fully transparent in this headless renderer, and grounding is
   not optional: without it both figures read as stickers on the deck. */
function contactShadow(radius, opacity) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uOpacity: { value: opacity } },
    vertexShader:
      'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'varying vec2 vUv; uniform float uOpacity; void main(){ float d = distance(vUv, vec2(0.5)) * 2.0; float a = 1.0 - smoothstep(0.0, 1.0, d); a = pow(a, 1.35); gl_FragColor = vec4(0.0, 0.004, 0.018, a * uOpacity); }'
  });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    mat
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 3;
  return m;
}

/* ------------------------------------------------------------- platform */
function buildPlatform() {
  const g = new THREE.Group();
  add(g, G.cyl(2.5, 2.62, 0.14), M.slab, [0, 0.07, 0]);
  add(g, G.cyl(2.38, 2.46, 0.08), M.darkMetal, [0, 0.18, 0]);
  add(g, G.cyl(2.34, 2.38, 0.14), M.slabTop, [0, 0.29, 0]);
  // A real planar reflection on the deck. Nothing sells a render like the
  // figures standing in their own reflection.
  const mirror = new Reflector(new THREE.CircleGeometry(2.33, 96), {
    textureWidth: 2048,
    textureHeight: 2048,
    color: 0x25344a
  });
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.y = 0.362;
  mirror.material.blending = THREE.AdditiveBlending;
  mirror.material.depthWrite = false;
  mirror.renderOrder = 1;
  g.add(mirror);
  add(g, G.tor(2.35, 0.013), M.emerald, [0, 0.36, 0], [Math.PI / 2, 0, 0]);
  add(g, G.tor(2.44, 0.008), M.emerald, [0, 0.17, 0], [Math.PI / 2, 0, 0]);
  return g;
}

/* ----------------------------------------------------------------- human
   Five heads tall, not four: the first pass read as a mascot. Proportion is
   the whole difference between a toy and a person in this style. */
function buildHuman() {
  const g = new THREE.Group();
  const SKIN = M.skin;

  // shoes + legs
  for (const s of [-1, 1]) {
    add(g, G.box(0.24, 0.13, 0.42, 0.055), M.shoe, [s * 0.17, 0.065, 0.06]);
    add(g, G.cap(0.115, 0.78), M.pants, [s * 0.17, 0.63, 0]);
  }
  add(
    g,
    G.cap(0.245, 0.16),
    M.pants,
    [0, 1.3, 0],
    [0, 0, Math.PI / 2],
    [1, 1, 0.76]
  );

  // torso
  add(g, G.cap(0.3, 0.54), M.shirt, [0, 1.76, 0], [0, 0, 0], [1.02, 1, 0.7]);
  for (const s of [-1, 1])
    add(
      g,
      G.sph(0.185),
      M.shirt,
      [s * 0.32, 2.1, 0],
      [0, 0, 0],
      [1, 0.95, 0.86]
    );
  add(
    g,
    G.tor(0.15, 0.045),
    M.collar,
    [0, 2.2, 0],
    [Math.PI / 2, 0, 0],
    [1, 0.85, 1]
  );

  // arms
  for (const s of [-1, 1]) {
    add(g, G.cap(0.105, 0.4), M.shirt, [s * 0.42, 1.88, 0], [0, 0, s * -0.1]);
    add(g, G.sph(0.1), M.shirt, [s * 0.47, 1.62, 0]);
    add(
      g,
      G.cap(0.086, 0.34),
      M.skin,
      [s * 0.49, 1.4, 0.02],
      [0.1, 0, s * -0.03]
    );
    add(
      g,
      G.sph(0.088),
      M.skin,
      [s * 0.5, 1.18, 0.05],
      [0, 0, 0],
      [0.82, 1.3, 0.62]
    );
  }

  // neck + head (head is ~0.62 tall against a 3.05 figure)
  add(g, G.cyl(0.105, 0.12, 0.2), M.skin, [0, 2.3, 0]);
  add(g, G.sph(0.285), SKIN, [0, 2.63, 0], [0, 0, 0], [0.96, 1.08, 0.95]);
  add(g, G.sph(0.224), SKIN, [0, 2.545, 0.025], [0, 0, 0], [0.95, 0.82, 1.0]);
  for (const s of [-1, 1])
    add(
      g,
      G.sph(0.062),
      SKIN,
      [s * 0.29, 2.61, 0.01],
      [0, 0, 0],
      [0.55, 1.1, 0.9]
    );
  add(g, G.sph(0.042), SKIN, [0, 2.57, 0.285], [0, 0, 0], [0.9, 0.95, 1.2]);

  // hair
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.307, 44, 34, 0, Math.PI * 2, 0, Math.PI * 0.45),
    M.hair
  );
  hair.position.set(0, 2.625, -0.008);
  hair.scale.set(1.0, 1.06, 1.0);
  hair.castShadow = true;
  g.add(hair);
  add(g, G.sph(0.265), M.hair, [0, 2.6, -0.115], [0, 0, 0], [1.06, 1.05, 0.72]);
  add(
    g,
    G.sph(0.152),
    M.hair,
    [0.075, 2.765, 0.15],
    [0, 0, 0.28],
    [1.25, 0.42, 0.82]
  );
  for (const s of [-1, 1])
    add(
      g,
      G.sph(0.115),
      M.hair,
      [s * 0.262, 2.68, 0.015],
      [0, 0, 0],
      [0.5, 1.1, 1.0]
    );

  // face: almond eyes, soft brows, no drawn mouth
  for (const s of [-1, 1]) {
    add(
      g,
      G.sph(0.046),
      M.sclera,
      [s * 0.112, 2.625, 0.248],
      [0, 0, 0],
      [1.15, 0.92, 0.5]
    );
    add(
      g,
      G.sph(0.026),
      M.eye,
      [s * 0.115, 2.622, 0.272],
      [0, 0, 0],
      [1, 1, 0.6]
    );
    add(
      g,
      G.box(0.086, 0.02, 0.026, 0.009),
      M.hair,
      [s * 0.115, 2.695, 0.255],
      [0, 0, s * 0.14]
    );
  }
  add(
    g,
    G.tor(0.042, 0.0085, Math.PI * 0.62),
    M.mouth,
    [0, 2.495, 0.253],
    [Math.PI * 0.05, 0, Math.PI * 1.19]
  );

  // lanyard + badge
  for (const s of [-1, 1]) {
    add(
      g,
      G.box(0.018, 0.34, 0.018, 0.007),
      M.headsetDark,
      [s * 0.125, 2.06, 0.16],
      [0.1, 0, s * 0.16]
    );
  }
  add(
    g,
    G.box(0.14, 0.19, 0.026, 0.018),
    M.emerald,
    [0, 1.83, 0.21],
    [0.12, 0, 0.03]
  );

  // headset
  add(
    g,
    G.tor(0.328, 0.021, Math.PI * 0.86),
    M.headsetDark,
    [0, 2.62, -0.04],
    [0.12, 0, Math.PI * 0.07],
    [1, 1.05, 1]
  );
  add(
    g,
    G.tor(0.328, 0.012, Math.PI * 0.7),
    M.headsetPad,
    [0, 2.62, -0.04],
    [0.12, 0, Math.PI * 0.15],
    [0.97, 1.01, 1]
  );
  for (const s of [-1, 1]) {
    add(
      g,
      G.cyl(0.088, 0.094, 0.078),
      M.headsetDark,
      [s * 0.325, 2.59, -0.008],
      [0, 0, Math.PI / 2]
    );
    add(
      g,
      G.cyl(0.07, 0.07, 0.022),
      M.headsetPad,
      [s * 0.365, 2.59, -0.008],
      [0, 0, Math.PI / 2]
    );
  }
  const boom = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.34, 2.55, 0.015),
    new THREE.Vector3(-0.32, 2.45, 0.18),
    new THREE.Vector3(-0.22, 2.42, 0.3),
    new THREE.Vector3(-0.11, 2.47, 0.34)
  ]);
  add(g, new THREE.TubeGeometry(boom, 48, 0.014, 12, false), M.headsetDark);
  add(
    g,
    G.cap(0.029, 0.035),
    M.headsetDark,
    [-0.1, 2.48, 0.35],
    [Math.PI / 2, 0, 0.3]
  );
  add(g, G.sph(0.013), M.cyan, [-0.075, 2.49, 0.365]);
  add(g, G.sph(0.015), M.cyan, [-0.385, 2.65, 0.025]);

  return g;
}

/* ----------------------------------------------------------------- robot
   Same height class as the human and the same restraint: a product, not a
   mascot. Panel gaps, a glass visor, one violet accent. */
function buildRobot() {
  const g = new THREE.Group();

  // feet + legs
  for (const s of [-1, 1]) {
    add(g, G.box(0.27, 0.14, 0.44, 0.055), M.darkMetal, [s * 0.19, 0.07, 0.05]);
    add(g, G.cap(0.098, 0.62), M.metal, [s * 0.19, 0.5, 0]);
    add(
      g,
      G.sph(0.13),
      M.darkMetal,
      [s * 0.19, 0.94, 0],
      [0, 0, 0],
      [1, 0.9, 1]
    );
  }
  add(g, G.box(0.58, 0.16, 0.42, 0.06), M.darkMetal, [0, 1.16, 0]);

  // torso
  add(g, G.box(0.82, 0.92, 0.58, 0.22), M.shell, [0, 1.72, 0]);
  add(g, G.box(0.72, 0.05, 0.5, 0.02), M.darkMetal, [0, 1.5, 0]);
  add(g, G.box(0.38, 0.24, 0.05, 0.08), M.glass, [0, 1.86, 0.3]);
  add(g, G.box(0.28, 0.13, 0.03, 0.05), M.violet, [0, 1.86, 0.32]);

  // shoulders + arms
  for (const s of [-1, 1]) {
    add(g, G.sph(0.165), M.darkMetal, [s * 0.47, 2.06, 0]);
    add(g, G.cap(0.105, 0.32), M.shell, [s * 0.51, 1.82, 0], [0, 0, s * -0.1]);
    add(g, G.sph(0.105), M.darkMetal, [s * 0.55, 1.55, 0]);
    add(
      g,
      G.cap(0.095, 0.3),
      M.shell,
      [s * 0.57, 1.33, 0.02],
      [0.1, 0, s * -0.03]
    );
    add(g, G.box(0.17, 0.2, 0.13, 0.05), M.metal, [s * 0.58, 1.11, 0.04]);
  }

  // neck + head
  add(g, G.cyl(0.115, 0.13, 0.14), M.darkMetal, [0, 2.24, 0]);
  add(g, G.box(0.84, 0.66, 0.62, 0.24), M.white, [0, 2.62, 0]);
  add(g, G.box(0.66, 0.36, 0.1, 0.15), M.glass, [0, 2.63, 0.29]);
  for (const s of [-1, 1])
    add(g, G.box(0.12, 0.12, 0.04, 0.05), M.violet, [s * 0.145, 2.64, 0.33]);
  for (const s of [-1, 1]) {
    add(
      g,
      G.cyl(0.13, 0.13, 0.09),
      M.metal,
      [s * 0.44, 2.6, 0],
      [0, 0, Math.PI / 2]
    );
    add(
      g,
      G.tor(0.09, 0.014),
      M.violet,
      [s * 0.485, 2.6, 0],
      [0, Math.PI / 2, 0]
    );
  }
  add(g, G.box(0.7, 0.04, 0.035, 0.015), M.darkMetal, [0, 2.86, 0.29]);
  add(g, G.cyl(0.02, 0.024, 0.28), M.metal, [0.17, 3.06, 0], [0, 0, -0.12]);
  const bulb = add(g, G.sph(0.058), M.violet, [0.15, 3.22, 0]);
  const bulbLight = new THREE.PointLight(0xa78bfa, 2.6, 3.2, 2);
  bulbLight.position.copy(bulb.position);
  g.add(bulbLight);

  return g;
}

/* ----------------------------------------------------------------- build */
const stage = new THREE.Group();
scene.add(stage);

const shadowFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.ShadowMaterial({ opacity: 0.62, color: 0x000510 })
);
shadowFloor.rotation.x = -Math.PI / 2;
shadowFloor.receiveShadow = true;
scene.add(shadowFloor);

if (SHOT === 'pair') {
  const platform = buildPlatform();
  stage.add(platform);
  const hs = contactShadow(0.72, 0.95);
  hs.position.set(-0.98, 0.375, 0.0);
  hs.scale.set(1, 0.72, 1);
  stage.add(hs);
  const rs = contactShadow(0.7, 0.95);
  rs.position.set(1.0, 0.375, -0.02);
  rs.scale.set(1, 0.72, 1);
  stage.add(rs);
  const human = buildHuman();
  human.position.set(-0.98, 0.365, 0.14);
  human.rotation.y = 0.36;
  stage.add(human);
  const robot = buildRobot();
  robot.position.set(1.0, 0.365, 0.08);
  robot.rotation.y = -0.36;
  robot.scale.setScalar(0.97);
  stage.add(robot);
  camera.position.set(0.42, 2.62, 5.7);
  camera.lookAt(0, 2.3, 0);
} else if (SHOT === 'human') {
  const human = buildHuman();
  human.rotation.y = 0.34;
  stage.add(human);
  camera.position.set(0.55, 2.7, 7.0);
  camera.lookAt(0, 1.9, 0);
} else {
  const robot = buildRobot();
  robot.rotation.y = -0.3;
  stage.add(robot);
  camera.position.set(-0.55, 2.8, 7.2);
  camera.lookAt(0, 1.95, 0);
}

renderer.render(scene, camera);
document.body.dataset.rendered = '1';
