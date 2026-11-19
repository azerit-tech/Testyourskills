// « Même photo ? » (SPEC §18.80) : la même image à deux tailles se reconnaît,
// deux portraits différents non. Les images sont dessinées ici, sans réseau.

import { renderAsync } from "@resvg/resvg-js";
import { describe, expect, it, vi } from "vitest";
import { photoMatcher } from "./linkedinLogin";
import { HASH_BITS, SAME_PHOTO_MAX_BITS, hashDistance, licdnImageId, photoHash, samePhotoHash } from "./photoHash";

/** Un « portrait » : un fond en dégradé, une tête, des épaules. `seed` en change la pose et la lumière. */
async function portrait(seed: number, size: number): Promise<Uint8Array> {
  const cx = 30 + ((seed * 17) % 40);
  const cy = 30 + ((seed * 11) % 25);
  const hue = (seed * 67) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    <defs><linearGradient id="g" x1="${seed % 2}" y1="0" x2="${(seed + 1) % 2}" y2="1"><stop offset="0" stop-color="hsl(${hue},40%,${20 + ((seed * 13) % 50)}%)"/><stop offset="1" stop-color="hsl(${hue + 90},50%,${75 - ((seed * 7) % 50)}%)"/></linearGradient></defs>
    <rect width="100" height="100" fill="url(#g)"/>
    <ellipse cx="${cx}" cy="${cy + 55}" rx="${28 + (seed % 9)}" ry="30" fill="hsl(${hue + 180},30%,${15 + ((seed * 5) % 30)}%)"/>
    <circle cx="${cx}" cy="${cy}" r="${14 + (seed % 7)}" fill="hsl(25,45%,${45 + ((seed * 3) % 35)}%)"/>
  </svg>`;
  return (await renderAsync(svg, { font: { loadSystemFonts: false } })).asPng();
}

describe("l'empreinte d'une photo", () => {
  it("la même photo en 100 px et en 400 px : presque les mêmes bits", async () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const [small, large] = await Promise.all([photoHash(await portrait(seed, 100), "png"), photoHash(await portrait(seed, 400), "png")]);
      expect(small).toHaveLength(HASH_BITS);
      expect(hashDistance(small!, large!)).toBeLessThanOrEqual(SAME_PHOTO_MAX_BITS);
      expect(samePhotoHash(small, large)).toBe(true);
    }
  });

  it("deux photos différentes, même cadrées pareil : au-delà du seuil", async () => {
    const hashes = await Promise.all([1, 2, 3, 4, 5, 6].map(async (s) => photoHash(await portrait(s, 200), "png")));
    for (let i = 0; i < hashes.length; i++) {
      for (let j = i + 1; j < hashes.length; j++) {
        expect(hashDistance(hashes[i]!, hashes[j]!)).toBeGreaterThan(SAME_PHOTO_MAX_BITS);
        expect(samePhotoHash(hashes[i]!, hashes[j]!)).toBe(false);
      }
    }
  });

  it("ce qui ne se décode pas, ou une image unie : pas d'empreinte, donc jamais « la même »", async () => {
    expect(await photoHash(new Uint8Array([1, 2, 3, 4]), "png")).toBeNull();
    expect(await photoHash(new Uint8Array(), "jpg")).toBeNull();
    expect(await photoHash(await portrait(1, 100), "webp")).toBeNull();
    const flat = (await renderAsync(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#345"/></svg>`)).asPng();
    expect(await photoHash(flat, "png")).toBeNull();
    expect(samePhotoHash(null, null)).toBe(false);
  });
});

describe("l'identifiant d'une photo LinkedIn", () => {
  it("le même à toutes les tailles, rien pour une autre adresse", () => {
    const small = "https://media.licdn.com/dms/image/v2/D4E03AQGabcdefghijk/profile-displayphoto-shrink_100_100/0/1700000000000?e=1&v=beta&t=aaa";
    const large = "https://media.licdn.com/dms/image/v2/D4E03AQGabcdefghijk/profile-displayphoto-shrink_800_800/0/1700000000000?e=2&v=beta&t=bbb";
    expect(licdnImageId(small)).toBe("D4E03AQGabcdefghijk");
    expect(licdnImageId(large)).toBe(licdnImageId(small));
    expect(licdnImageId("https://media.licdn.com/dms/image/D4E03AQGabcdefghijk/profile-displayphoto-shrink_100_100/0/1")).toBe("D4E03AQGabcdefghijk");
    expect(licdnImageId("https://evil.example/dms/image/v2/D4E03AQGabcdefghijk/x")).toBeNull();
    expect(licdnImageId("https://media.licdn.com/autre/chemin.jpg")).toBeNull();
    expect(licdnImageId(undefined)).toBeNull();
    expect(licdnImageId("pas une adresse")).toBeNull();
  });
});

describe("« même photo ? » entre deux adresses", () => {
  const A = "https://media.licdn.com/dms/image/v2/D4E03AQGaaaaaaaaaaa/profile-displayphoto-shrink_100_100/0/1";
  const A_BIG = "https://media.licdn.com/dms/image/v2/D4E03AQGaaaaaaaaaaa/profile-displayphoto-shrink_400_400/0/1";
  const B = "https://media.licdn.com/dms/image/v2/C5603AQGbbbbbbbbbbb/profile-displayphoto-shrink_400_400/0/2";
  const C = "https://media.licdn.com/dms/image/v2/C4D03AQGccccccccccc/profile-displayphoto-shrink_200_200/0/3";

  it("le même identifiant suffit, sans rien télécharger", async () => {
    const fetchImpl = vi.fn();
    expect(await photoMatcher(fetchImpl as unknown as typeof fetch)(A, A_BIG)).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("deux identifiants : les deux images sont comparées, chacune téléchargée une fois", async () => {
    const images: Record<string, Uint8Array> = { [A]: await portrait(1, 100), [B]: await portrait(1, 400), [C]: await portrait(2, 200) };
    const fetchImpl = vi.fn(async (url: string | URL | Request) => new Response(images[String(url)], { headers: { "content-type": "image/png" } }));
    const same = photoMatcher(fetchImpl as unknown as typeof fetch);
    expect(await same(A, B)).toBe(true);
    expect(await same(A, C)).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("une photo qui ne vient pas de LinkedIn, ou qui ne répond pas : jamais « la même »", async () => {
    const fetchImpl = vi.fn(async () => new Response("non", { status: 404 }));
    const same = photoMatcher(fetchImpl as unknown as typeof fetch);
    expect(await same(A, "https://evil.example/photo.png")).toBe(false);
    expect(await same(A, B)).toBe(false);
  });
});
