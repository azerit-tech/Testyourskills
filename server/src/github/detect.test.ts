import { describe, expect, it } from "vitest";
import { isLazyCommit, isTutorialRepo } from "../scoring/derive";
import { analyzeTree, countReadmeWords, isAgentFile, isSourceCandidate, isStrictTsconfig, parseLogin, parseManifest, parsePatchOffset } from "./detect";
import { EngineError, lastPageOf } from "./http";
import { truncateTo } from "./pick";

describe("parseLogin", () => {
  it("accepte pseudo, @pseudo, URL", () => {
    expect(parseLogin("sindresorhus")).toBe("sindresorhus");
    expect(parseLogin(" @tj ")).toBe("tj");
    expect(parseLogin("https://github.com/gaearon/")).toBe("gaearon");
    expect(parseLogin("github.com/torvalds/linux")).toBe("torvalds");
    expect(parseLogin("http://www.github.com/kevin-dev42?tab=repositories")).toBe("kevin-dev42");
  });
  it("refuse l'invalide", () => {
    expect(parseLogin("")).toBeNull();
    expect(parseLogin("-abc")).toBeNull();
    expect(parseLogin("a--b")).toBeNull();
    expect(parseLogin("x".repeat(40))).toBeNull();
    expect(parseLogin("foo bar")).toBeNull();
  });
});

describe("arborescence", () => {
  const blob = (path: string, size = 2000) => ({ path, type: "blob" as const, size });
  it("détecte tests, CI, outillage, node_modules, marqueurs", () => {
    const t = analyzeTree(
      "r",
      [
        blob("src/index.ts"),
        blob("src/__tests__/index.test.ts"),
        blob(".github/workflows/ci.yml"),
        blob(".eslintrc.json"),
        blob("node_modules/lodash/index.js"),
        blob("Dockerfile"),
        blob("infra/main.tf"),
        blob("dist/bundle.min.js"),
        blob("package-lock.json", 90_000),
      ],
      { truncated: false, tsconfig: '{ "compilerOptions": { "strict": true } }', devDeps: ["prettier"] },
    );
    expect(t.hasTests).toBe(true);
    expect(t.hasCi).toBe(true);
    expect(t.tooling).toEqual(["eslint", "prettier", "tsconfig-strict"]);
    expect(t.nodeModules).toBe(true);
    expect(t.markers).toEqual(["dockerfile", "terraform"]);
    expect(t.sourceFiles.map((f) => f.path)).toEqual(["src/__tests__/index.test.ts", "src/index.ts"]);
  });
  it("sans rien", () => {
    const t = analyzeTree("r", [blob("README.md"), blob("main.py")], { truncated: false });
    expect(t.hasTests || t.hasCi || t.nodeModules).toBe(false);
    expect(t.tooling).toEqual([]);
  });
  it("tests Go, Python, Rust", () => {
    expect(analyzeTree("r", [blob("pkg/x_test.go")], { truncated: false }).hasTests).toBe(true);
    expect(analyzeTree("r", [blob("app/test_api.py")], { truncated: false }).hasTests).toBe(true);
    expect(analyzeTree("r", [blob("tests/integration.rs")], { truncated: false }).hasTests).toBe(true);
  });
  it("candidats source : hors générés, vendored, minifiés, lockfiles", () => {
    expect(isSourceCandidate("src/app.ts", 3000)).toBe(true);
    expect(isSourceCandidate("vendor/lib.go", 3000)).toBe(false);
    expect(isSourceCandidate("static/app.min.js", 3000)).toBe(false);
    expect(isSourceCandidate("api/types.d.ts", 3000)).toBe(false);
    expect(isSourceCandidate("proto/x.pb.go", 3000)).toBe(false);
    expect(isSourceCandidate("README.md", 3000)).toBe(false);
    expect(isSourceCandidate("src/huge.ts", 500_000)).toBe(false);
  });
  it("fichiers d'agent d'IA : chemins triés, hors node_modules et vendor, dossiers vus en surface", () => {
    const t = analyzeTree(
      "r",
      [
        blob("src/index.ts"),
        blob("CLAUDE.md"),
        blob("packages/api/AGENTS.md"),
        blob(".cursor/rules/style.mdc"),
        blob(".github/copilot-instructions.md"),
        blob(".github/instructions/tests.instructions.md"),
        blob(".windsurfrules"),
        blob(".clinerules"),
        blob("node_modules/x/CLAUDE.md"),
        blob("vendor/lib/AGENTS.md"),
        blob("docs/claude.md"), // pas le nom exact
        blob("README.md"),
        { path: ".claude", type: "tree" as const },
      ],
      { truncated: true },
    );
    expect(t.agentFiles).toEqual([
      ".claude/",
      ".clinerules",
      ".cursor/rules/style.mdc",
      ".github/copilot-instructions.md",
      ".github/instructions/tests.instructions.md",
      ".windsurfrules",
      "CLAUDE.md",
      "packages/api/AGENTS.md",
    ]);
    expect(analyzeTree("r", [blob("README.md"), blob("main.py")], { truncated: false }).agentFiles).toEqual([]);
    for (const p of ["GEMINI.md", ".claude/commands/review.md", ".aider.conf.yml", ".roomodes", ".kiro/steering/product.md", "AGENTS.override.md", "CLAUDE.local.md"])
      expect(isAgentFile(p), p).toBe(true);
    for (const p of ["agents.md.bak", "src/CLAUDE.ts", ".github/workflows/ci.yml", "notes/AGENTS.txt"]) expect(isAgentFile(p), p).toBe(false);
  });
  it("tsconfig strict", () => {
    expect(isStrictTsconfig('{"compilerOptions":{"strict": true}}')).toBe(true);
    expect(isStrictTsconfig('{"extends": "@sindresorhus/tsconfig"}')).toBe(true);
    expect(isStrictTsconfig('{"compilerOptions":{"strict": false}}')).toBe(false);
  });
});

describe("manifestes", () => {
  it("package.json, requirements, Cargo, go.mod, pyproject", () => {
    expect(parseManifest("package.json", '{"dependencies":{"React":"^19"},"devDependencies":{"vite":"6"}}')).toEqual({ deps: ["react"], devDeps: ["vite"] });
    expect(parseManifest("requirements.txt", "pandas==2.1\n# commentaire\nnumpy>=1\n-r base.txt\n").deps).toEqual(["pandas", "numpy"]);
    expect(parseManifest("Cargo.toml", '[package]\nname="x"\n[dependencies]\ntokio = "1"\naxum = { version = "0.7" }\n[dev-dependencies]\ninsta = "1"\n')).toEqual({
      deps: ["tokio", "axum"],
      devDeps: ["insta"],
    });
    expect(parseManifest("go.mod", "module x\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.0\n)\n").deps).toContain("gin");
    expect(parseManifest("pyproject.toml", '[project]\ndependencies = [\n  "fastapi>=0.1",\n  "torch",\n]\n').deps).toEqual(["fastapi", "torch"]);
    expect(parseManifest("package.json", "pas du json")).toEqual({ deps: [], devDeps: [] });
  });
});

describe("divers", () => {
  it("mots de README, hors code et liens", () => {
    expect(countReadmeWords("# Titre\n\nUn outil simple.\n\n```js\nconst a = 1;\n```\n[![badge](https://x/y.svg)](https://x)")).toBe(4);
    expect(countReadmeWords("")).toBe(0);
  });
  it("décalage horaire d'un patch", () => {
    expect(parsePatchOffset("From abc\nFrom: Linus <l@x>\nDate: Mon, 13 Oct 2026 23:53:40 -0700\nSubject: x")).toBe(-420);
    expect(parsePatchOffset("Date: Tue, 1 Jan 2030 10:00:00 +0530\n")).toBe(330);
    expect(parsePatchOffset("rien")).toBeNull();
  });
  it("pagination Link", () => {
    expect(lastPageOf('<https://api.github.com/x?per_page=1&page=2>; rel="next", <https://api.github.com/x?per_page=1&page=1485159>; rel="last"')).toBe(1485159);
    expect(lastPageOf(null)).toBeNull();
  });
  it("commits paresseux et repos tutoriels (§4.2)", () => {
    for (const m of ["fix", "wip", "Update", "final 2!", "test 2", "stuff", "minor.", "asdf", "typo", "  ok  "]) expect(isLazyCommit(m), m).toBe(true);
    for (const m of ["Fix race in scheduler", "Add retry to HTTP client", "update dependencies to v2"]) expect(isLazyCommit(m), m).toBe(false);
    expect(isTutorialRepo({ name: "my-todo-app", commitCount: 3 })).toBe(true);
    expect(isTutorialRepo({ name: "portfolio-v2", commitCount: 1 })).toBe(true);
    expect(isTutorialRepo({ name: "portfolio-v2", commitCount: 12 })).toBe(false);
    expect(isTutorialRepo({ name: "kernel", commitCount: 1 })).toBe(false);
    expect(isTutorialRepo({ name: "learn-rust", commitCount: null })).toBe(false);
  });
  it("troncature à 40 Ko sur fin de ligne", () => {
    const text = Array.from({ length: 2000 }, (_, i) => `const line${i} = ${i};`).join("\n");
    const out = truncateTo(text, 1000);
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(1000);
    expect(out.endsWith("/* … tronqué */\n")).toBe(true);
    expect(truncateTo("court", 1000)).toBe("court");
  });
  it("EngineError porte un code", () => {
    const e = new EngineError("organization", "vercel");
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("organization");
  });
});
