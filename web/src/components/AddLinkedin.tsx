// « Ajoute ton LinkedIn au dossier » (§18.37) : sous une fiche GitHub seule, en
// miroir de « Ajoute ton GitHub » (ProveGithub.tsx). Le profil relance la fiche en
// comparaison : LinkedIn porte le parcours, GitHub porte le code, un seul dossier.
// Rien à coller (§18.80) : le champ part du nom de la fiche, les profils à ce nom
// sortent dessous, on touche le sien ; un lien collé marche toujours.
// Caché tant que le serveur ne lit pas LinkedIn (/api/config).
import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { normalizeLinkedinUrl, resolveDoor } from "../../../shared/entry";
import { pick, useT } from "../i18n";
import { api, tokens } from "../lib/api";
import { errorFact } from "../lib/errors";
import { navigate } from "../lib/router";
import { unlockAudio } from "../lib/audio";
import { markFresh, rememberInput } from "../lib/session";
import { useSuggestBox, useSuggestions } from "./Suggest";

/** Le lien du profil, ou ce qui suit « linkedin.com/in/ ». Null : pas un profil LinkedIn. */
export function linkedinFromField(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  return normalizeLinkedinUrl(/linkedin\.com/i.test(s) ? s : `linkedin.com/in/${s.replace(/^@/, "")}`);
}

interface Props {
  login: string;
  /** Sous trois étoiles, ajouter la source est le remède (§18.52) : le bouton passe en rose, le partage en contour. */
  strong?: boolean;
  /** Le nom public de la fiche : s'il a un prénom et un nom, le champ en part. */
  name?: string;
}

export function AddLinkedin({ login, strong = false, name = "" }: Props) {
  const { t, lang } = useT();
  const p = t.result.addLinkedin;
  const uid = useId().replace(/:/g, "");
  const [on, setOn] = useState(() => api.knownConfig()?.linkedinEntry ?? true);
  const [search, setSearch] = useState(() => !!api.knownConfig()?.linkedinSearch);
  const [value, setValue] = useState(() => (resolveDoor("linkedin", name).kind === "name" ? name : ""));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Le champ a été touché : avant, le nom posé d'avance ne cherche rien (une recherche se paie). */
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    let alive = true;
    void api.getConfig().then((c) => {
      if (!alive) return;
      setOn(c.linkedinEntry);
      setSearch(c.linkedinSearch);
    });
    return () => {
      alive = false;
    };
  }, []);

  const go = async (url: string) => {
    if (busy) return;
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

  const suggestions = useSuggestions(value, { linkedin: search }, busy || !touched || !on);
  const box = useSuggestBox({
    id: `${uid}-sg`,
    items: suggestions,
    label: p.label,
    onPick: (item) => {
      if (item.kind !== "linkedin") return;
      setValue(item.title);
      void go(item.url);
    },
  });

  if (!on) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    // Un nom : une seule personne proposée, c'est elle ; plusieurs, la liste ; aucune, l'erreur.
    if (resolveDoor("linkedin", value).kind === "name") {
      setTouched(true);
      if (suggestions.length === 1 && suggestions[0]!.kind === "linkedin") return void go(suggestions[0]!.url);
      if (suggestions.length) return box.show();
      if (touched) setError(t.home.errLinkedin);
      return;
    }
    const url = linkedinFromField(value);
    if (!url) return setError(t.home.errLinkedin);
    void go(url);
  };

  return (
    <section className="after-block add-source add-linkedin" aria-labelledby={`${uid}-t`}>
      <h2 id={`${uid}-t`}>{p.title}</h2>
      <p>{p.text}</p>
      <form className="entry" onSubmit={submit} noValidate>
        <div className="field field-who">
          <label htmlFor={`${uid}-li`} className="sr-only">
            {p.label}
          </label>
          <input
            id={`${uid}-li`}
            className="field-input"
            type="text"
            inputMode="text"
            enterKeyHint="go"
            autoComplete="off"
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            data-1p-ignore=""
            data-lpignore="true"
            placeholder={search ? t.home.linkedinPlaceholder : t.home.linkedinLinkPlaceholder}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setTouched(true);
              if (error) setError(null);
            }}
            onFocus={() => {
              setTouched(true);
              box.show();
            }}
            onBlur={box.close}
            onKeyDown={(e) => void box.onKeyDown(e)}
            aria-invalid={!!error}
            aria-describedby={`${uid}-err`}
            {...box.inputProps}
          />
          {box.list}
        </div>
        {/* Secondaire : le rose de la page reste au partage (§18.48) ; sous trois étoiles, c'est lui le rose (§18.52). */}
        <button type="submit" className={`pill ${strong ? "pill-big" : "pill-ghost"} entry-submit`} disabled={busy}>
          {busy ? t.home.submitting : p.btn}
        </button>
        <p id={`${uid}-err`} className={`entry-error${error ? " is-on" : ""}`} role="alert">
          {error}
        </p>
      </form>
    </section>
  );
}
