// « Ajoute ton GitHub pour prouver » (§18.24) : sous une fiche LinkedIn seule,
// un pseudo GitHub relance la fiche en comparaison LinkedIn contre GitHub. Le
// profil LinkedIn est déjà en cache côté serveur : seul GitHub est lu en plus.
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { pick, useT } from "../i18n";
import { api, tokens } from "../lib/api";
import { errorFact } from "../lib/errors";
import { navigate } from "../lib/router";
import { unlockAudio } from "../lib/audio";
import { markFresh, rememberInput } from "../lib/session";
import { parseLogin } from "../lib/util";

export function ProveGithub({ linkedinUrl }: { linkedinUrl: string }) {
  const { t, lang } = useT();
  const p = t.result.prove;
  const uid = useId().replace(/:/g, "");
  const [login, setLogin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const gh = parseLogin(login);
    if (!gh) {
      setError(login.trim() ? t.home.errLogin : t.home.errEmptyLogin);
      return;
    }
    unlockAudio();
    setBusy(true);
    setError(null);
    try {
      const res = await api.createCard({ login: gh, linkedin: linkedinUrl, lang });
      if (res.deleteToken) tokens.set(res.id, res.deleteToken);
      rememberInput({ login: gh, file: null });
      markFresh(res.id);
      navigate(`/c/${res.id}`);
    } catch (err) {
      setBusy(false);
      const msg = errorFact(err, t.errors.closed, t.home.errNetwork);
      setError(typeof msg === "string" ? msg : pick(msg, lang));
    }
  };

  return (
    <section className="after-block add-source" aria-labelledby={`${uid}-t`}>
      <h2 id={`${uid}-t`}>{p.title}</h2>
      <form className="entry" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor={`${uid}-gh`} className="sr-only">
            {p.label}
          </label>
          <span className="field-prefix" aria-hidden>
            @
          </span>
          <input
            id={`${uid}-gh`}
            className="field-input"
            type="text"
            inputMode="url"
            enterKeyHint="go"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            data-1p-ignore=""
            data-lpignore="true"
            placeholder={t.home.loginPlaceholder}
            value={login}
            onChange={(e) => {
              setLogin(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={!!error}
            aria-describedby={`${uid}-err`}
          />
        </div>
        <button type="submit" className="pill pill-big entry-submit" disabled={busy}>
          {busy ? t.home.submitting : p.btn}
        </button>
        <p id={`${uid}-err`} className={`entry-error${error ? " is-on" : ""}`} role="alert">
          {error}
        </p>
      </form>
    </section>
  );
}
