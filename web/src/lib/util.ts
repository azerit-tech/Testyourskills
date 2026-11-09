// Petits utilitaires du front : saisie, PDF, mouvement réduit, partage.
import { useEffect, useState } from "react";

const LOGIN_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

/** « @pseudo », « github.com/pseudo », « https://github.com/pseudo/repo » → « pseudo ». */
export function parseLogin(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/^@/, "");
  const m = /(?:^|\/\/|\.)github\.com\/([^/?#\s]+)/i.exec(s) ?? /^github\.com\/([^/?#\s]+)/i.exec(s);
  if (m) s = m[1];
  s = s.replace(/\/+$/, "");
  return LOGIN_RE.test(s) ? s : null;
}

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_PAGES = 10;

export type PdfCheck = { ok: true } | { ok: false; reason: "not_pdf" } | { ok: false; reason: "too_large"; mb: string } | { ok: false; reason: "too_many_pages"; pages: number };

/** Contrôle côté client : type, taille, et un comptage approximatif des pages. */
export async function checkPdf(file: File): Promise<PdfCheck> {
  const looksPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!looksPdf) return { ok: false, reason: "not_pdf" };
  if (file.size > MAX_PDF_BYTES) return { ok: false, reason: "too_large", mb: (file.size / 1024 / 1024).toFixed(1) };
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const head = String.fromCharCode(...buf.subarray(0, 5));
    if (head !== "%PDF-") return { ok: false, reason: "not_pdf" };
    // Décodage latin1 pour compter les objets /Type /Page (hors /Pages).
    const text = new TextDecoder("latin1").decode(buf);
    const pages = (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
    if (pages > MAX_PDF_PAGES) return { ok: false, reason: "too_many_pages", pages };
  } catch {
    /* lecture impossible : le serveur tranchera */
  }
  return { ok: true };
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => (typeof window !== "undefined" ? window.matchMedia(q).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

/**
 * Lien partagé d'une fiche : il porte son origine (?r=) pour compter les fiches
 * nées d'un partage (§18.0). La page /c/:id garde son og:url sans r.
 */
export function shareUrl(id: string): string {
  return `${window.location.origin}/c/${id}?r=${encodeURIComponent(id)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Repli pour les navigateurs sans clipboard API.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export const isTouch = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
