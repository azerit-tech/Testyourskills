// La révélation en 3D (Three.js), SPEC §17.4 : l'ascenseur qui monte jusqu'à
// l'étage du dev, transposé dans l'univers de GTA 6. Un seul plan-séquence.
// 1. le pack flotte dans la cabine d'un ascenseur de nuit ; il éclate ;
// 2. l'ascenseur monte : l'étage (la note) défile sur l'afficheur à droite des
//    portes, la lumière des paliers passe dans le jour entre les portes ; en
//    haut à droite du HUD, les cinq étoiles de recherche s'allument aux seuils
//    45 / 60 / 75 / 90 avec un crépitement de radio de police ; les statuts
//    de palier passent sur l'afficheur et en message radio ;
// 3. sur l'écran, et en 3D chromée devant lui : la spécialité, l'arme (le
//    langage), le dossier (GitHub, CV, ou les deux), puis l'affiliation, qui
//    se fait attendre ; chaque ligne reste inscrite en haut à gauche du HUD ;
// 4. « ding » : l'ascenseur arrive, les portes s'ouvrent sur l'open space de
//    nuit relevé au néon (rose à gauche, cyan à droite), la ville derrière les
//    baies ;
// 5. au bout de l'allée lumineuse, le dev code à son poste (feux d'artifice sur
//    la ville au clic ou à Espace), sa chaise pivote, le carton de fin de
//    mission (le niveau, la note, roulement de batterie), puis la carte se
//    forme devant lui, tourne, la note claque et la carte se pose au pixel
//    près sur la carte HTML. Une flèche pour une carte seule, deux pour une
//    comparaison GitHub × CV (le « double »). Assets : web/src/three/assets.ts ;
//    HUD : hud.ts ; sons : elevatorSound.ts et radioSound.ts.
import * as THREE from "three";
import { BloomEffect, EffectComposer, EffectPass, NoiseEffect, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect, BlendFunction } from "postprocessing";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { PALETTE } from "../../../shared/card/themes";
import { sharedResources, type WalkoutAssets } from "./assets";
import { CAB_H, DOOR_W, createCabin } from "./cabin";
import { MEAN_LUMA, grainAlbedo } from "./albedo";
import { createBakedLighting } from "./baked";
import { createCardMesh } from "./cardMesh";
import { chairMaterial, createChair } from "./chair";
import { createElevatorSound } from "./elevatorSound";
import { createHud, type Hud } from "./hud";
import { STAR_THRESHOLDS, type HudTexts } from "./hudTexts";
import { createRadioSound } from "./radioSound";
import { LensEffect, WhiteBalanceEffect, makeLensDirtTexture, whiteBalanceGains } from "./lens";
import { createPlayer } from "./player";
import { createWorkstation } from "./workstation";
import { createCityBackdrop, createGlassReflection, createStudioEnvironment } from "./stage";
import * as T from "./textures";

export type WalkoutCue = "fireworks" | null;

export interface WalkoutTexts {
  /** Langage principal (le « drapeau ») ; null si aucun. */
  langName: string;
  langLabel: string;
  /** La ligue : la source (GitHub, CV, ou les deux). */
  leagueName: string;
  leagueLabel: string;
  /** Code du poste (« FS ») et son nom en clair (« Full-stack »). */
  position: string;
  positionName: string;
  positionLabel: string;
  club: string;
  clubLabel: string;
  /** « Statut », au-dessus du statut affiché pendant la montée. */
  statusLabel: string;
  /** Les statuts par note, du plus bas au plus haut : à partir de `min`. */
  statuses: { min: number; label: string }[];
  /** Écran en veille. */
  idleTitle: string;
  idleSubtitle: string;
  /** Sous-titre du graphe de contributions sur l'écran du dev. */
  graphLabel: string;
  /** Le carton de fin de mission : le niveau (LEVEL_LABELS de shared/types.ts). */
  levelLabel: string;
  /** Le profil criminel (§18.2), inscrit sur le carton de fin ; absent sur une fiche d'avant 0.2.0. */
  profileLabel?: string;
  /** Les libellés du HUD (lignes du dossier, radio, note). */
  hud: HudTexts;
}

export interface WalkoutOptions {
  /** Échauffement : la scène est construite, ses shaders compilés et ses
   * textures envoyées au GPU, sans jamais être jouée ni affichée. */
  warm?: boolean;
  lang: "fr" | "en";
  /** Comparaison GitHub × CV : deux flèches au lieu d'une. */
  double: boolean;
  accent: { a: string; b: string; ink: string };
  texts: WalkoutTexts;
  /** Clé du langage principal (code sur l'écran du dev) et pseudo affiché. */
  langKey?: string;
  login: string;
  /** Chemins SVG (24 × 24) : logo du langage, logo de la ligue. */
  logoPath: string;
  leaguePath: string;
  overall: number;
  assets: WalkoutAssets;
  /** Texture de la carte, résolue en arrière-plan pendant la séquence. */
  cardTexture: Promise<THREE.Texture>;
  /** Rect de l'emplacement HTML de la carte, pour la passation. */
  anchor: () => DOMRect | null;
  onHandoff: () => void;
  onDone: () => void;
  onCue?: (cue: WalkoutCue) => void;
  /** Son coupé au départ (choix mémorisé du visiteur). */
  muted?: boolean;
  /** Reçoit le HUD en DOM (hud.ts) ; sans lui, pas de HUD. */
  hudHost?: HTMLElement;
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
  /** Coupe ou remet le son (ascenseur et radio). */
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
/** Bruit lisse et non périodique dans [-1, 1] (somme de sinus incommensurables). */
const smoothNoise = (x: number) => 0.5 * Math.sin(x) + 0.3 * Math.sin(x * 2.31 + 1.7) + 0.2 * Math.sin(x * 4.87 + 4.2);
const within = (t: number, w: [number, number]) => t >= w[0] && t < w[1];
const rnd = (i: number, s: number) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const hdr = (hex: THREE.ColorRepresentation, k: number) => new THREE.Color(hex).multiplyScalar(k);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/* ---------- géométrie (mètres) : sol à y = 0, l'ascenseur s'ouvre vers -z ---------- */
const ROOM_W = 22; // open space : x de -11 à 11, z de 0 à -14 (baies)
const WIN_Z = -14;
const CEIL = 3.3;
const DESK_Z = -7.8;
/** Le pack et la caméra dans la cabine ; pose finale de la caméra (regard droit vers -z) et emplacement de la carte. */
const PACK_POS = V(0, 1.5, 0.7);
const CAB_CAM = V(0, 1.5, 2.8);
const F_POS = V(0, 1.5, -3.2);
const CARD_POS = V(0, 1.45, -6.3);
const CARD_W3 = 1.2;
const CARD_H3 = (CARD_W3 * 520) / 360;
const TELL_POS = V(0, 1.24, 0.5);
/** Les plantes : x, z, hauteur, rotation (à reporter dans tools/bake/office.py, PLANTS). */
const PLANTS: [number, number, number, number][] = [
  [-2.25, DESK_Z - 1.3, 1.65, 0.35],
  [3.1, DESK_Z - 3.0, 1.3, 2.4],
];

/* ---------- chronologie ---------- */
type Win = [number, number];
const PLAN = {
  /** Après l'éclatement, l'ascenseur s'établit seul : l'afficheur passe à
   * l'étage 00, la flèche s'allume, le bouton aussi. Rien d'autre. */
  depart: 1.9,
  /** L'étage défile, vite puis de plus en plus lentement. */
  ascent: [1.9, 10.9] as Win,
  /** Les révélations ne commencent qu'une fois la montée lancée : une chose à la fois. */
  position: [2.7, 4.5] as Win,
  lang: [4.5, 6.2] as Win,
  league: [6.2, 7.8] as Win,
  loading: [7.8, 8.6] as Win,
  club: [8.6, 10.5] as Win,
  arrive: 10.9,
  doors: 11.3,
  /** Les néons de l'open space, rangée par rangée. */
  lights: 11.45,
  fireworks: [12.2, 15.6] as Win,
  autoFire: [12.6, 13.4, 14.3, 15.0],
  /** Le carton de fin de mission, plein écran, une fois le dev tourné. */
  mission: [15.2, 16.7] as Win,
  card: 16.7,
};
/** Les néons de l'open space : rose côté gauche, cyan côté droit. */
const PINK = PALETTE.pink;
const CYAN = PALETTE.cyan;

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
  const T_BURST = 0.5;
  const T_CARD = plan.card;
  const T_SLAM = T_CARD + 1.0;
  const T_SETTLE = T_CARD + 1.6;
  const T_HANDOFF = T_SETTLE + 1.15;
  const T_END = T_HANDOFF + 0.6;
  const T_TURN = plan.mission[0] - 0.65;
  const low = isLow();

  /* ---------- rendu ---------- */
  const renderer = getRenderer();
  const canvas = renderer.domElement;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070d);
  scene.fog = new THREE.FogExp2(0x05070d, 0.025);
  // Reflets : faibles partout ; les matières qui règlent leur propre intensité
  // (carte, métaux, pack) reçoivent la carte d'environnement en direct, sinon
  // three.js applique l'intensité de la scène à leur place.
  const studio = createStudioEnvironment(renderer, accent.a);
  scene.environment = studio;
  scene.environmentIntensity = 0.12;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 400);
  camera.position.copy(CAB_CAM);
  scene.add(camera);

  const glowTex = T.makeGlowTexture();
  const sparkTex = T.makeSparkTexture();
  const disposables: { dispose(): void }[] = [glowTex, sparkTex];
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
  const cab = createCabin({ scene, renderer, accent: accent.a, model: assets.cabin, floor: Math.max(1, Math.min(99, o.overall)) });
  disposables.push(cab);
  const sound = createElevatorSound({ depart: plan.depart, arrive: plan.arrive, doors: plan.doors }, o.muted ?? false);
  disposables.push(sound);
  const radio = createRadioSound(o.muted ?? false);
  disposables.push(radio);
  const { doors, screen, brushedSteel, shaftTex, shaftMat, shaftGap, btnOn, seam, seamMat } = cab;

  /* ---------- l'open space ----------
   * Le décor fixe (sol, plafond, murs, baies, luminaires, îlots, lattes, tapis)
   * est modélisé et éclairé dans Blender (tools/bake/office.py) : ses matières
   * lisent la lumière précalculée et n'évaluent aucune lumière en direct.
   * Restent en code ce qui s'allume ou bouge : barres des néons, écrans, allée,
   * verre et ville, plantes, poste du dev. */
  const office = new THREE.Group();
  scene.add(office);
  const baked = createBakedLighting(assets.office);
  // la lumière de la ville dans le bureau : rose d'un côté, cyan de l'autre
  baked.setCitySides(new THREE.Color(PINK).multiplyScalar(0.9), new THREE.Color(CYAN).multiplyScalar(0.8), 7);
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
    // l'inox des tableaux de porte est un métal : rien à lire dans la lumière diffuse
    steel: brushedSteel,
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
  // le liseré de LED au pied des murs, à la couleur du niveau
  for (const sx of [-1, 1]) box(0.02, 0.025, -WIN_Z, accentGlow, sx * (ROOM_W / 2 - 0.06), 0.06, WIN_Z / 2, office);
  // les baies : le verre fumé
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, CEIL),
    new THREE.MeshPhysicalMaterial({ color: 0x0b1424, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 0.8, depthWrite: false }),
  );
  glass.position.set(0, CEIL / 2, WIN_Z + 0.02);
  office.add(glass);
  // la nuit, les baies reflètent le bureau éclairé (le décor précalculé ne coûte presque rien à redessiner)
  let glassReflection: ReturnType<typeof createGlassReflection> | null = null;
  if (!low) {
    glassReflection = createGlassReflection(ROOM_W, CEIL - 0.25, new THREE.Vector2(640, 160));
    glassReflection.mesh.position.set(0, (CEIL - 0.25) / 2, WIN_Z + 0.04);
    scene.add(glassReflection.mesh);
    disposables.push({ dispose: () => glassReflection?.mesh.dispose() });
  }
  // la ville de nuit
  const city = createCityBackdrop(assets.city, 120, 1.5, scene.background);
  city.mesh.position.set(0, 0, DESK_Z);
  scene.add(city.mesh);

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
  /** Les trois zones de néons précalculées : rangées 0-2, 3-5, 6-7. */
  const ZONES = [[0, 1, 2], [3, 4, 5], [6, 7]];
  // l'éclairage d'ensemble des objets en direct (le dev, son poste, les plantes)
  const hemi = new THREE.HemisphereLight(0xa1b8ce, 0x403026, 0.18);
  scene.add(hemi);

  // l'allée de LED au sol, de l'ascenseur jusqu'au poste du dev
  const PATH_N = 12;
  const pathGeo = new THREE.BoxGeometry(0.025, 0.006, 0.12);
  const path = new THREE.InstancedMesh(pathGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), PATH_N * 2);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < PATH_N; i++)
    for (const sx of [-1, 1]) {
      dummy.position.set(sx * 1.38, 0.008, -0.5 - (i / (PATH_N - 1)) * (-DESK_Z - 2.3));
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
  key.position.set(0.8, CEIL - 0.2, CARD_POS.z + 3.0);
  key.target.position.copy(CARD_POS);
  scene.add(key, key.target);
  const cardRimL = new THREE.PointLight(accent.a, 0, 5, 1.6);
  cardRimL.position.set(-1.3, CARD_POS.y + 0.6, CARD_POS.z - 0.9);
  const cardRimR = new THREE.PointLight(accent.b, 0, 5, 1.6);
  cardRimR.position.set(1.3, CARD_POS.y - 0.2, CARD_POS.z - 0.9);
  scene.add(cardRimL, cardRimR);

  /* ---------- le pack (état prêt) ---------- */
  const packFace = keep(T.makePackFaceTexture(accent.a, accent.b, o.lang));
  const packBackTex = keep(T.makePackBackTexture(accent.a));
  const foilSide = new THREE.MeshStandardMaterial({ color: 0x3a4a5c, metalness: 0.95, roughness: 0.3, transparent: true, envMapIntensity: 1.2 });
  const foilFront = new THREE.MeshPhysicalMaterial({ map: packFace, emissiveMap: packFace, emissive: 0xffffff, emissiveIntensity: 0.3, metalness: 0.6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, transparent: true, envMapIntensity: 1.1 });
  const foilBack = new THREE.MeshPhysicalMaterial({ map: packBackTex, metalness: 0.85, roughness: 0.3, clearcoat: 0.8, transparent: true, envMapIntensity: 1.2 });
  const pack = new THREE.Group();
  const packBody = new THREE.Mesh(new RoundedBoxGeometry(1.0, 1.5, 0.09, 3, 0.035), [foilSide, foilSide, foilSide, foilSide, foilFront, foilBack]);
  const crimpMat = new THREE.MeshStandardMaterial({ color: 0xb9c6d2, metalness: 1, roughness: 0.4, envMapIntensity: 1.1 });
  const crimpGeo = new THREE.BoxGeometry(1.06, 0.11, 0.13);
  const crimpTop = new THREE.Mesh(crimpGeo, crimpMat);
  crimpTop.position.y = 0.79;
  const crimpBottom = new THREE.Mesh(crimpGeo, crimpMat);
  crimpBottom.position.y = -0.79;
  const packSeamMat = new THREE.MeshBasicMaterial({ color: hdr("#ffffff", 4), transparent: true, opacity: 0, toneMapped: false });
  const packSeam = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.035), packSeamMat);
  packSeam.position.set(0, 0.71, 0.06);
  pack.add(packBody, crimpTop, crimpBottom, packSeam);
  pack.scale.setScalar(0.62);
  pack.position.copy(PACK_POS);
  scene.add(pack);
  const packLight = new THREE.PointLight(accent.a, 2, 5, 1.6);
  packLight.position.set(0, PACK_POS.y + 0.3, PACK_POS.z + 1.0);
  scene.add(packLight);

  /* ---------- particules ---------- */
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
  const packBurst = makeBurst(260, accent.a, 3.2, 0.9, 0.8, 0.07, 1.2, 6);
  packBurst.origin.copy(PACK_POS);
  packBurst.start = T_BURST;
  const packBurst2 = makeBurst(100, "#ffffff", 2.4, 1.2, 0.6, 0.05, 1.0, 5);
  packBurst2.origin.copy(PACK_POS);
  packBurst2.start = T_BURST;
  // feux d'artifice sur la ville : un réservoir recyclé (automatiques + au clic)
  const FW_COLORS = [accent.a, PALETTE.yellow, "#ffffff", accent.b, PINK, CYAN];
  const fireworks = Array.from({ length: 10 }, (_, i) => makeBurst(220, FW_COLORS[i % FW_COLORS.length]!, 9, 1, 0.25, 1.1, 1.9, 4));
  let fwNext = 0;
  const launch = (t: number) => {
    const b = fireworks[fwNext++ % fireworks.length]!;
    const i = fwNext;
    const side = i % 2 ? 1 : -1;
    b.origin.set(side * (6 + rnd(i, 61) * 16), 3 + rnd(i, 62) * 6, -62 - rnd(i, 63) * 20);
    b.start = t;
  };
  // flash plein écran
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
  const white = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), whiteMat);
  white.position.z = -0.2;
  white.renderOrder = 999;
  camera.add(white);

  /* ---------- les révélations 3D devant les portes ---------- */
  const metal = (color: THREE.ColorRepresentation, emissive = 0) =>
    new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, emissive: new THREE.Color(color), emissiveIntensity: emissive, envMapIntensity: 1.6 });
  const text3D = (str: string, size: number, depth: number, mat: THREE.Material, maxWidth?: number): THREE.Mesh => {
    const g = new TextGeometry(str, { font: assets.font, size, depth, curveSegments: 6, bevelEnabled: true, bevelThickness: depth * 0.22, bevelSize: size * 0.025, bevelSegments: 3 });
    g.computeBoundingBox();
    g.center();
    const m = new THREE.Mesh(g, mat);
    const w = g.boundingBox!.max.x - g.boundingBox!.min.x;
    if (maxWidth && w > maxWidth) m.scale.setScalar(maxWidth / w);
    m.castShadow = true;
    return m;
  };
  const logo3D = (path: string, size: number, mat: THREE.Material): THREE.Mesh => {
    const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}"/></svg>`);
    const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: 3.2, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.4, bevelSegments: 4, curveSegments: 12 });
    geo.center();
    const s = size / 24;
    geo.scale(s, -s, -s);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  };
  // chaque révélation : l'objet chromé et son nom en lettres 3D au-dessus
  const tells: { obj: THREE.Object3D; win: Win }[] = [];
  const named = (obj: THREE.Object3D, name: string) => {
    const g = new THREE.Group();
    const n = text3D(name.toUpperCase(), 0.13, 0.026, metal(0xf2f5f8, 0.14), 1.3);
    n.position.y = 0.4;
    g.add(obj, n);
    return g;
  };
  {
    const g = new THREE.Group();
    const code = text3D(o.texts.position, 0.36, 0.07, metal(accent.a, 0.12));
    const n = text3D(o.texts.positionName.toUpperCase(), 0.1, 0.02, metal(0xf2f5f8, 0.14), 1.0);
    n.position.y = 0.34;
    g.add(code, n);
    tells.push({ obj: g, win: plan.position });
  }
  tells.push({ obj: named(logo3D(o.logoPath, 0.42, metal(0xe6ecf3, 0.06)), o.texts.langName), win: plan.lang });
  tells.push({ obj: named(logo3D(o.leaguePath, 0.4, metal(accent.a, 0.1)), o.texts.leagueName), win: plan.league });
  {
    const shield = new THREE.Shape();
    const S = 0.27;
    shield.moveTo(-1 * S, 1.05 * S);
    shield.lineTo(1 * S, 1.05 * S);
    shield.lineTo(1 * S, -0.25 * S);
    shield.lineTo(0, -1.25 * S);
    shield.lineTo(-1 * S, -0.25 * S);
    shield.closePath();
    const outer = new THREE.Mesh(new THREE.ExtrudeGeometry(shield, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 3 }), metal(accent.a, 0.06));
    const inner = new THREE.Mesh(new THREE.ExtrudeGeometry(shield, { depth: 0.012, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0x0b1119, metalness: 0.5, roughness: 0.45 }));
    inner.scale.set(0.84, 0.84, 1);
    inner.position.set(0, -0.007, 0.06);
    const name = text3D(o.texts.club.toUpperCase(), 0.085, 0.018, metal(0xf2f5f8, 0.15), 0.38);
    name.position.set(0, 0.075, 0.07);
    const grp = new THREE.Group();
    grp.add(outer, inner, name);
    tells.push({ obj: grp, win: plan.club });
  }
  for (const tl of tells) {
    tl.obj.visible = false;
    scene.add(tl.obj);
  }
  const tellKey = new THREE.SpotLight(0xffffff, 0, 6, 0.5, 0.6, 1.4);
  tellKey.position.set(0.8, CAB_H - 0.1, TELL_POS.z + 1.6);
  tellKey.target.position.copy(TELL_POS);
  scene.add(tellKey, tellKey.target);

  /* ---------- le dev à son poste ---------- */
  // De dos, debout face à ses écrans et aux baies ; il se retourne vers la caméra juste avant la carte.
  const desk = createWorkstation({ accent: accent.a, lang: o.langKey, login: o.login, seed: o.overall, graphLabel: o.texts.graphLabel, wood: assets.wood, chair: createChair(assets.chair, 0x1d2023), props: assets.desk });
  const player = createPlayer(assets.player);
  desk.group.rotation.y = Math.PI;
  desk.group.position.set(0, 0, DESK_Z);
  player.root.position.set(0, 0.03, 0);
  desk.swivel.add(player.root);
  scene.add(desk.group);
  disposables.push(desk);
  const heroSpot = new THREE.SpotLight(0xffe0b9, 0, 10, 0.72, 0.85, 1.4);
  heroSpot.position.set(-1.8, CEIL - 0.1, DESK_Z + 1.8);
  heroSpot.target.position.set(0, 0.9, DESK_Z);
  heroSpot.castShadow = !low;
  heroSpot.shadow.mapSize.set(1024, 1024);
  heroSpot.shadow.bias = -0.0004;
  scene.add(heroSpot, heroSpot.target);
  // les enseignes de la ville sur le dev : rose à gauche, cyan à droite
  const neonL = new THREE.SpotLight(PINK, 0, 10, 0.9, 0.9, 1.5);
  neonL.position.set(-2.8, 2.8, DESK_Z - 2.4);
  neonL.target.position.set(0, 1.3, DESK_Z);
  const neonR = new THREE.SpotLight(CYAN, 0, 10, 0.9, 0.9, 1.5);
  neonR.position.set(2.8, 2.8, DESK_Z - 2.4);
  neonR.target.position.set(0, 1.3, DESK_Z);
  scene.add(neonL, neonL.target, neonR, neonR.target);

  /* ---------- la carte ---------- */
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
      // la cabine a déjà la sienne : ses propres reflets, photographiés de l'intérieur
      if (std.isMeshStandardMaterial && std.envMapIntensity !== 1 && !std.envMap) std.envMap = studio;
    }
  });

  /* ---------- post-traitement ---------- */
  // Anticrénelage à deux échantillons (quatre avant) : le rendu de la scène,
  // en demi-flottants, est la passe la plus chère ; plus de flou de
  // profondeur (décision du 17 octobre 2026), tout est net.
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: low ? 0 : 2 });
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, intensity: 0.6, radius: 0.65 });
  // Vignettage d'un objectif ouvert : −0,7 IL dans les coins, rien au centre
  // ni presque au milieu des bords (il faisait −1,7 IL, un effet visible).
  const vignette = new VignetteEffect({ darkness: 0.35, offset: 0.35 });
  const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
  noise.blendMode.opacity.value = 0.14;
  // ACES (three.js) plutôt qu'AgX : l'AgX de three.js n'a que le look « Base »
  // (noirs levés, LED du tier délavées), pas le « Medium High Contrast » du
  // rendu de la ville dans Blender, déjà une image finie (SPEC §6.3).
  const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  // Balance des blancs : neutre dans la cabine, à la lumière chaude voulue ;
  // réglée sur 5 600 K une fois dehors, comme une balance automatique qui
  // s'adapte aux suspensions (≈ 4 500 K) : il leur reste un peu de chaleur.
  const WB_CABIN = whiteBalanceGains(6504);
  const WB_OFFICE = whiteBalanceGains(5600);
  const whiteBalance = new WhiteBalanceEffect(WB_CABIN.clone());
  // l'objectif (aberration radiale, saleté) : fusionné dans la même passe, coupé sur mobile
  const lens = low ? null : new LensEffect(bloom.texture, keep(makeLensDirtTexture()), { aberration: 0.001, dirt: 3 });
  const gradePass = new EffectPass(camera, ...(lens ? [lens] : []), bloom, whiteBalance, vignette, noise, toneMapping);
  composer.addPass(gradePass);

  /* ---------- le HUD (hud.ts) ---------- */
  const hud: Hud | null =
    o.hudHost && !o.warm
      ? createHud(o.hudHost, {
          texts: o.texts.hud,
          lines: { specialty: o.texts.positionName, weapon: o.texts.langName, file: o.texts.leagueName, affiliation: o.texts.club },
          title: o.texts.levelLabel,
          profile: o.texts.profileLabel,
          overall: o.overall,
          double: o.double,
          accent: accent.a,
          // pas de mini-carte : dans une cabine, on ne va nulle part
          map: false,
          // « Voir ma fiche » sur le carton : la séquence s'arrête, la fiche s'affiche
          onCta: () => handle.skip(),
        })
      : null;
  if (hud) disposables.push(hud);

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
  let wallState = "";
  let wallSwitch = -99;
  /** Le statut ne s'affiche qu'au franchissement d'un palier, puis l'afficheur revient à l'étage seul. */
  const STATUS_HOLD = 0.9;
  let lastStatus = -1;
  let statusUntil = -99;
  const autoFired = new Set<number>();
  /** Étoiles allumées à l'image précédente ; le message radio en cours. */
  let lastStars = 0;
  let prevT = -1;
  const starsAt = (level: number) => STAR_THRESHOLDS.filter((th) => level >= th).length;
  const shakeSeed = Math.random() * 100;
  let cardTarget: THREE.Vector3 | null = null;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const black = new THREE.Color(0, 0, 0);
  const tmpColor = new THREE.Color();
  /** Couleurs et intensités des groupes de lumière précalculée (réglées à l'œil, d'après les captures). */
  const NEON = new THREE.Color(0xffdfb8);
  const WARM = new THREE.Color(0xffe0b9);
  // la lumière de la ville est teintée par côté (baked.setCitySides) : blanche ici
  const CITY = new THREE.Color(0xe6eaff);
  const levelColor = new THREE.Color(accent.a);
  const LIGHT = { neon: 1, hero: 1, city: 1.45, accent: 1, glass: 1.6 };

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

  /** Position de la carte 3D qui coïncide avec l'emplacement HTML (caméra en pose finale). */
  const computeCardTarget = () => {
    const r = o.anchor();
    if (!r || r.width < 10) return CARD_POS.clone();
    const tanH = Math.tan((camera.fov * Math.PI) / 360);
    const d = (CARD_H3 * h) / (2 * r.height * tanH);
    const nx = ((r.left + r.width / 2) / w) * 2 - 1;
    const ny = 1 - ((r.top + r.height / 2) / h) * 2;
    return V(F_POS.x + nx * d * tanH * camera.aspect, F_POS.y + ny * d * tanH, F_POS.z - d);
  };

  const setWall = (state: string, t: number, draw: () => void, glitch = true) => {
    if (wallState === state) return;
    wallState = state;
    if (glitch) wallSwitch = t;
    draw();
  };
  const setCue = (c: WalkoutCue) => {
    if (c === cue) return;
    cue = c;
    o.onCue?.(c);
  };

  /** La montée (0 → 1) : la cabine accélère doucement, file à vitesse constante, puis freine à l'approche. */
  const ACC = 0.18;
  const DEC = 0.3;
  const VMAX = 1 / (1 - ACC / 2 - DEC / 2);
  const ascent = (t: number) => {
    const p = seg(t, plan.ascent[0], plan.ascent[1] - plan.ascent[0]);
    if (p < ACC) return (VMAX * p * p) / (2 * ACC);
    if (p < 1 - DEC) return VMAX * (ACC / 2 + (p - ACC));
    return 1 - (VMAX * (1 - p) * (1 - p)) / (2 * DEC);
  };
  /** Vitesse de la cabine, de 0 (arrêt) à 1 (pleine vitesse). */
  const ascentSpeed = (t: number) => {
    const p = seg(t, plan.ascent[0], plan.ascent[1] - plan.ascent[0]);
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

  /* ---------- la caméra : un seul plan-séquence ----------
   * Pas une coupe : la caméra est dans la cabine, face aux portes, et s'en
   * approche lentement pendant la montée ; les portes s'ouvrent, elle sort
   * dans l'axe de l'allée et vient se poser face à la carte. Images-clés
   * interpolées par des splines d'Hermite en temps, tangentes monotones
   * (Fritsch-Carlson) : position, visée et focale continues, leur vitesse
   * aussi, sans dépassement. La translation reste dans l'axe (x = 0). */
  interface Key {
    t: number;
    pos: THREE.Vector3;
    look: THREE.Vector3;
    fov: number;
  }
  const K = (t: number, pos: THREE.Vector3, look: THREE.Vector3, fov: number): Key => ({ t, pos, look, fov });
  const keys: Key[] = [
    K(0, CAB_CAM.clone(), PACK_POS.clone().add(V(0, 0.05, 0)), 54),
    K(plan.depart, V(0, 1.48, 2.77), V(0.12, 1.55, 0), 60),
    K(plan.league[0], V(0, 1.48, 2.67), V(0.12, 1.53, 0), 60),
    K(plan.club[1], V(0, 1.48, 2.47), V(0.08, 1.5, 0), 58),
    K(plan.doors + 0.35, V(0, 1.5, 1.95), V(0, 1.4, -6), 58),
    K(plan.doors + 2.0, V(0, 1.53, -1.5), V(0, 1.3, DESK_Z), 44),
    K(T_TURN - 0.4, V(0, 1.51, -2.9), V(0, 1.38, DESK_Z), 41),
    // le dev se retourne : l'objectif se resserre sur lui, à mi-corps, comme le portrait d'un
    // personnage qu'on retrouve ; il tient pendant le carton, puis s'ouvre quand la carte naît
    K(T_TURN + 0.65, V(0, 1.5, -3.0), V(0, 1.38, DESK_Z), 13),
    K(plan.mission[1] - 0.45, V(0, 1.5, -3.08), V(0, 1.42, DESK_Z), 11.5),
    K(T_CARD + 0.35, V(0, 1.5, -3.15), V(0, 1.42, CARD_POS.z - 2), 38),
    K(T_SETTLE, F_POS.clone(), V(F_POS.x, F_POS.y, F_POS.z - 10), 40),
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
  const camera_ = (t: number, wall: number) => {
    if (import.meta.env.DEV && freeCamera) return;
    let fov = 40;
    if (t < T_SETTLE) {
      fov = rail(t);
    } else {
      // pose finale exacte : la carte HTML vient s'y superposer au pixel près
      camPos.copy(F_POS);
      camLook.set(F_POS.x, F_POS.y, F_POS.z - 10);
    }
    camera.position.copy(camPos);
    // la cabine tasse au départ et à l'arrivée : un simple creux vertical, pas une secousse
    const lurch = (at: number, sign: number) => {
      const p = seg(t, at, 0.55);
      return p > 0 && p < 1 ? sign * 0.018 * Math.sin(Math.PI * p) * (1 - p * 0.4) : 0;
    };
    camera.position.y += lurch(plan.depart, -1) + lurch(plan.arrive - 0.1, 1);
    // En portrait, garder toute la platine latérale dans le cadre pendant
    // la montée et l'arrivée, puis revenir dans l'axe en sortant.
    if (camera.aspect < 0.8) {
      const lookDistance = (camera.position.z - camLook.z) / Math.max(camera.position.z, 1.5);
      camLook.x += 0.22 * lookDistance * inOut(seg(t, T_BURST + 0.3, 1.1)) * (1 - inOut(seg(t, plan.doors + 0.65, 0.85)));
    }
    camera.lookAt(camLook);
    // une seule secousse : l'éclatement du pack (traumatisme au carré, en rotation)
    const trauma = t >= T_BURST ? Math.max(0, 0.5 * (1 - (t - T_BURST) / 0.6)) : 0;
    if (trauma > 0) {
      const s = trauma * trauma;
      const f = wall * 18 + shakeSeed;
      camera.rotateY(s * 0.025 * smoothNoise(f));
      camera.rotateX(s * 0.025 * smoothNoise(f + 13.3));
      camera.rotateZ(s * 0.015 * smoothNoise(f + 27.9));
    }
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

    /* la montée : l'étage est la note ; la gaine défile dans les fentes */
    const climb = ascent(t);
    const speed = ascentSpeed(t);
    sound.update(t, speed);
    const moving = t >= plan.ascent[0] && t < plan.arrive;
    const level = Math.round(climb * SCORE);
    screen.floor(level, o.double ? 2 : 1, moving);
    const crossed = (at: number) => prevT < at && t >= at;
    /* les étoiles de recherche : une de plus à chaque seuil, avec la radio */
    const stars = t >= plan.depart ? starsAt(level) : 0;
    if (stars > lastStars && t >= plan.depart) radio.crackle();
    lastStars = stars;
    if (crossed(plan.mission[0])) radio.sting();
    shaftTex.offset.y = climb * 7;
    shaftMat.opacity = speed * dim;
    shaftGap.visible = t < plan.arrive;
    cab.setLight(dim);

    /* l'afficheur : le pack, puis l'étage 00 seul (l'ascenseur s'établit),
     * puis le statut, qui change à chaque palier franchi */
    screen.uniforms.uTime.value = wall;
    if (t < T_BURST + 0.35) setWall("idle", t, () => screen.caption(o.texts.idleSubtitle, o.texts.idleTitle));
    else if (t < plan.depart) setWall("ground", t, () => screen.caption("", ""));
    else {
      const si = statusAt(Math.max(1, level));
      if (si !== lastStatus) {
        lastStatus = si;
        statusUntil = t + STATUS_HOLD;
      }
      // à l'arrivée, le statut final reste
      if (t < statusUntil || t >= plan.arrive) setWall(`status-${si}`, t, () => screen.caption(o.texts.statusLabel, o.texts.statuses[si]?.label ?? ""));
      else setWall("floor", t, () => screen.caption("", ""), false);
    }
    const glitch = t >= 0 ? 1 - seg(t, wallSwitch, 0.22) : 0;
    screen.uniforms.uGlitch.value = glitch * 0.6;
    screen.uniforms.uOn.value = dim;
    // le bouton de l'étage s'allume un peu avant le départ, puis s'éteint à l'arrivée
    btnOn.color.copy(hdr(accent.a, t >= plan.depart - 0.5 && t < plan.arrive ? 2.4 : 0.35));

    /* les portes */
    const open = t >= plan.doors ? inOut(seg(t, plan.doors, 1.0)) : 0;
    for (const d of doors) d.mesh.position.x = d.closed + d.dir * open * (DOOR_W / 2 + 0.02);
    seamMat.color.copy(hdr("#ffffff", t >= plan.arrive ? 5 * seg(t, plan.arrive + 0.1, 0.3) * (1 - seg(t, plan.doors + 0.1, 0.4)) : 0));
    seam.visible = open < 0.05;

    /* l'open space : les néons rangée par rangée, les écrans, l'allée */
    let lit = 0;
    const pops = rowMats.map((m, r) => {
      const at = plan.lights + r * 0.16;
      const pop = seg(t, at, 0.65);
      m.color.copy(hdr("#ffe1bc", (0.03 + 1.35 * pop) * dim));
      lit += (t >= at ? 1 : 0) / ROWS;
      return pop;
    });
    // la lumière précalculée suit les barres : chaque zone à la moyenne de ses rangées
    ZONES.forEach((rows, z) => baked.set(`z${z}` as "z0", NEON, (rows.reduce((a, r) => a + pops[r]!, 0) / rows.length) * dim * LIGHT.neon));
    baked.set("hero", WARM, seg(t, plan.doors + 0.2, 1.0) * dim * LIGHT.hero);
    baked.set("city", CITY, dim * LIGHT.city);
    baked.set("accent", levelColor, seg(t, plan.doors + 0.3, 0.9) * dim * LIGHT.accent);
    hemi.intensity = (0.12 + 0.6 * lit) * dim;
    city.uBright.value = 0.85 * dim;
    if (glassReflection) {
      // le miroir redessine la scène : seulement une fois les portes ouvertes
      glassReflection.mesh.visible = t >= plan.doors;
      glassReflection.strength.value = (0.15 + 0.85 * lit) * dim * LIGHT.glass;
    }
    pendantMat.color.copy(hdr(0xffdfb8, (0.05 + 1.5 * seg(t, plan.doors + 0.6, 0.8)) * dim));
    deskSpots.forEach((d, k) => {
      const on = 0.25 + 0.75 * seg(t, plan.lights + d.row * 0.16, 0.3);
      otherScreens.setColorAt(k, tmpColor.setScalar(on * 0.35 * dim));
    });
    otherScreens.instanceColor!.needsUpdate = true;
    for (let i = 0; i < PATH_N; i++) {
      const on = seg(t, plan.doors + 0.3 + i * 0.05, 0.25) * dim;
      const c = on > 0 ? tmpColor.set(accent.a).multiplyScalar(0.8 * on) : black;
      path.setColorAt(i * 2, c);
      path.setColorAt(i * 2 + 1, c);
    }
    path.instanceColor!.needsUpdate = true;
    heroSpot.intensity = 28 * seg(t, plan.doors + 0.5, 0.8) * dim;
    // une fois retourné, les néons sont derrière lui : ils le détourent, comme les enseignes de la rue
    neonL.intensity = neonR.intensity = (14 + 18 * inOut(seg(t, T_TURN, 0.9))) * seg(t, plan.doors + 0.6, 0.8) * dim;

    /* le pack */
    if (t < T_BURST + 0.45) {
      pack.visible = true;
      const shake = t >= 0 ? seg(t, 0, T_BURST) : 0;
      const amp = shake * shake * 0.04;
      const kk = Math.floor(now / 14);
      pack.position.set(PACK_POS.x + (rnd(kk, 3) - 0.5) * amp, PACK_POS.y + Math.sin(wall * 1.3) * 0.03 + (rnd(kk, 4) - 0.5) * amp, PACK_POS.z);
      pack.rotation.set(Math.sin(wall * 0.7) * 0.06, Math.sin(wall * 0.45) * 0.3 + (rnd(kk, 5) - 0.5) * amp * 3, (rnd(kk, 6) - 0.5) * amp);
      packSeamMat.opacity = shake;
      packSeam.scale.x = 0.2 + shake * 0.8;
      packLight.intensity = lerp(2, 8, shake) + (t >= T_BURST ? 40 * (1 - seg(t, T_BURST, 0.5)) : 0);
      if (t >= T_BURST) {
        const p = seg(t, T_BURST, 0.45);
        const s = 1 + p * 0.3;
        packBody.scale.set(s, s, s);
        foilFront.opacity = foilBack.opacity = foilSide.opacity = 1 - inCubic(p);
        crimpBottom.position.y = -0.79 - p * 0.5;
        crimpTop.position.y = 0.79 + p * 3;
        crimpTop.rotation.x = p * 7;
        crimpTop.rotation.z = p * 2;
      }
    } else {
      pack.visible = false;
      packLight.intensity = 0;
    }

    /* flashs : l'éclatement du pack, la carte */
    let wo = 0;
    if (t >= T_BURST) wo = Math.max(wo, 0.7 * Math.min(seg(t, T_BURST, 0.06), 1 - seg(t, T_BURST + 0.06, 0.35)));
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

    /* les révélations devant les portes */
    tellKey.intensity = tells.some((tl) => within(t, tl.win)) ? 14 : 0;
    for (const tl of tells) {
      const [a, b] = tl.win;
      const tau = t - a;
      const dur = b - a;
      tl.obj.visible = tau >= 0 && tau < dur;
      if (!tl.obj.visible) continue;
      const pin = outBack(seg(tau, 0, 0.45));
      const pout = inCubic(seg(tau, dur - 0.3, 0.3));
      tl.obj.position.set(TELL_POS.x, TELL_POS.y + Math.sin(tau * 2.4) * 0.015 + pout * 0.2, lerp(0.05, TELL_POS.z, Math.min(1, pin)));
      tl.obj.scale.setScalar(Math.max(0.001, Math.min(1.1, pin) * (1 - pout)));
      tl.obj.rotation.set(0, lerp(-Math.PI * 1.5, 0, outCubic(seg(tau, 0, 0.7))) + Math.sin(tau * 1.6) * 0.25, 0);
    }

    /* le dev */
    // Le poste reste présent derrière les portes dès la première image.
    // Masquer son groupe retire aussi ses lumières : sa réapparition forçait
    // une recompilation des shaders de toute la scène juste avant l'ouverture.
    {
      const turn = inOut(seg(t, T_TURN, 0.75));
      desk.swivel.rotation.y = turn * Math.PI;
      const typing = 1 - seg(t, T_TURN - 0.15, 0.3);
      player.pose(t, typing, turn, camera.position);
      desk.update(Math.max(0, t - plan.doors), seg(t, plan.doors - 0.2, 0.6) * dim);
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
        card.rotation.set(0, spin, 0);
      } else {
        if (!cardTarget) cardTarget = computeCardTarget();
        const p = inOut(seg(t, T_SETTLE, 1.05));
        card.position.lerpVectors(CARD_POS, cardTarget, p);
        card.scale.setScalar(1);
        card.rotation.set(0, 0, 0);
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
        const from = V(CARD_POS.x, CARD_POS.y + 0.05, CARD_POS.z + 0.9);
        slam.position.lerpVectors(from, target, pout);
        slam.rotation.y = lerp(0.5, 0, outCubic(pin));
        slam.scale.setScalar(Math.max(0.001, lerp(outBack(pin), 0.2, pout) * (pin < 1 ? lerp(2.2, 1, outCubic(pin)) : 1)));
        slamMat.opacity = pin * (1 - seg(ts, 1.1, 0.2));
      } else slam.visible = false;
    } else card.visible = false;

    camera_(t, wall);
    bloom.intensity = lerp(0.6, 0.35, seg(t, plan.doors, 1)) + (t >= T_BURST ? 0.8 * (1 - seg(t, T_BURST, 0.5)) : 0);
    noise.blendMode.opacity.value = lerp(0.14, 0.055, seg(t, plan.doors, 1));
    whiteBalance.gains.lerpVectors(WB_CABIN, WB_OFFICE, inOut(seg(t, plan.doors + 0.3, 1.5)));
    void dt;

    /* le HUD : étoiles, lignes du dossier (chacune reste une fois sa
     * révélation chromée repartie), carton de fin de mission, fondu à la passation */
    hud?.update({
      t,
      stars,
      lines: tells.filter((tl) => t >= tl.win[1] - 0.35).length,
      mission: within(t, plan.mission) ? Math.min(seg(t, plan.mission[0], 0.3), 1 - seg(t, plan.mission[1] - 0.25, 0.25)) : 0,
      distance: 0,
      altitude: level,
      opacity: t < 0 ? 0 : 1 - seg(t, T_HANDOFF - 0.4, 0.4),
    });
    prevT = t;

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
        prevT = s;
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
  // Préparer aussi les matières hors du champ de la cabine, avant que la
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
      radio.setMuted(true);
      if (!doneSent) {
        doneSent = true;
        handoffSent = true;
        setCue(null);
        o.onDone();
      }
    },
    setMuted(m) {
      sound.setMuted(m);
      radio.setMuted(m);
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
      studio.dispose();
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
