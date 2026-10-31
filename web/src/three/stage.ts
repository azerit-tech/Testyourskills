// Décor de la scène : environnement « studio » pour les reflets (bandes de
// lumière comme sur un plateau photo), la ville de nuit derrière les baies du
// bureau, et sol réfléchissant (réflexion plane floutée, déformée par la normal
// map du béton poli).
import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";

/** Environnement de reflets : une pièce sombre et quelques boîtes à lumière. */
export function createStudioEnvironment(renderer: THREE.WebGLRenderer, accent: string): THREE.Texture {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 14), new THREE.MeshBasicMaterial({ color: 0x07090d, side: THREE.BackSide }));
  room.position.y = 3;
  env.add(room);
  const panel = (w: number, h: number, color: THREE.ColorRepresentation, k: number, pos: [number, number, number], look: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    env.add(m);
  };
  panel(7, 0.7, 0xffffff, 7, [0, 6.5, -1], [0, 0, -1]); // bande du plafond
  panel(0.6, 6, 0xdfe9ff, 5, [-6.5, 3, 1], [0, 2, 0]); // bande verticale gauche
  panel(0.6, 6, accent, 4, [6.5, 3, -1], [0, 2, 0]); // bande verticale droite, teinte du tier
  panel(7, 3.5, 0xffffff, 2.6, [1.5, 2.5, 6.5], [0, 1.5, 0]); // grande boîte à lumière de face (faces planes des métaux)
  panel(9, 2.5, 0x9fc3ff, 2.4, [0, 2, -6.8], [0, 2, 0]); // contre-jour (les baies)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  env.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
  return tex;
}

const CITY_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CITY_FRAG = `
uniform sampler2D uMap; uniform float uBright; uniform vec3 uBg; varying vec2 vUv;
void main(){
  vec2 uv = vec2(1.0 - vUv.x, vUv.y);
  vec3 c = texture2D(uMap, uv).rgb * uBright;
  // bords gauche et droit fondus dans la nuit
  float edge = max(1.0 - smoothstep(0.0, 0.06, uv.x), smoothstep(0.94, 1.0, uv.x));
  gl_FragColor = vec4(mix(c, uBg, edge), 1.0);
}`;

/** Le cadrage du rendu de la ville (tools/bake/city.py) : largeur en degrés, hauteur sous et sur l'horizon. */
export const CITY_VIEW = { arc: 100, below: 14, above: 16 };

/**
 * La ville de nuit derrière les baies, générée et rendue dans Blender
 * (tools/bake/city.py) en projection cylindrique centrale : posée sur le même
 * morceau de cylindre, centré sur le bureau, elle tombe juste, l'horizon à
 * `horizon` (la hauteur de l'œil).
 */
export function createCityBackdrop(map: THREE.Texture, radius: number, horizon: number, bg: THREE.Color) {
  const rad = Math.PI / 180;
  const arc = CITY_VIEW.arc * rad;
  const lo = Math.tan(CITY_VIEW.below * rad) * radius;
  const height = lo + Math.tan(CITY_VIEW.above * rad) * radius;
  const geo = new THREE.CylinderGeometry(radius, radius, height, 128, 1, true, Math.PI - arc / 2, arc);
  geo.translate(0, horizon - lo + height / 2, 0);
  const uBright = { value: 1 };
  const mat = new THREE.ShaderMaterial({
    vertexShader: CITY_VERT,
    fragmentShader: CITY_FRAG,
    uniforms: { uMap: { value: map }, uBright, uBg: { value: bg } },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  return { mesh, uBright, height };
}

const REFL_VERT = `
uniform mat4 textureMatrix; varying vec4 vProj; varying vec3 vWorld;
void main(){ vProj = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const REFL_FRAG = `
uniform sampler2D tDiffuse; uniform float uStrength; uniform vec3 color; uniform vec3 uNormal;
varying vec4 vProj; varying vec3 vWorld;
void main(){
  // Fresnel d'un double vitrage : ~8 % de face, davantage en incidence rasante
  float c = abs(dot(normalize(cameraPosition - vWorld), uNormal));
  float f = 0.08 + 0.92 * pow(1.0 - c, 5.0);
  gl_FragColor = vec4(texture2DProj(tDiffuse, vProj).rgb * color * uStrength * f, 1.0);
}`;

/** Le reflet de l'intérieur dans les baies, la nuit : un miroir plan ajouté par-dessus la ville. */
export function createGlassReflection(width: number, height: number, size: THREE.Vector2) {
  const refl = new Reflector(new THREE.PlaneGeometry(width, height), {
    textureWidth: size.x,
    textureHeight: size.y,
    clipBias: 0.003,
    color: 0xffffff,
    shader: {
      name: "GlassReflection",
      uniforms: {
        color: { value: null },
        tDiffuse: { value: null },
        textureMatrix: { value: null },
        uStrength: { value: 1 },
        uNormal: { value: new THREE.Vector3(0, 0, 1) },
      },
      vertexShader: REFL_VERT,
      fragmentShader: REFL_FRAG,
    },
  });
  const mat = refl.material as THREE.ShaderMaterial;
  mat.transparent = true;
  mat.blending = THREE.AdditiveBlending;
  mat.depthWrite = false;
  return { mesh: refl, strength: mat.uniforms.uStrength as { value: number } };
}
