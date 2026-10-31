// Illustrations de l'écran de chargement (§17.5), en SVG : aplats de couleur,
// contours à l'encre, lumière de fin de journée, palmiers, néons rose et cyan.
// Elles tiennent lieu des illustrations peintes tant que `scripts/gen-loading.ts`
// n'a pas pu tourner (il faut des crédits OpenRouter) : dès que des fichiers
// sont listés dans PAINTED, ce sont eux qui défilent.
import type { ReactNode } from "react";

/** Illustrations générées, dans web/public/loading/ (vide tant qu'aucune n'est validée). */
export const PAINTED: string[] = [];

const INK = "#1a0b2e";
const W = 1600;
const H = 900;

function Frame({ children, sky }: { children: ReactNode; sky: [string, string, string] }) {
  return (
    <svg className="load-scene" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      <defs>
        <linearGradient id="ls-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="0.55" stopColor={sky[1]} />
          <stop offset="1" stopColor={sky[2]} />
        </linearGradient>
        <radialGradient id="ls-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff2b0" />
          <stop offset="0.6" stopColor="#ffd23f" />
          <stop offset="1" stopColor="#ff7a3d" />
        </radialGradient>
        <linearGradient id="ls-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8f6a" />
          <stop offset="0.3" stopColor="#8a3f9e" />
          <stop offset="1" stopColor="#1d1240" />
        </linearGradient>
        <filter id="ls-ink" x="-2%" y="-2%" width="104%" height="104%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="ls-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.18 0" />
        </filter>
      </defs>
      <rect width={W} height={H} fill="url(#ls-sky)" />
      <g filter="url(#ls-ink)" stroke={INK} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
        {children}
      </g>
      <rect width={W} height={H} filter="url(#ls-grain)" opacity="0.5" style={{ mixBlendMode: "overlay" }} />
    </svg>
  );
}

/** Un palmier : tronc courbe et six palmes. `s` : échelle, `flip` : miroir. */
function Palm({ x, y, s = 1, flip = false, fill = "#2a1448" }: { x: number; y: number; s?: number; flip?: boolean; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} fill={fill}>
      <path d="M-6 0 C -4 -120 0 -220 28 -330 L 46 -326 C 18 -224 14 -126 14 0 Z" />
      <path d="M36 -328 C -20 -380 -90 -372 -150 -330 C -84 -350 -24 -342 36 -328 Z" />
      <path d="M36 -328 C -30 -312 -84 -270 -108 -210 C -66 -262 -14 -296 36 -328 Z" />
      <path d="M36 -328 C 90 -392 160 -404 220 -370 C 160 -376 96 -356 36 -328 Z" />
      <path d="M36 -328 C 110 -330 170 -290 196 -230 C 150 -278 96 -306 36 -328 Z" />
      <path d="M36 -328 C 14 -400 26 -460 66 -500 C 50 -450 48 -392 36 -328 Z" />
      <path d="M36 -328 C 70 -392 120 -424 180 -430 C 126 -404 80 -366 36 -328 Z" />
    </g>
  );
}

/** Un dev de dos, assis, casque sur les oreilles. */
function Dev({ x, y, s = 1, shirt = "#ff3fa4", skin = "#d9956a", hair = "#1a0b2e" }: { x: number; y: number; s?: number; shirt?: string; skin?: string; hair?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-70 120 C -80 40 -40 0 0 0 C 40 0 80 40 70 120 Z" fill={shirt} />
      <path d="M-96 120 C -100 80 -82 48 -62 44 L -40 110 Z" fill={shirt} />
      <path d="M96 120 C 100 80 82 48 62 44 L 40 110 Z" fill={shirt} />
      <rect x="-22" y="-30" width="44" height="40" rx="12" fill={skin} />
      <circle cx="0" cy="-60" r="42" fill={skin} />
      <path d="M-42 -66 C -40 -110 40 -110 42 -66 C 30 -84 -30 -84 -42 -66 Z" fill={hair} />
      <path d="M-46 -60 C -50 -100 50 -100 46 -60" fill="none" strokeWidth="8" />
      <rect x="-56" y="-72" width="16" height="28" rx="7" fill={INK} />
      <rect x="40" y="-72" width="16" height="28" rx="7" fill={INK} />
    </g>
  );
}

function Towers({ y, h = 1, fill }: { y: number; h?: number; fill: string }) {
  const t = [
    [60, 170, 70],
    [150, 260, 60],
    [230, 120, 90],
    [340, 330, 80],
    [440, 200, 50],
    [520, 420, 110],
    [660, 240, 70],
    [760, 360, 90],
    [880, 180, 60],
    [960, 300, 120],
    [1110, 210, 70],
    [1200, 390, 100],
    [1330, 160, 80],
    [1440, 280, 90],
    [1560, 200, 60],
  ];
  return (
    <g fill={fill}>
      {t.map(([x, th, w], i) => (
        <g key={i}>
          <rect x={x} y={y - th * h} width={w} height={th * h + 10} rx="4" />
          {i % 3 === 0 && <rect x={x + w / 2 - 6} y={y - th * h - 40} width="12" height="44" rx="3" />}
          {i % 4 === 1 && <path d={`M${x} ${y - th * h} L${x + w / 2} ${y - th * h - 30} L${x + w} ${y - th * h} Z`} />}
        </g>
      ))}
    </g>
  );
}

/** Fenêtres allumées, en néon rose ou cyan, au hasard mais stable. */
function Windows({ y, color, n = 60, seed = 3 }: { y: number; color: string; n?: number; seed?: number }) {
  const out = [];
  let r = seed;
  for (let i = 0; i < n; i++) {
    r = (r * 9301 + 49297) % 233280;
    const x = (r / 233280) * W;
    r = (r * 9301 + 49297) % 233280;
    const dy = (r / 233280) * 260;
    out.push(<rect key={i} x={x} y={y - 40 - dy} width="10" height="14" fill={color} stroke="none" opacity="0.9" />);
  }
  return <g>{out}</g>;
}

/* ---------- les scènes ---------- */

function Rooftop() {
  return (
    <Frame sky={["#2b1a5e", "#ff5c9a", "#ffb24a"]}>
      <circle cx="1120" cy="470" r="150" fill="url(#ls-sun)" stroke="none" />
      <rect x="0" y="470" width={W} height="160" fill="url(#ls-sea)" stroke="none" />
      <Towers y={480} fill="#5b2a7a" />
      <Windows y={480} color="#ff3fa4" seed={11} />
      <rect x="0" y="600" width={W} height="300" fill="#2a1448" />
      <rect x="0" y="600" width={W} height="20" fill="#7b3fe4" />
      <rect x="560" y="640" width="480" height="24" rx="8" fill="#3b1f66" />
      <rect x="600" y="664" width="30" height="236" fill="#3b1f66" />
      <rect x="970" y="664" width="30" height="236" fill="#3b1f66" />
      <rect x="690" y="600" width="220" height="40" rx="10" fill="#1d1240" />
      <rect x="700" y="560" width="200" height="40" rx="8" fill="#3fd8ff" opacity="0.9" />
      <Dev x={800} y={580} s={1.25} shirt="#ff7a3d" />
      <Palm x={180} y={900} s={1.5} />
      <Palm x={1460} y={900} s={1.3} flip />
      <circle cx="340" cy="520" r="20" fill="#ffd23f" stroke="none" />
      <circle cx="390" cy="530" r="14" fill="#3fd8ff" stroke="none" />
    </Frame>
  );
}

function NightOffice() {
  return (
    <Frame sky={["#120a2c", "#1d1240", "#2a1448"]}>
      <rect x="300" y="80" width="1000" height="520" rx="12" fill="#3b1f66" />
      <rect x="330" y="110" width="940" height="460" fill="#ff5c9a" stroke="none" />
      <rect x="330" y="110" width="940" height="200" fill="#7b3fe4" stroke="none" />
      <circle cx="1040" cy="330" r="120" fill="url(#ls-sun)" stroke="none" />
      <g transform="translate(0 0)">
        <Towers y={570} h={0.62} fill="#1d1240" />
      </g>
      <Windows y={570} color="#3fd8ff" n={90} seed={5} />
      <rect x="795" y="110" width="10" height="460" fill="#3b1f66" stroke="none" />
      <rect x="330" y="340" width="940" height="10" fill="#3b1f66" stroke="none" />
      <rect x="0" y="600" width={W} height="300" fill="#140a2e" />
      <rect x="380" y="620" width="840" height="28" rx="8" fill="#5b2a7a" />
      <rect x="430" y="470" width="220" height="140" rx="10" fill="#1a0b2e" />
      <rect x="440" y="480" width="200" height="120" rx="6" fill="#3fd8ff" stroke="none" />
      <rect x="690" y="440" width="220" height="170" rx="10" fill="#1a0b2e" />
      <rect x="700" y="450" width="200" height="150" rx="6" fill="#8ce06b" stroke="none" />
      <rect x="950" y="470" width="220" height="140" rx="10" fill="#1a0b2e" />
      <rect x="960" y="480" width="200" height="120" rx="6" fill="#ff3fa4" stroke="none" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={720 + i * 14} y={470 + i * 22} width={120 - i * 18} height="10" rx="4" fill="#1a0b2e" stroke="none" />
      ))}
      <Dev x={800} y={660} s={1.5} shirt="#3fd8ff" skin="#8a5a3c" />
      <rect x="1240" y="300" width="30" height="300" rx="8" fill="#2a1448" />
      <ellipse cx="1255" cy="300" rx="60" ry="30" fill="#2a1448" />
      <ellipse cx="1255" cy="300" rx="40" ry="18" fill="#ffd23f" stroke="none" />
    </Frame>
  );
}

function Avenue() {
  return (
    <Frame sky={["#ffb24a", "#ff5c9a", "#7b3fe4"]}>
      <circle cx="800" cy="520" r="200" fill="url(#ls-sun)" stroke="none" />
      <rect x="0" y="540" width={W} height="360" fill="#2a1448" />
      <path d={`M0 900 L560 560 L1040 560 L1600 900 Z`} fill="#3b1f66" />
      <path d="M790 560 L810 560 L860 900 L740 900 Z" fill="#ffd23f" stroke="none" opacity="0.8" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={140 + i * 100} y={400 - i * 60} width="150" height={140 + i * 60} rx="8" fill={i % 2 ? "#5b2a7a" : "#8a3f9e"} />
          <rect x={160 + i * 100} y={430 - i * 60} width="110" height="24" rx="12" fill={i % 2 ? "#3fd8ff" : "#ff3fa4"} stroke="none" />
          <rect x={1310 - i * 100} y={400 - i * 60} width="150" height={140 + i * 60} rx="8" fill={i % 2 ? "#8a3f9e" : "#5b2a7a"} />
          <rect x={1330 - i * 100} y={430 - i * 60} width="110" height="24" rx="12" fill={i % 2 ? "#ff3fa4" : "#3fd8ff"} stroke="none" />
        </g>
      ))}
      <Palm x={120} y={900} s={1.6} />
      <Palm x={330} y={760} s={1.1} />
      <Palm x={1480} y={900} s={1.6} flip />
      <Palm x={1270} y={760} s={1.1} flip />
      <g transform="translate(900 760)">
        <rect x="-110" y="-40" width="220" height="70" rx="20" fill="#ff3fa4" />
        <path d="M-60 -40 C -50 -90 50 -90 60 -40 Z" fill="#3fd8ff" />
        <circle cx="-70" cy="36" r="24" fill="#1a0b2e" />
        <circle cx="70" cy="36" r="24" fill="#1a0b2e" />
        <rect x="-120" y="-10" width="20" height="14" rx="4" fill="#ffd23f" stroke="none" />
        <rect x="100" y="-10" width="20" height="14" rx="4" fill="#ffd23f" stroke="none" />
      </g>
    </Frame>
  );
}

function Pool() {
  return (
    <Frame sky={["#3fd8ff", "#ff8f6a", "#ff3fa4"]}>
      <circle cx="420" cy="380" r="110" fill="url(#ls-sun)" stroke="none" />
      <rect x="0" y="430" width={W} height="470" fill="#e9b88a" />
      <path d="M200 520 C 300 440 1300 440 1420 540 C 1500 700 1300 860 1000 840 C 600 820 180 760 200 520 Z" fill="#3fd8ff" />
      <path d="M260 540 C 360 480 1240 480 1340 560" fill="none" stroke="#dffbff" strokeWidth="10" opacity="0.8" />
      <path d="M300 700 C 500 660 900 760 1200 700" fill="none" stroke="#dffbff" strokeWidth="8" opacity="0.6" />
      <g transform="translate(1180 640)">
        <ellipse cx="0" cy="0" rx="120" ry="60" fill="#ff3fa4" />
        <ellipse cx="0" cy="0" rx="60" ry="28" fill="#3fd8ff" />
        <path d="M70 -20 C 110 -90 150 -100 150 -40 C 150 -10 120 -10 110 -30" fill="#ff3fa4" />
        <circle cx="140" cy="-46" r="6" fill={INK} stroke="none" />
      </g>
      <g transform="translate(560 330)">
        <rect x="-170" y="60" width="340" height="40" rx="12" fill="#ffd23f" />
        <rect x="-170" y="-20" width="130" height="90" rx="12" fill="#ffd23f" transform="rotate(-30 -105 60)" />
        <rect x="-160" y="100" width="20" height="60" fill="#5b2a7a" />
        <rect x="140" y="100" width="20" height="60" fill="#5b2a7a" />
        <rect x="-40" y="10" width="150" height="90" rx="8" fill="#1a0b2e" />
        <rect x="-30" y="20" width="130" height="70" rx="4" fill="#8ce06b" stroke="none" />
      </g>
      <Palm x={120} y={900} s={1.7} fill="#5b2a7a" />
      <Palm x={1500} y={900} s={1.4} flip fill="#5b2a7a" />
      <Palm x={1340} y={430} s={0.9} fill="#8a3f9e" />
      <Palm x={220} y={430} s={0.9} flip fill="#8a3f9e" />
    </Frame>
  );
}

function ServerRoom() {
  return (
    <Frame sky={["#0d0a24", "#1d1240", "#120a2c"]}>
      <path d="M0 900 L300 300 L1300 300 L1600 900 Z" fill="#1a0b2e" />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect x={300 - i * 60} y={320 + i * 30} width="140" height={560 - i * 30} rx="6" fill="#2a1448" />
          <rect x={1160 + i * 60} y={320 + i * 30} width="140" height={560 - i * 30} rx="6" fill="#2a1448" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((j) => (
            <g key={j}>
              <rect x={320 - i * 60} y={350 + i * 30 + j * 60} width="100" height="12" rx="3" fill={(i + j) % 2 ? "#ff3fa4" : "#3fd8ff"} stroke="none" opacity="0.9" />
              <rect x={1180 + i * 60} y={350 + i * 30 + j * 60} width="100" height="12" rx="3" fill={(i + j) % 2 ? "#3fd8ff" : "#ff3fa4"} stroke="none" opacity="0.9" />
            </g>
          ))}
        </g>
      ))}
      <rect x="600" y="300" width="400" height="30" fill="#ff3fa4" stroke="none" opacity="0.8" />
      <rect x="600" y="300" width="400" height="30" fill="none" />
      <path d="M700 600 C 760 540 820 660 900 600" fill="none" stroke="#3fd8ff" strokeWidth="10" />
      <g transform="translate(800 620)">
        <path d="M-70 140 C -80 60 -40 20 0 20 C 40 20 80 60 70 140 Z" fill="#8ce06b" />
        <circle cx="0" cy="-30" r="44" fill="#8a5a3c" />
        <path d="M-44 -36 C -40 -84 40 -84 44 -36 C 30 -56 -30 -56 -44 -36 Z" fill="#1a0b2e" />
        <rect x="-110" y="40" width="60" height="26" rx="10" fill="#8a5a3c" transform="rotate(-20 -80 53)" />
        <rect x="-150" y="20" width="60" height="36" rx="6" fill="#ffd23f" />
      </g>
      <path d="M0 880 L1600 880" />
    </Frame>
  );
}

function Highway() {
  return (
    <Frame sky={["#5b2a7a", "#ff5c9a", "#ffd23f"]}>
      <circle cx="800" cy="500" r="230" fill="url(#ls-sun)" stroke="none" />
      <Towers y={520} h={0.8} fill="#2a1448" />
      <Windows y={520} color="#ffd23f" n={70} seed={23} />
      <rect x="0" y="520" width={W} height="380" fill="#3b1f66" />
      <path d="M0 900 L640 520 L960 520 L1600 900 Z" fill="#1d1240" />
      <path d="M790 540 L810 540 L830 640 L770 640 Z" fill="#ffd23f" stroke="none" />
      <path d="M760 690 L840 690 L870 820 L730 820 Z" fill="#ffd23f" stroke="none" />
      <path d="M640 520 L0 900" fill="none" stroke="#ff3fa4" strokeWidth="8" />
      <path d="M960 520 L1600 900" fill="none" stroke="#3fd8ff" strokeWidth="8" />
      <g transform="translate(1100 780)">
        <rect x="-150" y="-60" width="300" height="90" rx="24" fill="#3fd8ff" />
        <path d="M-90 -60 C -70 -130 70 -130 90 -60 Z" fill="#ff3fa4" />
        <circle cx="-95" cy="40" r="30" fill="#1a0b2e" />
        <circle cx="95" cy="40" r="30" fill="#1a0b2e" />
        <rect x="-162" y="-30" width="24" height="16" rx="5" fill="#ff5c7a" stroke="none" />
      </g>
      <Palm x={200} y={760} s={1.2} fill="#1d1240" />
      <Palm x={1400} y={720} s={1} flip fill="#1d1240" />
    </Frame>
  );
}

export const SCENES = [Rooftop, NightOffice, Avenue, Pool, ServerRoom, Highway];
