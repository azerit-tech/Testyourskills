// Le film et le réseau (docs/cinematique-poursuite.md §5.3, §5.4).
import { afterEach, describe, expect, it, vi } from "vitest";
import { FILE_CEILINGS } from "../../../shared/film/budget";
import { ECO_BELOW_BPS, endingToLoad, filmAssetUrl, initialVariant, PROBE_BYTES, probeVerdict, RateMeter, READY_WAIT_MS, readyVerdict, STALL_MS, VisibleClock } from "./net";

describe("les adresses du film", () => {
  it("sans base : l'adresse à empreinte donnée par Vite", () => {
    expect(filmAssetUrl("", "/assets/poursuite-720-AbC123.mp4")).toBe("/assets/poursuite-720-AbC123.mp4");
    expect(filmAssetUrl("  ", "/assets/fin-540-x.mp4")).toBe("/assets/fin-540-x.mp4");
  });

  it("avec une base : le même nom à empreinte sous l'autre hôte, barre finale ou non", () => {
    expect(filmAssetUrl("https://media.example.net/film/", "/assets/fin6-720-Zz9.mp4")).toBe("https://media.example.net/film/fin6-720-Zz9.mp4");
    expect(filmAssetUrl("https://media.example.net/film", "/assets/fin6-720-Zz9.mp4")).toBe("https://media.example.net/film/fin6-720-Zz9.mp4");
  });
});

describe("le choix de la variante", () => {
  it("économiseur de données : éco d'emblée, flux ou non", () => {
    expect(initialVariant({ saveData: true, canStream: true })).toBe("540");
    expect(initialVariant({ saveData: true, canStream: false, effectiveType: "4g" })).toBe("540");
  });

  it("avec le flux : la haute au départ, quoi qu'annonce la connexion (la mesure tranche)", () => {
    expect(initialVariant({ saveData: false, canStream: true })).toBe("720");
    expect(initialVariant({ saveData: false, canStream: true, effectiveType: "3g" })).toBe("720");
  });

  it("sans flux : le repli sur la connexion annoncée", () => {
    expect(initialVariant({ saveData: false, canStream: false, effectiveType: "3g" })).toBe("540");
    expect(initialVariant({ saveData: false, canStream: false, effectiveType: "4g" })).toBe("720");
    expect(initialVariant({ saveData: false, canStream: false })).toBe("720");
  });

  it("la mesure attend ses 350 Ko, puis tranche à 5 Mbit/s", () => {
    expect(ECO_BELOW_BPS).toBe(5_000_000);
    expect(PROBE_BYTES).toBeGreaterThanOrEqual(300_000);
    expect(PROBE_BYTES).toBeLessThanOrEqual(400_000);
    expect(probeVerdict(200_000, 100, false)).toBe("pending");
    // 350 Ko en 1 s : 2,8 Mbit/s
    expect(probeVerdict(350_000, 1000, false)).toBe("eco");
    // 350 Ko en 400 ms : 7 Mbit/s
    expect(probeVerdict(350_000, 400, false)).toBe("keep");
    // pile au seuil : la haute reste
    expect(probeVerdict(350_000, 560, false)).toBe("keep");
  });

  it("un fichier fini trop court ne dit rien : la haute reste ; assez long, il tranche", () => {
    expect(probeVerdict(100_000, 5000, true)).toBe("keep");
    expect(probeVerdict(320_000, 1000, true)).toBe("eco");
  });
});

describe("la fin à charger (six étoiles)", () => {
  it("niveau inconnu : la fin la plus probable ; niveau connu : la seule fin utile, l'autre abandonnée", () => {
    expect(endingToLoad()).toEqual({ load: "fin", drop: null });
    expect(endingToLoad(6)).toEqual({ load: "fin6", drop: "fin" });
    for (const l of [1, 2, 3, 4, 5]) expect(endingToLoad(l)).toEqual({ load: "fin", drop: "fin6" });
  });
});

describe("le compteur de débit", () => {
  it("compte les octets sur le temps de téléchargement seul", () => {
    const m = new RateMeter();
    expect(m.bps(0)).toBeNull();
    m.begin(0);
    m.add(500_000, 500);
    m.end(1000);
    // 4 Mbit en 1 s
    expect(m.bps(1000)).toBe(4_000_000);
    // le temps sans téléchargement ne compte pas
    expect(m.bps(60_000)).toBe(4_000_000);
    m.begin(60_000);
    m.add(500_000, 61_000);
    expect(m.bps(61_000)).toBe(4_000_000);
  });

  it("un téléchargement qui ne reçoit plus rien : débit nul", () => {
    const m = new RateMeter();
    m.begin(0);
    m.add(400_000, 300);
    expect(m.bps(300 + STALL_MS - 1)).toBeGreaterThan(0);
    expect(m.bps(300 + STALL_MS)).toBe(0);
  });
});

/** Une réponse lue en flux : `chunks` morceaux de `size` octets, un toutes les `every` ms. */
function slowResponse(chunks: number, size: number, every: number): Response {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(c) {
      if (i >= chunks) return c.close();
      if (every) await new Promise((r) => setTimeout(r, every));
      i++;
      c.enqueue(new Uint8Array(size));
    },
  });
  return new Response(body, { headers: { "content-type": "video/mp4", "content-length": String(chunks * size) } });
}

describe("le délai d'abandon, fiche prête", () => {
  const MBIT = 1_000_000;

  it("le reste arrive à temps : on attend", () => {
    // 1 Mo à 10 Mbit/s : 0,8 s, 1,4 s avec la marge et le décodage
    expect(readyVerdict({ visibleMs: 0, remainingBytes: 1_000_000, bps: 10 * MBIT })).toBe("wait");
    expect(readyVerdict({ visibleMs: 2500, remainingBytes: 1_000_000, bps: 10 * MBIT })).toBe("wait");
  });

  it("le reste ne peut pas arriver : la fiche se pose tout de suite, sans attendre 4 s pour rien", () => {
    // 3 Mo à 2 Mbit/s : 12 s
    expect(readyVerdict({ visibleMs: 0, remainingBytes: 3_000_000, bps: 2 * MBIT })).toBe("give-up");
    expect(readyVerdict({ visibleMs: 3000, remainingBytes: 1_000_000, bps: 10 * MBIT })).toBe("give-up");
  });

  it("réseau coupé (débit nul) : tout de suite ; sans mesure : à l'aveugle jusqu'au délai", () => {
    expect(readyVerdict({ visibleMs: 100, remainingBytes: 500_000, bps: 0 })).toBe("give-up");
    expect(readyVerdict({ visibleMs: 100, remainingBytes: 500_000, bps: null })).toBe("wait");
    expect(readyVerdict({ visibleMs: READY_WAIT_MS - 1, remainingBytes: 500_000, bps: null })).toBe("wait");
    expect(readyVerdict({ visibleMs: READY_WAIT_MS, remainingBytes: 500_000, bps: null })).toBe("give-up");
  });

  it("tout est chargé : on attend le décodage, jusqu'au délai", () => {
    expect(readyVerdict({ visibleMs: 3900, remainingBytes: 0, bps: 0 })).toBe("wait");
    expect(readyVerdict({ visibleMs: READY_WAIT_MS, remainingBytes: 0, bps: 10 * MBIT })).toBe("give-up");
  });

  it("le délai ne compte que le temps d'onglet visible", () => {
    const c = new VisibleClock(0, true);
    expect(c.at(1000, false)).toBe(1000);
    // dix secondes onglet caché : rien ne compte
    expect(c.at(11_000, true)).toBe(1000);
    expect(c.at(12_500, true)).toBe(2500);
    const hidden = new VisibleClock(0, false);
    expect(hidden.at(60_000, true)).toBe(0);
    expect(hidden.at(60_400, true)).toBe(400);
  });
});

describe("le chargement en flux (loader.ts)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("débit sous le seuil : la haute est abandonnée en cours de fichier, tout est repris en éco", async () => {
    const asked: string[] = [];
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      // la haute : 50 Ko toutes les 100 ms (4 Mbit/s) ; l'éco : tout de suite
      return /-720/.test(url) ? slowResponse(20, 50_000, 100) : slowResponse(4, 50_000, 0);
    });
    const { loadFilmFiles, filmVariant } = await import("./loader");
    const r = await loadFilmFiles(["poursuite", "fin"]);
    expect(r.quality).toBe("540");
    expect(filmVariant()).toBe("540");
    expect(asked.map((u) => u.replace(/^.*\/(\w+-\d+).*$/, "$1"))).toEqual(["poursuite-720", "poursuite-540", "fin-540"]);
    expect(r.urls.every((u) => u.startsWith("blob:"))).toBe(true);
  });

  it("débit au-dessus : la haute reste pour tous les fichiers", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("fetch", async () => slowResponse(8, 50_000, 0));
    const { loadFilmFiles } = await import("./loader");
    const r = await loadFilmFiles(["poursuite", "fin6"]);
    expect(r.quality).toBe("720");
  });

  it("économiseur de données : rien n'est demandé en haute", async () => {
    const asked: string[] = [];
    vi.stubGlobal("navigator", { connection: { saveData: true } });
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      return slowResponse(2, 1000, 0);
    });
    const { loadFilmFiles } = await import("./loader");
    expect((await loadFilmFiles(["poursuite", "fin"])).quality).toBe("540");
    expect(asked.some((u) => /-720/.test(u))).toBe(false);
  });

  it("une page HTML servie à la place n'est pas un film", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("fetch", async () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }));
    const { loadFilmFiles } = await import("./loader");
    await expect(loadFilmFiles(["poursuite"])).rejects.toThrow(/film/);
  });

  it("six étoiles connues pendant le chargement de `fin` : elle est abandonnée, `fin6` se charge dans la même variante", async () => {
    const asked: string[] = [];
    const aborted: string[] = [];
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", { createElement: () => ({ canPlayType: () => "probably" }) });
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const name = url.replace(/^.*\/(\w+-\d+).*$/, "$1");
      asked.push(name);
      init.signal?.addEventListener("abort", () => aborted.push(name));
      // la poursuite vite (la haute reste), la fin lentement
      return name.startsWith("fin-") ? slowResponse(40, 50_000, 50) : slowResponse(8, 50_000, 0);
    });
    const { loadFilmFiles, preloadFilm } = await import("./loader");
    preloadFilm();
    await new Promise((r) => setTimeout(r, 120));
    preloadFilm(6);
    const r = await loadFilmFiles(["poursuite", "fin6"]);
    expect(r.quality).toBe("720");
    expect(asked).toEqual(["poursuite-720", "fin-720", "fin6-720"]);
    expect(aborted).toEqual(["fin-720"]);
  });

  it("ce qui reste à charger : la taille annoncée moins le reçu, sinon le plafond du fichier", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("fetch", async () => slowResponse(8, 50_000, 0));
    const { loadFilmFiles, filmRemaining } = await import("./loader");
    expect(filmRemaining(["poursuite", "fin"])).toBe(FILE_CEILINGS["720"].poursuite + FILE_CEILINGS["720"].fin);
    await loadFilmFiles(["poursuite"]);
    expect(filmRemaining(["poursuite", "fin"])).toBe(FILE_CEILINGS["720"].fin);
    expect(filmRemaining(["poursuite"])).toBe(0);
  });
});
