// Desenha os cards do Multi-View: boneco do Minecraft (textura da skin) numa pose
// + Pokémon do Cobblemon (modelos .geo.json do Bedrock) ao redor.
// Tudo é renderizado uma vez num canvas escondido e vira imagem (fica em cache no navegador).

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const VERSION = 'c3d-3';
const SIZE = 240;              // px do card (renderiza em 2x)
const D = Math.PI / 180;

/* ---------------- utilidades ---------------- */
function hash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

const texCache = new Map();
function loadTexture(url) {
  if (!texCache.has(url)) {
    texCache.set(url, new Promise((ok, fail) => {
      new THREE.TextureLoader().load(url, t => {
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
        t.generateMipmaps = false;
        t.colorSpace = THREE.SRGBColorSpace;
        ok(t);
      }, undefined, fail);
    }));
  }
  return texCache.get(url);
}
const jsonCache = new Map();
function loadJson(url) {
  if (!jsonCache.has(url)) jsonCache.set(url, fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.json(); }));
  return jsonCache.get(url);
}

// UV de caixa padrão do Minecraft/Blockbench (faces na ordem do BoxGeometry: +x, -x, +y, -y, +z, -z)
function boxUV(geo, u, v, w, h, d, tw, th, mirror = false) {
  const face = (x1, y1, x2, y2) => [[x1 / tw, 1 - y2 / th], [x2 / tw, 1 - y2 / th], [x2 / tw, 1 - y1 / th], [x1 / tw, 1 - y1 / th]];
  const top = face(u + d, v, u + w + d, v + d);
  const bottom = face(u + w + d, v, u + w * 2 + d, v + d);
  let left = face(u, v + d, u + d, v + d + h);
  const front = face(u + d, v + d, u + w + d, v + d + h);
  let right = face(u + w + d, v + d, u + w + d * 2, v + h + d);
  const back = face(u + w + d * 2, v + d, u + w * 2 + d * 2, v + h + d);
  const order = q => [q[3], q[2], q[0], q[1]];
  let faces = [order(right), order(left), order(top), [bottom[0], bottom[1], bottom[3], bottom[2]], order(front), order(back)];
  if (mirror) {
    const flip = f => [f[1], f[0], f[3], f[2]];
    faces = [flip(faces[1]), flip(faces[0]), flip(faces[2]), flip(faces[3]), flip(faces[4]), flip(faces[5])];
  }
  geo.attributes.uv.set(new Float32Array(faces.flat(2)));
  geo.attributes.uv.needsUpdate = true;
}

/* ---------------- boneco do Minecraft ---------------- */
function material(tex, overlay) {
  return new THREE.MeshLambertMaterial({ map: tex, transparent: overlay, alphaTest: overlay ? 0.1 : 0.5, side: overlay ? THREE.DoubleSide : THREE.FrontSide });
}
function boxPart(tex, [w, h, d], uv, ouv, legacyMirror) {
  const g = new THREE.Group();
  const tw = 64, th = tex.image.height === 32 ? 32 : 64;
  const inner = new THREE.BoxGeometry(w, h, d);
  boxUV(inner, uv[0], uv[1], w, h, d, tw, th, legacyMirror);
  g.add(new THREE.Mesh(inner, material(tex, false)));
  if (ouv && th === 64) {
    const s = 0.5;
    const outer = new THREE.BoxGeometry(w + s * 2, h + s * 2, d + s * 2);
    boxUV(outer, ouv[0], ouv[1], w, h, d, tw, th);
    g.add(new THREE.Mesh(outer, material(tex, true)));
  }
  return g;
}

function buildPlayer(tex, slim) {
  const legacy = tex.image.height === 32;
  const aw = slim ? 3 : 4;
  const root = new THREE.Group();

  // cada membro fica dentro de um "pivô" (ombro, quadril, pescoço) pra poder girar
  const pivot = (x, y, z, part, ox, oy, oz) => { const p = new THREE.Group(); p.position.set(x, y, z); part.position.set(ox, oy, oz); p.add(part); root.add(p); return p; };

  const body = boxPart(tex, [8, 12, 4], [16, 16], [16, 32]);
  const head = boxPart(tex, [8, 8, 8], [0, 0], [32, 0]);
  const rArm = boxPart(tex, [aw, 12, 4], [40, 16], [40, 32]);
  const lArm = legacy ? boxPart(tex, [aw, 12, 4], [40, 16], null, true) : boxPart(tex, [aw, 12, 4], [32, 48], [48, 48]);
  const rLeg = boxPart(tex, [4, 12, 4], [0, 16], [0, 32]);
  const lLeg = legacy ? boxPart(tex, [4, 12, 4], [0, 16], null, true) : boxPart(tex, [4, 12, 4], [16, 48], [0, 48]);

  const parts = {
    body: pivot(0, 12, 0, body, 0, 6, 0),
    head: pivot(0, 24, 0, head, 0, 4, 0),
    rightArm: pivot(-(4 + aw / 2), 22, 0, rArm, 0, -4, 0),
    leftArm: pivot(4 + aw / 2, 22, 0, lArm, 0, -4, 0),
    rightLeg: pivot(-2, 12, 0, rLeg, 0, -6, 0),
    leftLeg: pivot(2, 12, 0, lLeg, 0, -6, 0),
  };
  return { root, parts };
}

// poses: rotações em graus [x, y, z] de cada parte; y = deslocamento do corpo inteiro
const POSES = {
  acenando:    { rightArm: [0, 0, -150], leftArm: [0, 0, 6], head: [-6, -6, 6] },
  comemorando: { rightArm: [0, 0, -160], leftArm: [0, 0, 160], head: [-14, 0, 0], rightLeg: [0, 0, -4], leftLeg: [0, 0, 4] },
  sentado:     { y: -10, rightLeg: [-90, 10, 0], leftLeg: [-90, -10, 0], rightArm: [-30, 0, 4], leftArm: [-30, 0, -4], head: [8, 4, 0] },
  andando:     { rightArm: [40, 0, 0], leftArm: [-40, 0, 0], rightLeg: [-35, 0, 0], leftLeg: [35, 0, 0], head: [0, 6, 0] },
  apontando:   { rightArm: [-90, 0, 0], leftArm: [10, 0, 6], head: [0, -5, 0] },
  pensando:    { rightArm: [-120, 30, 20], leftArm: [-40, -20, 0], head: [10, -6, -8] },
  relaxando:   { rightArm: [0, 0, -20], leftArm: [0, 0, 20], head: [-10, 8, 8], rightLeg: [0, 0, -6], leftLeg: [0, 0, 6] },
};
const POSE_NAMES = Object.keys(POSES);
function applyPose(player, name) {
  const pose = POSES[name];
  for (const [k, part] of Object.entries(player.parts)) {
    const r = pose[k] || [0, 0, 0];
    part.rotation.set(r[0] * D, r[1] * D, r[2] * D);
  }
  player.root.position.y = pose.y || 0;
}

/* ---------------- Pokémon do Cobblemon (geometria Bedrock) ---------------- */
// molang bem simplificado (só pra pegar o quadro 0 da animação parada)
function molang(v) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return 0;
  const expr = v.toLowerCase()
    .replace(/(query|q|variable|v|temp|t|context|c)\.[a-z_0-9.]+/g, '0')
    .replace(/math\.(sin|cos)\(/g, (m, f) => `${f}d(`)
    .replace(/math\.(abs|floor|ceil|round|sqrt|min|max|pow)\(/g, (m, f) => `Math.${f}(`)
    .replace(/math\.pi/g, 'Math.PI')
    .replace(/math\.clamp\(/g, 'clamp(')
    .replace(/math\.lerp\(/g, 'lerp(');
  if (!/^[\d\s+\-*/().,a-zA-Z_?:<>=!&|]*$/.test(expr)) return 0;
  try {
    // eslint-disable-next-line no-new-func
    const r = Function('sind', 'cosd', 'clamp', 'lerp', `return (${expr});`)(
      x => Math.sin(x * D), x => Math.cos(x * D), (x, a, b) => Math.min(Math.max(x, a), b), (a, b, t) => a + (b - a) * t);
    return Number.isFinite(r) ? r : 0;
  } catch { return 0; }
}
function frame0(ch) {
  if (ch == null) return null;
  let v = ch;
  if (!Array.isArray(v) && typeof v === 'object') {
    const keys = Object.keys(v).sort((a, b) => parseFloat(a) - parseFloat(b));
    v = v[keys[0]];
    if (v && !Array.isArray(v) && typeof v === 'object') v = v.post || v.pre || v.vector || null;
  }
  if (v == null) return null;
  if (!Array.isArray(v)) { const n = molang(v); return [n, n, n]; }
  return v.map(molang);
}

function buildGeo(geoJson, tex, idle) {
  const geo = (geoJson['minecraft:geometry'] || [])[0];
  const tw = geo.description.texture_width || 64, th = geo.description.texture_height || 64;
  const anim = (idle && idle.bones) || {};
  const groups = new Map();
  const root = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });

  for (const b of geo.bones || []) {
    const g = new THREE.Group();
    g.name = b.name;
    const pv = b.pivot || [0, 0, 0];
    g.userData.pivot = [-pv[0], pv[1], pv[2]];
    const r = b.rotation || [0, 0, 0];
    g.rotation.order = 'ZYX';
    g.rotation.set(-r[0] * D, -r[1] * D, r[2] * D);

    // quadro 0 da animação parada (esconde bocas/olhos extras com escala 0)
    const a = anim[b.name];
    if (a) {
      const ar = frame0(a.rotation), ap = frame0(a.position), as = frame0(a.scale);
      if (ar) g.rotation.set(g.rotation.x - ar[0] * D, g.rotation.y - ar[1] * D, g.rotation.z + ar[2] * D);
      if (ap) g.userData.offset = [-ap[0], ap[1], ap[2]];
      if (as) g.scale.set(as[0] || 1e-4, as[1] || 1e-4, as[2] || 1e-4);
    }
    if (/^locator|hitbox|seat|saddle|item_|_item$/.test(b.name)) g.visible = false;

    for (const c of b.cubes || []) {
      const [ox, oy, oz] = c.origin, [sx, sy, sz] = c.size;
      const inf = c.inflate || 0;
      const box = new THREE.BoxGeometry(Math.max(sx + inf * 2, 0.001), Math.max(sy + inf * 2, 0.001), Math.max(sz + inf * 2, 0.001));
      if (Array.isArray(c.uv)) bbBoxUV(box, c.uv[0], c.uv[1], sx, sy, sz, tw, th, !!c.mirror);
      else if (c.uv) bbFaceUV(box, c.uv, tw, th);
      const mesh = new THREE.Mesh(box, mat);
      const center = [-(ox + sx / 2), oy + sy / 2, oz + sz / 2];
      if (c.rotation) {
        const cp = c.pivot || [0, 0, 0];
        const holder = new THREE.Group();
        holder.userData.pivot = [-cp[0], cp[1], cp[2]];
        holder.rotation.order = 'ZYX';
        holder.rotation.set(-c.rotation[0] * D, -c.rotation[1] * D, c.rotation[2] * D);
        holder.userData.cube = { mesh, center };
        g.add(holder);
      } else {
        mesh.userData.center = center;
        g.add(mesh);
      }
    }
    groups.set(b.name, { g, parent: b.parent });
  }
  // monta a hierarquia e converte posições absolutas em relativas ao pivô do pai
  for (const { g, parent } of groups.values()) {
    const p = parent && groups.get(parent);
    const pp = p ? p.g.userData.pivot : [0, 0, 0];
    const off = g.userData.offset || [0, 0, 0];
    g.position.set(g.userData.pivot[0] - pp[0] + off[0], g.userData.pivot[1] - pp[1] + off[1], g.userData.pivot[2] - pp[2] + off[2]);
    (p ? p.g : root).add(g);
  }
  for (const { g } of groups.values()) {
    const piv = g.userData.pivot;
    for (const ch of g.children) {
      if (ch.isMesh && ch.userData.center) {
        const c = ch.userData.center; ch.position.set(c[0] - piv[0], c[1] - piv[1], c[2] - piv[2]);
      } else if (ch.userData.cube) {
        const hp = ch.userData.pivot, { mesh, center } = ch.userData.cube;
        ch.position.set(hp[0] - piv[0], hp[1] - piv[1], hp[2] - piv[2]);
        mesh.position.set(center[0] - hp[0], center[1] - hp[1], center[2] - hp[2]);
        ch.add(mesh);
      }
    }
  }
  return root;
}
// ---- UV dos modelos Bedrock, seguindo as regras do Blockbench ----
// Espaço do three = espaço do Blockbench (x do Bedrock invertido): east = +x, west = -x, north = -z, south = +z.
// Cada face recebe um retângulo da textura; flipX/flipY espelham o retângulo.
// Ordem das faces no BoxGeometry: +x, -x, +y, -y, +z, -z; vértices de cada face: TL, TR, BL, BR.
const FACE_ORDER = ['east', 'west', 'up', 'down', 'south', 'north'];
function setFaces(box, rects, tw, th) {
  const out = [];
  for (const k of FACE_ORDER) {
    const r = rects[k];
    if (!r) { out.push(0, 0, 0, 0, 0, 0, 0, 0); continue; }
    let x1 = r.x, x2 = r.x + r.w, y1 = r.y, y2 = r.y + r.h;
    if (r.fx) [x1, x2] = [x2, x1];
    if (r.fy) [y1, y2] = [y2, y1];
    const U = x => x / tw, V = y => 1 - y / th;
    out.push(U(x1), V(y1), U(x2), V(y1), U(x1), V(y2), U(x2), V(y2));
  }
  box.attributes.uv.set(new Float32Array(out));
  box.attributes.uv.needsUpdate = true;
}
function bbBoxUV(box, u, v, w, h, d, tw, th, mirror) {
  const r = {
    east:  { x: u,             y: v + d, w: d, h },
    north: { x: u + d,         y: v + d, w, h },
    west:  { x: u + d + w,     y: v + d, w: d, h },
    south: { x: u + d * 2 + w, y: v + d, w, h },
    up:    { x: u + d,         y: v,     w, h: d, fx: true, fy: true },
    down:  { x: u + d + w,     y: v,     w, h: d, fx: true },
  };
  if (mirror) {
    [r.east, r.west] = [r.west, r.east];
    for (const k in r) r[k].fx = !r[k].fx;
  }
  setFaces(box, r, tw, th);
}
function bbFaceUV(box, uv, tw, th) {
  const r = {};
  for (const k of FACE_ORDER) {
    const f = uv[k];
    if (!f || !f.uv) continue;
    let [x, y] = f.uv, [w, h] = f.uv_size || [0, 0];
    const fx = w < 0, fy = h < 0;
    if (fx) { x += w; w = -w; }
    if (fy) { y += h; h = -h; }
    // no Bedrock as faces de cima/baixo vêm de ponta-cabeça em relação ao Blockbench
    const up = k === 'up', down = k === 'down';
    r[k] = { x, y, w, h, fx: up || down ? !fx : fx, fy: up ? !fy : fy };
  }
  setFaces(box, r, tw, th);
}

let POKE_DIR = 'pokemon/';
export function setPokemonDir(d) { POKE_DIR = d; }   // só pra testes

async function buildPokemon(base, sp) {
  const [geo, tex, idle] = await Promise.all([
    loadJson(`${base}${POKE_DIR}${sp}/model.geo.json`),
    loadTexture(`${base}${POKE_DIR}${sp}/texture.png`),
    loadJson(`${base}${POKE_DIR}${sp}/idle.json`).catch(() => null),
  ]);
  const model = buildGeo(geo, tex, idle);
  // normaliza o tamanho: altura parecida pra todos, apoiados no chão
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const k = Math.min(16 / Math.max(size.y, 0.01), 20 / Math.max(size.x, size.z, 0.01));
  const wrap = new THREE.Group();
  model.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  wrap.add(model);
  wrap.scale.setScalar(k);
  return wrap;
}

/* ---------------- cena e fila de renderização ---------------- */
let renderer, camera, scene;
function setup() {
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(2);
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-20, 40, 30);
  scene.add(sun);
  camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
  camera.position.set(0, 26, 92);
  camera.lookAt(0, 15, 0);
}

async function render(pov, base) {
  if (!renderer) setup();
  const holder = new THREE.Group();
  const seed = hash(pov.mc || pov.name);
  const side = seed & 1 ? 1 : -1;            // Pokémon à direita ou à esquerda
  const sp = (pov.pokemon || [])[0];
  if (pov.skin) {
    const tex = await loadTexture(base + pov.skin + (pov.skinV ? `?v=${pov.skinV}` : ''));
    const player = buildPlayer(tex, !!pov.slim);
    applyPose(player, POSE_NAMES[(seed >>> 1) % POSE_NAMES.length]);
    // de frente pra câmera, só uma leve virada pro lado do Pokémon
    player.root.rotation.y = side * 8 * D;
    player.root.position.x = sp ? -side * 6 : 0;
    holder.add(player.root);
  }
  const m = sp && await buildPokemon(base, sp).catch(() => null);
  if (m) {
    m.position.set(pov.skin ? side * 13 : 0, 0, 7);
    // os modelos do Cobblemon olham pro -z; gira pra ficar de três-quartos, virado pro boneco
    m.rotation.y = (180 - side * 30) * D;
    if (!pov.skin) m.scale.multiplyScalar(1.6);
    holder.add(m);
  }
  scene.add(holder);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/webp', 0.92);
  scene.remove(holder);
  holder.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  return url;
}

let queue = Promise.resolve();
const memo = new Map();
// devolve a imagem do card (dataURL), com cache no navegador
export function cardImage(pov, base = '') {
  const key = `${VERSION}|${pov.mc || pov.name}|${pov.skinV || ''}|${pov.slim ? 's' : ''}|${(pov.pokemon || []).join(',')}`;
  if (memo.has(key)) return memo.get(key);
  let cached = null;
  try { cached = localStorage.getItem('card:' + key); } catch {}
  let p;
  if (cached) p = Promise.resolve(cached);
  else {
    p = queue.then(() => render(pov, base)).then(url => {
      try { localStorage.setItem('card:' + key, url); }
      catch { cleanup(); try { localStorage.setItem('card:' + key, url); } catch {} }
      return url;
    });
    queue = p.catch(() => {});   // um card com erro não trava os outros
  }
  memo.set(key, p);
  return p;
}
// sem espaço no navegador: apaga as imagens de versões antigas
function cleanup() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('card:') && !k.startsWith(`card:${VERSION}|`)) localStorage.removeItem(k);
    }
  } catch {}
}

// só pra testes: um Pokémon sozinho, grande e de frente
export async function debugPokemon(sp, yaw = 0) {
  if (!renderer) setup();
  const m = await buildPokemon('', sp);
  m.rotation.y = (180 + yaw) * D;
  m.position.set(0, 9, 45);
  scene.add(m);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(m);
  return url;
}
