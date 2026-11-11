// « Ajoute ton LinkedIn au dossier » (§18.37) : sous une fiche GitHub seule, en
// miroir de « Ajoute ton GitHub » (ProveGithub.tsx). Le lien du profil relance la
// fiche en comparaison : LinkedIn porte le parcours, GitHub porte le code, un seul
// dossier. Caché tant que le serveur ne lit pas LinkedIn (/api/config).
import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { normalizeLinkedinUrl } from "../../../shared/entry";
import { pick, useT } from "../i18n";
import { api, tokens } from "../lib/api";
import { errorFact } from "../lib/errors";
import { navigate } from "../lib/router";
import { unlockAudio } from "../lib/audio";
import { markFresh, rememberInput } from "../lib/session";

/** Le lien du profil, ou ce qui suit « linkedin.com/in/ ». Null : pas un profil LinkedIn. */
export function linkedinFromField(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  return normalizeLinkedinUrl(/linkedin\.com/i.test(s) ? s : `linkedin.com/in/${s.replace(/^@/, "")}`);
}

export function AddLinkedin({ login }: { login: string }) {
  const { t, lang } = useT();
  const p = t.result.addLinkedin;
  const uid = useId().replace(/:/g, "");
  const [on, setOn] = useState(() => api.knownConfig()?.linkedinEntry ?? true);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void api.getConfig().then((c) => alive && setOn(c.linkedinEntry));
    return () => {
      alive = false;
    };
  }, []);

  if (!on) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const url = linkedinFromField(value);
    if (!url) {
      setError(t.home.errLinkedin);
      return;
    }
    unlockAudio();
    setBusy(true);
    setError(null);
    try {
      const res = await api.createCard({ login, linkedin: url, lang });
      if (res.deleteToken) tokens.set(res.id, res.deleteToken);
      rememberInput({ login, file: null });
      markFresh(res.id, login);
      navigate(`/c/${res.id}`);
    } catch (err) {
      setBusy(false);
      const msg = errorFact(err, t.errors.closed, t.home.errNetwork);
      setError(typeof msg === "string" ? msg : pick(msg, lang));
    }
  };

  return (
    <section className="after-block add-source add-linkedin" aria-labelledby={`${uid}-t`}>
      <h2 id={`${uid}-t`}>{p.title}</h2>
      <p>{p.text}</p>
      <form className="entry" onSubmit={submit} noValidate>
        <div className="field field-li">
          <label htmlFor={`${uid}-li`} className="sr-only">
            {p.label}
          </label>
          {!/linkedin\.com/i.test(value) && (
            <span className="field-prefix" aria-hidden>
              linkedin.com/in/
            </span>
          )}
          <input
            id={`${uid}-li`}
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
            placeholder={t.home.linkedinPlaceholder}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
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
