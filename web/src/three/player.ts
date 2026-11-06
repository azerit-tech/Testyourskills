// Le dev : un personnage Character Creator riggé (Jungle Jim, CC BY ; tools/bake/prepare.py),
// posé assis et animé par code. Chaque os reçoit une orientation exprimée
// dans le repère du personnage, par rapport à sa pose de repos (en T) : bras
// et jambes par cinématique inverse à deux segments (mains sur le clavier,
// pieds au sol), tronc, tête et yeux par angles. Tout est une fonction du
// temps, sans état : `hold` et `seek` donnent toujours la même image.
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

export interface Player {
  root: THREE.Object3D;
  /** Pose à l'instant t ; typing 0 → 1 (mains sur le clavier), look 0 → 1 (tourné
   * vers la caméra) ; gaze : le point regardé une fois tourné, dans le repère du monde. */
  pose(t: number, typing: number, look: number, gaze?: THREE.Vector3): void;
}

type V3 = [number, number, number];
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};
/** Bruit déterministe dans [0, 1). */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Bruit lisse, somme de sinus de fréquences incommensurables : jamais périodique à l'œil. */
const drift = (t: number, f: number, seed: number) =>
  0.55 * Math.sin(t * f + seed) + 0.3 * Math.sin(t * f * 2.13 + seed * 1.7) + 0.15 * Math.sin(t * f * 4.37 + seed * 2.9);

/* Repère du personnage (celui de `root`) : x à sa gauche, y en haut, z devant lui.
 * L'origine est sur l'axe du fauteuil, au ras du tapis à 1 cm près ; les cotes
 * suivent le poste de workstation.ts, où `root` est posé en (0, 0.03, 0.06). */
const HIP: V3 = [0, 0.545, 0.0];
/** Les poignets sur le clavier (la rangée de repos), une main de chaque côté du bloc des lettres. */
const KEYS_L: V3 = [0.15, 0.825, 0.32];
const KEYS_R: V3 = [-0.06, 0.825, 0.32];
/** Une fois tourné, adossé : le poignet gauche sur le bout de l'accoudoir (son dessus est à 0,75 m,
 * entre x = 0,27 et 0,34), la main droite à plat sur la cuisse, épaisse : elle reste dessus. */
const LAP_L: V3 = [0.3, 0.79, 0.07];
const LAP_R: V3 = [-0.14, 0.75, 0.2];
/** La direction des doigts une fois tourné : droit devant sur l'accoudoir, vers le genou sur la cuisse. */
const LAP_DIR_L: V3 = [-0.05, -0.3, 1];
const LAP_DIR_R: V3 = [0.2, -0.5, 1];
/** Les chevilles, pieds à plat. */
const ANKLE_L: V3 = [0.15, 0.085, 0.36];
const ANKLE_R: V3 = [-0.14, 0.085, 0.33];
/** Les écrans, vus de son siège : le code au centre, le terminal à droite, le graphe à gauche. */
const SCREENS: V3[] = [
  [0, 1.08, 0.95],
  [-0.66, 1.03, 0.8],
  [0.66, 1.03, 0.8],
];

const FINGERS = ["index", "middle", "ring", "pinky"] as const;
/** Doigts arrondis au-dessus des touches, un peu plus repliés vers l'auriculaire. */
const CURL_KEYS = [
  [0.32, 0.5, 0.32],
  [0.36, 0.55, 0.34],
  [0.4, 0.58, 0.36],
  [0.46, 0.6, 0.36],
];
const CURL_LAP = [
  [0.18, 0.3, 0.2],
  [0.22, 0.34, 0.22],
  [0.26, 0.38, 0.24],
  [0.3, 0.4, 0.24],
];

/** Une frappe toutes les 90 ms au plus fort, par rafales, chaque touche enfoncée 130 ms. */
const STROKE = 0.09;
const PRESS = 0.13;
const BURST = 1.7;
/** Paupières (radians) : un peu baissées au repos, le scan a les yeux grands ouverts ; fermées au clignement. */
const LID = 0.1;
const BLINK = 0.42;

interface Stroke {
  /** Enfoncement 0 → 1 → 0. */
  e: number;
  finger: number;
}

/** Les touches que frappe une main (0 : gauche, 1 : droite) à l'instant t. */
function strokes(t: number, hand: number, out: Stroke[]): Stroke[] {
  out.length = 0;
  const k0 = Math.floor(t / STROKE);
  for (let k = k0 - 1; k <= k0; k++) {
    const tau = t - k * STROKE;
    if (tau < 0 || tau > PRESS) continue;
    // des rafales de mots, séparées de pauses où il relit
    const busy = hash(Math.floor((k * STROKE) / BURST) * 3.1 + 0.7) < 0.72;
    if (hash(k * 7.3 + hand * 91.1) > (busy ? 0.42 : 0.04)) continue;
    const r = hash(k * 13.7 + hand * 5.3);
    out.push({ e: Math.sin((Math.PI * tau) / PRESS), finger: r < 0.38 ? 0 : r < 0.7 ? 1 : r < 0.88 ? 2 : 3 });
  }
  return out;
}

/** La rotation qui amène le repère (d0, n0) sur (d1, n1) ; d : direction de l'os, n : une normale de référence. */
const _m0 = new THREE.Matrix4();
const _m1 = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
function frame(m: THREE.Matrix4, d: THREE.Vector3, n: THREE.Vector3) {
  _a.copy(d).normalize();
  _b.copy(n).addScaledVector(_a, -n.dot(_a)).normalize();
  _c.crossVectors(_a, _b);
  return m.makeBasis(_a, _b, _c);
}
function frameRotation(out: THREE.Quaternion, d0: THREE.Vector3, n0: THREE.Vector3, d1: THREE.Vector3, n1: THREE.Vector3) {
  frame(_m0, d0, n0).transpose();
  frame(_m1, d1, n1).multiply(_m0);
  return out.setFromRotationMatrix(_m1);
}
const euler = new THREE.Euler(0, 0, 0, "YXZ");
const fromAngles = (out: THREE.Quaternion, pitch: number, yaw: number, roll: number) => out.setFromEuler(euler.set(pitch, yaw, roll, "YXZ"));

/** Position du coude (ou du genou) : deux segments a et b de `from` vers `to`, plié du côté de `pole`. */
function bend(out: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3, a: number, b: number, pole: THREE.Vector3) {
  const d = _a.subVectors(to, from);
  const len = Math.min(d.length(), (a + b) * 0.999);
  d.normalize();
  const cos = (a * a + len * len - b * b) / (2 * a * len);
  const side = _b.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
  return out.copy(from).addScaledVector(d, a * cos).addScaledVector(side, a * Math.sqrt(Math.max(0, 1 - cos * cos)));
}

export function createPlayer(gltf: GLTF): Player {
  const model = cloneSkinned(gltf.scene);
  const root = new THREE.Group();
  root.add(model);
  const height = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y;
  model.scale.multiplyScalar(1.78 / height);
  root.name = "developer";
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    const material = (m.material as THREE.MeshStandardMaterial).clone();
    const name = material.name;
    material.metalness = 0;
    material.envMapIntensity = 0.7;
    if (/^Std_Skin_|^Std_Nails$/.test(name)) {
      // la peau : satinée, ses pores dans la normal map
      material.roughness = 0.52;
    } else if (/^Std_Cornea_/.test(name)) {
      // la cornée n'ajoute que ses reflets : c'est la petite lumière dans l'œil
      material.color.set(0x000000);
      material.roughness = 0.04;
      material.envMapIntensity = 1.4;
      material.transparent = true;
      material.opacity = 1;
      material.blending = THREE.AdditiveBlending;
      material.depthWrite = false;
    } else if (/^Std_Eye_/.test(name)) {
      // sans l'ombre portée des paupières (Character Creator la dessine dans un maillage que le modèle n'a pas),
      // le blanc de l'œil brillait sous les projecteurs
      material.color.setScalar(0.72);
    } else if (/^Std_Eyelash$/.test(name)) {
      material.depthWrite = false;
    } else if (!/^(Std_Eye_|Std_Tongue$|Teeth$|Mouth$)/.test(name)) {
      // le denim, le coton, les baskets : mats
      material.roughness = 0.88;
    }
    // les vêtements n'ont qu'une épaisseur (double face) : seules leurs faces arrière portent l'ombre, sans acné
    material.shadowSide = THREE.BackSide;
    m.material = material;
    m.castShadow = !material.transparent;
    m.receiveShadow = true;
    m.frustumCulled = false;
  });

  const bones = new Map<string, THREE.Bone>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
  });
  const bone = (name: string) => {
    const b = bones.get(name);
    if (!b) throw new Error(`[player] os manquant : ${name}`);
    return b;
  };

  // La pose de repos, dans le repère du personnage : orientation et position de chaque os.
  root.updateMatrixWorld(true);
  const qRootInv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const rest = new Map<THREE.Bone, { q: THREE.Quaternion; p: THREE.Vector3; local: THREE.Quaternion }>();
  for (const b of bones.values())
    rest.set(b, { q: qRootInv.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion())), p: root.worldToLocal(b.getWorldPosition(new THREE.Vector3())), local: b.quaternion.clone() });
  const restOf = (b: THREE.Bone) => rest.get(b)!;
  const restDir = (from: string, to: string) => restOf(bone(to)).p.clone().sub(restOf(bone(from)).p).normalize();
  const span = (from: string, to: string) => restOf(bone(to)).p.distanceTo(restOf(bone(from)).p);

  const hips = bone("hip");
  const spine = ["spine_01", "spine_02", "spine_03"].map(bone);
  const neck = bone("neck");
  const head = bone("head");
  const eyes = ["eye_l", "eye_r"].map(bone);
  const lids = ["eyelid_l", "eyelid_r"].flatMap((n) => (bones.has(n) ? [bone(n)] : []));
  const side = (s: "l" | "r") => {
    const sign = s === "l" ? 1 : -1;
    return {
      sign,
      shoulder: bone(`shoulder_${s}`),
      upper: bone(`upperarm_${s}`),
      fore: bone(`lowerarm_${s}`),
      twist: bones.get(`lowerarm_twist_${s}`),
      hand: bone(`hand_${s}`),
      upperLen: span(`upperarm_${s}`, `lowerarm_${s}`),
      foreLen: span(`lowerarm_${s}`, `hand_${s}`),
      armDir: restDir(`upperarm_${s}`, `lowerarm_${s}`),
      handDir: restDir(`hand_${s}`, `middle_01_${s}`),
      fingers: FINGERS.map((f) => [1, 2, 3].map((i) => bone(`${f}_0${i}_${s}`))),
      thumb: [1, 2, 3].map((i) => bone(`thumb_0${i}_${s}`)),
      thigh: bone(`upperleg_${s}`),
      shin: bone(`lowerleg_${s}`),
      foot: bone(`foot_${s}`),
      thighLen: span(`upperleg_${s}`, `lowerleg_${s}`),
      shinLen: span(`lowerleg_${s}`, `foot_${s}`),
      legDir: restDir(`upperleg_${s}`, `lowerleg_${s}`),
      footDir: restDir(`foot_${s}`, `ball_${s}`),
      keys: V(...(s === "l" ? KEYS_L : KEYS_R)),
      lap: V(...(s === "l" ? LAP_L : LAP_R)),
      lapDir: V(...(s === "l" ? LAP_DIR_L : LAP_DIR_R)),
      ankle: V(...(s === "l" ? ANKLE_L : ANKLE_R)),
    };
  };
  const arms = [side("l"), side("r")];
  // les doigts se replient vers la paume : autour de (direction des doigts × normale de la paume), dans le repère de chaque phalange
  const PALM = V(0, -1, 0);
  const curlAxis = new Map<THREE.Bone, THREE.Vector3>();
  for (const s of arms) {
    const axis = new THREE.Vector3().crossVectors(s.handDir, PALM).normalize();
    for (const b of [...s.fingers.flat(), ...s.thumb]) curlAxis.set(b, axis.clone().applyQuaternion(restOf(b).q.clone().invert()));
  }

  // les paupières se ferment autour de l'axe des yeux (x du personnage)
  const lidAxis = new Map(lids.map((b) => [b, V(1, 0, 0).applyQuaternion(restOf(b).q.clone().invert())]));

  /* ---------- poser un os ---------- */
  const qRoot = new THREE.Quaternion();
  const qParent = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  /** Oriente l'os par la rotation `r` (repère du personnage) appliquée à sa pose de repos. */
  const orient = (b: THREE.Bone, r: THREE.Quaternion) => {
    b.parent!.updateWorldMatrix(true, false);
    b.parent!.getWorldQuaternion(qParent).invert();
    b.quaternion.copy(qParent).multiply(qRoot).multiply(r).multiply(restOf(b).q);
  };
  const curl = (b: THREE.Bone, angle: number) => {
    b.quaternion.copy(restOf(b).local).multiply(q.setFromAxisAngle(curlAxis.get(b)!, angle));
  };
  const posOf = (b: THREE.Bone, out: THREE.Vector3) => {
    b.updateWorldMatrix(true, false);
    return root.worldToLocal(b.getWorldPosition(out));
  };

  const hipAt = V(...HIP);
  const S = new THREE.Vector3();
  const W = new THREE.Vector3();
  const E = new THREE.Vector3();
  const d = new THREE.Vector3();
  const n = new THREE.Vector3();
  const n2 = new THREE.Vector3();
  const pole = new THREE.Vector3();
  const look = new THREE.Vector3();
  const gazeLocal = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const presses: Stroke[] = [];
  const UP = V(0, 1, 0);
  const FWD = V(0, 0, 1);

  /** Le point regardé à l'écran : il lit surtout son code, jette un œil au terminal et au graphe. */
  const screenGaze = (t: number, out: THREE.Vector3) => {
    const SPAN = 2.3;
    const w = Math.floor(t / SPAN);
    const pick = (i: number) => {
      const r = hash(i * 4.7 + 1.3);
      return SCREENS[r < 0.68 ? 0 : r < 0.84 ? 1 : 2]!;
    };
    const a = pick(w - 1);
    const b = pick(w);
    // une saccade de la tête en 0,3 s, puis il lit : les yeux balaient la ligne
    const u = smooth(0, 0.3, t - w * SPAN);
    out.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
    out.x += 0.09 * Math.sin(t * 2.6) + 0.03 * drift(t, 0.9, 4);
    out.y += 0.03 * drift(t, 0.7, 8);
    return out;
  };

  const pose = (t: number, typingIn: number, lookIn: number, gaze?: THREE.Vector3) => {
    const typing = smooth(0, 1, typingIn);
    const turned = smooth(0, 1, lookIn);
    // pendant le demi-tour : la tête devance le fauteuil, le buste traîne un peu
    const swing = 4 * lookIn * (1 - lookIn);
    const breath = Math.sin((t * 2 * Math.PI) / 4.3);
    root.updateWorldMatrix(true, false);
    root.getWorldQuaternion(qRoot);

    /* le bassin et le tronc */
    hips.parent!.updateWorldMatrix(true, false);
    hips.position.copy(hips.parent!.worldToLocal(root.localToWorld(tmp.copy(hipAt))));
    const sway = 0.02 * drift(t, 0.31, 1);
    orient(hips, fromAngles(q2, -0.1, sway * 0.5, 0));
    // penché vers l'écran en tapant, redressé et adossé une fois tourné
    const lean = 0.2 * typing + 0.03 * (1 - typing) - 0.1 * turned + 0.02 * drift(t, 0.23, 3);
    const yaw = sway - 0.18 * swing;
    const roll = 0.015 * drift(t, 0.19, 7);
    spine.forEach((b, i) => {
      const k = (i + 1) / 3;
      orient(b, fromAngles(q2, lean * k - 0.012 * breath * (i === 2 ? 1 : 0), yaw * k, roll * k));
    });

    /* la tête et le regard */
    const headPos = posOf(neck, tmp);
    screenGaze(t, look);
    let hy = Math.atan2(look.x - headPos.x, look.z - headPos.z);
    let hp = Math.atan2(headPos.y - look.y, Math.hypot(look.x - headPos.x, look.z - headPos.z));
    if (gaze && lookIn > 0) {
      root.worldToLocal(gazeLocal.copy(gaze));
      const cy = THREE.MathUtils.clamp(Math.atan2(gazeLocal.x - headPos.x, gazeLocal.z - headPos.z), -1.25, 1.25);
      const cp = THREE.MathUtils.clamp(Math.atan2(headPos.y - gazeLocal.y, Math.hypot(gazeLocal.x - headPos.x, gazeLocal.z - headPos.z)), -0.4, 0.5);
      const w = smooth(0.04, 0.5, lookIn);
      hy += (cy - hy) * w;
      hp += (cp - hp) * w;
    }
    hy += 0.02 * drift(t, 0.6, 11);
    // tourné, adossé : le menton baisse un peu, il regarde la caméra par en dessous
    hp += 0.09 * turned;
    hp += 0.015 * drift(t, 0.8, 13) + 0.008 * breath;
    const hr = 0.03 * drift(t, 0.27, 17) + 0.04 * turned;
    orient(neck, fromAngles(q2, hp * 0.4 + lean * 0.5, hy * 0.45, hr * 0.5));
    orient(head, fromAngles(q2, hp, hy, hr));
    // les yeux visent le point regardé ; quelques clignements
    const target = gaze && lookIn > 0.5 ? gazeLocal : look;
    for (const eye of eyes) {
      posOf(eye, S);
      d.subVectors(target, S).normalize();
      const headQ = fromAngles(q2, hp, hy, hr);
      n.copy(FWD).applyQuaternion(headQ);
      const ang = n.angleTo(d);
      if (ang > 0.45) d.lerp(n, 1 - 0.45 / ang).normalize();
      orient(eye, q.setFromUnitVectors(FWD, d));
    }
    const blinkT = (t + 1.3 * hash(Math.floor(t / 3.7))) % 3.7;
    const blink = blinkT < 0.16 ? Math.sin((Math.PI * blinkT) / 0.16) : 0;
    for (const lid of lids) lid.quaternion.copy(restOf(lid).local).multiply(q.setFromAxisAngle(lidAxis.get(lid)!, LID + (BLINK - LID) * blink));

    /* les bras */
    arms.forEach((s, hand) => {
      const sg = s.sign;
      // épaules : la respiration les soulève, la frappe les avance un peu
      orient(s.shoulder, fromAngles(q2, lean, yaw, roll).multiply(fromAngles(q, 0, -sg * 0.08 * typing, sg * (0.012 * breath + 0.03 * typing))));
      posOf(s.upper, S);
      strokes(t, hand, presses);
      let dip = 0;
      for (const p of presses) dip = Math.max(dip, p.e);
      // la main glisse d'une touche à l'autre
      W.copy(s.keys);
      W.x += 0.016 * drift(t, 1.9, hand * 5 + 1);
      W.z += 0.012 * drift(t, 1.4, hand * 5 + 2);
      W.y += 0.006 * drift(t, 2.2, hand * 5 + 3) - 0.006 * dip;
      W.lerp(s.lap, 1 - typing);
      W.y += 0.05 * swing;
      // coude en dehors et en arrière
      pole.set(sg * 0.55, -1, -0.35);
      bend(E, S, W, s.upperLen, s.foreLen, pole);
      d.subVectors(E, S);
      n.subVectors(W, E);
      orient(s.upper, frameRotation(q2, s.armDir, FWD, d, n));
      // la paume vers le bas ; l'avant-bras ne porte que la moitié de la pronation, son os de torsion le reste
      d.subVectors(W, E);
      n.copy(PALM).applyQuaternion(q2);
      n2.set(sg * 0.15, -1, 0.1 * typing);
      n.lerp(n2, 0.5);
      orient(s.fore, frameRotation(q, s.armDir, PALM, d, n));
      if (s.twist) orient(s.twist, frameRotation(q, s.armDir, PALM, d, n2));
      // la main : doigts vers le clavier (ou le long de la cuisse), légèrement fléchie
      d.set(-sg * 0.18, -0.42 - 0.12 * dip, 1).lerp(s.lapDir, 1 - typing);
      orient(s.hand, frameRotation(q, s.handDir, PALM, d, n2));
      s.fingers.forEach((seg, f) => {
        let extra = 0;
        for (const p of presses) if (p.finger === f) extra = Math.max(extra, p.e);
        // le doigt qui frappe se tend vers la touche puis s'enfonce ; les autres se soulèvent à peine
        const lift = dip > 0 && extra === 0 ? -0.06 * dip : 0;
        seg.forEach((b, i) => {
          const base = CURL_KEYS[f]![i]! * typing + CURL_LAP[f]![i]! * (1 - typing);
          curl(b, base + (lift + (i === 0 ? 0.32 : 0.18) * extra) * typing);
        });
      });
      s.thumb.forEach((b, i) => curl(b, 0.1 + 0.1 * i + 0.05 * typing));
    });

    /* les jambes */
    arms.forEach((s) => {
      posOf(s.thigh, S);
      W.copy(s.ankle);
      // les pieds se soulèvent pendant que le fauteuil tourne
      W.y += 0.06 * swing;
      W.z += 0.01 * drift(t, 0.4, s.sign * 3);
      pole.set(s.sign * 0.12, 0.45, 1);
      bend(E, S, W, s.thighLen, s.shinLen, pole);
      d.subVectors(E, S);
      n.subVectors(W, E).negate();
      orient(s.thigh, frameRotation(q2, s.legDir, FWD, d, n));
      d.subVectors(W, E);
      n.subVectors(E, S);
      orient(s.shin, frameRotation(q2, s.legDir, FWD, d, n));
      d.set(s.sign * 0.12, -0.12, 1);
      orient(s.foot, frameRotation(q2, s.footDir, UP, d, UP));
    });
  };
  pose(0, 1, 0);

  return { root, pose };
}
