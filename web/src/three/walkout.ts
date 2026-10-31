// La révélation en 3D (Three.js), dans l'univers de GTA 6 (SPEC §17.4) : la
// plongée du changement de personnage, du ciel jusqu'au dev à son bureau.
// 1. le ciel de l'heure bleue, la côte très loin en bas ; le HUD apparaît
//    (mini-carte, cinq étoiles vides) ; clic ou délai : la plongée commence ;
// 2. la plongée : la caméra descend vers la ville en néons ; à chaque seuil de
//    note franchi (45, 60, 75, 90), une étoile de recherche s'allume avec le
//    crépitement de la radio ; les statuts de palier passent en messages radio ;
//    les lignes du dossier (spécialité, arme, dossier, affiliation) s'affichent ;
// 3. la caméra arrive sur la tour, traverse la baie et entre dans l'open space,
//    dans l'axe de l'allée, jusqu'au dev qui code, de dos ; les néons s'allument
//    rangée par rangée ; sa chaise pivote ;
// 4. le carton de fin de mission : le niveau en très grand, la note, le
//    roulement de batterie ; la carte se forme, tourne, la note claque et la
//    carte se pose au pixel près sur la carte HTML.
// Un seul plan-séquence, dans l'axe (x = 0), qui ne fait qu'avancer. Assets :
// web/src/three/assets.ts ; monde de la plongée : world.ts ; HUD : hud.ts.
import * as THREE from "three";
import { BloomEffect, EffectComposer, EffectPass, NoiseEffect, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect, BlendFunction } from "postprocessing";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { sharedResources, type WalkoutAssets } from "./assets";
import { MEAN_LUMA, grainAlbedo } from "./albedo";
import { createBakedLighting } from "./baked";
import { createCardMesh } from "./cardMesh";
import { chairMaterial, createChair } from "./chair";
import { createHud, type Hud } from "./hud";
import type { HudTexts } from "./hudTexts";
import { LensEffect, WhiteBalanceEffect, makeLensDirtTexture, whiteBalanceGains } from "./lens";
import { createPlayer } from "./player";
import { createRadioSound } from "./radioSound";
import { createWorkstation } from "./workstation";
import { CYAN, GROUND, PINK, createWorld } from "./world";
import * as T from "./textures";

export type WalkoutCue = "fireworks" | null;

export interface WalkoutTexts {
  /** Les quatre lignes du dossier, en clair : spécialité (le poste), arme (le langage), dossier (la source), affiliation (l'employeur). */
  specialty: string;
  weapon: string;
  file: string;
  affiliation: string;
  /** Les statuts par note, du plus bas au plus haut : à partir de `min`. */
  statuses: { min: number; label: string }[];
  /** Sous-titre du graphe de contributions sur l'écran du dev. */
  graphLabel: string;
  /** Le niveau, pour le carton de fin (« Recherché »). */
  levelLabel: string;
  hud: HudTexts;
}

export interface WalkoutOptions {
  /** Échauffement : la scène est construite, ses shaders compilés et ses
   * textures envoyées au GPU, sans jamais être jouée ni affichée. */
  warm?: boolean;
  lang: "fr" | "en";
  /** Comparaison GitHub × CV : deux points sur la mini-carte. */
  double: boolean;
  accent: { a: string; b: string; ink: string };
  texts: WalkoutTexts;
  /** Clé du langage principal (code sur l'écran du dev) et pseudo affiché. */
  langKey?: string;
  login: string;
  overall: number;
  assets: WalkoutAssets;
  /** Texture de la carte, résolue en arrière-plan pendant la séquence. */
  cardTexture: Promise<THREE.Texture>;
  /** Rect de l'emplacement HTML de la carte, pour la passation. */
  anchor: () => DOMRect | null;
  /** Où poser le HUD (DOM) ; sans lui, pas de HUD (échauffement). */
  hudHost?: HTMLElement;
  onHandoff: () => void;
  onDone: () => void;
  onCue?: (cue: WalkoutCue) => void;
  /** Son coupé au départ (choix mémorisé du visiteur). */
  muted?: boolean;
}

export interface WalkoutHandle {
  /** Le canvas du moteur de rendu partagé, à placer dans la page. */
  canvas: HTMLCanvasElement;
  /** Résolue quand la scène est prête à jouer sans compilation (échauffement). */
  ready: Promise<void>;
  open(): void;
  skip(): void;
  /** Clic ou Espace pendant la séquence : vrai si la scène l'a utilisé (feux d'artifice). */
  interact(): boolean;
  /** Coupe ou remet le son. */
  setMuted(muted: boolean): void;
  dispose(): void;
}

/* ---------- petites fonctions d'animation ---------- */
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const seg = (t: number, start: number, dur: number) => clamp01((t - start) / dur);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const outCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const inCubic = (p: number) => p * p * p;
const inOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const outBack = (p: number) => 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2);
const within = (t: number, w: [number, number]) => t >= w[0] && t < w[1];
const rnd = (i: number, s: number) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const hdr = (hex: THREE.ColorRepresentation, k: number) => new THREE.Color(hex).multiplyScalar(k);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/* ---------- géométrie (mètres) : sol à y = 0, les baies vers -z, la mer au-delà ---------- */
const ROOM_W = 22; // open space : x de -11 à 11, z de 0 à -14 (baies)
const WIN_Z = -14;
const CEIL = 3.3;
const DESK_Z = -7.8;
/** La caméra entre par la baie et regarde vers +z : pose finale et emplacement de la carte, entre la baie et le dev. */
const F_POS = V(0, 1.5, DESK_Z - 4.6);
const CARD_POS = V(0, 1.45, DESK_Z - 1.5);
const CARD_W3 = 1.2;
const CARD_H3 = (CARD_W3 * 520) / 360;
/** Les plantes : x, z, hauteur, rotation (à reporter dans tools/bake/office.py, PLANTS). */
const PLANTS: [number, number, number, number][] = [
  [-2.25, DESK_Z - 1.3, 1.65, 0.35],
  [3.1, DESK_Z - 3.0, 1.3, 2.4],
];
/** Les seuils de note qui allument une étoile (SPEC §17.3) ; la première à la première note. */
const STAR_AT = [1, 45, 60, 75, 90];

/* ---------- chronologie ---------- */
type Win = [number, number];
const PLAN = {
  /** La plongée : la note monte avec la descente (profil de vitesse en trapèze). */
  dive: [0.3, 10.7] as Win,
  /** Les lignes du dossier, une à la fois. */
  lines: [2.0, 4.0, 6.0, 8.2],
  fireworks: [3.6, 10.2] as Win,
  autoFire: [4.3, 5.7, 7.2, 8.6],
  /** La baie traversée. */
  glass: 11.0,
  /** Les néons de l'open space, rangée par rangée. */
  lights: 11.25,
  turn: 13.4,
  mission: [14.3, 15.8] as Win,
  card: 15.8,
};

interface Burst {
  points: THREE.Points;
  mat: THREE.PointsMaterial;
  origin: THREE.Vector3;
  vel: Float32Array;
  start: number;
  life: number;
  gravity: number;
}

/* ---------- le moteur de rendu, partagé ----------
 * Un seul WebGLRenderer pour la page : les shaders qu'il a compilés et les
 * textures qu'il a envoyées au GPU resservent à la scène suivante. Pendant
 * l'attente du scoring, une scène d'échauffement (warm) le prépare ; la
 * révélation, construite ensuite avec la vraie carte, démarre sans compiler. */
const isLow = () => window.matchMedia("(pointer: coarse)").matches || Math.min(window.innerWidth, window.innerHeight) < 560;
let sharedRenderer: THREE.WebGLRenderer | null = null;
function getRenderer(): THREE.WebGLRenderer {
  if (!sharedRenderer) {
    const r = new THREE.WebGLRenderer({ antialias: false, stencil: false, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(window.devicePixelRatio, isLow() ? 1.25 : 1.5));
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = !isLow();
    r.shadowMap.type = THREE.PCFShadowMap;
    sharedRenderer = r;
  }
  return sharedRenderer;
}
/** La scène d'échauffement en cours : libérée dès que la vraie a rendu sa première image. */
let warming: WalkoutHandle | null = null;

export function createWalkout(o: WalkoutOptions): WalkoutHandle {
  const { accent, assets } = o;
  const plan = PLAN;
  const T_CARD = plan.card;
  const T_SLAM = T_CARD + 1.0;
  const T_SETTLE = T_CARD + 1.6;
  const T_HANDOFF = T_SETTLE + 1.15;
  const T_END = T_HANDOFF + 0.6;
  const T_TURN = plan.turn;
  const low = isLow();

  /* ---------- rendu ---------- */
  const renderer = getRenderer();
  const canvas = renderer.domElement;
  const scene = new THREE.Scene();
  // la brume de l'horizon : négligeable sur les douze mètres de l'open space
  scene.fog = new THREE.FogExp2(0x3a1e4a, 0.0015);
  const world = createWorld(renderer, assets, scene.fog, { winZ: WIN_Z, roomW: ROOM_W, ceil: CEIL, low });
  scene.add(world.group);
  scene.fog.color.copy(world.haze);
  scene.background = world.background;
  // Reflets : le ciel de l'heure bleue, faibles partout ; les matières qui
  // règlent leur propre intensité reçoivent la carte d'environnement en direct,
  // sinon three.js applique l'intensité de la scène à leur place.
  const sky = world.environment;
  scene.environment = sky;
  scene.environmentIntensity = 0.2;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 6000);
  scene.add(camera);

  const sparkTex = T.makeSparkTexture();
  const disposables: { dispose(): void }[] = [sparkTex, world];
  const keep = <X extends { dispose(): void }>(x: X): X => {
    disposables.push(x);
    return x;
  };
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  const accentGlow = new THREE.MeshBasicMaterial({ color: hdr(accent.a, 2), toneMapped: false });
  const sound = createRadioSound(o.muted ?? false);
  disposables.push(sound);

  /* ---------- l'open space ----------
   * Le décor fixe (sol, plafond, murs, baies, luminaires, îlots, lattes, tapis)
   * est modélisé et éclairé dans Blender (tools/bake/office.py) : ses matières
   * lisent la lumière précalculée et n'évaluent aucune lumière en direct.
   * Restent en code ce qui s'allume ou bouge : barres des néons, écrans, allée,
   * verre, plantes, poste du dev. */
  const office = new THREE.Group();
  scene.add(office);
  const baked = createBakedLighting(assets.office);
  /** Une texture d'asset partagée, en tuile de `metres` (le décor de Blender a ses uv0 en mètres). */
  const tiled = (t: THREE.Texture, metres: number) => {
    const c = keep(t.clone());
    c.repeat.set(1 / metres, 1 / metres);
    c.needsUpdate = true;
    return c;
  };
  // Moquette en dalles de 50 cm (relief et grain : Poly Haven, dirty_carpet),
  // mate : aucun reflet au sol. La texture, brune, ne garde que sa luminance ;
  // les dalles sont posées en damier, le velours tourné d'un quart (deux nuances).
  const CARPET_TILE = 1.2;
  const carpet = new THREE.MeshStandardMaterial({
    map: tiled(assets.carpet.map!, CARPET_TILE),
    normalMap: tiled(assets.carpet.normalMap, CARPET_TILE),
    roughnessMap: tiled(assets.carpet.roughnessMap, CARPET_TILE),
    roughness: 1,
    normalScale: new THREE.Vector2(0.35, 0.35),
    envMapIntensity: 0.05,
  });
  const uCarpet = { value: new THREE.Color(0x56606b) };
  carpet.onBeforeCompile = (shader) => {
    shader.uniforms.uCarpet = uCarpet;
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 uCarpet;").replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      vec2 tileUv = vMapUv * ${(CARPET_TILE / 0.5).toFixed(3)};
      vec2 tileId = floor( tileUv );
      vec2 tileF = fract( tileUv );
      float pile = mod( tileId.x + tileId.y, 2.0 );
      float seam = smoothstep( 0.0, 0.012, tileF.x ) * smoothstep( 0.0, 0.012, 1.0 - tileF.x ) * smoothstep( 0.0, 0.012, tileF.y ) * smoothstep( 0.0, 0.012, 1.0 - tileF.y );
      float grain = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
      diffuseColor.rgb = uCarpet * ( 0.45 + 2.2 * grain ) * ( 0.975 + 0.05 * pile ) * ( 0.9 + 0.1 * seam );`,
    );
  };
  let chairSource: THREE.Material = new THREE.MeshStandardMaterial();
  assets.chair.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) chairSource = (o as THREE.Mesh).material as THREE.Material;
  });
  const std = (color: number, roughness: number, metalness = 0, envMapIntensity = 0.3) => new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity });
  // Albédos d'après des mesures (SPEC §6.3, « Étalonnage ») ; le précalcul
  // (tools/bake/office.py, COLORS) en garde d'autres pour la lumière renvoyée.
  // Peintures, plastiques et poudrages sont des diélectriques : métal 0.
  const officeMats: Record<string, THREE.Material> = {
    floor: baked.apply(carpet),
    ceiling: baked.apply(std(0xdddcd7, 0.95, 0, 0.05)),
    wall: baked.apply(std(0xacaaa4, 0.9, 0, 0.1)),
    fixture: baked.apply(std(0x1e2023, 0.4, 0, 0.5)),
    mullion: baked.apply(std(0x383e42, 0.45, 0, 0.6)),
    deskTop: baked.apply(grainAlbedo(new THREE.MeshStandardMaterial({ map: tiled(assets.wood.map!, 1.6), roughness: 0.6, envMapIntensity: 0.35 }), 0xb89a78, MEAN_LUMA.walnut)),
    metal: baked.apply(std(0x202224, 0.55, 0, 0.4)),
    fabric: baked.apply(std(0x2e3436, 0.95, 0, 0.05)),
    panel: baked.apply(std(0x51625e, 1, 0, 0.02)),
    screen: baked.apply(std(0x26282b, 0.45, 0, 0.5)),
    paper: baked.apply(std(0xe5e6e6, 0.8, 0, 0.1)),
    oak: baked.apply(grainAlbedo(new THREE.MeshStandardMaterial({ map: tiled(assets.wood.map!, 1), roughness: 0.75, envMapIntensity: 0.3 }), 0x725941, MEAN_LUMA.walnut)),
    rug: baked.apply(
      grainAlbedo(new THREE.MeshStandardMaterial({ map: tiled(assets.carpet.map!, 0.6), normalMap: tiled(assets.carpet.normalMap, 0.6), roughness: 1, normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 0.05 }), 0x3d3f42, MEAN_LUMA.carpet, 0.45),
    ),
    // les fauteuils du fond : lumière par sommet, cuir noir
    chairs: baked.applyVertex(chairMaterial(chairSource, 0x1d2023)),
    // l'inox des tableaux de porte de l'ascenseur, au fond de la pièce
    steel: new THREE.MeshStandardMaterial({ color: 0xb9c2cc, metalness: 1, roughness: 0.35, envMapIntensity: 0.8 }),
  };
  assets.office.scene.updateMatrixWorld(true);
  assets.office.scene.traverse((src) => {
    const m = src as THREE.Mesh;
    // gltfpack porte le nom sur le nœud parent (le maillage, nommé mesh_N, garde sa déquantification)
    const mat = officeMats[m.name] ?? officeMats[m.parent?.name ?? ""];
    if (!m.isMesh || !mat) return;
    const mesh = new THREE.Mesh(m.geometry, mat);
    mesh.matrix.copy(m.matrixWorld);
    mesh.matrixAutoUpdate = false;
    office.add(mesh);
  });
  // le liseré de LED au pied des murs, à la couleur du tier
  for (const sx of [-1, 1]) box(0.02, 0.025, -WIN_Z, accentGlow, sx * (ROOM_W / 2 - 0.06), 0.06, WIN_Z / 2, office);
  // les baies : le verre fumé, vu des deux côtés (la caméra le traverse)
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0b1424, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.18, envMapIntensity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, CEIL), glassMat);
  glass.position.set(0, CEIL / 2, WIN_Z + 0.02);
  office.add(glass);

  // Les barres lumineuses des luminaires suspendus (leurs boîtiers sont dans le décor).
  const ROWS = 8;
  const rowMats: THREE.MeshBasicMaterial[] = [];
  for (let r = 0; r < ROWS; r++) {
    const mat = new THREE.MeshBasicMaterial({ color: hdr("#eef3ff", 0.05), toneMapped: false });
    rowMats.push(mat);
    for (const x of [-5.2, 5.2]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.006, 0.05), mat);
      bar.position.set(x, CEIL - 0.348, -1.2 - r * 1.6);
      office.add(bar);
    }
  }
  /** Les trois zones de néons précalculées : rangées 0-2, 3-5, 6-7 ; la plus proche des baies en premier. */
  const ZONES = [[6, 7], [3, 4, 5], [0, 1, 2]];
  const rows = (zone: number) => ZONES[zone] ?? [];
  // l'éclairage d'ensemble des objets en direct (le dev, son poste, les plantes) : la ville en néons
  const hemi = new THREE.HemisphereLight(0x9a6aa8, 0x403026, 0.18);
  scene.add(hemi);

  // les repères de LED au sol, de la baie jusqu'au poste du dev
  const PATH_N = 12;
  const pathGeo = new THREE.BoxGeometry(0.025, 0.006, 0.12);
  const path = new THREE.InstancedMesh(pathGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), PATH_N * 2);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < PATH_N; i++)
    for (const sx of [-1, 1]) {
      dummy.position.set(sx * 1.38, 0.008, WIN_Z + 0.6 + (i / (PATH_N - 1)) * (DESK_Z - 1.6 - (WIN_Z + 0.6)));
      dummy.updateMatrix();
      path.setMatrixAt(i * 2 + (sx > 0 ? 1 : 0), dummy.matrix);
      path.setColorAt(i * 2 + (sx > 0 ? 1 : 0), new THREE.Color(0, 0, 0));
    }
  scene.add(path);

  // les écrans en veille des autres postes (les îlots sont dans le décor)
  const deskSpots: { x: number; z: number; row: number }[] = [];
  for (const [zc, row] of [
    [-4.4, 1],
    [-11.2, 5],
  ] as const)
    for (const x of [-7.2, -5.3, -3.4, 3.4, 5.3, 7.2]) deskSpots.push({ x, z: zc + 0.42, row });
  const codeTex = keep(makeCodeTexture(accent.a));
  const screenMat = new THREE.MeshBasicMaterial({ map: codeTex, toneMapped: false });
  const otherScreens = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.58, 0.33), screenMat, deskSpots.length);
  deskSpots.forEach((d, i) => {
    dummy.position.set(d.x, 1.12, d.z - 0.25 + 0.017);
    dummy.updateMatrix();
    otherScreens.setMatrixAt(i, dummy.matrix);
    otherScreens.setColorAt(i, new THREE.Color(0, 0, 0));
  });
  office.add(otherScreens);

  // Deux plantes en pot (Poly Haven), de tailles et de places différentes,
  // encadrent le poste ; leurs ombres sont dans la lumière précalculée.
  for (const [x, z, height, rot] of PLANTS) {
    const plant = assets.plant.scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(plant);
    const scale = height / bounds.getSize(new THREE.Vector3()).y;
    plant.scale.multiplyScalar(scale);
    plant.position.set(x, -bounds.min.y * scale, z);
    plant.rotation.y = rot;
    plant.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = !low;
      mesh.receiveShadow = true;
    });
    office.add(plant);
  }

  // la barre lumineuse du luminaire au-dessus du poste
  const pendantMat = new THREE.MeshBasicMaterial({ color: hdr(0xffdfb8, 0.1), toneMapped: false });
  box(2.72, 0.006, 0.09, pendantMat, 0, 2.722, DESK_Z - 0.5, office);

  /* ---------- lumières de la carte ---------- */
  const key = new THREE.SpotLight(0xffffff, 0, 12, 0.5, 0.6, 1.4);
  key.position.set(0.8, CEIL - 0.2, CARD_POS.z - 3.0);
  key.target.position.copy(CARD_POS);
  scene.add(key, key.target);
  const cardRimL = new THREE.PointLight(accent.a, 0, 5, 1.6);
  cardRimL.position.set(-1.3, CARD_POS.y + 0.6, CARD_POS.z + 0.9);
  const cardRimR = new THREE.PointLight(accent.b, 0, 5, 1.6);
  cardRimR.position.set(1.3, CARD_POS.y - 0.2, CARD_POS.z + 0.9);
  scene.add(cardRimL, cardRimR);

  /* ---------- particules : les feux d'artifice sur la baie ---------- */
  const bursts: Burst[] = [];
  const makeBurst = (n: number, color: string, speed: number, spread: number, up: number, size: number, life: number, gravity: number): Burst => {
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd(i, 21 + bursts.length) * Math.PI * 2;
      const r = Math.sqrt(rnd(i, 22 + bursts.length)) * spread;
      const s = speed * (0.55 + rnd(i, 23) * 0.9);
      vel[i * 3] = Math.cos(a) * r * s;
      vel[i * 3 + 1] = up * s + (rnd(i, 24) - 0.5) * spread * s;
      vel[i * 3 + 2] = Math.sin(a) * r * s;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mat = new THREE.PointsMaterial({ map: sparkTex, size, color: hdr(color, 3), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const points = new THREE.Points(g, mat);
    points.visible = false;
    points.frustumCulled = false;
    scene.add(points);
    const b = { points, mat, origin: new THREE.Vector3(), vel, start: -99, life, gravity };
    bursts.push(b);
    return b;
  };
  const FW_COLORS = [PINK, "#ffd66b", "#ffffff", CYAN, "#ff9ec6", "#8fe3ff"];
  const fireworks = Array.from({ length: 10 }, (_, i) => makeBurst(220, FW_COLORS[i % FW_COLORS.length]!, 22, 1, 0.25, 3.2, 2.2, 7));
  let fwNext = 0;
  const launch = (t: number) => {
    const b = fireworks[fwNext++ % fireworks.length]!;
    const i = fwNext;
    const side = i % 2 ? 1 : -1;
    // au-dessus de la plage, devant la caméra qui descend
    b.origin.set(side * (30 + rnd(i, 61) * 140), -GROUND + 70 + rnd(i, 62) * 70, -150 - rnd(i, 63) * 90);
    b.start = t;
    sound.pop();
  };
  // flash plein écran
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
  const white = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), whiteMat);
  white.position.z = -0.2;
  white.renderOrder = 999;
  camera.add(white);

  /* ---------- le dev à son poste ---------- */
  // De dos, face à ses écrans, tourné vers le fond de la pièce : la caméra
  // arrive par la baie derrière lui ; la chaise pivote vers elle juste avant le carton.
  const desk = createWorkstation({ accent: accent.a, lang: o.langKey, login: o.login, seed: o.overall, graphLabel: o.texts.graphLabel, wood: assets.wood, chair: createChair(assets.chair, 0x1d2023), props: assets.desk });
  const player = createPlayer(assets.player);
  desk.group.rotation.y = 0;
  desk.group.position.set(0, 0, DESK_Z);
  // un peu en avant sur l'assise : le dos ne traverse pas le dossier du fauteuil
  player.root.position.set(0, 0.03, 0.06);
  desk.swivel.add(player.root);
  scene.add(desk.group);
  disposables.push(desk);
  const heroSpot = new THREE.SpotLight(0xffe0b9, 0, 10, 0.72, 0.85, 1.4);
  heroSpot.position.set(-1.8, CEIL - 0.1, DESK_Z - 1.8);
  heroSpot.target.position.set(0, 0.6, DESK_Z);
  heroSpot.castShadow = !low;
  heroSpot.shadow.mapSize.set(1024, 1024);
  heroSpot.shadow.bias = -0.0004;
  scene.add(heroSpot, heroSpot.target);
  // la ville par les baies, sur le dev : rose d'un côté, cyan de l'autre
  const neonL = new THREE.SpotLight(PINK, 0, 10, 0.9, 0.9, 1.5);
  neonL.position.set(-3.4, 2.6, DESK_Z - 3.4);
  neonL.target.position.set(0, 0.9, DESK_Z);
  const neonR = new THREE.SpotLight(CYAN, 0, 10, 0.9, 0.9, 1.5);
  neonR.position.set(3.4, 2.6, DESK_Z - 3.4);
  neonR.target.position.set(0, 0.9, DESK_Z);
  // (toujours présentes : retirer une lumière recompile les shaders de toute la scène)
  scene.add(neonL, neonL.target, neonR, neonR.target);

  /* ---------- la carte ---------- */
  const metal = (color: THREE.ColorRepresentation, emissive = 0) =>
    new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, emissive: new THREE.Color(color), emissiveIntensity: emissive, envMapIntensity: 1.6 });
  const text3D = (str: string, size: number, depth: number, mat: THREE.Material): THREE.Mesh => {
    const g = new TextGeometry(str, { font: assets.font, size, depth, curveSegments: 6, bevelEnabled: true, bevelThickness: depth * 0.22, bevelSize: size * 0.025, bevelSegments: 3 });
    g.computeBoundingBox();
    g.center();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    return m;
  };
  const maskTex = keep(T.makeCardMaskTexture());
  const backTex = keep(T.makeCardBackTexture(accent.a));
  const cardMesh = createCardMesh(CARD_W3, { frontMap: backTex, backMap: backTex, edgeColor: accent.a, foil: true });
  const card = new THREE.Group();
  card.add(cardMesh.group);
  const sheenTex = keep(T.makeStreakTexture(512, 128));
  sheenTex.wrapS = sheenTex.wrapT = THREE.ClampToEdgeWrapping;
  sheenTex.center.set(0.5, 0.5);
  sheenTex.rotation = 0.55;
  sheenTex.repeat.set(1.3, 2.2);
  const sheenMat = new THREE.MeshBasicMaterial({ map: sheenTex, alphaMap: maskTex, color: hdr("#ffffff", 1.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const sheen = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W3, CARD_H3), sheenMat);
  sheen.position.z = cardMesh.depth / 2 + 0.002;
  card.add(sheen);
  const GLINTS = 46;
  const glintPos = new Float32Array(GLINTS * 3);
  for (let i = 0; i < GLINTS; i++) {
    glintPos[i * 3] = (rnd(i, 31) - 0.5) * (CARD_W3 + 1.2);
    glintPos[i * 3 + 1] = (rnd(i, 32) - 0.5) * (CARD_H3 + 1.0);
    glintPos[i * 3 + 2] = 0.1 + rnd(i, 33) * 0.5;
  }
  const glintGeo = new THREE.BufferGeometry();
  glintGeo.setAttribute("position", new THREE.BufferAttribute(glintPos, 3));
  const glintMat = new THREE.PointsMaterial({ map: sparkTex, size: 0.16, color: hdr("#ffffff", 2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  card.add(new THREE.Points(glintGeo, glintMat));
  card.position.copy(CARD_POS);
  // la face de la carte regarde la caméra, vers -z
  card.rotation.y = Math.PI;
  card.visible = false;
  scene.add(card);
  let cardReady = false;
  o.cardTexture
    .then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      cardMesh.front.map = t;
      cardMesh.front.emissiveMap = t;
      cardMesh.front.needsUpdate = true;
      cardReady = true;
    })
    .catch(() => undefined);
  // la note qui claque
  const slamMat = metal(accent.a, 0.55);
  slamMat.transparent = true;
  const slam = text3D(String(o.overall), 0.95, 0.22, slamMat);
  slam.visible = false;
  scene.add(slam);

  scene.traverse((obj) => {
    const mats = (obj as THREE.Mesh).material;
    for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
      const std = m as THREE.MeshStandardMaterial;
      if (std.isMeshStandardMaterial && std.envMapIntensity !== 1 && !std.envMap) std.envMap = sky;
    }
  });

  /* ---------- le HUD ---------- */
  const hud: Hud | null = o.hudHost
    ? createHud(o.hudHost, {
        texts: o.texts.hud,
        lines: { specialty: o.texts.specialty, weapon: o.texts.weapon, file: o.texts.file, affiliation: o.texts.affiliation },
        title: o.texts.levelLabel,
        overall: o.overall,
        double: o.double,
        accent: accent.a,
      })
    : null;
  if (hud) disposables.push(hud);

  /* ---------- post-traitement ---------- */
  // Anticrénelage à deux échantillons : le rendu de la scène, en
  // demi-flottants, est la passe la plus chère ; pas de flou de profondeur, tout est net.
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: low ? 0 : 2 });
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, intensity: 0.6, radius: 0.65 });
  // Vignettage d'un objectif ouvert : −0,7 IL dans les coins, rien au centre.
  const vignette = new VignetteEffect({ darkness: 0.35, offset: 0.35 });
  const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
  noise.blendMode.opacity.value = 0.1;
  // ACES (SPEC §6.3) : le rendu garde ses noirs et ses néons.
  const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  // Balance des blancs : neutre dehors, dans la lumière de l'heure bleue ;
  // réglée sur 5 600 K une fois à l'intérieur, comme une balance automatique qui
  // s'adapte aux suspensions (≈ 4 500 K) : il leur reste un peu de chaleur.
  const WB_SKY = whiteBalanceGains(6504);
  const WB_OFFICE = whiteBalanceGains(5600);
  const whiteBalance = new WhiteBalanceEffect(WB_SKY.clone());
  // l'objectif (aberration radiale, saleté) : fusionné dans la même passe, coupé sur mobile
  const lens = low ? null : new LensEffect(bloom.texture, keep(makeLensDirtTexture()), { aberration: 0.001, dirt: 3 });
  const gradePass = new EffectPass(camera, ...(lens ? [lens] : []), bloom, whiteBalance, vignette, noise, toneMapping);
  composer.addPass(gradePass);

  /* ---------- état ---------- */
  let t0 = 0;
  let opened = false;
  let raf = 0;
  let last = performance.now();
  let disposed = false;
  let handoffSent = false;
  let doneSent = false;
  let w = 1;
  let h = 1;
  let cue: WalkoutCue = null;
  let tNow = -1;
  let held: number | null = null;
  let freeCamera = false; // inspection locale uniquement, via __tys3d
  let frameMs = 16;
  /** Le statut ne s'affiche qu'au franchissement d'un palier, 0,9 s. */
  const STATUS_HOLD = 0.9;
  let lastStatus = -1;
  let statusUntil = -99;
  let lastStars = 0;
  let lastT = -1;
  const autoFired = new Set<number>();
  let cardTarget: THREE.Vector3 | null = null;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const black = new THREE.Color(0, 0, 0);
  const tmpColor = new THREE.Color();
  /** Couleurs et intensités des groupes de lumière précalculée (réglées à l'œil, d'après les captures). */
  const NEON = new THREE.Color(0xffdfb8);
  const WARM = new THREE.Color(0xffe0b9);
  const CITY = new THREE.Color(0xffffff);
  const tierColor = new THREE.Color(accent.a);
  const LIGHT = { neon: 1, hero: 1, city: 1.1, accent: 1 };
  baked.setCitySides(new THREE.Color(PINK).multiplyScalar(0.9), new THREE.Color(CYAN).multiplyScalar(0.8), 7);

  const resize = () => {
    const nw = Math.max(1, canvas.clientWidth || window.innerWidth);
    const nh = Math.max(1, canvas.clientHeight || window.innerHeight);
    if (nw === w && nh === h) return;
    w = nw;
    h = nh;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    cardTarget = null;
  };
  window.addEventListener("resize", resize);
  resize();
  /** Champ vertical : plus large en portrait pour garder la scène dans le cadre. */
  const fovFor = (base: number) => (camera.aspect < 0.8 ? base + 16 : camera.aspect < 1.2 ? base + 7 : base);

  /** Position de la carte 3D qui coïncide avec l'emplacement HTML (caméra en pose finale, regard vers +z : la droite de l'écran est vers -x). */
  const computeCardTarget = () => {
    const r = o.anchor();
    if (!r || r.width < 10) return CARD_POS.clone();
    const tanH = Math.tan((camera.fov * Math.PI) / 360);
    const d = (CARD_H3 * h) / (2 * r.height * tanH);
    const nx = ((r.left + r.width / 2) / w) * 2 - 1;
    const ny = 1 - ((r.top + r.height / 2) / h) * 2;
    return V(F_POS.x - nx * d * tanH * camera.aspect, F_POS.y + ny * d * tanH, F_POS.z + d);
  };

  const setCue = (c: WalkoutCue) => {
    if (c === cue) return;
    cue = c;
    o.onCue?.(c);
  };

  /** La plongée (0 → 1) : la chute accélère, file, puis freine à l'approche de la tour. */
  const ACC = 0.18;
  const DEC = 0.3;
  const VMAX = 1 / (1 - ACC / 2 - DEC / 2);
  const dive = (t: number) => {
    const p = seg(t, plan.dive[0], plan.dive[1] - plan.dive[0]);
    if (p < ACC) return (VMAX * p * p) / (2 * ACC);
    if (p < 1 - DEC) return VMAX * (ACC / 2 + (p - ACC));
    return 1 - (VMAX * (1 - p) * (1 - p)) / (2 * DEC);
  };
  /** Vitesse de la chute, de 0 à 1. */
  const diveSpeed = (t: number) => {
    const p = seg(t, plan.dive[0], plan.dive[1] - plan.dive[0]);
    if (p <= 0 || p >= 1) return 0;
    return p < ACC ? p / ACC : p < 1 - DEC ? 1 : (1 - p) / DEC;
  };
  const SCORE = Math.max(1, Math.min(99, o.overall));
  const statusAt = (n: number) => {
    let i = 0;
    o.texts.statuses.forEach((st, k) => {
      if (n >= st.min) i = k;
    });
    return i;
  };
  const starsAt = (level: number) => STAR_AT.filter((th) => level >= th).length;

  /* ---------- la caméra : un seul plan-séquence ----------
   * Pas une coupe : la caméra part du ciel, au-dessus de la mer, face à la
   * ville, descend vers la tour, traverse la baie et vient se poser dans l'axe
   * de l'allée, face au dev. Images-clés interpolées par des splines d'Hermite
   * en temps, tangentes monotones (Fritsch-Carlson) : position, visée et focale
   * continues, leur vitesse aussi, sans dépassement. Tout reste sur x = 0, et la
   * caméra ne fait qu'avancer (z croît) et descendre (y décroît). */
  interface Key {
    t: number;
    pos: THREE.Vector3;
    look: THREE.Vector3;
    fov: number;
  }
  const K = (t: number, pos: THREE.Vector3, look: THREE.Vector3, fov: number): Key => ({ t, pos, look, fov });
  const keys: Key[] = [
    K(0, V(0, 240, -700), V(0, 20, 0), 52),
    K(3.2, V(0, 150, -450), V(0, 8, -20), 54),
    K(6.4, V(0, 62, -215), V(0, 3, -25), 56),
    K(8.8, V(0, 14, -62), V(0, 2, -12), 55),
    K(10.4, V(0, 2.4, -19), V(0, 1.55, DESK_Z), 52),
    K(plan.glass, V(0, 1.62, WIN_Z), V(0, 1.5, DESK_Z), 50),
    K(plan.glass + 1.4, V(0, 1.56, F_POS.z - 0.3), V(0, 1.25, DESK_Z), 44),
    K(T_TURN - 0.4, V(0, 1.52, F_POS.z - 0.1), V(0, 1.25, DESK_Z), 41),
    K(T_SETTLE, F_POS.clone(), V(F_POS.x, F_POS.y, F_POS.z + 10), 40),
  ];
  /** Tangente monotone : nulle quand la courbe change de sens, pour ne jamais dépasser une image-clé. */
  const slope = (prev: number, cur: number, next: number, ta: number, tb: number, tc: number) => {
    const d0 = (cur - prev) / (tb - ta);
    const d1 = (next - cur) / (tc - tb);
    if (d0 * d1 <= 0) return 0;
    return (2 * d0 * d1) / (d0 + d1);
  };
  const tanAt = (i: number, get: (k: Key) => number) => {
    if (i === 0 || i === keys.length - 1) return 0; // on part du repos, on se pose
    return slope(get(keys[i - 1]!), get(keys[i]!), get(keys[i + 1]!), keys[i - 1]!.t, keys[i]!.t, keys[i + 1]!.t);
  };
  const tangents = (pick: (k: Key) => THREE.Vector3) =>
    keys.map((_k, i) => V(tanAt(i, (k) => pick(k).x), tanAt(i, (k) => pick(k).y), tanAt(i, (k) => pick(k).z)));
  const posTan = tangents((k) => k.pos);
  const lookTan = tangents((k) => k.look);
  const fovTan = keys.map((_k, i) => tanAt(i, (k) => k.fov));
  const hermite = (out: THREE.Vector3, p0: THREE.Vector3, m0: THREE.Vector3, p1: THREE.Vector3, m1: THREE.Vector3, s: number, dt: number) => {
    const s2 = s * s;
    const s3 = s2 * s;
    return out
      .copy(p0)
      .multiplyScalar(2 * s3 - 3 * s2 + 1)
      .addScaledVector(m0, (s3 - 2 * s2 + s) * dt)
      .addScaledVector(p1, -2 * s3 + 3 * s2)
      .addScaledVector(m1, (s3 - s2) * dt);
  };
  /** Caméra du plan-séquence à l'instant t (position, visée) ; renvoie la focale. */
  const rail = (t: number) => {
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1]!.t) i++;
    const a = keys[i]!;
    const b = keys[i + 1]!;
    const dt = b.t - a.t;
    const s = clamp01((t - a.t) / dt);
    hermite(camPos, a.pos, posTan[i]!, b.pos, posTan[i + 1]!, s, dt);
    hermite(camLook, a.look, lookTan[i]!, b.look, lookTan[i + 1]!, s, dt);
    const s2 = s * s;
    const s3 = s2 * s;
    return a.fov * (2 * s3 - 3 * s2 + 1) + fovTan[i]! * (s3 - 2 * s2 + s) * dt + b.fov * (-2 * s3 + 3 * s2) + fovTan[i + 1]! * (s3 - s2) * dt;
  };
  const camera_ = (t: number) => {
    if (import.meta.env.DEV && freeCamera) return;
    let fov = 40;
    if (t < T_SETTLE) {
      fov = rail(Math.max(0, t));
    } else {
      // pose finale exacte : la carte HTML vient s'y superposer au pixel près
      camPos.copy(F_POS);
      camLook.set(F_POS.x, F_POS.y, F_POS.z + 10);
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    const fv = fovFor(fov);
    if (Math.abs(camera.fov - fv) > 0.01) {
      camera.fov = fv;
      camera.updateProjectionMatrix();
    }
  };

  const update = (now: number, dt: number) => {
    const t = held !== null ? held : !opened ? -1 : (now - t0) / 1000;
    tNow = t;
    const wall = now / 1000;
    const dim = t >= T_SETTLE ? 1 - 0.8 * inOut(seg(t, T_SETTLE, 1.0)) : 1;
    // retour en arrière (mise au point) : on rejoue les repères
    if (t < lastT - 0.5) {
      lastStars = 0;
      lastStatus = -1;
    }
    const crossed = (at: number) => lastT < at && t >= at && Math.abs(t - lastT) < 0.5;

    /* la plongée : la note monte avec la descente ; les étoiles s'allument aux seuils */
    const progress = dive(t);
    const speed = diveSpeed(t);
    sound.update(t, speed);
    const level = t >= plan.dive[0] ? Math.max(1, Math.round(progress * SCORE)) : 0;
    const stars = starsAt(level);
    if (stars > lastStars && t >= 0) sound.crackle();
    lastStars = stars;
    world.update(t, dim);

    /* la radio : le statut change à chaque palier franchi, 0,9 s ; le dernier reste jusqu'au demi-tour */
    let radio = "";
    if (level > 0 && t < T_TURN) {
      const si = statusAt(level);
      if (si !== lastStatus) {
        lastStatus = si;
        statusUntil = t + STATUS_HOLD;
      }
      if (t < statusUntil || t >= plan.dive[1]) radio = o.texts.statuses[si]?.label ?? "";
    }

    /* la baie traversée */
    if (crossed(plan.glass)) sound.whoosh();
    if (crossed(plan.mission[0])) sound.sting();

    /* l'open space : le poste du dev déjà allumé, la ville par les baies ; les néons rangée par rangée une fois entré */
    let lit = 0;
    const pops = rowMats.map((m, r) => {
      const zone = ZONES.findIndex((rows) => rows.includes(r));
      const at = plan.lights + zone * 0.4 + (rows(zone).indexOf(r)) * 0.14;
      const pop = seg(t, at, 0.65);
      m.color.copy(hdr("#ffe1bc", (0.03 + 1.35 * pop) * dim));
      lit += (t >= at ? 1 : 0) / ROWS;
      return pop;
    });
    // la lumière précalculée suit les barres : chaque zone à la moyenne de ses rangées
    ZONES.forEach((rows, z) => baked.set(`z${2 - z}` as "z0", NEON, (rows.reduce((a, r) => a + pops[r]!, 0) / rows.length) * dim * LIGHT.neon));
    baked.set("hero", WARM, dim * LIGHT.hero);
    baked.set("city", CITY, dim * LIGHT.city);
    baked.set("accent", tierColor, seg(t, plan.glass + 0.2, 0.9) * dim * LIGHT.accent);
    hemi.intensity = (0.16 + 0.5 * lit) * dim;
    pendantMat.color.copy(hdr(0xffdfb8, 1.5 * dim));
    deskSpots.forEach((d, k) => {
      const on = 0.25 + 0.75 * seg(t, plan.lights + d.row * 0.16, 0.3);
      otherScreens.setColorAt(k, tmpColor.setScalar(on * 0.35 * dim));
    });
    otherScreens.instanceColor!.needsUpdate = true;
    for (let i = 0; i < PATH_N; i++) {
      const on = seg(t, plan.glass + 0.2 + i * 0.05, 0.25) * dim;
      const c = on > 0 ? tmpColor.set(accent.a).multiplyScalar(0.8 * on) : black;
      path.setColorAt(i * 2, c);
      path.setColorAt(i * 2 + 1, c);
    }
    path.instanceColor!.needsUpdate = true;
    heroSpot.intensity = 28 * seg(t, plan.glass - 1.0, 1.0) * dim;
    neonL.intensity = neonR.intensity = 9 * seg(t, plan.glass - 1.2, 1.0) * dim;

    /* flashs : la baie traversée, la carte */
    let wo = 0;
    if (t >= plan.glass - 0.08) wo = Math.max(wo, 0.55 * Math.min(seg(t, plan.glass - 0.08, 0.08), 1 - seg(t, plan.glass, 0.3)));
    if (t >= T_CARD - 0.18) wo = Math.max(wo, Math.min(seg(t, T_CARD - 0.18, 0.18), 1 - seg(t, T_CARD, 0.3)) * 0.75);
    whiteMat.opacity = wo;

    /* bouffées de particules */
    for (const b of bursts) {
      const tau = t - b.start;
      if (tau < 0 || tau > b.life) {
        b.points.visible = false;
        continue;
      }
      b.points.visible = true;
      const pos = b.points.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length / 3; i++) {
        arr[i * 3] = b.origin.x + b.vel[i * 3]! * tau;
        arr[i * 3 + 1] = b.origin.y + b.vel[i * 3 + 1]! * tau - 0.5 * b.gravity * tau * tau;
        arr[i * 3 + 2] = b.origin.z + b.vel[i * 3 + 2]! * tau;
      }
      pos.needsUpdate = true;
      b.mat.opacity = 1 - inCubic(tau / b.life);
    }
    for (const at of plan.autoFire)
      if (t >= at && !autoFired.has(at)) {
        autoFired.add(at);
        launch(t);
      }
    setCue(within(t, plan.fireworks) ? "fireworks" : null);

    /* le dev */
    {
      const turn = inOut(seg(t, T_TURN, 0.75));
      desk.swivel.rotation.y = turn * Math.PI;
      const typing = 1 - seg(t, T_TURN - 0.15, 0.3);
      player.pose(t, typing, turn, camera.position);
      desk.update(Math.max(0, t), dim);
    }

    /* la carte */
    if (t >= T_CARD) {
      card.visible = true;
      const tau = t - T_CARD;
      if (!cardReady) {
        cardMesh.front.map = backTex;
        cardMesh.front.emissiveMap = backTex;
      }
      const sc = outBack(seg(tau, 0, 0.6));
      const spin = lerp(-Math.PI * 2, 0, outCubic(seg(tau, 0, 1.4)));
      if (t < T_SETTLE) {
        card.position.copy(CARD_POS);
        card.scale.setScalar(Math.max(0.001, sc));
        card.rotation.set(0, Math.PI + spin, 0);
      } else {
        if (!cardTarget) cardTarget = computeCardTarget();
        const p = inOut(seg(t, T_SETTLE, 1.05));
        card.position.lerpVectors(CARD_POS, cardTarget, p);
        card.scale.setScalar(1);
        card.rotation.set(0, Math.PI, 0);
      }
      // la carte HTML va se poser dessus : on rapproche le rendu de l'image à plat
      const flat = inOut(seg(t, T_SETTLE, 1.0));
      cardMesh.front.emissiveIntensity = lerp(0.22, 0.85, flat);
      cardMesh.front.envMapIntensity = lerp(0.55, 0.15, flat);
      key.intensity = lerp(9, 2, flat) * (1 - seg(t, T_HANDOFF, 0.4));
      cardRimL.intensity = cardRimR.intensity = 5 * (1 - flat);
      const sw = seg(tau, 1.2, 0.75);
      sheenMat.opacity = sw > 0 && sw < 1 ? 0.5 * Math.sin(Math.PI * sw) : 0;
      sheenTex.offset.set(lerp(-0.9, 0.9, sw), 0);
      glintMat.opacity = seg(tau, 0.5, 0.4) * (1 - seg(t, T_HANDOFF - 0.3, 0.3));
      glintMat.size = 0.1 + Math.abs(Math.sin(wall * 5)) * 0.1;
      if (t >= T_SLAM && t < T_SLAM + 1.3) {
        slam.visible = true;
        const ts = t - T_SLAM;
        const pin = seg(ts, 0, 0.35);
        const pout = inOut(seg(ts, 0.85, 0.45));
        card.updateMatrixWorld();
        const target = V(-0.39, 0.6, 0.05).applyMatrix4(card.matrixWorld);
        const from = V(CARD_POS.x, CARD_POS.y + 0.05, CARD_POS.z - 0.9);
        slam.position.lerpVectors(from, target, pout);
        slam.rotation.y = Math.PI + lerp(0.5, 0, outCubic(pin));
        slam.scale.setScalar(Math.max(0.001, lerp(outBack(pin), 0.2, pout) * (pin < 1 ? lerp(2.2, 1, outCubic(pin)) : 1)));
        slamMat.opacity = pin * (1 - seg(ts, 1.1, 0.2));
      } else slam.visible = false;
    } else card.visible = false;

    camera_(t);
    bloom.intensity = lerp(0.75, 0.35, seg(t, plan.glass, 1)) + (t >= plan.glass ? 0.8 * (1 - seg(t, plan.glass, 0.5)) : 0);
    noise.blendMode.opacity.value = lerp(0.1, 0.055, seg(t, plan.glass, 1));
    whiteBalance.gains.lerpVectors(WB_SKY, WB_OFFICE, inOut(seg(t, plan.glass + 0.3, 1.5)));
    void dt;

    /* le HUD */
    hud?.update({
      t,
      stars,
      radio,
      lines: plan.lines.filter((at) => t >= at).length,
      mission: within(t, plan.mission) ? Math.min(seg(t, plan.mission[0], 0.3), 1 - seg(t, plan.mission[1] - 0.25, 0.25)) : 0,
      distance: Math.hypot(camera.position.z - DESK_Z, camera.position.y - 1.2),
      altitude: camera.position.y + GROUND,
      opacity: t >= T_SETTLE ? 1 - seg(t, T_SETTLE, 0.6) : 1,
    });
    lastT = t;

    if (t >= T_HANDOFF && !handoffSent) {
      handoffSent = true;
      o.onHandoff();
    }
    if (t >= T_END && !doneSent) {
      doneSent = true;
      setCue(null);
      o.onDone();
    }
  };

  if (import.meta.env.DEV && !o.warm)
    (window as unknown as { __tys3d?: unknown }).__tys3d = {
      scene,
      camera,
      get freeCamera() { return freeCamera; },
      set freeCamera(value: boolean) { freeCamera = value; },
      bloom,
      /** Intensités de la lumière précalculée, réglables en direct. */
      light: LIGHT,
      /** L'objectif et le développement, réglables en direct. */
      post: { pass: gradePass, bloom, vignette, noise, toneMapping, whiteBalance, lens, setKelvin: (k: number) => WB_OFFICE.copy(whiteBalanceGains(k)) },
      get t() {
        return tNow;
      },
      /** Durée moyenne d'une image (ms) sur les 60 dernières. */
      get frameMs() {
        return frameMs;
      },
      seek: (s: number) => {
        held = null;
        opened = true;
        t0 = performance.now() - s * 1000;
      },
      /** Fige la séquence à l'instant s (mise au point des plans). */
      hold: (s: number | null) => {
        held = s;
        opened = true;
      },
    };

  const loop = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    frameMs = frameMs * 0.95 + (now - last) * 0.05;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    resize();
    update(now, dt);
    composer.render(dt);
    // la vraie scène a pris les shaders et les textures de l'échauffement : on le libère
    if (warming && warming !== handle) {
      warming.dispose();
      warming = null;
    }
  };
  // Préparer aussi les matières hors du champ de départ, avant que la
  // caméra ne découvre les bureaux (notamment leurs géométries instanciées).
  // Sans compilation parallèle, l'échauffement compile au premier rendu.
  const compiled = renderer.compileAsync(scene, camera).catch((error: unknown) => {
    console.warn("[walkout] précompilation indisponible, compilation au rendu", error);
  });
  const ready = o.warm
    ? compiled.then(() => {
        if (disposed) return;
        // une image hors de la page : textures envoyées au GPU, passes du post-traitement compilées
        resize();
        update(performance.now(), 0);
        composer.render(0);
      })
    : compiled.then(() => undefined);
  if (!o.warm) raf = requestAnimationFrame(loop);

  const handle: WalkoutHandle = {
    canvas,
    ready,
    open() {
      if (opened) return;
      opened = true;
      t0 = performance.now();
    },
    skip() {
      sound.setMuted(true);
      if (!doneSent) {
        doneSent = true;
        handoffSent = true;
        setCue(null);
        o.onDone();
      }
    },
    setMuted(m) {
      sound.setMuted(m);
    },
    interact() {
      if (!within(tNow, plan.fireworks)) return false;
      launch(tNow);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        // les géométries et matières sont propres à cette scène, sauf celles des
        // modèles chargés, partagées ; les textures d'assets sont partagées aussi.
        // Le moteur de rendu reste, pour la scène suivante.
        if (m.geometry && !sharedResources.has(m.geometry)) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (mat) for (const mm of Array.isArray(mat) ? mat : [mat]) if (!sharedResources.has(mm)) mm.dispose();
      });
      for (const d of disposables) d.dispose();
      composer.dispose();
      if (warming === handle) warming = null;
    },
  };
  if (o.warm) {
    warming?.dispose();
    warming = handle;
  }
  return handle;
}

/** Code en veille sur les écrans de l'open space : lignes colorées, en tuile. */
function makeCodeTexture(accent: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 146;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b0f16";
  g.fillRect(0, 0, 256, 146);
  const cols = ["#ff7b72", "#d2a8ff", "#a5d6ff", "#79c0ff", "#8b949e", accent];
  for (let line = 0; line < 13; line++) {
    let x = 10 + (rnd(line, 9) > 0.6 ? 16 : 0) + (rnd(line, 10) > 0.8 ? 16 : 0);
    const n = 1 + Math.floor(rnd(line, 11) * 4);
    for (let k = 0; k < n; k++) {
      const w = 12 + rnd(line * 7 + k, 12) * 46;
      g.fillStyle = cols[Math.floor(rnd(line * 5 + k, 13) * cols.length)]!;
      g.globalAlpha = 0.85;
      g.fillRect(x, 10 + line * 10.5, w, 5);
      x += w + 6;
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
