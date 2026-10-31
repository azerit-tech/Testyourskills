// Le monde de la plongée (SPEC §17.4) : le ciel de l'heure bleue, les nuages,
// la mer, la côte en néons et la tour du dev. Repère : le sol de l'open space à
// y = 0, la baie du dev à z = WIN_Z, la mer vers -z, la rue en bas à y = -GROUND.
// Tant que le chantier B1 n'a pas livré city.glb, sky.webp et les palmiers, un
// remplaçant procédural tient la place : blocs extrudés aux fenêtres allumées,
// ciel en dégradé, mer qui reflète le ciel. Quand les fichiers sont là, ils
// prennent la place (le GLB a son origine à la baie du dev, y en haut, z vers
// la mer ; son nœud `dev_window` marque la baie).
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { makeGlowTexture } from "./textures";

/** Altitude de l'étage du dev au-dessus de la rue (20e étage). */
export const GROUND = 70;
export const PINK = "#ff3fa4";
export const CYAN = "#3fd8ff";
export const ORANGE = "#ff7a3d";
export const VIOLET = "#7b3fe4";

export interface WorldAssets {
  sky?: THREE.Texture;
  city?: GLTF;
  palm?: GLTF;
  /** L'ancien panorama cylindrique, en horizon lointain quand il n'y a pas de GLB. */
  skyline?: THREE.Texture;
}

export interface World {
  group: THREE.Group;
  /** Carte d'environnement du ciel (reflets de la mer, de la tour, du verre). */
  environment: THREE.Texture;
  background: THREE.Texture | THREE.Color;
  /** Couleur de la brume à l'horizon. */
  haze: THREE.Color;
  /** À chaque image : temps de la séquence et atténuation (0 → 1). */
  update(t: number, dim: number): void;
  dispose(): void;
}

const rnd = (i: number, s: number) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/* ---------- le ciel : dégradé de l'heure bleue, ou sky.webp ---------- */
const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = `
varying vec3 vDir;
uniform vec3 uZenith; uniform vec3 uHigh; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uBelow;
void main(){
  float h = vDir.y;
  // le soleil vient de se coucher derrière la ville (vers +z) : la lueur y est plus chaude
  float sun = 0.5 + 0.5 * vDir.z;
  vec3 horizon = mix(uHorizon, uGlow, sun * sun * 0.7);
  // du rose de l'horizon au bleu profond du zénith, vite : l'heure bleue
  vec3 c = h < 0.0 ? mix(horizon, uBelow, smoothstep(0.0, 0.12, -h))
    : mix(horizon, mix(uHigh, uZenith, smoothstep(0.12, 0.6, h)), smoothstep(0.0, 0.1, h));
  // fine bande de lueur orangée juste au-dessus de l'horizon, côté soleil
  c += uGlow * 0.3 * sun * exp(-abs(h - 0.012) * 70.0);
  gl_FragColor = vec4(c, 1.0);
}`;

function makeSkyScene(): THREE.Scene {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uZenith: { value: new THREE.Color(0x07061c) },
      uHigh: { value: new THREE.Color(0x1d1448) },
      uHorizon: { value: new THREE.Color(0x9c3f7c) },
      uGlow: { value: new THREE.Color(0xff8a52) },
      uBelow: { value: new THREE.Color(0x1a0c24) },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  scene.add(dome);
  return scene;
}

/* ---------- la ville en blocs : fenêtres allumées par le shader ---------- */
const WINDOWS_PARS = `
varying vec3 vWorld; varying vec3 vNormalW;
uniform float uLit; uniform vec3 uWarm; uniform float uGlowK;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`;
const WINDOWS_FRAG = `
  {
    vec3 n = normalize(vNormalW);
    float side = abs(n.y) > 0.5 ? 0.0 : 1.0;
    float u = abs(n.x) > 0.5 ? vWorld.z : vWorld.x;
    float v = vWorld.y;
    vec2 cell = vec2(floor(u / 2.6), floor(v / 3.3));
    vec2 f = vec2(fract(u / 2.6), fract(v / 3.3));
    float frame = step(0.3, f.x) * step(0.32, f.y) * step(f.x, 0.8) * step(f.y, 0.72);
    float seed = hash12(cell + vec2(floor(vWorld.x / 60.0), floor(vWorld.z / 60.0)) * 7.0);
    float lit = step(1.0 - uLit, seed) * side;
    vec3 tint = mix(uWarm, vec3(0.75, 0.85, 1.0), step(0.85, hash12(cell * 3.1)));
    totalEmissiveRadiance += tint * frame * lit * uGlowK * (0.5 + 0.5 * hash12(cell * 5.7));
  }`;

function windowed(mat: THREE.MeshStandardMaterial, lit: number, warm = new THREE.Color(0xffc98a), glow = 1) {
  const uniforms = { uLit: { value: lit }, uWarm: { value: warm }, uGlowK: { value: glow } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld; varying vec3 vNormalW;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWorld = worldPosition.xyz;\n#ifdef USE_INSTANCING\nvNormalW = normalize( mat3( modelMatrix ) * mat3( instanceMatrix ) * objectNormal );\n#else\nvNormalW = normalize( mat3( modelMatrix ) * objectNormal );\n#endif");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + WINDOWS_PARS)
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n" + WINDOWS_FRAG);
  };
  mat.customProgramCacheKey = () => `windowed-${lit}-${glow}`;
  return mat;
}

/* ---------- la rue : trame de réverbères ---------- */
const GROUND_FRAG = `
varying vec3 vWorld;
uniform vec3 uAsphalt; uniform vec3 uLamp; uniform vec3 uFog; uniform float uFogDensity;
void main(){
  vec2 g = abs(fract(vWorld.xz / 52.0 + 0.5) - 0.5) * 52.0;
  float street = 1.0 - smoothstep(4.0, 6.5, min(g.x, g.y));
  float lamps = street * (0.35 + 0.65 * smoothstep(0.2, 0.0, abs(fract(max(vWorld.x, vWorld.z) / 13.0) - 0.5) - 0.3));
  vec3 c = uAsphalt + uLamp * lamps * 0.55;
  float depth = gl_FragCoord.z / gl_FragCoord.w;
  float f = 1.0 - exp(-uFogDensity * uFogDensity * depth * depth);
  gl_FragColor = vec4(mix(c, uFog, clamp(f, 0.0, 1.0)), 1.0);
}`;
const GROUND_VERT = `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

export function createWorld(renderer: THREE.WebGLRenderer, assets: WorldAssets, fog: THREE.FogExp2, o: { winZ: number; roomW: number; ceil: number; low: boolean }): World {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <X extends { dispose(): void }>(x: X): X => {
    disposables.push(x);
    return x;
  };
  const haze = new THREE.Color(0x3a1e4a);

  /* le ciel */
  const pmrem = new THREE.PMREMGenerator(renderer);
  let environment: THREE.Texture;
  let background: THREE.Texture | THREE.Color;
  if (assets.sky) {
    assets.sky.mapping = THREE.EquirectangularReflectionMapping;
    assets.sky.colorSpace = THREE.SRGBColorSpace;
    environment = keep(pmrem.fromEquirectangular(assets.sky).texture);
    background = assets.sky;
  } else {
    const skyScene = makeSkyScene();
    environment = keep(pmrem.fromScene(skyScene, 0).texture);
    // le dôme lui-même, en fond (le PMREM est trop flou pour l'horizon)
    const dome = skyScene.children[0] as THREE.Mesh;
    dome.scale.setScalar(4000);
    dome.frustumCulled = false;
    dome.renderOrder = -20;
    group.add(dome);
    keep(dome.geometry);
    keep(dome.material as THREE.Material);
    background = new THREE.Color(0x120a1e);
  }
  pmrem.dispose();

  /* la mer, vers -z, qui reflète le ciel */
  const seaMat = new THREE.MeshStandardMaterial({ color: 0x0a1c3a, roughness: 0.18, metalness: 0, envMap: environment, envMapIntensity: 2.6, emissive: 0x071226, emissiveIntensity: 0.8 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -GROUND - 0.3, -3000 - 150);
  group.add(sea);
  keep(sea.geometry);
  keep(seaMat);

  /* la rue : terre ferme de z = -150 vers +z */
  const groundMat = new THREE.ShaderMaterial({
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
    uniforms: { uAsphalt: { value: new THREE.Color(0x0a0912) }, uLamp: { value: new THREE.Color(0xffa44a) }, uFog: { value: haze }, uFogDensity: { value: fog.density } },
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 2000), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -GROUND, -150 + 1000);
  group.add(ground);
  keep(ground.geometry);
  keep(groundMat);
  // la plage : une bande sable pâle entre la rue et la mer
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(3000, 40), new THREE.MeshStandardMaterial({ color: 0x3a3040, roughness: 1 }));
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, -GROUND - 0.1, -150 - 20);
  group.add(beach);
  keep(beach.geometry);
  keep(beach.material as THREE.Material);

  if (assets.city) {
    // le vrai décor (chantier B1) : origine à la baie du dev, y en haut, z vers la mer
    const city = assets.city.scene;
    city.position.set(0, 0, o.winZ);
    city.rotation.y = Math.PI;
    group.add(city);
  } else {
    /* la ville en blocs : un damier de 52 m, rues de 12 m, hauteurs aléatoires,
     * plus basses vers la plage, quelques tours. La tour du dev est à part. */
    const blockGeo = new THREE.BoxGeometry(1, 1, 1);
    blockGeo.translate(0, 0.5, 0);
    const blockMat = windowed(new THREE.MeshStandardMaterial({ color: 0x14121f, roughness: 0.7, metalness: 0, envMap: environment, envMapIntensity: 0.25 }), 0.32);
    const cells: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    const PITCH = 52;
    for (let ix = -22; ix <= 22; ix++)
      for (let iz = -2; iz <= 24; iz++) {
        const cx = ix * PITCH;
        const cz = -140 + 26 + iz * PITCH;
        // la tour du dev occupe son îlot
        if (Math.abs(cx) < 40 && Math.abs(cz - (o.winZ / 2)) < 40) continue;
        const i = ix * 100 + iz;
        const n = 1 + Math.floor(rnd(i, 1) * 2);
        for (let k = 0; k < n; k++) {
          const w = 14 + rnd(i, 2 + k) * 24;
          const d = 14 + rnd(i, 5 + k) * 22;
          const tall = rnd(i, 8 + k);
          const h = iz < 2 ? 8 + tall * 18 : 10 + tall * tall * 85;
          dummy.position.set(cx + (rnd(i, 11 + k) - 0.5) * (PITCH - 14 - w), -GROUND, cz + (rnd(i, 14 + k) - 0.5) * (PITCH - 14 - d));
          dummy.scale.set(w, h, d);
          dummy.updateMatrix();
          cells.push(dummy.matrix.clone());
        }
      }
    const blocks = new THREE.InstancedMesh(blockGeo, blockMat, cells.length);
    cells.forEach((m, k) => blocks.setMatrixAt(k, m));
    blocks.frustumCulled = false;
    group.add(blocks);
    keep(blockGeo);
    keep(blockMat);

    /* le front de mer : façades art déco en néons rose et cyan, en haut des premiers blocs */
    const neonGeo = new THREE.BoxGeometry(1, 0.5, 0.5);
    const neons = new THREE.InstancedMesh(neonGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), 90);
    const colors = [new THREE.Color(PINK).multiplyScalar(5), new THREE.Color(CYAN).multiplyScalar(5), new THREE.Color(ORANGE).multiplyScalar(4), new THREE.Color(VIOLET).multiplyScalar(5)];
    for (let k = 0; k < 90; k++) {
      const x = (rnd(k, 31) - 0.5) * 2200;
      const z = -140 + 20 + rnd(k, 32) * 60;
      const y = -GROUND + 8 + rnd(k, 33) * 22;
      dummy.position.set(x, y, z);
      dummy.scale.set(6 + rnd(k, 34) * 18, 1, 1);
      dummy.rotation.set(0, rnd(k, 35) > 0.7 ? Math.PI / 2 : 0, 0);
      dummy.updateMatrix();
      neons.setMatrixAt(k, dummy.matrix);
      neons.setColorAt(k, colors[k % colors.length]!);
    }
    neons.frustumCulled = false;
    group.add(neons);
    keep(neonGeo);
    keep(neons.material as THREE.Material);

    /* la rangée de palmiers de la promenade : troncs et houppiers en billboard, en attendant de vrais modèles */
    const palmTex = keep(makeGlowTexture(128, 0.1));
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x2a2020, roughness: 1 }), 120);
    const crowns = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: palmTex, color: 0x0a2416, transparent: true, depthWrite: false, side: THREE.DoubleSide }), 120);
    for (let k = 0; k < 120; k++) {
      const x = -1200 + k * 20 + (rnd(k, 41) - 0.5) * 6;
      const z = -140 - 4 + rnd(k, 42) * 4;
      const h = 9 + rnd(k, 43) * 6;
      dummy.position.set(x, -GROUND, z);
      dummy.scale.set(1, h, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      trunks.setMatrixAt(k, dummy.matrix);
      dummy.position.set(x, -GROUND + h + 1, z);
      dummy.scale.set(8, 6, 1);
      dummy.updateMatrix();
      crowns.setMatrixAt(k, dummy.matrix);
    }
    trunks.frustumCulled = crowns.frustumCulled = false;
    group.add(trunks, crowns);
    keep(trunkGeo);
    keep(trunks.material as THREE.Material);
    keep(crowns.geometry);
    keep(crowns.material as THREE.Material);
  }

  /* la tour du dev : la coque autour de l'open space (verre fumé, étages allumés), ouverte sur la baie */
  const towerMat = windowed(new THREE.MeshStandardMaterial({ color: 0x0c1220, roughness: 0.28, metalness: 0, envMap: environment, envMapIntensity: 1.2, emissive: 0x0b1020, emissiveIntensity: 0.6 }), 0.1, new THREE.Color(0xdfe9ff), 0.2);
  const TW = o.roomW + 11;
  const TD = -o.winZ + 3;
  const tz = o.winZ / 2 + 1; // centre en z : la façade à winZ - 0.6
  const slab = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), towerMat);
    m.position.set(x, y, z);
    group.add(m);
    keep(m.geometry);
  };
  const below = GROUND - 0.4;
  slab(TW, below, TD, 0, -0.4 - below / 2, tz);
  slab(TW, 26, TD, 0, o.ceil + 0.3 + 13, tz);
  for (const sx of [-1, 1]) slab((TW - o.roomW) / 2 - 0.2, o.ceil + 0.8, TD, sx * (o.roomW / 2 + (TW - o.roomW) / 4 + 0.1), o.ceil / 2, tz);
  // le toit et la couronne
  slab(TW + 2, 1.2, TD + 2, 0, o.ceil + 0.3 + 26.6, tz);
  keep(towerMat);

  /* les nuages : des voiles rosés que la caméra traverse au départ */
  const cloudTex = keep(makeGlowTexture(256, 0.0));
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, color: 0x6a3d72, transparent: true, opacity: 0.28, depthWrite: false, fog: false });
  const clouds: THREE.Sprite[] = [];
  for (let k = 0; k < (o.low ? 10 : 22); k++) {
    const s = new THREE.Sprite(cloudMat);
    const sz = 90 + rnd(k, 51) * 160;
    s.scale.set(sz, sz * 0.35, 1);
    s.position.set((rnd(k, 52) - 0.5) * 900, 60 + rnd(k, 53) * 150, -300 - rnd(k, 54) * 700);
    group.add(s);
    clouds.push(s);
  }
  keep(cloudMat);

  /* l'horizon lointain : l'ancien panorama, si on l'a encore, en couronne à 1,8 km */
  if (assets.skyline && !assets.city) {
    const r = 1800;
    const geo = new THREE.CylinderGeometry(r, r, 420, 96, 1, true);
    const mat = new THREE.MeshBasicMaterial({ map: assets.skyline, side: THREE.BackSide, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.set(0, -GROUND + 120, 300);
    ring.renderOrder = -15;
    group.add(ring);
    keep(geo);
    keep(mat);
  }

  return {
    group,
    environment,
    background,
    haze,
    update(t, dim) {
      // les nuages dérivent à peine ; les néons respirent
      for (let k = 0; k < clouds.length; k++) clouds[k]!.position.x += Math.sin(t * 0.1 + k) * 0.02;
      cloudMat.opacity = 0.28 * dim;
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
