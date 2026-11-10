// Le partage côté navigateur (§18.27) : les images portrait et story préchargées en fichier,
// la feuille de partage du système, et ce qu'on sait du navigateur intégré.
import { useSyncExternalStore } from "react";
import { images, isMock } from "./api";
import { mockApi } from "./mock";
import { copyText } from "./util";

/**
 * Le navigateur intégré d'une appli (LinkedIn, Instagram, Facebook…). L'attribut
 * `download` y existe mais ne fait rien : on montre l'image, un appui long l'enregistre.
 */
export function inAppBrowser(ua: string): boolean {
  if (/LinkedInApp|FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|Line\/|Snapchat|TikTok|musical_ly|Pinterest|Twitter/i.test(ua)) return true;
  // WebView Android : « ; wv) ». WKWebView iOS : un iPhone sans « Safari/ » (Safari, Chrome et Firefox l'ont tous).
  if (/Android/i.test(ua)) return /; wv\)/.test(ua);
  return /iPhone|iPad|iPod/i.test(ua) && /AppleWebKit/i.test(ua) && !/Safari\//i.test(ua);
}

export const hasNativeShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

/* ---------- les images de partage, en fichier ---------- */

/** `portrait` : 4:5, pour les fils ; `story` : 9:16, pour Instagram et TikTok. */
export type ShareImage = "portrait" | "story";

const files = new Map<string, File>();
const loading = new Map<string, Promise<File | null>>();

async function fetchPng(src: string): Promise<Blob | null> {
  const res = await fetch(src, { headers: { Accept: "image/png" } });
  if (!res.ok) return null;
  const blob = await res.blob();
  // Un serveur de dev sans API répond la page d'accueil : ce n'est pas une image.
  return blob.type.startsWith("image/") ? blob : null;
}

/**
 * Charge une image de partage d'une fiche et la garde en `File` : au clic, `navigator.share`
 * part dans le geste, sans rien attendre. Une seule requête par fiche et par format ; un échec se retente.
 */
export function preloadImage(id: string, kind: ShareImage, filename: string): Promise<File | null> {
  const key = `${kind}:${id}`;
  const known = loading.get(key);
  if (known) return known;
  const p = (async () => {
    try {
      const blob = isMock() ? await mockApi.portrait(kind) : await fetchPng(images[kind](id));
      if (!blob) return null;
      const file = new File([blob], filename, { type: "image/png" });
      files.set(key, file);
      return file;
    } catch {
      return null;
    }
  })();
  loading.set(key, p);
  void p.then((f) => {
    if (!f) loading.delete(key);
  });
  return p;
}

/** L'image déjà chargée, ou null : jamais d'attente. */
export const imageFile = (id: string, kind: ShareImage): File | null => files.get(`${kind}:${id}`) ?? null;

export const preloadPortrait = (id: string, filename: string) => preloadImage(id, "portrait", filename);
export const portraitFile = (id: string): File | null => imageFile(id, "portrait");

export function canShareFile(file: File | null): file is File {
  try {
    return !!file && hasNativeShare() && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/* ---------- la feuille de partage ---------- */

/** Annulé par la personne, ou une feuille déjà ouverte : ni repli ni mesure. */
const dismissed = (e: unknown) => {
  const name = (e as { name?: string } | null)?.name;
  return name === "AbortError" || name === "InvalidStateError";
};

/** Par où c'est parti ; `copy_failed` : le lien n'a même pas pu être copié ; null : annulé. */
export type SheetResult = "native_file" | "native" | "copy" | "copy_failed" | null;

/**
 * Ouvre la feuille de partage : l'image en fichier si le navigateur la prend, sinon
 * le texte et le lien, sinon le lien dans le presse-papier. À appeler dans le geste :
 * rien n'attend avant le premier `navigator.share`.
 */
export async function shareSheet(data: { title: string; text: string; url: string; file: File | null }): Promise<SheetResult> {
  const { title, text, url, file } = data;
  if (hasNativeShare()) {
    if (canShareFile(file)) {
      try {
        await navigator.share({ files: [file], title, text, url });
        return "native_file";
      } catch (e) {
        if (dismissed(e)) return null;
      }
    }
    try {
      await navigator.share({ title, text, url });
      return "native";
    } catch (e) {
      if (dismissed(e)) return null;
    }
  }
  return (await copyText(url)) ? "copy" : "copy_failed";
}

/** L'image seule dans la feuille de partage : « Enregistrer l'image » y est. */
export async function shareFile(file: File): Promise<boolean> {
  try {
    await navigator.share({ files: [file] });
    return true;
  } catch {
    return false;
  }
}

/* ---------- « texte copié », retenu par fiche ---------- */

// Le bloc sous la fiche et la barre du pouce montrent le même état, et il tient
// tant que la page vit : on le lit au retour de l'onglet LinkedIn.
const copied = new Set<string>();
const listeners = new Set<() => void>();

export function markTextCopied(id: string): void {
  if (copied.has(id)) return;
  copied.add(id);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useTextCopied(id: string): boolean {
  const read = () => copied.has(id);
  return useSyncExternalStore(subscribe, read, read);
}
