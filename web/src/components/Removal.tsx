// Sous une fiche sans pseudo GitHub (LinkedIn seule, CV), vue par un tiers : la
// personne fichée demande son retrait (server/src/removal.ts). Un lien d'appoint
// lisible, puis un champ email dont l'erreur reste collée au champ ; l'envoi
// réussi rend un accusé qui a une forme (coche, titre, phrase). Sans relais côté
// serveur, l'adresse de contact de la page Vie privée.
import { useState } from "react";
import type { FormEvent } from "react";
import { CONTACT_EMAIL, pick, useT } from "../i18n";
import { api, ApiError } from "../lib/api";
import { BusyDots } from "./Busy";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type State = "closed" | "open" | "sending" | "invalid" | "sent" | "fallback";

/** `short` : dans le bloc d'une fiche dénoncée, dont le titre a déjà dit qui l'a faite. */
export function RemovalRequest({ cardId, short = false }: { cardId: string; short?: boolean }) {
  const { t, lang } = useT();
  const r = t.removal;
  const [state, setState] = useState<State>("closed");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (state === "sending") return;
    if (!EMAIL_RE.test(email.trim())) return setState("invalid");
    setState("sending");
    setError(null);
    try {
      setState(await api.requestRemoval(cardId, email.trim()));
    } catch (err) {
      setError(err instanceof ApiError && err.fact ? pick(err.fact, lang) : t.errors.generic);
      setState("open");
    }
  };

  if (state === "closed") {
    return (
      <p className="removal">
        <button type="button" className="link-alt" onClick={() => setState("open")}>
          {short ? r.linkShort : r.link}
        </button>
      </p>
    );
  }
  if (state === "sent") {
    return (
      <div className="removal removal-done" role="status">
        <svg viewBox="0 0 20 20" aria-hidden focusable="false">
          <path d="M4 10.5l4 4 8-8.5" />
        </svg>
        <p>
          <strong>{t.pages.removal.doneTitle}</strong>
          <span>{t.pages.removal.doneText}</span>
        </p>
      </div>
    );
  }
  if (state === "fallback") {
    return (
      <p className="removal removal-note" role="status">
        {r.fallback}{" "}
        <a className="link-alt" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Retrait ${cardId}`)}&body=${encodeURIComponent(`${window.location.origin}/c/${cardId}`)}`}>
          {CONTACT_EMAIL}
        </a>
      </p>
    );
  }
  const bad = state === "invalid" || !!error;
  const sending = state === "sending";
  return (
    <form className="removal email-form" onSubmit={submit} noValidate>
      <label htmlFor="removal-email" className="removal-note">
        {r.label}
      </label>
      <input
        id="removal-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder={r.placeholder}
        value={email}
        onChange={(ev) => {
          setEmail(ev.target.value);
          if (bad) {
            setState("open");
            setError(null);
          }
        }}
        aria-invalid={state === "invalid"}
        aria-describedby={bad ? "removal-email-err" : undefined}
      />
      {/* l'erreur : juste sous le champ, avant le bouton */}
      {bad && (
        <p className="email-note is-error" id="removal-email-err" role="alert">
          {state === "invalid" ? r.invalid : error}
        </p>
      )}
      <button type="submit" className={`pill${sending ? " is-busy" : ""}`} aria-busy={sending}>
        {r.send}
        {sending && <BusyDots />}
      </button>
    </form>
  );
}
