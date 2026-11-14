// Sous une fiche sans pseudo GitHub (LinkedIn seule, CV), vue par un tiers : la
// personne fichée demande son retrait (server/src/removal.ts). Un lien discret,
// puis un champ email ; sans relais côté serveur, l'adresse de contact de la
// page Confidentialité.
import { useState } from "react";
import type { FormEvent } from "react";
import { CONTACT_EMAIL, pick, useT } from "../i18n";
import { api, ApiError } from "../lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type State = "closed" | "open" | "sending" | "invalid" | "sent" | "fallback";

export function RemovalRequest({ cardId }: { cardId: string }) {
  const { t, lang } = useT();
  const r = t.removal;
  const [state, setState] = useState<State>("closed");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
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
        <button type="button" className="link-quiet" onClick={() => setState("open")}>
          {r.link}
        </button>
      </p>
    );
  }
  if (state === "sent") {
    return (
      <p className="removal email-done" role="status">
        {r.done}
      </p>
    );
  }
  if (state === "fallback") {
    return (
      <p className="removal removal-note" role="status">
        {r.fallback}{" "}
        <a className="link-quiet" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Retrait ${cardId}`)}&body=${encodeURIComponent(`${window.location.origin}/c/${cardId}`)}`}>
          {CONTACT_EMAIL}
        </a>
      </p>
    );
  }
  const bad = state === "invalid" || !!error;
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
      />
      <button type="submit" className="pill pill-ghost" disabled={state === "sending"}>
        {state === "sending" ? r.sending : r.send}
      </button>
      {bad && (
        <p className="email-note is-error" role="alert">
          {state === "invalid" ? r.invalid : error}
        </p>
      )}
    </form>
  );
}
