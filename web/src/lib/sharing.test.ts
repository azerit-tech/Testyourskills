import { afterEach, describe, expect, it, vi } from "vitest";
import { inAppBrowser, shareSheet } from "./sharing";

const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9";

describe("navigateur intégré d'une appli (§18.27)", () => {
  it("reconnaît LinkedIn, Instagram et Facebook sur iPhone", () => {
    expect(inAppBrowser(`${IOS} Mobile/15E148 [LinkedInApp]/9.30.1234`)).toBe(true);
    expect(inAppBrowser(`${IOS} Mobile/15E148 Instagram 355.0.0.31.108 (iPhone16,1; iOS 18_1; fr_FR)`)).toBe(true);
    expect(inAppBrowser(`${IOS} Mobile/15E148 [FBAN/FBIOS;FBAV/485.0.0.31.108;FBBV/1]`)).toBe(true);
  });

  it("reconnaît une WebView Android, avec ou sans nom d'appli", () => {
    expect(inAppBrowser(`${ANDROID}; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 LinkedInApp`)).toBe(true);
    expect(inAppBrowser(`${ANDROID}; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36`)).toBe(true);
  });

  it("une WebView iOS sans nom : pas de « Safari/ »", () => {
    expect(inAppBrowser(`${IOS} Mobile/15E148`)).toBe(true);
  });

  it("laisse passer les vrais navigateurs", () => {
    expect(inAppBrowser(`${IOS} Version/18.1 Mobile/15E148 Safari/604.1`)).toBe(false);
    expect(inAppBrowser(`${IOS} CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1`)).toBe(false);
    expect(inAppBrowser(`${ANDROID}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36`)).toBe(false);
    expect(inAppBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15")).toBe(false);
    expect(inAppBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0")).toBe(false);
  });
});

describe("feuille de partage : l'image, sinon le texte et le lien, sinon le lien copié", () => {
  const file = new File(["png"], "testyourskills-leamd.png", { type: "image/png" });
  const data = { title: "Testyourskills", text: "Fiche ★★★★☆☆, 71. Fais la tienne :", url: "https://skills.test/c/AbCdEf1234?r=AbCdEf1234" };
  const named = (name: string) => Object.assign(new Error(name), { name });

  function nav(over: { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean; copy?: boolean }) {
    const writeText = vi.fn(async () => {
      if (over.copy === false) throw named("NotAllowedError");
    });
    const share = over.share ? vi.fn(over.share) : undefined;
    vi.stubGlobal("navigator", { ...(share ? { share } : {}), ...(over.canShare ? { canShare: over.canShare } : {}), clipboard: { writeText } });
    // Le repli de copyText (execCommand) n'a pas de document ici : il échoue proprement.
    return { share, writeText };
  }

  afterEach(() => vi.unstubAllGlobals());

  it("avec l'image quand le navigateur prend les fichiers", async () => {
    const { share, writeText } = nav({ share: async () => undefined, canShare: () => true });
    expect(await shareSheet({ ...data, file })).toBe("native_file");
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ files: [file], ...data });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("le premier appel part dans le geste, sans rien attendre", () => {
    const { share } = nav({ share: async () => undefined, canShare: () => true });
    void shareSheet({ ...data, file });
    expect(share).toHaveBeenCalledTimes(1);
  });

  it("sans fichier prêt, ou sans partage de fichier : le texte et le lien", async () => {
    const a = nav({ share: async () => undefined, canShare: () => true });
    expect(await shareSheet({ ...data, file: null })).toBe("native");
    expect(a.share).toHaveBeenCalledWith(data);
    const b = nav({ share: async () => undefined, canShare: () => false });
    expect(await shareSheet({ ...data, file })).toBe("native");
    expect(b.share).toHaveBeenCalledWith(data);
    const c = nav({ share: async () => undefined });
    expect(await shareSheet({ ...data, file })).toBe("native");
    expect(c.share).toHaveBeenCalledWith(data);
  });

  it("annulé : ni repli, ni copie", async () => {
    const { share, writeText } = nav({ share: async () => Promise.reject(named("AbortError")), canShare: () => true });
    expect(await shareSheet({ ...data, file })).toBeNull();
    expect(share).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("le fichier refusé : on retente sans lui", async () => {
    const { share } = nav({ share: async (d) => (d.files ? Promise.reject(named("NotAllowedError")) : undefined), canShare: () => true });
    expect(await shareSheet({ ...data, file })).toBe("native");
    expect(share).toHaveBeenCalledTimes(2);
  });

  it("pas de feuille de partage, ou elle refuse tout : le lien est copié", async () => {
    const a = nav({});
    expect(await shareSheet({ ...data, file })).toBe("copy");
    expect(a.writeText).toHaveBeenCalledWith(data.url);
    const b = nav({ share: async () => Promise.reject(named("NotAllowedError")), canShare: () => true });
    expect(await shareSheet({ ...data, file })).toBe("copy");
    expect(b.writeText).toHaveBeenCalledWith(data.url);
  });

  it("même la copie échoue : on le dit, le lien s'affichera", async () => {
    nav({ copy: false });
    expect(await shareSheet({ ...data, file })).toBe("copy_failed");
  });
});
