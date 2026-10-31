// Assets de la scène 3D (web/public/3d) : le décor de l'open space et sa
// lumière précalculés dans Blender (tools/bake/office.py), matières PBR de
// bois et de moquette, plante, fauteuil, bureau et objets du poste, personnage
// habillé et police Barlow Condensed ; et, pour la plongée (SPEC §17.4), le
// ciel, la ville et les palmiers quand ils existent (chantier B1), sinon la
// scène met un remplaçant procédural. Sources et licences :
// public/3d/CREDITS.txt. Modèles compressés meshopt, textures WebP,
// préchargés pendant le scoring, une seule fois par page.
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FontLoader, type Font } from "three/examples/jsm/loaders/FontLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { LIGHT_GROUPS, packLightmaps, type BakedOffice, type LightGroup } from "./baked";

export interface PbrSet {
  map?: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

export interface WalkoutAssets {
  /** L'ancien panorama de la ville derrière les baies, s'il est encore là (horizon lointain). */
  skyline?: THREE.Texture;
  /** Le ciel de l'heure bleue en équirectangulaire (sky.webp), s'il existe. */
  sky?: THREE.Texture;
  /** La ville de la plongée (city.glb) et un palmier (palm.glb), s'ils existent. */
  city?: GLTF;
  palm?: GLTF;
  player: GLTF;
  font: Font;
  wood: PbrSet;
  carpet: PbrSet;
  plant: GLTF;
  chair: GLTF;
  /** Le poste du dev : bureau et objets (tools/bake/prepare.py). */
  desk: Record<DeskModel, GLTF>;
  office: BakedOffice;
}

const BASE = "/3d/";

/** Les modèles du poste du dev, chacun dans web/public/3d/{nom}.glb. */
export const DESK_MODELS = ["desk", "monitor", "keyboard", "mouse", "deskmat", "mug", "lamp", "desk-headphones", "phone", "notebook", "pen", "postit", "desk-bottle", "desk-plant"] as const;
export type DeskModel = (typeof DESK_MODELS)[number];

/** Géométries et matières des modèles chargés : partagées par toutes les scènes
 * de la page, une scène qui se ferme ne les libère pas (le GPU les garde). */
export const sharedResources = new WeakSet<object>();
const share = (g: GLTF) => {
  g.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    sharedResources.add(m.geometry);
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) sharedResources.add(mat);
  });
  return g;
};
let pending: Promise<WalkoutAssets> | null = null;

function texture(loader: THREE.TextureLoader, file: string, color = false): Promise<THREE.Texture> {
  return loader.loadAsync(BASE + file).then((t) => {
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  });
}

async function surface(loader: THREE.TextureLoader, name: string): Promise<PbrSet> {
  const [map, normalMap, roughnessMap] = await Promise.all([
    texture(loader, `${name}-color.webp`, true),
    texture(loader, `${name}-normal.webp`),
    texture(loader, `${name}-roughness.webp`),
  ]);
  return { map, normalMap, roughnessMap };
}

/** Le décor de l'open space et sa lumière précalculée dans Blender (tools/bake/office.py). */
async function bakedOffice(gltf: GLTFLoader): Promise<BakedOffice> {
  const image = (g: LightGroup) => new THREE.ImageLoader().loadAsync(`${BASE}office-lm-${g}.webp`);
  const [model, ...images] = await Promise.all([gltf.loadAsync(BASE + "office.glb"), ...LIGHT_GROUPS.map(image)]);
  const meta = JSON.parse(String(model.scene.userData.lightmap ?? "{}")) as { groups?: Record<LightGroup, { scale: number }> };
  const [lightA, lightB] = packLightmaps(Object.fromEntries(LIGHT_GROUPS.map((g, i) => [g, images[i]!])) as Record<LightGroup, HTMLImageElement>);
  const scale = Object.fromEntries(LIGHT_GROUPS.map((g) => [g, meta.groups?.[g]?.scale ?? 1])) as Record<LightGroup, number>;
  return { scene: model.scene, lightA, lightB, scale };
}

/** Un asset facultatif : absent, on continue sans. */
const optional = <X,>(p: Promise<X>): Promise<X | undefined> => p.catch(() => undefined);

/** Lance (une fois) le chargement des assets ; sans risque à appeler souvent. */
export function preloadWalkoutAssets(): Promise<WalkoutAssets> {
  if (!pending) {
    const tex = new THREE.TextureLoader();
    const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    pending = Promise.all([
      optional(
        texture(tex, "city.webp", true).then((t) => {
          t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
          return t;
        }),
      ),
      gltf.loadAsync(BASE + "developer-v3.glb"),
      new FontLoader().loadAsync(BASE + "barlow-800.typeface.json"),
      surface(tex, "walnut"),
      bakedOffice(gltf),
      surface(tex, "carpet"),
      gltf.loadAsync(BASE + "plant-v2.glb"),
      gltf.loadAsync(BASE + "chair.glb"),
      Promise.all(DESK_MODELS.map((n) => gltf.loadAsync(`${BASE}${n}.glb`))),
      optional(texture(tex, "sky.webp", true)),
      optional(gltf.loadAsync(BASE + "city.glb")),
      optional(gltf.loadAsync(BASE + "palm.glb")),
    ]).then(([skyline, player, font, wood, office, carpet, plant, chair, deskModels, sky, city, palm]) => {
      for (const g of [player, plant, chair, ...deskModels]) share(g);
      if (city) share(city);
      if (palm) share(palm);
      office.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) sharedResources.add((o as THREE.Mesh).geometry);
      });
      return {
        skyline,
        sky,
        city,
        palm,
        player,
        font,
        wood,
        office,
        carpet,
        plant,
        chair,
        desk: Object.fromEntries(DESK_MODELS.map((n, i) => [n, deskModels[i]!])) as Record<DeskModel, GLTF>,
      };
    });
    // un échec ne doit pas rester en cache : on retentera à la prochaine révélation
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
