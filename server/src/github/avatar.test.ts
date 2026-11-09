// Détection de l'avatar par défaut de GitHub, sur des réponses simulées.
import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR_MAX_BYTES, isDefaultGithubAvatar, type FetchLike } from "./avatar";

const URL_OK = "https://avatars.githubusercontent.com/u/100000001?v=4";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function png(bytes: number): Uint8Array {
  const b = new Uint8Array(bytes);
  b.set(PNG);
  return b;
}

function reply(body: Uint8Array, type: string, o: { status?: number; length?: boolean } = {}): FetchLike {
  return async () =>
    new Response(body, {
      status: o.status ?? 200,
      headers: { "content-type": type, ...(o.length === false ? {} : { "content-length": String(body.byteLength) }) },
    });
}

describe("avatar par défaut de GitHub", () => {
  it("reconnaît un identicon : PNG de quelques kilo-octets", async () => {
    expect(await isDefaultGithubAvatar(URL_OK, { fetch: reply(png(3219), "image/png") })).toBe(true);
    // la silhouette d'un compte supprimé, 5 Ko, aussi
    expect(await isDefaultGithubAvatar(URL_OK, { fetch: reply(png(5065), "image/png") })).toBe(true);
    // sans longueur annoncée, la lecture bornée décide
    expect(await isDefaultGithubAvatar(URL_OK, { fetch: reply(png(3300), "image/png", { length: false }) })).toBe(true);
  });

  it("garde une photo : JPEG, ou PNG lourd", async () => {
    expect(await isDefaultGithubAvatar(URL_OK, { fetch: reply(new Uint8Array(3000), "image/jpeg") })).toBe(false);
    expect(await isDefaultGithubAvatar(URL_OK, { fetch: reply(png(27_761), "image/png") })).toBe(false);
    expect(await isDefaultGithubAvatar(URL_OK, { fetch: reply(png(DEFAULT_AVATAR_MAX_BYTES + 1), "image/png", { length: false }) })).toBe(false);
  });

  it("en cas de doute, garde l'avatar", async () => {
    // type annoncé PNG mais pas la signature
    expect(await isDefaultGithubAvatar(URL_OK, { fetch: reply(new Uint8Array(3000), "image/png") })).toBe(false);
    // erreur HTTP, corps vide, réseau en panne
    expect(await isDefaultGithubAvatar(URL_OK, { fetch: reply(png(3219), "image/png", { status: 404 }) })).toBe(false);
    expect(await isDefaultGithubAvatar(URL_OK, { fetch: reply(new Uint8Array(0), "image/png") })).toBe(false);
    expect(await isDefaultGithubAvatar(URL_OK, { fetch: async () => Promise.reject(new Error("ECONNRESET")) })).toBe(false);
    // délai dépassé : la requête est coupée à 2 s
    const hang: FetchLike = (_u, init) =>
      new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    const t0 = Date.now();
    expect(await isDefaultGithubAvatar(URL_OK, { fetch: hang })).toBe(false);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it("ne regarde que les avatars servis par GitHub", async () => {
    let called = false;
    const spy: FetchLike = async () => {
      called = true;
      return new Response(png(3000), { headers: { "content-type": "image/png" } });
    };
    expect(await isDefaultGithubAvatar("https://example.com/a.png", { fetch: spy })).toBe(false);
    expect(await isDefaultGithubAvatar("", { fetch: spy })).toBe(false);
    expect(await isDefaultGithubAvatar(undefined, { fetch: spy })).toBe(false);
    expect(called).toBe(false);
  });
});
