// Détections pures sur les données brutes GitHub : pseudo, arborescence,
// manifestes de dépendances, README. Testables hors ligne.

import type { RepoTree } from "./facts";

const LOGIN_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i;

/** Accepte « pseudo », « @pseudo », « github.com/pseudo », une URL complète. Rend null si invalide. */
export function parseLogin(input: string): string | null {
  let s = input.trim();
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#\s]+)/i);
  if (m) s = m[1];
  s = s.replace(/^@/, "").replace(/\/+$/, "");
  return LOGIN_RE.test(s) ? s : null;
}

// --- Arborescence -----------------------------------------------------------

const TEST_DIRS = new Set(["test", "tests", "spec", "specs", "__tests__", "testing"]);
const TEST_FILE_RES = [
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /_test\.(go|py|rs|exs?|dart)$/,
  /(^|\/)test_[^/]+\.py$/,
  /Tests?\.(java|kt|swift|cs|scala)$/,
  /_spec\.rb$/,
];
const CI_RES = [
  /^\.github\/workflows\/[^/]+\.ya?ml$/,
  /^\.gitlab-ci\.yml$/,
  /^\.circleci\//,
  /^\.travis\.yml$/,
  /^azure-pipelines\.yml$/,
  /^Jenkinsfile$/,
  /^bitbucket-pipelines\.yml$/,
  /^\.drone\.yml$/,
  /^\.buildkite\//,
  /^appveyor\.yml$/,
];
const TOOLING_FILES: [RegExp, string][] = [
  [/(^|\/)\.eslintrc(\.[a-z]+)?$|(^|\/)eslint\.config\.[cm]?[jt]s$/, "eslint"],
  [/(^|\/)\.prettierrc(\.[a-z]+)?$|(^|\/)prettier\.config\.[cm]?[jt]s$/, "prettier"],
  [/(^|\/)biome\.jsonc?$/, "biome"],
  [/(^|\/)\.?ruff\.toml$/, "ruff"],
  [/(^|\/)\.?mypy\.ini$/, "mypy"],
  [/(^|\/)\.golangci\.(ya?ml|toml|json)$/, "golangci"],
  [/(^|\/)\.?rustfmt\.toml$/, "rustfmt"],
  [/(^|\/)\.?clippy\.toml$/, "clippy"],
  [/^\.pre-commit-config\.yaml$/, "pre-commit"],
];
const MARKERS: [RegExp, string][] = [
  [/(^|\/)Dockerfile(\.[\w-]+)?$|(^|\/)docker-compose[\w.-]*\.ya?ml$|(^|\/)compose\.ya?ml$/, "dockerfile"],
  [/\.tf$/, "terraform"],
  [/(^|\/)(k8s|kubernetes|helm|charts)\/|(^|\/)kustomization\.ya?ml$|(^|\/)Chart\.yaml$/, "k8s"],
  [/(^|\/)AndroidManifest\.xml$/, "android"],
  [/\.xcodeproj\/|(^|\/)Podfile$|\.xcworkspace\//, "ios"],
  [/(^|\/)pubspec\.yaml$/, "flutter"],
  [/(^|\/)platformio\.ini$|\.ino$|(^|\/)memory\.x$|\.ld$|(^|\/)Kconfig$|(^|\/)sdkconfig/, "embedded"],
  [/\.ipynb$/, "notebook"],
];

/**
 * Fichiers de consignes pour agents d'IA (§18.37, « IA dans l'atelier ») :
 * Claude Code, Codex et AGENTS.md, Gemini, Cursor, Copilot, Windsurf, Cline,
 * Roo, Aider, Junie, Kiro, Continue, Amazon Q. Lus dans l'arbre déjà demandé :
 * aucun appel de plus.
 */
const AGENT_FILE_RES = [
  /(^|\/)CLAUDE(\.local)?\.md$/,
  /(^|\/)AGENTS(\.override)?\.md$/,
  /(^|\/)GEMINI\.md$/,
  /^\.claude\//,
  /(^|\/)\.cursorrules$/,
  /^\.cursor\/rules\//,
  /^\.github\/copilot-instructions\.md$/,
  /^\.github\/instructions\/[^/]+\.instructions\.md$/,
  /^\.github\/prompts\/[^/]+\.prompt\.md$/,
  /(^|\/)\.windsurfrules$/,
  /^\.windsurf\/rules\//,
  /(^|\/)\.clinerules(\/|$)/,
  /^\.roo\/rules/,
  /^\.roomodes$/,
  /^\.aider\.conf\.ya?ml$/,
  /^\.junie\/guidelines\.md$/,
  /^\.kiro\/steering\//,
  /^\.continue\/(rules|prompts)\//,
  /^\.amazonq\/rules\//,
];
/** Dossiers d'agent vus à la racine d'un arbre lu en surface (repo énorme). */
const AGENT_DIRS = new Set([".claude", ".clinerules", ".kiro", ".roo", ".junie"]);
const MAX_AGENT_FILES = 10;

export function isAgentFile(path: string): boolean {
  return AGENT_FILE_RES.some((re) => re.test(path));
}

const SOURCE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|kts|swift|c|h|cc|cpp|hpp|cxx|m|mm|rb|php|cs|scala|ex|exs|erl|dart|vue|svelte|lua|sh|zig|hs|ml|clj|elm|jl|r|nim|cr|v|sol)$/i;
const EXCLUDED_PATH =
  /(^|\/)(node_modules|vendor|third_party|third-party|dist|build|out|target|coverage|\.next|\.nuxt|bower_components|Pods|deps|_build|generated|__generated__|gen|\.yarn|fixtures?|__snapshots__|examples?|docs?)\//i;
const EXCLUDED_FILE = /(\.min\.[jc]ss?$|\.min\.js$|[-.]bundle\.js$|\.d\.ts$|\.pb\.go$|_pb2\.py$|\.generated\.\w+$|\.g\.dart$|\.freezed\.dart$|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|go\.sum|poetry\.lock|Gemfile\.lock|composer\.lock))$/i;

export interface TreeEntry {
  path: string;
  type: "blob" | "tree" | "commit";
  size?: number;
}

export function isSourceCandidate(path: string, size: number | undefined): boolean {
  if (!SOURCE_EXT.test(path)) return false;
  if (EXCLUDED_PATH.test(path) || EXCLUDED_FILE.test(path)) return false;
  return size === undefined || (size >= 300 && size <= 100_000);
}

function isTestPath(path: string): boolean {
  const segs = path.split("/");
  for (let i = 0; i < segs.length - 1; i++) if (TEST_DIRS.has(segs[i].toLowerCase())) return true;
  return TEST_FILE_RES.some((re) => re.test(path));
}

/** Analyse une arborescence (git/trees?recursive=1). tsconfig/pyproject sont lus à part et passés ici. */
export function analyzeTree(
  repo: string,
  entries: TreeEntry[],
  extra: { truncated: boolean; tsconfig?: string | null; pyproject?: string | null; devDeps?: string[] | null },
): RepoTree {
  let testFiles = 0;
  let hasCi = false;
  let nodeModules = false;
  const tooling = new Set<string>();
  const markers = new Set<string>();
  const sources: { path: string; size: number }[] = [];
  const agentFiles = new Set<string>();

  for (const e of entries) {
    const p = e.path;
    if (/(^|\/)node_modules(\/|$)/.test(p)) {
      nodeModules = true;
      continue;
    }
    if (e.type === "tree" && AGENT_DIRS.has(p)) agentFiles.add(`${p}/`);
    if (e.type !== "blob") continue;
    if (isAgentFile(p) && !/(^|\/)(vendor|third_party)\//.test(p)) agentFiles.add(p);
    if (isTestPath(p) && !/(^|\/)(vendor|third_party)\//.test(p)) testFiles++;
    if (!hasCi && CI_RES.some((re) => re.test(p))) hasCi = true;
    for (const [re, name] of TOOLING_FILES) if (re.test(p)) tooling.add(name);
    for (const [re, name] of MARKERS) if (re.test(p)) markers.add(name);
    if (isSourceCandidate(p, e.size)) sources.push({ path: p, size: e.size ?? 0 });
  }
  if (extra.tsconfig && isStrictTsconfig(extra.tsconfig)) tooling.add("tsconfig-strict");
  if (extra.pyproject) {
    if (/^\[tool\.ruff/m.test(extra.pyproject)) tooling.add("ruff");
    if (/^\[tool\.mypy/m.test(extra.pyproject)) tooling.add("mypy");
  }
  for (const d of extra.devDeps ?? []) {
    if (d === "eslint") tooling.add("eslint");
    if (d === "prettier") tooling.add("prettier");
    if (d === "@biomejs/biome") tooling.add("biome");
    if (d === "xo") tooling.add("xo");
  }
  sources.sort((a, b) => b.size - a.size || a.path.localeCompare(b.path));
  return {
    repo,
    available: true,
    truncated: extra.truncated,
    entries: entries.length,
    testFiles,
    hasTests: testFiles > 0,
    hasCi,
    tooling: [...tooling].sort(),
    nodeModules,
    markers: [...markers].sort(),
    sourceFiles: sources.slice(0, 60),
    agentFiles: [...agentFiles].sort().slice(0, MAX_AGENT_FILES),
  };
}

export function isStrictTsconfig(text: string): boolean {
  if (/"strict"\s*:\s*true/.test(text)) return true;
  // Configs partagées connues pour être strictes.
  return /"extends"\s*:\s*"[^"]*(strict|@sindresorhus\/tsconfig|@tsconfig\/strictest)[^"]*"/.test(text);
}

// --- Manifestes --------------------------------------------------------------

/** Fichiers de dépendances lus à la racine, par ordre de préférence. */
export const MANIFESTS = [
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "pubspec.yaml",
  "Gemfile",
  "build.gradle.kts",
  "build.gradle",
  "Package.swift",
  "composer.json",
] as const;

/** Manifestes à essayer d'après le langage principal, quand l'arbre n'est pas connu. */
export function manifestsForLanguage(lang: string | null): string[] {
  switch (lang) {
    case "JavaScript":
    case "TypeScript":
    case "Vue":
    case "Svelte":
    case "Astro":
    case "HTML":
    case "CSS":
    case "SCSS":
    case null:
      return ["package.json"];
    case "Python":
    case "Jupyter Notebook":
      return ["requirements.txt", "pyproject.toml"];
    case "Rust":
      return ["Cargo.toml"];
    case "Go":
      return ["go.mod"];
    case "Dart":
      return ["pubspec.yaml"];
    case "Ruby":
      return ["Gemfile"];
    case "Kotlin":
    case "Java":
      return ["build.gradle.kts", "build.gradle"];
    case "Swift":
      return ["Package.swift"];
    case "PHP":
      return ["composer.json"];
    default:
      return [];
  }
}

export interface ParsedManifest {
  deps: string[];
  devDeps: string[];
}

/** Extraction tolérante des noms de dépendances. Ne lève jamais. */
export function parseManifest(file: string, text: string): ParsedManifest {
  const deps = new Set<string>();
  const devDeps = new Set<string>();
  const add = (s: string, dev = false) => {
    const n = s.trim().toLowerCase();
    if (n && n.length < 80) (dev ? devDeps : deps).add(n);
  };
  try {
    if (file === "package.json" || file === "composer.json") {
      const j = JSON.parse(text);
      for (const k of ["dependencies", "peerDependencies", "require"]) for (const d of Object.keys(j[k] ?? {})) add(d);
      for (const k of ["devDependencies", "require-dev"]) for (const d of Object.keys(j[k] ?? {})) add(d, true);
    } else if (file === "requirements.txt") {
      for (const line of text.split("\n")) {
        const m = line.trim().match(/^([A-Za-z0-9][A-Za-z0-9._-]*)/);
        if (m && !line.trim().startsWith("-")) add(m[1]);
      }
    } else if (file === "pyproject.toml") {
      for (const m of text.matchAll(/^\s*"([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(?:[<>=!~;].*)?",?\s*$/gm)) add(m[1]);
      const poetry = text.match(/\[tool\.poetry\.(?:dev-)?dependencies\]([\s\S]*?)(?:\n\[|$)/);
      if (poetry) for (const m of poetry[1].matchAll(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*=/gm)) if (m[1] !== "python") add(m[1]);
    } else if (file === "Cargo.toml") {
      for (const sec of text.matchAll(/\[((?:dev-|build-)?dependencies)\]([\s\S]*?)(?=\n\[|$)/g))
        for (const m of sec[2].matchAll(/^([A-Za-z0-9_-]+)\s*=/gm)) add(m[1], sec[1] !== "dependencies");
    } else if (file === "go.mod") {
      for (const m of text.matchAll(/^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]+\/[^\s]+)\s+v[\d.]/gim)) {
        add(m[1]);
        add(m[1].split("/").pop()!);
      }
    } else if (file === "pubspec.yaml") {
      add("flutter-app");
      const sec = text.match(/^dependencies:\s*\n([\s\S]*?)(?:\n\S|$)/m);
      if (sec) for (const m of sec[1].matchAll(/^ {2}([a-z0-9_]+):/gm)) add(m[1]);
    } else if (file === "Gemfile") {
      for (const m of text.matchAll(/^\s*gem\s+['"]([^'"]+)['"]/gm)) add(m[1]);
    } else if (file === "build.gradle" || file === "build.gradle.kts") {
      if (/com\.android\.(application|library)|android\s*\{/.test(text)) add("android");
      for (const m of text.matchAll(/["']([a-z0-9.-]+):([a-z0-9.-]+):[^"']+["']/gi)) add(m[2]);
    } else if (file === "Package.swift") {
      add("swift-package");
    }
  } catch {
    // manifeste illisible : ignoré
  }
  return { deps: [...deps], devDeps: [...devDeps] };
}

// --- README -------------------------------------------------------------------

/** Mots d'un README, hors blocs de code, balises HTML, URLs et badges. */
export function countReadmeWords(text: string): number {
  const clean = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\]\([^)]*\)/g, "] ")
    .replace(/https?:\/\/\S+/g, " ");
  return (clean.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
}

/** Décalage horaire d'un en-tête « Date: Mon, 13 Oct 2026 23:53:40 -0700 » (minutes). */
export function parsePatchOffset(text: string): number | null {
  const m = text.match(/^Date:\s.*?([+-])(\d{2})(\d{2})\s*$/m);
  if (!m) return null;
  const v = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "-" ? -v : v;
}
