// La lumière précalculée de l'open space (tools/bake/office.py, Blender Cycles).
// Le décor fixe n'évalue aucune lumière en direct : son éclairage vient de six
// textures d'éclairement, une par groupe de lumières, que la scène mélange à
// chaque image avec la couleur et l'intensité du moment (les néons rangée par
// rangée, le poste du dev, la ville, le liseré du tier). Les reflets restent
// ceux de la carte d'environnement.
import * as THREE from "three";

export const LIGHT_GROUPS = ["z0", "z1", "z2", "hero", "city", "accent"] as const;
export type LightGroup = (typeof LIGHT_GROUPS)[number];

export interface BakedOffice {
  /** Le décor exporté de Blender ; un maillage par matière, nommé comme elle. */
  scene: THREE.Object3D;
  /** Groupes z0, z1, z2 dans r, g, b ; hero, city, accent dans la seconde. */
  lightA: THREE.DataTexture;
  lightB: THREE.DataTexture;
  /** Éclairement maximal stocké par groupe (texel 1 = scale). */
  scale: Record<LightGroup, number>;
}

/** Recompose les six images en niveaux de gris en deux textures RGB (sRGB, comme encodées). */
export function packLightmaps(images: Record<LightGroup, HTMLImageElement | ImageBitmap>): [THREE.DataTexture, THREE.DataTexture] {
  const size = images.z0.width;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  const a = new Uint8Array(size * size * 4);
  const b = new Uint8Array(size * size * 4);
  LIGHT_GROUPS.forEach((group, k) => {
    g.clearRect(0, 0, size, size);
    g.drawImage(images[group], 0, 0);
    const px = g.getImageData(0, 0, size, size).data;
    const dst = k < 3 ? a : b;
    const c = k % 3;
    for (let i = 0; i < size * size; i++) dst[i * 4 + c] = px[i * 4]!;
  });
  for (let i = 0; i < size * size; i++) a[i * 4 + 3] = b[i * 4 + 3] = 255;
  const tex = (data: Uint8Array) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.colorSpace = THREE.SRGBColorSpace;
    // pas de mipmaps : les îles de l'atlas se toucheraient aux niveaux réduits
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.channel = 1;
    t.needsUpdate = true;
    return t;
  };
  return [tex(a), tex(b)];
}

const includePattern = /^[ \t]*#include +<([\w\d./]+)>/gm;
const inline = (src: string): string => src.replace(includePattern, (_m, name: string) => inline((THREE.ShaderChunk as Record<string, string>)[name] ?? ""));
/** Les comptes de lumières que three.js substitue dans les shaders : à zéro, le décor ne boucle sur aucune. */
const LIGHT_COUNTS = [
  "NUM_DIR_LIGHT_SHADOWS",
  "NUM_DIR_LIGHTS",
  "NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS",
  "NUM_SPOT_LIGHT_SHADOWS",
  "NUM_SPOT_LIGHT_COORDS",
  "NUM_SPOT_LIGHT_MAPS",
  "NUM_SPOT_LIGHTS",
  "NUM_RECT_AREA_LIGHTS",
  "NUM_POINT_LIGHT_SHADOWS",
  "NUM_POINT_LIGHTS",
  "NUM_HEMI_LIGHTS",
];
const noLights = (src: string, keep: string[] = []) =>
  LIGHT_COUNTS.filter((n) => !keep.some((k) => n.startsWith(k))).reduce((s, n) => s.replace(new RegExp(`\\b${n}\\b`, "g"), "0"), inline(src));

/** Une matière qui n'évalue que certains types de lumières (les autres sont compilés à zéro). */
export function limitLights(mat: THREE.Material, keep: ("NUM_RECT_AREA" | "NUM_POINT_LIGHTS" | "NUM_SPOT")[], cacheKey: string) {
  const previous = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    previous.call(mat, shader, renderer);
    shader.vertexShader = noLights(shader.vertexShader, keep);
    shader.fragmentShader = noLights(shader.fragmentShader, keep);
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${cacheKey}|${key()}`;
}

export interface BakedLighting {
  /** Couleur × intensité de chaque groupe, partagées par toutes les matières du décor. */
  set(group: LightGroup, color: THREE.Color, k: number): void;
  /** La lumière de la ville par les baies change de teinte avec x : `left` à gauche
   * (x négatif), `right` à droite, fondu sur la largeur `width` (m). Multiplie la
   * couleur du groupe « city ». */
  setCitySides(left: THREE.Color, right: THREE.Color, width: number): void;
  /** Branche une matière du décor sur la lumière précalculée (atlas, uv1). */
  apply(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial;
  /** Idem, lumière stockée par sommet, pour les objets trop découpés pour l'atlas :
   * COLOR_0 = z0 z1 z2 hero (à moitié, 8 bits), uv1 = city accent. */
  applyVertex(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial;
}

export function createBakedLighting(office: BakedOffice): BakedLighting {
  const tints = LIGHT_GROUPS.map(() => new THREE.Vector3());
  const uTints = { value: tints };
  const uLightB = { value: office.lightB };
  const uCityL = { value: new THREE.Vector3(1, 1, 1) };
  const uCityR = { value: new THREE.Vector3(1, 1, 1) };
  const uCityW = { value: 1 };
  const CITY_PARS = "uniform vec3 uCityL;\nuniform vec3 uCityR;\nuniform float uCityW;\nvarying float vBakedX;\n";
  const citySide = "mix( uCityL, uCityR, smoothstep( -uCityW, uCityW, vBakedX ) )";
  return {
    setCitySides(left, right, width) {
      uCityL.value.set(left.r, left.g, left.b);
      uCityR.value.set(right.r, right.g, right.b);
      uCityW.value = width;
    },
    set(group, color, k) {
      const i = LIGHT_GROUPS.indexOf(group);
      const s = office.scale[group] * k;
      tints[i]!.set(color.r * s, color.g * s, color.b * s);
    },
    apply(mat) {
      mat.lightMap = office.lightA;
      mat.lightMapIntensity = 1;
      const previous = mat.onBeforeCompile;
      mat.onBeforeCompile = (shader, renderer) => {
        previous.call(mat, shader, renderer);
        shader.uniforms.uLightB = uLightB;
        shader.uniforms.uTints = uTints;
        shader.uniforms.uCityL = uCityL;
        shader.uniforms.uCityR = uCityR;
        shader.uniforms.uCityW = uCityW;
        shader.vertexShader = noLights(shader.vertexShader.replace("void main() {", "varying float vBakedX;\nvoid main() {\n\tvBakedX = ( modelMatrix * vec4( position, 1.0 ) ).x;"));
        shader.fragmentShader = noLights(shader.fragmentShader)
          .replace("void main() {", `uniform sampler2D uLightB;\nuniform vec3 uTints[ ${LIGHT_GROUPS.length} ];\n${CITY_PARS}void main() {`)
          .replace(
            "vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;",
            `vec3 lightMapB = texture2D( uLightB, vLightMapUv ).rgb;
            vec3 lightMapIrradiance = ( uTints[ 0 ] * lightMapTexel.r + uTints[ 1 ] * lightMapTexel.g + uTints[ 2 ] * lightMapTexel.b
              + uTints[ 3 ] * lightMapB.r + uTints[ 4 ] * ${citySide} * lightMapB.g + uTints[ 5 ] * lightMapB.b ) * lightMapIntensity;`,
          );
      };
      const key = mat.customProgramCacheKey.bind(mat);
      mat.customProgramCacheKey = () => `baked-office|${key()}`;
      return mat;
    },
    applyVertex(mat) {
      const previous = mat.onBeforeCompile;
      mat.onBeforeCompile = (shader, renderer) => {
        previous.call(mat, shader, renderer);
        shader.uniforms.uTints = uTints;
        shader.uniforms.uCityL = uCityL;
        shader.uniforms.uCityR = uCityR;
        shader.uniforms.uCityW = uCityW;
        shader.vertexShader = noLights(
          shader.vertexShader
            .replace("void main() {", "attribute vec4 color;\nattribute vec2 uv1;\nvarying vec4 vLmA;\nvarying vec2 vLmB;\nvarying float vBakedX;\nvoid main() {\n\tvLmA = color * 2.0;\n\tvLmB = uv1;\n\tvBakedX = ( modelMatrix * vec4( position, 1.0 ) ).x;"),
        );
        shader.fragmentShader = noLights(
          shader.fragmentShader
            .replace("void main() {", `uniform vec3 uTints[ ${LIGHT_GROUPS.length} ];\n${CITY_PARS}varying vec4 vLmA;\nvarying vec2 vLmB;\nvoid main() {`)
            .replace(
              "#include <lights_fragment_end>",
              `irradiance += uTints[ 0 ] * vLmA.x + uTints[ 1 ] * vLmA.y + uTints[ 2 ] * vLmA.z + uTints[ 3 ] * vLmA.w + uTints[ 4 ] * ${citySide} * vLmB.x + uTints[ 5 ] * vLmB.y;
              #include <lights_fragment_end>`,
            ),
        );
      };
      const key = mat.customProgramCacheKey.bind(mat);
      mat.customProgramCacheKey = () => `baked-vertex|${key()}`;
      return mat;
    },
  };
}
