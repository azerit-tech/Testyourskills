// Maquette de la fiche, style mat et six étoiles (SPEC §18.18).
//
// La fiche est dessinée en SVG, pas en HTML : c'est ce que fera le vrai
// composant (shared/card/Card.tsx), rendu à l'écran et en PNG par resvg.
// On n'utilise donc que ce qu'un SVG simple sait faire et que resvg rend :
// aplats, UN dégradé linéaire par fiche, texte, clipPath, feComponentTransfer
// (photo), feTurbulence (grain) et un seul flou léger (le contour de ★★★★★★).
// Pas de mix-blend-mode, pas de masque CSS, pas de backdrop-filter.
//
// Les couleurs viennent de gta.css (variables définies une fois).
(function () {
  const css = getComputedStyle(document.documentElement);
  const C = new Proxy({}, { get: (_, k) => css.getPropertyValue(`--${String(k)}`).trim() });

  /* ---------------- Mesure du texte (le vrai composant a fit() dans text.ts) ---------------- */
  const ctx = document.createElement("canvas").getContext("2d");
  const FONTS = {
    name7: (s) => `700 ${s}px "Barlow Condensed"`,
    name8: (s) => `800 ${s}px "Barlow Condensed"`,
    hud7: (s) => `700 ${s}px "Barlow Semi Condensed"`,
    mono4: (s) => `400 ${s}px "JetBrains Mono"`,
    mono7: (s) => `700 ${s}px "JetBrains Mono"`,
  };
  const sansFont = (w, family) => (s) => `${w} ${s}px "${family}"`;
  function measure(text, font, size, ls = 0) {
    ctx.font = font(size);
    return ctx.measureText(text).width + ls * text.length;
  }
  /** Réduit d'abord l'interlettrage, puis le corps, puis coupe avec « … ». */
  function fit(text, font, size, maxW, { ls = 0, minLs = 0, minSize = size } = {}) {
    let s = size, l = ls;
    while (measure(text, font, s, l) > maxW && l > minLs) l = Math.max(minLs, l - 0.1);
    while (measure(text, font, s, l) > maxW && s > minSize) s = Math.max(minSize, s - 0.25);
    let t = text;
    if (measure(t, font, s, l) > maxW) {
      while (t.length > 1 && measure(t + "…", font, s, l) > maxW) t = t.slice(0, -1).trimEnd();
      t += "…";
    }
    return { text: t, size: s, ls: l, cut: t !== text };
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const up = (s, lang) => s.toLocaleUpperCase(lang === "en" ? "en" : "fr");
  const txt = (x, y, font, size, fill, body, { ls = 0, anchor = "start", op } = {}) => {
    const m = /^(\d+) (\d+(?:\.\d+)?)px "(.+)"$/.exec(font(size));
    return `<text x="${x}" y="${y}" font-family="${m[3]}" font-weight="${m[1]}" font-size="${size}"${ls ? ` letter-spacing="${ls.toFixed(2)}"` : ""} text-anchor="${anchor}" fill="${fill}"${op !== undefined ? ` fill-opacity="${op}"` : ""}>${esc(body)}</text>`;
  };

  /* ---------------- Les six niveaux (SPEC §18.18) ---------------- */
  const starsFor = (o) => (o >= 90 ? 6 : o >= 75 ? 5 : o >= 60 ? 4 : o >= 45 ? 3 : o >= 30 ? 2 : 1);
  const LEVELS = {
    1: { fr: "Petit délit", en: "Petty crime" },
    2: { fr: "Délit", en: "Misdemeanor" },
    3: { fr: "Avis de recherche", en: "Wanted" },
    4: { fr: "Haute surveillance", en: "High surveillance" },
    5: { fr: "Menace publique", en: "Public menace" },
    6: { fr: "Priorité absolue", en: "Top priority" },
  };

  /* Thème : fond, emplacement du seul dégradé, couleur des barres, palmier.
     grad: "bg" (fond qui descend vers son ton bas), "num" (la note en --dusk),
     "sky" (ciel peint au-dessus de l'horizon), ou rien. */
  const THEMES = {
    s1: { bg: [C.slate, C["slate-low"]], grad: "bg", bar: C["lilac-2"], palm: null },
    s2: { bg: [C.navy, C["navy-low"]], grad: "bg", bar: C.blush, palm: "#2c3a60" },
    s3: { bg: [C.plum, C["plum-low"]], grad: "bg", bar: C.blush, palm: "#3a2442" },
    s4: { bg: [C.plum, C.plum], grad: "num", bar: C.peach, palm: "#5a3a64" },
    s5: { sky: [C["rose-a"], C["rose-b"], C["rose-c"], C["rose-d"]], ground: C["dusk-ground"], grad: "sky", bar: C.peach, palm: "#35244a", sun: "#ffe0b8" },
    s6: { sky: [C["blue-a"], C["blue-b"], C["blue-c"], C["blue-d"]], ground: C["blue-ground"], grad: "sky", bar: C.peach, palm: "#1b1c3e", lights: true, rim: true },
    wonderkid: { bg: [C.moss, C["moss-low"]], grad: "bg", bar: C.lime, palm: "#1f3430", badge: [C.lime, C["ink-0"]], label: { fr: "Débarque en ville", en: "New in town" } },
    flashback: { bg: [C.cold, C["cold-low"]], grad: "bg", bar: C.peach, palm: "#323e4a", badge: [C.peach, C["ink-0"]], gray: true, label: { fr: "Affaire classée", en: "Cold case" } },
    totw: { bg: [C.indigo, C.indigo], grad: "num", bar: C.peach, palm: "#34407a", badge: [C.cream, C["ink-0"]], label: { fr: "Les 5 plus recherchés · S47", en: "Top 5 most wanted · W47" } },
  };

  const STR = {
    fr: { file: "Dossier", gh: "GitHub", cv: "CV", spec: "Spécialité", weapon: "Arme", aff: "Affiliation", lone: "Sans bande", charges: "Chefs d'accusation", no: "N°", ai: "IA", stamp: "D'APRÈS LE CV",
      foot: (s, r) => `Interrogatoire par une IA : ${s} s · preuves ${r} %`,
      pos: { FS: "Full-stack", BE: "Backend", FE: "Frontend", EMB: "Embarqué", OPS: "Ops", CTO: "CTO sur parole", DATA: "Data", MOB: "Mobile", ML: "Machine learning" } },
    en: { file: "File", gh: "GitHub", cv: "CV", spec: "Specialty", weapon: "Weapon", aff: "Affiliation", lone: "Lone wolf", charges: "Charges", no: "No.", ai: "AI", stamp: "PER THE CV",
      foot: (s, r) => `Questioned by an AI for ${s} s · evidence ${r}%`,
      pos: { FS: "Full-stack", BE: "Backend", FE: "Frontend", EMB: "Embedded", OPS: "Ops", CTO: "Self-styled CTO", DATA: "Data", MOB: "Mobile", ML: "Machine learning" } },
  };
  const LANG = { python: "Python", typescript: "TypeScript", javascript: "JavaScript", rust: "Rust", c: "C", go: "Go", hcl: "HCL", kotlin: "Kotlin" };

  /* ---------------- Formes ---------------- */
  const STAR = "M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8z";
  const PALM = [
    "M46 140c2-34 5-62 12-86l4 1c-8 24-11 52-12 85z",
    "M60 54C40 38 20 38 4 50c18-4 36 0 56 7z",
    "M60 54C36 56 18 68 10 88c14-14 30-22 50-30z",
    "M60 54c18-22 40-28 60-20-20 0-40 8-60 24z",
    "M60 54c26-2 44 10 54 30-14-14-32-22-54-26z",
    "M60 54c-6-22-2-40 8-52-2 16 0 32-4 50z",
    "M60 54c10-20 26-32 44-34-16 8-30 20-42 36z",
    "M60 54c-14-14-18-30-14-48 4 16 10 30 16 46z",
  ].join("");
  const W = 360, H = 520, R = 16;

  /** Étoiles du HUD en SVG : six emplacements, les allumées calées à droite. */
  function starsSvg(n, x, y, size, gap, { shadow = true, onSky = false } = {}) {
    const k = size / 24;
    let out = "";
    for (let i = 0; i < 6; i++) {
      const on = i >= 6 - n;
      const tx = x + i * (size + gap);
      out += `<g transform="translate(${tx} ${y}) scale(${k})">`;
      if (on && shadow) out += `<path d="${STAR}" transform="translate(0 ${1 / k})" fill="#000" fill-opacity="0.28"/>`;
      out += on ? `<path d="${STAR}" fill="${C.star}"/></g>` : onSky ? `<path d="${STAR}" fill="#14141e" fill-opacity="0.55"/></g>` : `<path d="${STAR}" fill="#fff" fill-opacity="0.13"/></g>`;
    }
    return out;
  }

  /** Pastille d'un chef d'accusation : rouge sirène pour les charges, crème pour
   *  les points forts, lilas pour les spéciaux, pêche pour les écarts CV. */
  function pastille(tone, cx, cy) {
    const bg = { negative: C.siren, positive: C.cream, special: C["lilac-2"], gap: C.peach }[tone];
    const ink = tone === "negative" ? "#fff" : C["ink-0"];
    const g = {
      negative: `<rect x="-0.85" y="-3.4" width="1.7" height="4.1" rx="0.8" fill="${ink}"/><circle cx="0" cy="2.5" r="0.95" fill="${ink}"/>`,
      positive: `<path d="M-2.5 0.1 L-0.7 1.9 L2.6 -1.9" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
      special: `<path d="M0 -3.2 L0.9 -0.9 L3.2 0 L0.9 0.9 L0 3.2 L-0.9 0.9 L-3.2 0 L-0.9 -0.9 Z" fill="${ink}"/>`,
      gap: `<path d="M-2.6 -1.1h5.2M-2.6 1.1h5.2M1.4 -3 L-1.4 3" stroke="${ink}" stroke-width="1.3" stroke-linecap="round"/>`,
    }[tone];
    return `<g transform="translate(${cx} ${cy})"><circle r="5.6" fill="${bg}"/>${g}</g>`;
  }

  /** Horizon peint des niveaux ★★★★★ et ★★★★★★ : immeubles bas et palmiers
   *  en aplat de la teinte du sol, soleil ou fenêtres allumées. Tout en aplats. */
  function skyline(th, hy) {
    let s = "";
    // deux grappes d'immeubles, une trouée au milieu pour le soleil ou la baie
    const blocks = [[0, 12, 14], [12, 9, 24], [21, 14, 15], [35, 8, 31], [43, 12, 19], [124, 10, 22], [134, 9, 36], [143, 14, 18], [157, 8, 27], [165, 15, 14]];
    blocks.forEach(([x, w, h]) => {
      s += `<rect x="${x}" y="${hy - h}" width="${w + 0.5}" height="${h + 1}" fill="${th.ground}"/>`;
      if (th.lights) for (let k = 0; k < Math.floor(h / 8); k++) s += `<rect x="${x + 2.5 + (k % 2) * 3.5}" y="${hy - h + 4 + k * 7}" width="1.6" height="1.6" fill="#ffc46b" fill-opacity="0.8"/>`;
    });
    // trois palmiers de tailles différentes, ton sur ton avec le sol
    [[50, 0.42], [92, 0.28], [104, 0.35]].forEach(([x, k]) => {
      s += `<g transform="translate(${x} ${hy - 140 * k}) scale(${k})" fill="${th.ground}"><path d="${PALM}"/></g>`;
    });
    return s;
  }

  let uid = 0;
  /**
   * La fiche (360 × 520). c : données fictives (mêmes formes que shared/fixtures.ts).
   * opts.sans : "Outfit" (choisi) ou "Inter" (pour comparer).
   */
  function card(c, opts = {}) {
    const id = `f${++uid}`;
    const lang = c.lang || "fr";
    const s = STR[lang];
    const fam = opts.sans || "Outfit";
    const S5 = sansFont(500, fam), S6 = sansFont(600, fam);
    const o = overallOf(c.v);
    const n = starsFor(o);
    const th = THEMES[c.special || `s${n}`];
    const sky = th.grad === "sky";
    const ground = sky ? th.ground : th.bg[1];
    const u = (k) => `url(#${id}-${k})`;
    const L = 20, Rx = W - 18, FW = Rx - L;
    const M = { x: 178, y: 44, w: 164, h: 192 };
    const HY = 248; // horizon des fiches au ciel peint

    /* ---- defs : le seul dégradé de la fiche, les découpes, la photo ---- */
    let defs = `<clipPath id="${id}-card"><rect width="${W}" height="${H}" rx="${R}"/></clipPath>`;
    defs += `<clipPath id="${id}-mug"><rect x="${M.x}" y="${M.y}" width="${M.w}" height="${M.h}" rx="6"/></clipPath>`;
    if (th.grad === "bg") defs += `<linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${th.bg[0]}"/><stop offset="1" stop-color="${th.bg[1]}"/></linearGradient>`;
    if (th.grad === "num") defs += `<linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C["dusk-a"]}"/><stop offset="0.35" stop-color="${C["dusk-b"]}"/><stop offset="0.65" stop-color="${C["dusk-c"]}"/><stop offset="1" stop-color="${C["dusk-d"]}"/></linearGradient>`;
    if (sky) defs += `<linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="${HY}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${th.sky[0]}"/><stop offset="0.5" stop-color="${th.sky[1]}"/><stop offset="0.84" stop-color="${th.sky[2]}"/><stop offset="1" stop-color="${th.sky[3]}"/></linearGradient>`;
    // Photo « peinte » : ombres poussées vers le violet, pas de posterisation dure.
    defs += th.gray
      ? `<filter id="${id}-photo" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="table" tableValues="0.16 0.62 0.93"/><feFuncG type="table" tableValues="0.17 0.64 0.95"/><feFuncB type="table" tableValues="0.21 0.68 0.98"/></feComponentTransfer></filter>`
      : `<filter id="${id}-photo" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="1.08"/><feComponentTransfer><feFuncR type="table" tableValues="0.19 0.56 1"/><feFuncG type="table" tableValues="0.12 0.48 0.98"/><feFuncB type="table" tableValues="0.31 0.6 0.98"/></feComponentTransfer></filter>`;
    defs += `<filter id="${id}-grain" x="0" y="0" width="${W}" height="${H}" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0"/></filter>`;
    if (th.rim) defs += `<filter id="${id}-rim" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="5"/></filter>`;

    /* ---- fond ---- */
    let body = "";
    if (th.grad === "bg") body += `<rect width="${W}" height="${H}" fill="${u("g")}"/>`;
    else if (sky) {
      body += `<rect width="${W}" height="${HY}" fill="${u("g")}"/>`;
      if (th.sun) body += `<circle cx="96" cy="${HY - 2}" r="20" fill="${th.sun}" fill-opacity="0.85"/>`;
      body += `<rect y="${HY}" width="${W}" height="${H - HY}" fill="${ground}"/>${skyline(th, HY)}`;
    }
    else body += `<rect width="${W}" height="${H}" fill="${th.bg[0]}"/>`;
    if (th.palm) body += `<g transform="translate(236 318) scale(1.45)" fill="${th.palm}"><path d="${PALM}"/></g>`;
    body += `<rect width="${W}" height="${H}" filter="${u("grain")}" opacity="0.05"/>`;

    /* ---- haut : la marque à gauche, les étoiles du HUD à droite ---- */
    let top = `<g transform="translate(${L} 18) scale(${13 / 120})"><path d="M52 8 L14 50 L37 102 Z" fill="#c9d67c" stroke="#c9d67c" stroke-width="9" stroke-linejoin="round"/><path d="M63 10 L92 42 L85 80 L47 112 Z" fill="#6fb2a8" stroke="#6fb2a8" stroke-width="9" stroke-linejoin="round"/></g>`;
    top += txt(L + 17, 29.5, S6, 10, C.lilac, "AZERIT", { ls: 2.2, op: 0.85 });
    const SZ = 17, GP = 3;
    top += starsSvg(n, Rx - 6 * SZ - 5 * GP, 15, SZ, GP, { onSky: sky });

    /* ---- la note : crème plat, ou le seul dégradé de la fiche ---- */
    const numSize = o >= 100 ? 92 : 118;
    const numFill = th.grad === "num" ? u("g") : C.cream;
    top += `<text x="16" y="134" font-family="Barlow Condensed" font-weight="800" font-size="${numSize}" letter-spacing="-2.4" fill="${numFill}">${o}</text>`;

    /* ---- le niveau, la source ---- */
    const lv = fit(up(LEVELS[n][lang], lang), S6, 11, M.x - L - 8, { ls: 1.65, minLs: 0.5, minSize: 9 });
    top += txt(L, 157, S6, lv.size, C.lilac, lv.text, { ls: lv.ls });
    top += txt(L, 180, S6, 8.5, C.lilac, up(s.file, lang), { ls: 1.3, op: 0.62 });
    top += txt(L, 196, S6, 12.5, C.cream, c.cv ? s.cv : s.gh);
    if (th.badge) {
      const b = fit(up(th.label[lang], lang), S6, 8.5, M.x - L - 8 - 18, { ls: 1.2, minLs: 0.4, minSize: 7.5 });
      const bw = b.size === 0 ? 0 : measure(b.text, S6, b.size, b.ls) + 18;
      top += `<rect x="${L}" y="208" width="${bw}" height="20" rx="10" fill="${th.badge[0]}"/>`;
      top += txt(L + 9, 221.2, S6, b.size, th.badge[1], b.text, { ls: b.ls });
    }

    /* ---- photo d'identité judiciaire ---- */
    let mug = `<g clip-path="${u("mug")}"><rect x="${M.x}" y="${M.y}" width="${M.w}" height="${M.h}" fill="${th.gray ? "#a9b0b6" : "#b4bfcb"}"/>`;
    for (let i = 0; i < 7; i++) mug += `<rect x="${M.x}" y="${M.y + 25 + i * 26.5}" width="${M.w}" height="1.5" fill="#141c28" fill-opacity="0.32"/>`;
    ["190", "180", "170", "160"].forEach((t, i) => (mug += `<text x="${M.x + 6}" y="${M.y + 21 + i * 53}" font-family="JetBrains Mono" font-weight="700" font-size="8" fill="#141c28" fill-opacity="0.6">${t}</text>`));
    if (c.photo) mug += `<image href="${esc(c.photo)}" x="${M.x + 12}" y="${M.y + M.h - 168}" width="140" height="168" preserveAspectRatio="xMidYMin slice" filter="${u("photo")}"/>`;
    else {
      const f = fit(c.initials, FONTS.name8, 72, M.w - 30, { minSize: 40 });
      mug += `<text x="${M.x + M.w / 2}" y="${M.y + 108}" font-family="Barlow Condensed" font-weight="800" font-size="${f.size}" text-anchor="middle" fill="#2b3442" fill-opacity="0.85">${esc(f.text)}</text>`;
    }
    if (c.cv) {
      mug += `<g transform="translate(${M.x + M.w / 2} ${M.y + 40}) rotate(-9)" opacity="0.88"><rect x="-64" y="-16" width="128" height="32" rx="3" fill="none" stroke="#a3261b" stroke-width="2.2"/><rect x="-60" y="-12" width="120" height="24" rx="1.5" fill="none" stroke="#a3261b" stroke-width="0.8"/>`;
      mug += `<text x="0" y="5.4" font-family="Barlow Condensed" font-weight="800" font-size="15.5" letter-spacing="1.4" text-anchor="middle" fill="#a3261b">${esc(s.stamp)}</text></g>`;
    }
    // écriteau
    const PW = 136, PH = 44, px = M.x + (M.w - PW) / 2, py = M.y + M.h - 10 - PH;
    const pn = fit(up(c.login || c.name, lang), FONTS.name7, 20, PW - 16, { ls: 1.6, minLs: 0.3, minSize: 12 });
    const caseLine = `${s.no} ${c.no || "4F7K"} · 09.11.26`;
    mug += `<g transform="rotate(-1.2 ${px + PW / 2} ${py + PH / 2})"><rect x="${px}" y="${py}" width="${PW}" height="${PH}" rx="3" fill="#111"/>`;
    mug += `<text x="${px + PW / 2 + pn.ls / 2}" y="${py + 22}" font-family="Barlow Condensed" font-weight="700" font-size="${pn.size}" letter-spacing="${pn.ls.toFixed(2)}" text-anchor="middle" fill="#f4f1ea">${esc(pn.text)}</text>`;
    mug += `<text x="${px + PW / 2}" y="${py + 35}" font-family="JetBrains Mono" font-size="8.5" letter-spacing="0.85" text-anchor="middle" fill="#bdb8ad">${esc(caseLine)}</text></g></g>`;
    mug += `<rect x="${M.x + 0.5}" y="${M.y + 0.5}" width="${M.w - 1}" height="${M.h - 1}" rx="6" fill="none" stroke="#fff" stroke-opacity="0.14"/>`;

    /* ---- le profil criminel : le nom d'une page personnage, puis l'accroche rose ---- */
    let prof = "";
    if (c.profile) {
      const pf = fit(up(c.profile.label[lang], lang), FONTS.name7, 30, FW, { ls: 0.4, minLs: 0, minSize: 20 });
      prof += txt(L - 1, 276, FONTS.name7, pf.size, C.cream, pf.text, { ls: pf.ls });
      const tg = fit(c.profile.tag[lang], S5, 13, FW, { minSize: 11 });
      if (!tg.cut) prof += txt(L, 295, S5, tg.size, C.blush, tg.text);
    }

    /* ---- spécialité, arme, affiliation ---- */
    let form = `<rect x="${L}" y="306" width="${FW}" height="1" fill="#fff" fill-opacity="0.12"/>`;
    const unit = (FW - 20) / 3.3;
    [
      [L, unit, s.spec, s.pos[c.pos]],
      [L + unit + 10, unit, s.weapon, c.lang_ ? LANG[c.lang_] : "—"],
      [L + 2 * unit + 20, unit * 1.3, s.aff, c.club || s.lone],
    ].forEach(([x, w, lab, val]) => {
      form += txt(x, 321, S6, 8.5, C.lilac, up(lab, lang), { ls: 1.2, op: 0.62 });
      const f = fit(val, S6, 12.5, w, { minSize: 10 });
      form += txt(x, 337, S6, f.size, C.cream, f.text);
    });

    /* ---- six stats en barres de dix segments, aplats ---- */
    let stats = "";
    ["TEC", "SHIP", "ARCH", "DOC", "XP", "BUZZ"].forEach((k, i) => {
      const x = L + (i < 3 ? 0 : 169), y = 348 + (i % 3) * 22;
      const val = c.v[k], weak = (c.weak || []).includes(k), buzz = k === "BUZZ";
      const col = buzz ? C.siren : th.bar;
      stats += txt(x, y + 13, S6, 10, C.lilac, k, { ls: 0.6, op: 0.75 });
      const bx = x + 40, bw = 153 - 40 - 28, seg = (bw - 9 * 2) / 10;
      for (let j = 0; j < 10; j++) {
        const sx = bx + j * (seg + 2);
        const fillW = Math.max(0, Math.min(seg, (val - j * 10) / 10 * seg));
        stats += `<rect x="${sx.toFixed(2)}" y="${y + 5}" width="${seg.toFixed(2)}" height="8" rx="1" fill="#fff" fill-opacity="0.09"/>`;
        if (fillW > 0) stats += `<rect x="${sx.toFixed(2)}" y="${y + 5}" width="${fillW.toFixed(2)}" height="8" rx="1" fill="${col}"${weak ? ` fill-opacity="0.45"` : ""}/>`;
      }
      stats += txt(x + 153, y + 15, FONTS.name7, 18, C.cream, String(val), { anchor: "end", op: weak ? 0.55 : 1 });
      if (weak) stats += txt(x + 153 - 25, y + 14, FONTS.mono7, 9, C.lilac, "?", { anchor: "end", op: 0.6 });
    });

    /* ---- chefs d'accusation : pastilles du HUD ---- */
    let ch = txt(L, 429, S6, 8.5, C.lilac, up(s.charges, lang), { ls: 1.3, op: 0.62 });
    c.st.slice(0, 3).forEach(([tone, label, ai], i) => {
      const y = 448 + i * 18;
      const tag = ai ? ` · ${s.ai}` : "";
      const tagW = ai ? measure(tag, FONTS.mono4, 9) : 0;
      const f = fit(label[lang], S5, 12.5, FW - 15 - tagW, {});
      ch += pastille(tone, L + 5.6, y - 4.3);
      ch += txt(L + 16, y, S5, 12.5, C.lilac, f.text);
      if (ai) ch += txt(L + 16 + measure(f.text, S5, 12.5) + 2, y, FONTS.mono4, 9, C.lilac, tag, { op: 0.55 });
    });

    /* ---- pied, en procès-verbal ---- */
    const ft = fit(s.foot(c.s, c.rel), FONTS.mono4, 9, FW, { ls: 0.2, minSize: 7.5 });
    const foot = txt(L, 507, FONTS.mono4, ft.size, C.lilac, ft.text, { ls: ft.ls, op: 0.55 });

    /* ---- ★★★★★★ : le contour éclairé par l'arrière, la seule lumière ---- */
    let rim = `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="${R - 0.5}" fill="none" stroke="#fff" stroke-opacity="0.08"/>`;
    if (th.rim) {
      rim = `<rect x="0" y="0" width="${W}" height="${H}" rx="${R}" fill="none" stroke="${C["rim-glow"]}" stroke-width="12" stroke-opacity="0.75" filter="${u("rim")}"/>`;
      rim += `<rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="${R - 0.75}" fill="none" stroke="${C["rim-core"]}" stroke-width="1.5"/>`;
    }

    const aria = `Fiche ${LEVELS[n][lang]} ${o}, ${n} étoiles sur 6 — ${c.name}`;
    return `<svg class="fiche" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}" data-stars="${n}"><defs>${defs}</defs><g clip-path="${u("card")}">${body}${top}${mug}${prof}${form}${stats}${ch}${foot}${rim}</g></svg>`;
  }

  /** La fiche dans son enveloppe HTML (le contour de ★★★★★★ déborde à l'écran). */
  function cardHtml(c, opts) {
    const n = starsFor(overallOf(c.v));
    return `<div class="fiche-wrap${n === 6 && !c.special ? " rim" : ""}">${card(c, opts)}</div>`;
  }

  /** Étoiles du HUD en HTML pour les pages (même dessin). */
  function hudStars(n, label, sky) {
    let s = `<span class="hud-stars${sky ? " hud-stars--sky" : ""}" role="img" aria-label="${label || `${n} étoiles sur 6`}">`;
    for (let i = 0; i < 6; i++) s += `<svg viewBox="0 0 24 24" class="${i >= 6 - n ? "on" : "off"}"><path d="${STAR}"/></svg>`;
    return s + "</span>";
  }

  const overallOf = (v) => Math.round(v.TEC * 0.3 + v.SHIP * 0.2 + v.ARCH * 0.2 + v.DOC * 0.15 + v.XP * 0.15);

  /* ---------------- Données fictives (shared/fixtures.ts, data/profiles.json) ---------------- */
  const P = {
    delivery: { label: { fr: "Machine à livrer", en: "Delivery machine" }, tag: { fr: "Livre plus vite que la police ne lit", en: "Ships faster than the cops can read" } },
    kingpin: { label: { fr: "Légende du milieu", en: "Underworld legend" }, tag: { fr: "Ses PR font la loi dans tous les quartiers", en: "PRs that run every block in town" } },
    night: { label: { fr: "Oiseau de nuit", en: "Night owl" }, tag: { fr: "Les meilleurs coups partent à 3 h du matin", en: "The best jobs go out at 3am" } },
    arsonist: { label: { fr: "Pyromane", en: "Arsonist" }, tag: { fr: "Déploie le vendredi soir. Sans peur, sans rollback", en: "Deploys on Friday night. No fear, no rollback" } },
    repeat: { label: { fr: "Récidiviste", en: "Repeat offender" }, tag: { fr: "fix, fix2, final fix : une signature de légende", en: "fix, fix2, final fix: a signature move" } },
    hoarder: { label: { fr: "Écureuil", en: "Hoarder" }, tag: { fr: "Des repos en planque partout, au cas où", en: "Repos stashed everywhere, just in case" } },
    fresh: { label: { fr: "Jeune pousse", en: "Fresh blood" }, tag: { fr: "À peine en ville, déjà sur tous les radars", en: "New in town, already on every radar" } },
    old: { label: { fr: "Vieille école", en: "Old school" }, tag: { fr: "Du code d'époque, toujours en état de marche", en: "Vintage code, still in working order" } },
    ghost: { label: { fr: "Fantôme", en: "Ghost" }, tag: { fr: "Aucune trace publique : du travail de pro", en: "No public trace: strictly pro work" } },
    sleeper: { label: { fr: "Cellule dormante", en: "Sleeper agent" }, tag: { fr: "En sommeil, jusqu'au jour du grand coup", en: "Lying low until the big score" } },
    forger: { label: { fr: "Faussaire", en: "Forger" }, tag: { fr: "Le CV le plus convaincant de la ville", en: "The most convincing CV in town" } },
  };
  const st = (tone, fr, en, ai) => [tone, { fr, en }, ai];
  const S = {
    lazy: st("negative", "Commits : fix, fix2, final fix", "Commits: fix, fix2, final fix"),
    noTests: st("negative", "Tests : bientôt", "Tests: coming soon"),
    friday: st("negative", "Push sur main le vendredi soir", "Pushes to main on Friday night"),
    night: st("negative", "Commit de 3 h du matin", "3am committer"),
    ship: st("positive", "Ship ou rien", "Ship or nothing"),
    maintainer: st("positive", "Maintient des projets", "Maintainer"),
    stars: st("positive", "Code lu par d'autres", "Read by others"),
    tutorial: st("negative", "A fini le tutoriel", "Finished the tutorial"),
    archeo: st("special", "Archéologue", "Archaeologist"),
    typed: st("positive", "Typage jusqu'au bout", "Typed all the way down", true),
    senior: st("gap", "Senior depuis le CV", "Senior since the CV"),
    buzz: st("negative", "Agile, synergie, disruptif", "Agile, synergy, disruptive"),
    passion: st("negative", "Passion citée 4 fois", "Passionate (mentioned 4 times)"),
    privateTalent: st("special", "Repo privé, talent privé", "Private repos, private talent"),
    alive: st("negative", "48 repos, 3 vivants (et encore, ça dépend des jours)", "48 repos, 3 alive (on a good day)"),
    franglais: st("negative", "Commentaires en franglais dans tout le code source du projet", "Franglais comments all over the source", true),
  };

  const CARDS = {
    jmougeot: { name: "Jacques Mougeot", login: "jmougeot", photo: "public/jmougeot-linkedin.jpg", initials: "JM", pos: "FS", lang_: "python", club: "Azerit", v: { TEC: 80, SHIP: 88, ARCH: 72, DOC: 70, XP: 60, BUZZ: 24 }, st: [S.ship, S.typed, S.friday], profile: P.delivery, rel: 95, s: 9, no: "JMOUGE",
      sentence: { fr: "Peine : 2 README de 300 mots", en: "Sentence: 2 READMEs of 300 words" }, bail: { fr: "Caution : un push le lundi matin", en: "Bail: one Monday-morning push" } },
    s1: { name: "x", login: "x", initials: "X", pos: "FE", lang_: "javascript", v: { TEC: 30, SHIP: 22, ARCH: 25, DOC: 20, XP: 28, BUZZ: 72 }, st: [S.tutorial, S.noTests], profile: P.sleeper, rel: 38, s: 3, weak: ["TEC", "ARCH"], no: "X09Q" },
    s2: { name: "kevin-dev42", login: "kevin-dev42", initials: "KD", pos: "FE", lang_: "javascript", v: { TEC: 48, SHIP: 41, ARCH: 30, DOC: 44, XP: 52, BUZZ: 81 }, st: [S.lazy, S.noTests, S.tutorial], profile: P.repeat, rel: 76, s: 7, no: "BR0NZE" },
    s3: { name: "ghost-coder", login: "ghost-coder", initials: "GC", pos: "BE", lang_: "go", v: { TEC: 55, SHIP: 38, ARCH: 40, DOC: 35, XP: 60, BUZZ: 20 }, st: [S.privateTalent], profile: P.ghost, rel: 38, s: 8, weak: ["TEC", "ARCH", "DOC"], no: "LOW" },
    s4: { name: "Camille Roux", login: "camroux", initials: "CR", pos: "BE", lang_: "python", club: "Doctolib", v: { TEC: 68, SHIP: 72, ARCH: 61, DOC: 66, XP: 70, BUZZ: 34 }, st: [S.friday, S.stars], profile: P.arsonist, rel: 95, s: 9, no: "SILVER" },
    s5: { name: "Léa Martin-Dubois", login: "leamd", initials: "LM", pos: "FS", lang_: "typescript", club: "Alan", v: { TEC: 82, SHIP: 88, ARCH: 76, DOC: 71, XP: 74, BUZZ: 22 }, st: [S.typed, S.lazy, S.ship], profile: P.delivery, rel: 95, s: 9, no: "GOLD" },
    s6: { name: "Sindre Sorhus", login: "sindresorhus", photo: "https://avatars.githubusercontent.com/u/170270?v=4", initials: "SS", pos: "FE", lang_: "typescript", v: { TEC: 94, SHIP: 97, ARCH: 92, DOC: 93, XP: 99, BUZZ: 12 }, st: [S.maintainer, S.stars, S.ship], profile: P.kingpin, rel: 95, s: 9, no: "ICON" },
    wonderkid: { special: "wonderkid", name: "Nour", login: "nour-rs", initials: "NO", pos: "EMB", lang_: "rust", v: { TEC: 78, SHIP: 74, ARCH: 70, DOC: 62, XP: 38, BUZZ: 18 }, st: [S.typed, S.ship], profile: P.fresh, rel: 95, s: 8, no: "WONDER" },
    flashback: { special: "flashback", name: "Jean-Pierre Lefèvre", login: "jplefevre", initials: "JL", pos: "BE", lang_: "c", v: { TEC: 80, SHIP: 32, ARCH: 58, DOC: 69, XP: 95, BUZZ: 14 }, st: [S.archeo, S.stars], profile: P.old, rel: 95, s: 9, no: "FLASHB" },
    totw: { special: "totw", name: "Octo Cat", login: "octocat", photo: "https://avatars.githubusercontent.com/u/583231?v=4", initials: "OC", pos: "OPS", lang_: "hcl", club: "GitHub", v: { TEC: 84, SHIP: 91, ARCH: 86, DOC: 78, XP: 80, BUZZ: 16 }, st: [S.ship, S.maintainer, S.friday], profile: P.kingpin, rel: 95, s: 9, no: "TOTW" },
    english: { lang: "en", name: "Linus T.", login: "torvalds", photo: "https://avatars.githubusercontent.com/u/1024025?v=4", initials: "LT", pos: "EMB", lang_: "c", club: "Linux Foundation", v: { TEC: 92, SHIP: 95, ARCH: 88, DOC: 84, XP: 99, BUZZ: 10 }, st: [S.maintainer, S.lazy], profile: P.kingpin, rel: 95, s: 9, no: "GHPHOT" },
    cv: { cv: true, name: "Maxime Bernard", initials: "MB", pos: "CTO", club: "Stealth Startup", v: { TEC: 86, SHIP: 70, ARCH: 60, DOC: 65, XP: 88, BUZZ: 92 }, st: [S.buzz, S.passion, S.senior], profile: P.forger, rel: 76, s: 6, no: "CV" },
    long: { name: "Marie-Charlotte Vandenberghe-Lefebvre de Montmorency", login: "marie-charlotte-vdb", initials: "MV", pos: "MOB", lang_: "kotlin", club: "Société Générale Corporate & Investment Banking", v: { TEC: 63, SHIP: 66, ARCH: 58, DOC: 70, XP: 72, BUZZ: 55 }, st: [S.alive, S.franglais, S.senior], profile: P.hoarder, rel: 95, s: 9, no: "LONG" },
    /* La personne de la page partagée et du carton : ★★★★, Oiseau de nuit. */
    samk: { name: "Sam K.", login: "sam-k", initials: "SK", pos: "BE", lang_: "rust", club: null, v: { TEC: 72, SHIP: 70, ARCH: 64, DOC: 58, XP: 66, BUZZ: 30 }, st: [S.night, S.lazy, S.stars], profile: P.night, rel: 95, s: 9, no: "N8OWL",
      sentence: { fr: "Peine : 5 README de 300 mots", en: "Sentence: 5 READMEs of 300 words" }, bail: { fr: "Caution : un commit à l'heure du café", en: "Bail: one commit at coffee time" } },
  };

  async function ready() {
    const want = ['700 30px "Barlow Condensed"', '800 118px "Barlow Condensed"', '700 20px "Barlow Semi Condensed"', '400 9px "JetBrains Mono"', '700 9px "JetBrains Mono"', '500 13px "Outfit"', '600 13px "Outfit"', '500 13px "Inter"', '600 13px "Inter"'];
    await Promise.all(want.map((f) => document.fonts.load(f).catch(() => null)));
    await document.fonts.ready;
  }

  window.TYS = { card, cardHtml, hudStars, starsSvg, starsFor, overallOf, LEVELS, CARDS, PALM, STAR, ready, fit, measure, FONTS };
})();
