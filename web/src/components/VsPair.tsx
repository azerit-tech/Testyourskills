// Le face-à-face reçu (§18.115) : /c/{X}?r={S}, la fiche X ouverte par le lien que S a envoyé
// (« Lui envoyer ma note », une dénonciation). Le premier écran montre les deux fiches côte à
// côte : celle de qui envoie à gauche, « VS », celle de la page à droite, et au-dessus le verdict
// en une ligne (« 79 contre 80 : 1 point d'avance pour @x »). Un toucher ouvre une fiche en grand.
// La fiche de qui envoie, masquée, supprimée, scellée ou introuvable : la page reste à une fiche.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fileOf } from "../../../shared/caseFile";
import type { CardData } from "../../../shared/types";
import { CardView } from "../card/CardView";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { vsSender } from "../lib/session";
import { verdict } from "../lib/versus";
import "./vs.css";

/** La fiche de qui a envoyé le lien : « loading » le temps de la lire, null s'il n'y a pas de face-à-face. */
export type VsSender = CardData | "loading" | null;

export function useVsSender(page: CardData): VsSender {
  const senderId = useMemo(() => vsSender(page.id), [page.id]);
  const [got, setGot] = useState<{ id: string; card: CardData | null } | null>(null);
  useEffect(() => {
    if (!senderId) return;
    let alive = true;
    const done = (card: CardData | null) => alive && setGot({ id: senderId, card });
    api
      .getJob(senderId)
      .then((job) => {
        if (job.state !== "done") return done(null);
        const card = job.kind === "card" ? job.card : fileOf(job.comparison);
        done(sameSide(card, page) || card.sealed ? null : card);
      })
      // Masquée (410), supprimée (404), réseau coupé : la page reste à une fiche.
      .catch(() => done(null));
    return () => {
      alive = false;
    };
  }, [senderId, page]);
  if (!senderId) return null;
  if (!got || got.id !== senderId) return "loading";
  return got.card;
}

/** La même fiche, ou la même personne : rien à mettre en face. */
function sameSide(a: CardData, b: CardData): boolean {
  if (a.id === b.id) return true;
  return !!a.login && !!b.login && a.login.toLowerCase() === b.login.toLowerCase();
}

const whoOf = (card: CardData) => (card.login ? `@${card.login}` : card.name);

/** Le verdict en une ligne, celui de l'aperçu du lien (§18.94) : les étoiles d'abord, les points à étoiles égales. */
export function vsLine(t: ReturnType<typeof useT>["t"], sender: CardData, page: CardData): string {
  if (page.sealed) return t.vs.sealed(whoOf(sender));
  const v = verdict(sender.overall, page.overall);
  if (v.by === "tie") return t.vs.line(sender.overall, page.overall, null, "");
  const gap = v.by === "stars" ? t.denounce.starsAhead(v.n) : t.denounce.pointsAhead(v.n);
  return t.vs.line(sender.overall, page.overall, gap, whoOf(v.ahead ? sender : page));
}

export function VsPair({ sender, card }: { sender: VsSender; card: CardData }) {
  const { t, lang } = useT();
  const [open, setOpen] = useState<CardData | null>(null);
  const ready = sender !== null && sender !== "loading";
  const side = (c: CardData | null, key: string) =>
    c ? (
      <button type="button" className="vs-card" onClick={() => setOpen(c)} aria-label={t.vs.open(whoOf(c))}>
        <CardView card={c} lang={lang} interactive={false} idPrefix={`vs-${key}`} />
      </button>
    ) : (
      <span className="vs-card vs-card-wait" aria-hidden="true" />
    );
  return (
    <section className="vs-stage" aria-label={t.vs.label}>
      {/* La ligne garde sa hauteur pendant la lecture : rien ne bouge quand elle arrive. */}
      <p className="vs-line">{ready ? vsLine(t, sender, card) : " "}</p>
      <div className="vs-pair">
        {side(ready ? sender : null, "l")}
        <span className="vs-disk" aria-hidden="true">
          VS
        </span>
        {side(card, "r")}
      </div>
      {open && <VsZoom card={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

/** Une fiche en grand, par-dessus la page : elle se retourne ; Échap, le fond ou « Fermer » la referment. */
function VsZoom({ card, onClose }: { card: CardData; onClose: () => void }) {
  const { t, lang } = useT();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    close.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      back?.focus?.({ preventScroll: true });
    };
  }, [onClose]);
  // Sur le corps de la page : au-dessus de tout, hors des plans de la fiche et des blocs.
  return createPortal(
    <div className="vs-zoom" role="dialog" aria-modal="true" aria-label={whoOf(card)} onClick={onClose}>
      <div className="vs-zoom-in" onClick={(e) => e.stopPropagation()}>
        <CardView card={card} lang={lang} flippable idPrefix="vs-zoom" />
        <button ref={close} type="button" className="link-alt vs-zoom-close" onClick={onClose}>
          {t.vs.close}
        </button>
      </div>
    </div>,
    document.body,
  );
}
