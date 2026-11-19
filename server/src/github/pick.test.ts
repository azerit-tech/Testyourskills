// Choix et téléchargement des fichiers à lire, avec un fetch factice : jamais d'appel réseau réel.

import { afterEach, describe, expect, it, vi } from "vitest";
import { facts, repo, tree } from "../scoring/__fixtures__/make";
import { NoFilesReadError, pickFilesForReading } from "./pick";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Un repo actif, deux fichiers source, aucun commit à inspecter : seuls les fichiers bruts sont demandés. */
function oneRepo(sourceFiles = [{ path: "src/index.ts", size: 2000 }, { path: "src/app.ts", size: 1500 }]) {
  return facts({ repos: [repo("a")], activeRepos: ["a"], trees: [tree("a", { sourceFiles })], commits: [] });
}

function stubRaw(answer: (url: string) => Response) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (!url.startsWith("https://raw.githubusercontent.com/")) throw new Error(`appel réseau inattendu : ${url}`);
    return answer(url);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("pickFilesForReading", () => {
  it("rend les fichiers téléchargés", async () => {
    stubRaw(() => new Response("export const x = 1;\n".repeat(40)));
    const out = await pickFilesForReading(oneRepo(), { token: "" });
    expect(out).toHaveLength(1);
    expect(out[0]!.files.map((f) => f.path).sort()).toEqual(["src/app.ts", "src/index.ts"]);
  });

  it("aucun fichier téléchargé alors qu'il y en avait à lire : lève, pour que la fiche sorte dégradée", async () => {
    const fetchMock = stubRaw(() => new Response("Too Many Requests", { status: 429 }));
    await expect(pickFilesForReading(oneRepo(), { token: "" })).rejects.toBeInstanceOf(NoFilesReadError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("une panne partielle ne lève pas : ce qui a été téléchargé est lu", async () => {
    stubRaw((url) => (url.endsWith("/src/app.ts") ? new Response("export const y = 2;\n".repeat(40)) : new Response("", { status: 500 })));
    const out = await pickFilesForReading(oneRepo(), { token: "" });
    expect(out[0]!.files.map((f) => f.path)).toEqual(["src/app.ts"]);
  });

  it("les fichiers de tous les repos se téléchargent ensemble, sans attendre le repo d'avant (SPEC §18.89)", async () => {
    const three = facts({
      repos: [repo("a"), repo("b"), repo("c")],
      activeRepos: ["a", "b", "c"],
      trees: ["a", "b", "c"].map((r) => tree(r, { sourceFiles: [{ path: "src/index.ts", size: 2000 }] })),
      commits: [],
    });
    // Aucune réponse tant que les trois téléchargements ne sont pas partis.
    const asked: string[] = [];
    let release!: () => void;
    const all = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        asked.push(String(input));
        if (asked.length === 3) release();
        await all;
        return new Response("export const x = 1;\n".repeat(40));
      }),
    );
    const out = await pickFilesForReading(three, { token: "" });
    expect(asked).toHaveLength(3);
    expect(out.map((r) => r.repo).sort()).toEqual(["a", "b", "c"]);
  });

  it("les faits donnés en avance par la collecte suffisent : même choix qu'avec les faits entiers", async () => {
    stubRaw(() => new Response("export const x = 1;\n".repeat(40)));
    const full = oneRepo();
    const { repos, activeRepos, trees, commits } = full;
    expect(await pickFilesForReading({ repos, activeRepos, trees, commits }, { token: "" })).toEqual(await pickFilesForReading(full, { token: "" }));
  });

  it("rien à lire (aucun fichier source) : liste vide, sans erreur ni téléchargement", async () => {
    const fetchMock = stubRaw(() => new Response("x"));
    expect(await pickFilesForReading(oneRepo([]), { token: "" })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
