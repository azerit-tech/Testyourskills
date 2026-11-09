// L'avatar par défaut de GitHub (l'identicon, damier de pixels, ou la silhouette
// d'un compte supprimé) casse l'effet de la photo d'identité : la fiche montre
// alors les initiales devant la toise, comme sans avatar.
//
// Une seule requête, sur l'adresse de l'avatar elle-même (avatars.githubusercontent.com,
// hors de l'API limitée), 2 s au plus. Critère, relevé le 9 novembre 2026 sur une
// vingtaine de comptes : les avatars par défaut sont des PNG 420 × 420 de 3 à 5 Ko
// (identicons 3,2 à 3,4 Ko, silhouette 5,1 Ko) ; une photo envoyée est un JPEG, ou
// un PNG bien plus lourd (20 Ko et plus, souvent des centaines). D'où :
//   PNG (type annoncé ET signature) ET 8 Ko au plus  →  avatar par défaut.
// Le moindre doute (échec réseau, délai, statut, type, poids inconnu) garde l'avatar.

const TIMEOUT_MS = 2000;
/** Au-delà, ce n'est plus un avatar par défaut. */
export const DEFAULT_AVATAR_MAX_BYTES = 8 * 1024;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

function isGithubAvatarHost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "avatars.githubusercontent.com";
  } catch {
    return false;
  }
}

/** true seulement si l'avatar est sûrement celui que GitHub met par défaut. */
export async function isDefaultGithubAvatar(url: string | null | undefined, opts: { fetch?: FetchLike; signal?: AbortSignal } = {}): Promise<boolean> {
  if (!url || !isGithubAvatarHost(url)) return false;
  const doFetch = opts.fetch ?? fetch;
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  try {
    const res = await doFetch(url, { signal, redirect: "follow" });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!res.ok || type !== "image/png") {
      await res.body?.cancel().catch(() => {});
      return false;
    }
    const announced = Number(res.headers.get("content-length"));
    if (Number.isFinite(announced) && announced > DEFAULT_AVATAR_MAX_BYTES) {
      await res.body?.cancel().catch(() => {});
      return false;
    }
    // Lecture bornée : on s'arrête dès qu'on dépasse le seuil.
    const reader = res.body?.getReader();
    if (!reader) return false;
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > DEFAULT_AVATAR_MAX_BYTES) {
        await reader.cancel().catch(() => {});
        return false;
      }
      chunks.push(value);
    }
    if (total === 0) return false;
    const head = Buffer.concat(chunks).subarray(0, 8);
    return PNG_MAGIC.every((b, i) => head[i] === b);
  } catch {
    return false;
  }
}
