// La cabine d'ascenseur de la révélation : un vrai projet de cabine de bureaux
// (« JNKM Design - Elevator Cab Interior », Sketchfab, CC BY 4.0), préparé par
// tools/bake/prepare.py : inox brossé, plafond lumineux, mains courantes,
// boîte à boutons, portes et seuil. Ses parois de verre blanc sont habillées
// d'un placage de noyer photographié (Poly Haven), embarqué dans le GLB, en
// panneaux à livre ouvert du sol au plafond ; les mains courantes y sont
// fixées par des tiges rondes ; le sol de marbre blanc et le plafond d'inox
// brossé sont calepinés en moulinet (textures ambientCG). La scène n'y ajoute que ce qui bouge ou
// change par carte : l'ouverture des portes, l'afficheur, le bouton de
// l'étage d'arrivée à la couleur du tier, les numéros des boutons, la
// pancarte et la lumière des paliers dans le jour entre les portes.
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { limitLights } from "./baked";
import { createWallScreen, type WallScreen } from "./ledWall";

/* ---------- géométrie (mètres) : sol à y = 0, la façade intérieure en z = 0, la cabine vers +z ----------
 * Les cotes du modèle remis à l'échelle par prepare.py (portes de 2,1 m). */
export const CAB_W = 2.6; // x de -1,3 à 1,3 ; ouverture conservée à 1 m
export const CAB_H = 2.37; // sous le plafond lumineux
export const CAB_D = 3.0;
export const DOOR_W = 1.0;
export const DOOR_H = 2.1;
/** Les portes palières, dans le mur de l'open space (tools/bake/office.py, z = -0,25). */
const LANDING_Z = -0.25;
/** Placage de noyer assombri par un gris neutre ; finition mate et relief discret. */
const WALNUT_TINT = 0xaaaaaa;
/** La définition de la photo de la cabine que reflètent les miroirs (px par face). */
const MIRROR_ENV_SIZE = 1024;
/** Le marbre noir veiné des joints du sol, réchauffé en brun foncé. */
const FLOOR_DARK_TINT = 0xb08a70;

const hdr = (hex: THREE.ColorRepresentation, k: number) => new THREE.Color(hex).multiplyScalar(k);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/* ---------- les reflets projetés sur la boîte ----------
 * Une carte d'environnement est photographiée depuis un seul point : sans
 * correction, une matière la reflète comme si la cabine était infiniment
 * loin (le reflet ne bouge pas avec la caméra). On prolonge le rayon réfléchi
 * jusqu'aux parois de la cabine et on lit la carte dans la direction du point
 * touché, vue depuis le point de prise de vue. */
const IBL_DIR = "reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );";
function boxProjection(mat: THREE.Material, probe: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBoxMin = { value: min };
    shader.uniforms.uBoxMax = { value: max };
    shader.uniforms.uProbe = { value: probe };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBoxPos;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvBoxPos = worldPosition.xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vBoxPos;
        uniform vec3 uBoxMin;
        uniform vec3 uBoxMax;
        uniform vec3 uProbe;
        vec3 boxProjected( vec3 dir ) {
          vec3 p = vBoxPos;
          // hors de la cabine (portes palières, bureaux) : pas de correction
          if ( any( lessThan( p, uBoxMin - 0.12 ) ) || any( greaterThan( p, uBoxMax + 0.12 ) ) ) return dir;
          vec3 d = dir + sign( dir ) * 1e-5;
          vec3 t = mix( ( uBoxMin - p ) / d, ( uBoxMax - p ) / d, step( vec3( 0.0 ), dir ) );
          float f = max( min( min( t.x, t.y ), t.z ), 0.0 );
          return normalize( p + dir * f - uProbe );
        }`,
      )
      .replace("#include <envmap_physical_pars_fragment>", THREE.ShaderChunk.envmap_physical_pars_fragment.replace(IBL_DIR, `${IBL_DIR}\nreflectVec = boxProjected( reflectVec );`));
  };
  mat.customProgramCacheKey = () => "cabin-box-projection";
}

/** Les miroirs : la photo de la cabine projetée sur la boîte, et le reflet de
 * la main courante de la même paroi, un cylindre ovale le long de z. */
const MIRROR_VERT = /* glsl */ `
varying vec3 vPos;
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vPos = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
const MIRROR_FRAG = /* glsl */ `
uniform samplerCube uEnv;
uniform vec3 uProbe;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform vec3 uNormal;
uniform vec3 uTint;
uniform vec3 uSteel;
uniform vec4 uRail; // centre (x, y) et demi-axes de la main courante
uniform vec2 uRailZ;
varying vec3 vPos;
vec3 boxed( vec3 p, vec3 dir ) {
  vec3 d = dir + sign( dir ) * 1e-5;
  vec3 t = mix( ( uBoxMin - p ) / d, ( uBoxMax - p ) / d, step( vec3( 0.0 ), dir ) );
  float f = max( min( min( t.x, t.y ), t.z ), 0.0 );
  return normalize( p + dir * f - uProbe );
}
void main() {
  vec3 r = reflect( normalize( vPos - cameraPosition ), uNormal );
  vec3 color = textureCube( uEnv, boxed( vPos, r ) ).rgb;
  // la main courante : intersection du rayon réfléchi et du cylindre,
  // bord adouci sur un pixel
  vec2 o = ( vPos.xy - uRail.xy ) / uRail.zw;
  vec2 d = r.xy / uRail.zw;
  float a = max( dot( d, d ), 1e-8 );
  float b = dot( o, d );
  float disc = b * b - a * ( dot( o, o ) - 1.0 );
  float t = ( -b - sqrt( max( disc, 0.0 ) ) ) / a;
  vec3 h = vPos + r * t;
  float cover = clamp( disc / max( fwidth( disc ), 1e-6 ) + 0.5, 0.0, 1.0 ) * step( 0.0, t ) * step( uRailZ.x, h.z ) * step( h.z, uRailZ.y );
  if ( cover > 0.0 ) {
    vec3 n = normalize( vec3( ( h.xy - uRail.xy ) / ( uRail.zw * uRail.zw ), 0.0 ) );
    vec3 rail = textureLod( uEnv, boxed( h, reflect( r, n ) ), 6.0 ).rgb * uSteel;
    color = mix( color, rail, cover );
  }
  gl_FragColor = vec4( color * uTint, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** La main courante d'une paroi (côté `side`), mesurée sur le modèle : son
 * centre et ses demi-axes dans le plan x-y, sa longueur le long de z. */
function railOf(mesh: THREE.Mesh, side: -1 | 1, rail: THREE.Vector4, along: THREE.Vector2) {
  const pos = mesh.geometry.getAttribute("position");
  const p = new THREE.Vector3();
  const lo = V(Infinity, Infinity, Infinity);
  const hi = V(-Infinity, -Infinity, -Infinity);
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    // la main courante latérale, sans les retours de celle du fond (|x| < 1,13)
    if (side * p.x < 1.135 || p.y < 0.8 || p.y > 0.95) continue;
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z);
    // la section, mesurée aux deux bouts (un tube droit n'a de sommets qu'à
    // ses extrémités), loin des tiges de fixation (z = 0,65 et 2,3 m)
    if (p.z > 0.5 && p.z < 2.5) continue;
    lo.min(p);
    hi.max(p);
  }
  if (!Number.isFinite(lo.x)) return;
  rail.set((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (hi.x - lo.x) / 2, (hi.y - lo.y) / 2);
  along.set(z0, z1);
}

export interface CabinOptions {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  /** Couleur du tier (afficheur et bouton de l'étage). */
  accent: string;
  /** Le modèle de la cabine (cabin.glb, tools/bake/prepare.py). */
  model: GLTF;
  /** L'étage d'arrivée (la note) : numéros de la boîte à boutons. */
  floor: number;
}

export interface Cabin {
  /** Portes de la cabine et portes palières ; `closed` : x en position fermée. */
  doors: { mesh: THREE.Object3D; dir: number; closed: number }[];
  /** L'afficheur sur la platine à droite de la porte. */
  screen: WallScreen;
  /** L'inox de la façade, repris pour les tableaux de la porte côté bureaux. */
  brushedSteel: THREE.MeshStandardMaterial;
  /** La lumière des paliers dans le jour entre les portes. */
  shaftTex: THREE.Texture;
  shaftMat: THREE.MeshBasicMaterial;
  shaftGap: THREE.Mesh;
  /** Lumières de la cabine, 0 (éteintes) à 1. */
  setLight(k: number): void;
  /** Le halo du bouton de l'étage d'arrivée. */
  btnOn: THREE.MeshBasicMaterial;
  /** La lumière du palier dans le joint des portes, à l'arrivée. */
  seam: THREE.Mesh;
  seamMat: THREE.MeshBasicMaterial;
  dispose(): void;
}

/** Construit la cabine dans la scène (avant le reste : ses reflets sont photographiés de l'intérieur). */
export function createCabin(o: CabinOptions): Cabin {
  const { scene, renderer } = o;
  const disposables: { dispose(): void }[] = [];
  const keep = <X extends { dispose(): void }>(x: X): X => {
    disposables.push(x);
    return x;
  };
  const cabin = new THREE.Group();
  scene.add(cabin);

  /* ---------- le modèle ----------
   * Ses matières sont reprises telles quelles (le modèle est partagé par
   * toutes les révélations de la page) : on les copie pour régler reflets
   * et rugosité, et pour donner aux métaux les reflets de la cabine. */
  const parts: Record<string, THREE.Object3D> = {};
  const copies = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const cabinMats: THREE.MeshStandardMaterial[] = [];
  const own = (m: THREE.Material) => {
    let c = copies.get(m);
    if (!c) {
      c = keep((m as THREE.MeshStandardMaterial).clone());
      copies.set(m, c);
      cabinMats.push(c);
    }
    return c;
  };
  o.model.scene.updateMatrixWorld(true);
  o.model.scene.traverse((src) => {
    const m = src as THREE.Mesh;
    if (!m.isMesh) return;
    const mesh = new THREE.Mesh(m.geometry, Array.isArray(m.material) ? m.material.map(own) : own(m.material));
    mesh.matrix.copy(m.matrixWorld);
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    // gltfpack ou l'export peuvent porter le nom sur le nœud parent
    const name = m.name && !/^mesh_\d+/.test(m.name) ? m.name : (m.parent?.name ?? "");
    parts[name] = mesh;
    cabin.add(mesh);
  });
  const matNamed = (name: string) => cabinMats.find((m) => m.name === name);
  // l'inox poli de la façade et des portes : la texture du modèle donne le brossé
  const facade = matNamed("M_Steel1")!;
  facade.roughness = 0.28;
  facade.envMapIntensity = 1;
  // les portes : le même inox, plus mat, sinon le reflet du plafond fait une
  // barre blanche qui écrase le joint central
  const doorSteel = keep(facade.clone());
  doorSteel.roughness = 0.38;
  doorSteel.color.setScalar(0.72);
  doorSteel.envMapIntensity = 0.7;
  cabinMats.push(doorSteel);
  // les parois : le verre blanc du modèle est habillé de noyer, en panneaux
  // à livre ouvert séparés par des joints (woodPanels) ; la couleur, le
  // relief et la rugosité viennent du scan, posés en mètres sur la paroi
  const walnut = matNamed("M_White_Glass");
  if (walnut) {
    walnut.color.set(WALNUT_TINT);
    walnut.normalScale.set(0.15, 0.15);
    walnut.roughness = 0.9;
    walnut.envMapIntensity = 0.3;
    for (const texture of [walnut.map, walnut.normalMap, walnut.roughnessMap]) {
      if (texture) texture.anisotropy = 8;
    }
  }
  // le plafond : le marbre blanc du sol, poli ; il ne reçoit pas la lumière
  // du plafonnier, tournée vers le bas : seulement le reflet de la cabine
  const ceilingMarble = matNamed("M_Ceiling_Marble");
  if (ceilingMarble) {
    ceilingMarble.roughness = 0.42;
    ceilingMarble.normalScale.set(0.08, 0.08);
    ceilingMarble.envMapIntensity = 1.4;
  }
  // les mains courantes : inox satiné, pas le gris mat de l'export
  const handle = matNamed("M_Handle");
  if (handle) handle.roughness = 0.3;
  // le sol en moulinet : dalles de marbre blanc, joints et bordure en marbre
  // sombre, teinté brun comme un emperador
  const floorMats = [matNamed("M_Floor"), matNamed("M_Floor_Dark")].filter((m) => m !== undefined);
  matNamed("M_Floor_Dark")?.color.set(FLOOR_DARK_TINT);
  for (const floorMat of floorMats) {
    floorMat.roughness = 0.42;
    floorMat.normalScale.set(0.08, 0.08);
    floorMat.envMapIntensity = 0.45;
    if (floorMat.map) floorMat.map.anisotropy = 8;
    if (floorMat.normalMap) floorMat.normalMap.anisotropy = 8;
    if (floorMat.roughnessMap) floorMat.roughnessMap.anisotropy = 8;
  }

  // La photo est embarquée dans le GLB ; le texte de la pancarte est tracé
  // à haute résolution, sur un papier mat qui reçoit la lumière de la cabine.
  const noticeTexture = keep(makeCabinNotice());
  const noticeMaterial = keep(new THREE.MeshStandardMaterial({ map: noticeTexture, roughness: 0.92, envMapIntensity: 0.15 }));
  cabinMats.push(noticeMaterial);
  (parts.wall_notice as THREE.Mesh).material = noticeMaterial;

  // les portes : les deux vantaux du modèle, et leur copie pour les portes palières
  const doors: Cabin["doors"] = [];
  for (const [name, dir] of [["door_l", -1], ["door_r", 1]] as const) {
    const leaf = parts[name] as THREE.Mesh;
    leaf.material = doorSteel;
    doors.push({ mesh: leaf, dir, closed: leaf.position.x });
    const box = new THREE.Box3().setFromObject(leaf);
    const landing = leaf.clone();
    landing.position.z += LANDING_Z - (box.min.z + box.max.z) / 2;
    cabin.add(landing);
    doors.push({ mesh: landing, dir, closed: landing.position.x });
  }
  const doorBox = new THREE.Box3().setFromObject(parts.door_l!);

  // le pavé LED et les quatre spots du plafond, et la lumière en direct
  // qu'ils donnent à la cabine : une seule lumière rectangulaire, de la taille
  // de l'ancienne dalle lumineuse, pour garder l'éclairage de la cabine
  const ceiling = parts.ceiling_light as THREE.Mesh;
  const glowMat = new THREE.MeshBasicMaterial({ color: hdr("#fff3e4", 2.2), toneMapped: false });
  ceiling.material = keep(glowMat);
  RectAreaLightUniformsLib.init();
  const LIGHT = 9;
  const cabinLight = new THREE.RectAreaLight(0xfff0de, LIGHT, 1.6, 1.6);
  cabinLight.position.set(0, CAB_H - 0.005, CAB_D / 2);
  cabinLight.lookAt(0, 0, CAB_D / 2);
  cabin.add(cabinLight);

  // la gaine, vue par le jour entre les portes : la lumière des paliers défile
  const shaftTex = keep(makeShaftTexture());
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTex, color: hdr("#ffe9d0", 2), toneMapped: false, transparent: true, opacity: 0.3, depthWrite: false });
  const shaftGap = new THREE.Mesh(new THREE.PlaneGeometry(0.08, DOOR_H), shaftMat);
  shaftGap.position.set(0, DOOR_H / 2, (doorBox.min.z + LANDING_Z) / 2);
  scene.add(shaftGap);
  const seamMat = new THREE.MeshBasicMaterial({ color: hdr("#ffffff", 0), toneMapped: false, transparent: true });
  const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.008, DOOR_H), seamMat);
  seam.position.set(0, DOOR_H / 2, doorBox.max.z + 0.003);
  scene.add(seam);

  // Un seul afficheur, à hauteur des yeux, sur la platine latérale du modèle.
  const DISP = { w: 0.34, h: 0.32 };
  const screen = keep(createWallScreen(o.accent, DISP));
  // Les UV du GLB ont déjà été retournés par l'export glTF.
  screen.texture.flipY = false;
  (parts.cop_display as THREE.Mesh).material = screen.material;

  // Destination, ouverture, fermeture, alarme. Seule la destination s'allume.
  const btnOn = keep(new THREE.MeshBasicMaterial({ color: hdr(o.accent, 0.35), toneMapped: false }));
  (parts.button_arrival as THREE.Mesh).material = btnOn;
  const buttons = JSON.parse(String(o.model.scene.userData.buttons ?? "[]")) as [number, number, number][];
  if (buttons.length) {
    const labels = keep(makeButtonLabels(buttons, o.floor));
    const ink = new THREE.Mesh(new THREE.PlaneGeometry(labels.w, labels.h), new THREE.MeshBasicMaterial({ map: labels.texture, transparent: true, toneMapped: false, depthWrite: false }));
    ink.position.set(labels.x, labels.y, Math.max(...buttons.map((b) => b[2])) + 0.0015);
    cabin.add(ink);
  }

  // les reflets de la cabine : on la photographie de l'intérieur (deux fois,
  // pour que l'inox se reflète aussi dans l'inox) et ses matières reflètent cette image
  // projetée sur la boîte de la cabine : le reflet d'une paroi tombe à sa
  // vraie place et se décale quand la caméra avance
  const probe = V(0, 1.45, 1.4);
  for (const m of cabinMats) boxProjection(m, probe, V(-CAB_W / 2, 0, -0.02), V(CAB_W / 2, CAB_H, CAB_D));
  for (const floorMat of floorMats) floorFinish(floorMat);
  // Traces dans la rugosité : surtout lisibles en reflet, liées aux surfaces
  // (et non à la caméra), y compris quand les portes coulissent.
  const wear = keep(makeSteelWear());
  const controlSteel = matNamed("M_Control_Steel");
  for (const mat of [facade, doorSteel, ...(controlSteel ? [controlSteel] : [])]) steelWear(mat, wear);
  // les côtés en trois panneaux de noyer, le fond en deux (le modèle n'a qu'une vitre par paroi)
  if (walnut) woodPanels(walnut, [CAB_D / 3, (2 * CAB_D) / 3], [0]);
  // seules la dalle du plafond et l'éclat du pack éclairent la cabine : les
  // projecteurs de l'open space n'y entrent pas, inutile de les évaluer
  for (const m of cabinMats) limitLights(m, ["NUM_RECT_AREA", "NUM_POINT_LIGHTS"], "cabin");
  const pmrem = new THREE.PMREMGenerator(renderer);
  let cabinEnv: THREE.Texture | null = null;
  for (let pass = 0; pass < 2; pass++) {
    const next = pmrem.fromScene(scene, 0.008, 0.02, 20, { position: probe, size: 512 }).texture;
    for (const m of cabinMats) m.envMap = next;
    cabinEnv?.dispose();
    cabinEnv = next;
  }
  pmrem.dispose();
  disposables.push(cabinEnv!);

  // les miroirs : du sol au plafond, au milieu de chaque paroi latérale, à la
  // place du panneau de noyer central (entre ses deux joints). Leur reflet est
  // précalculé : la cabine photographiée une fois, nette, depuis le point des
  // reflets de l'inox, et projetée sur la boîte comme eux (exact pour tout ce
  // qui est posé sur les parois). Seule la main courante, à 9 cm devant le
  // miroir, ne figure pas sur la photo vue sous cet angle : son reflet est
  // calculé dans le shader (un cylindre ovale). Le pack et ses étincelles n'y
  // apparaissent pas ; le coût est celui d'un panneau texturé.
  // avec ses mipmaps : le miroir vu en biais reste propre, et la main
  // courante, en inox satiné, y lit un reflet flou
  const mirrorEnv = keep(
    new THREE.WebGLCubeRenderTarget(MIRROR_ENV_SIZE, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }),
  );
  const mirrorCam = new THREE.CubeCamera(0.02, 20, mirrorEnv);
  mirrorCam.position.copy(probe);
  mirrorCam.updateMatrixWorld();
  mirrorCam.update(renderer, scene);
  cabin.updateMatrixWorld(true);
  const railMesh = cabin.getObjectsByProperty("isMesh", true).find((m) => ((m as THREE.Mesh).material as THREE.Material).name === "M_Handle") as THREE.Mesh | undefined;
  for (const side of [-1, 1] as const) {
    const rail = new THREE.Vector4(0, -10, 1, 1);
    const railZ = new THREE.Vector2(0, 0);
    if (railMesh) railOf(railMesh, side, rail, railZ);
    const material = keep(
      new THREE.ShaderMaterial({
        uniforms: {
          uEnv: { value: mirrorEnv.texture },
          uProbe: { value: probe },
          uBoxMin: { value: V(-CAB_W / 2, 0, -0.02) },
          uBoxMax: { value: V(CAB_W / 2, CAB_H, CAB_D) },
          uNormal: { value: V(-side, 0, 0) },
          // la réflectance d'un miroir argenté, avec le léger vert du verre
          uTint: { value: new THREE.Color(0.86, 0.89, 0.87) },
          uSteel: { value: new THREE.Color(0.9, 0.9, 0.9) },
          uRail: { value: rail },
          uRailZ: { value: railZ },
        },
        vertexShader: MIRROR_VERT,
        fragmentShader: MIRROR_FRAG,
      }),
    );
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(CAB_D / 3 - 0.003, CAB_H), material);
    disposables.push(mirror.geometry);
    mirror.position.set(side * (CAB_W / 2 - 0.006), CAB_H / 2, CAB_D / 2);
    mirror.rotation.y = -side * (Math.PI / 2);
    cabin.add(mirror);
  }

  return {
    doors,
    screen,
    brushedSteel: facade,
    shaftTex,
    shaftMat,
    shaftGap,
    setLight(k) {
      cabinLight.intensity = LIGHT * k;
      glowMat.color.copy(hdr("#fff3e4", 2.2 * k));
    },
    btnOn,
    seam,
    seamMat,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

/** Les UV des feuilles de noyer sont préparés dans Blender, avec le fil
 * vertical et des morceaux différents par panneau. Le shader ajoute les
 * joints de 3 mm et une finition mate. `alongZ` : joints des parois
 * latérales (z) ; `alongX` : du fond (x). */
function woodPanels(mat: THREE.Material, alongZ: number[], alongX: number[]) {
  const previous = mat.onBeforeCompile;
  const f = (x: number) => x.toFixed(3);
  const nearest = (v: number[]) => v.map((x) => `abs( woodC - ${f(x)} )`).reduce((a, b) => `min( ${a}, ${b} )`);
  mat.onBeforeCompile = (shader, renderer) => {
    previous.call(mat, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWoodNormal;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvWoodNormal = normalize( mat3( modelMatrix ) * objectNormal );");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWoodNormal;")
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        // paroi latérale : le long de z ; fond : le long de x
        // L'orientation de la face, pas sa proximité avec l'angle : le fond
        // doit garder le même veinage jusque sur ses bords élargis.
        bool woodSide = abs( vWoodNormal.x ) > abs( vWoodNormal.z );
        float woodC = woodSide ? vBoxPos.z : vBoxPos.x;
        float woodD = woodSide ? ${nearest(alongZ)} : ${nearest(alongX)};
        float woodJoint = 1.0 - smoothstep( 0.0015, 0.0015 + 1.5 * fwidth( woodC ), woodD );`,
      )
      .replace("#include <color_fragment>", "#include <color_fragment>\n        diffuseColor.rgb *= 1.0 - 0.85 * woodJoint;")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n        roughnessFactor = mix( clamp( roughnessFactor, 0.55, 0.82 ), 0.8, woodJoint );");
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `wood-panels|${key()}`;
}

/** La lumière de la gaine vue par les fentes : deux paliers éclairés par tuile, bords doux. */
function makeShaftTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, 8, 256);
  for (const y of [64, 192]) {
    const grad = g.createLinearGradient(0, y - 34, 0, y + 34);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.9)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.9)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, y - 34, 8, 68);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Marquage gris discret et pictogrammes dessinés, sans glyphes emoji dépendants de l'OS. */
function makeButtonLabels(buttons: [number, number, number][], top: number) {
  const PX = 2000;
  const PAD = 0.06;
  const xs = buttons.map((b) => b[0]);
  const ys = buttons.map((b) => b[1]);
  const x0 = Math.min(...xs) - PAD;
  const x1 = Math.max(...xs) + PAD;
  const y0 = Math.min(...ys) - 0.11;
  const y1 = Math.max(...ys) + PAD;
  const c = document.createElement("canvas");
  c.width = Math.round((x1 - x0) * PX);
  c.height = Math.round((y1 - y0) * PX);
  const g = c.getContext("2d")!;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = g.strokeStyle = "#202327";
  g.lineWidth = 3;
  g.lineCap = g.lineJoin = "round";
  buttons.forEach(([x, y], i) => {
    g.save();
    g.translate((x - x0) * PX, (y1 - y) * PX);
    if (i === 0) {
      g.font = "600 40px 'Barlow Condensed', 'Arial Narrow', sans-serif";
      g.fillText(String(top), 0, 1);
    } else if (i === 1 || i === 2) {
      for (const side of [-1, 1]) {
        const dir = side * (i === 1 ? 1 : -1);
        const cx = side * 12;
        g.beginPath();
        g.moveTo(cx + dir * 7, 0);
        g.lineTo(cx - dir * 6, -10);
        g.lineTo(cx - dir * 6, 10);
        g.closePath();
        g.fill();
      }
      g.fillRect(-1.5, -12, 3, 24);
    } else {
      g.beginPath();
      g.moveTo(-14, 10);
      g.quadraticCurveTo(-9, 5, -9, -4);
      g.bezierCurveTo(-9, -17, 9, -17, 9, -4);
      g.quadraticCurveTo(9, 5, 14, 10);
      g.closePath();
      g.stroke();
      g.beginPath();
      g.arc(0, 14, 3, 0, Math.PI);
      g.stroke();
    }
    g.restore();
  });
  g.font = "500 14px 'Arial', sans-serif";
  g.fillText("1000 kg · 13 pers.", c.width / 2, c.height - 30);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, w: x1 - x0, h: y1 - y0, x: (x0 + x1) / 2, y: (y0 + y1) / 2, dispose: () => texture.dispose() };
}

/** Marbre blanc satiné : la texture est conservée, avec un léger
 * polissage de passage près du seuil. Coordonnées de la cabine en mètres. */
function floorFinish(mat: THREE.MeshStandardMaterial) {
  const previous = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    previous.call(mat, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        float passage = exp(-pow(vBoxPos.x / 0.65, 4.0)) * exp(-max(vBoxPos.z, 0.0) * 1.8);
        roughnessFactor = mix(clamp(roughnessFactor, 0.32, 0.52), 0.27, passage * 0.3);
        diffuseColor.rgb *= 1.0 - passage * 0.018;`);
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `cabin-floor|${key()}`;
}

/** Une information d'immeuble imprimée sur papier, sans émission lumineuse. */
function makeCabinNotice(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 768;
  c.height = 1084;
  const g = c.getContext("2d")!;
  g.fillStyle = "#e5e0d4";
  g.fillRect(0, 0, c.width, c.height);
  // Papier légèrement irrégulier ; aucune saleté très contrastée.
  let seed = 29;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 6500; i++) {
    g.fillStyle = `rgba(87,75,54,${random() * 0.035})`;
    g.fillRect(random() * c.width, random() * c.height, 1 + random(), 1 + random());
  }
  g.fillStyle = "#405b62";
  g.fillRect(54, 62, 64, 6);
  g.font = "500 20px 'JetBrains Mono', monospace";
  g.fillText("VIE DE L’IMMEUBLE", 54, 108);
  g.fillStyle = "#242b2d";
  g.font = "600 66px 'Barlow Condensed', sans-serif";
  g.fillText("INFORMATIONS", 50, 198);
  g.font = "400 25px Arial, sans-serif";
  g.fillStyle = "#606461";
  g.fillText("Quelques repères au quotidien.", 54, 250);
  const entries = [
    ["01", "ACCUEIL", "Rez-de-chaussée", "Pour toute question sur l’immeuble."],
    ["02", "ESPACES COMMUNS", "Des lieux à partager", "Merci de les laisser propres."],
    ["03", "ASCENSEUR", "Un passage pour tous", "Merci de laisser les portes libres."],
  ];
  entries.forEach(([n, title, line1, line2], i) => {
    const y = 340 + i * 195;
    g.fillStyle = "#405b62";
    g.font = "500 22px 'JetBrains Mono', monospace";
    g.fillText(n!, 54, y);
    g.fillStyle = "#b9b8ad";
    g.fillRect(54, y + 24, 660, 1);
    g.fillStyle = "#303638";
    g.font = "600 31px 'Barlow Condensed', sans-serif";
    g.fillText(title!, 125, y);
    g.font = "400 27px Arial, sans-serif";
    g.fillText(line1!, 125, y + 68);
    g.fillStyle = "#606461";
    g.font = "400 23px Arial, sans-serif";
    g.fillText(line2!, 125, y + 108);
  });
  g.fillStyle = "#777a72";
  g.font = "400 22px Arial, sans-serif";
  g.fillText("Merci de votre attention.", 54, 1008);
  // Petit coin plié, presque ton sur ton.
  g.fillStyle = "#cdc8bb";
  g.beginPath();
  g.moveTo(c.width - 24, 0);
  g.lineTo(c.width - 24, 24);
  g.lineTo(c.width, 24);
  g.closePath();
  g.fill();
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false; // UV du panneau exportés par glTF
  texture.anisotropy = 8;
  return texture;
}

/** RGB = traces de doigts, rayures, dépôts. Placement en mètres sur l'inox. */
function makeSteelWear(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, c.width, c.height);
  const px = (x: number) => (x / CAB_W + 0.5) * c.width;
  const py = (y: number) => (1 - y / CAB_H) * c.height;
  let seed = 71;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  const mark = (x: number, y: number, w: number, h: number, rgb: string, opacity: number) => {
    g.save();
    g.translate(px(x), py(y));
    g.scale(w * c.width / CAB_W, h * c.height / CAB_H);
    const fade = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    fade.addColorStop(0, `rgba(${rgb},${opacity})`);
    fade.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = fade;
    g.fillRect(-1, -1, 2, 2);
    g.restore();
  };
  // Toucher : autour des commandes, quelques traces sur les vantaux.
  for (const [x, y] of [[0.9, 1.43], [0.83, 1.28], [0.97, 1.28], [0.9, 1.13], [-0.3, 1.3], [0.25, 1.05]]) {
    for (let i = 0; i < 5; i++) mark(x + (random() - 0.5) * 0.09, y + (random() - 0.5) * 0.08, 0.015 + random() * 0.025, 0.025 + random() * 0.035, "255,0,0", 0.22);
  }
  // Frottements courts au bas des portes ; pas une couche de bruit uniforme.
  g.lineWidth = 0.65;
  for (let i = 0; i < 85; i++) {
    const x = (random() - 0.5) * 0.95;
    const y = 0.07 + random() * random() * 0.65;
    g.strokeStyle = `rgba(0,255,0,${0.08 + random() * 0.22})`;
    g.beginPath();
    g.moveTo(px(x), py(y));
    g.lineTo(px(x + 0.008 + random() * 0.055), py(y + (random() - 0.5) * 0.009));
    g.stroke();
  }
  for (let i = 0; i < 28; i++) mark((random() - 0.5) * CAB_W, 0.02 + random() * 0.045, 0.025 + random() * 0.06, 0.035, "0,0,255", 0.3);
  const texture = new THREE.CanvasTexture(c);
  texture.anisotropy = 8;
  return texture;
}

function steelWear(mat: THREE.MeshStandardMaterial, texture: THREE.Texture) {
  const previous = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    previous.call(mat, shader, renderer);
    shader.uniforms.uSteelWear = { value: texture };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vSteelWearUv;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\nvSteelWearUv = vec2(position.x / ${CAB_W.toFixed(3)} + 0.5, position.y / ${CAB_H.toFixed(3)});`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D uSteelWear;\nvarying vec2 vSteelWearUv;")
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        vec3 wear = texture2D(uSteelWear, vSteelWearUv).rgb;
        roughnessFactor = clamp(roughnessFactor + wear.r * 0.35 + wear.g * 0.25 + wear.b * 0.3, 0.0, 1.0);
        diffuseColor.rgb *= 1.0 - wear.r * 0.06 - wear.b * 0.18;`);
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `steel-wear|${key()}`;
}
