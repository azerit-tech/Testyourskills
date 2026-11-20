// Avant de juger (§18.111) : au retour de LinkedIn, son GitHub, pour que la première
// fiche soit le dossier LinkedIn + GitHub. Le compte trouvé à son nom : « J'ai trouvé
// ton GitHub », validé seul au bout de 3 s (§18.113). Rien trouvé, ou « Ce n'est pas
// moi » : « Ajoute ton GitHub », un champ (les comptes à ce nom dessous) et « Je n'en ai pas ».
import { useEffect, useId, useRef, useState } from "react";
import type { GithubSuggestion } from "../../../shared/entry";
import { resolveDoor } from "../../../shared/entry";
import { githubHref } from "../../../shared/profileLinks";
import { useT } from "../i18n";
import { useAvatar } from "../card/avatar";
import { isTouch, parseLogin } from "../lib/util";
import { BusyDots } from "./Busy";
import { FoundConfirm } from "./FoundConfirm";
import { IconGithub } from "./Icons";
import { useSuggestBox, useSuggestions } from "./Suggest";

interface Props {
  /** Le nom rendu par LinkedIn : le champ en part, les comptes à ce nom sortent dessous. */
  name: string;
  candidate: GithubSuggestion | null;
  /** La fiche part : avec ce pseudo, ou sans GitHub (null). */
  onAnswer: (login: string | null) => void;
  busy: boolean;
}

function Face({ url }: { url: string }) {
  const state = useAvatar(url || null);
  return <span className="propose-face is-github">{state === "photo" && url ? <img src={url} alt="" width={44} height={44} /> : <IconGithub />}</span>;
}

export function GithubAsk({ name, candidate, onAnswer, busy }: Props) {
  const { t } = useT();
  const a = t.home.ghAsk;
  const uid = useId().replace(/:/g, "");
  const ref = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** « Non » au compte trouvé : le champ. */
  const [typing, setTyping] = useState(!candidate);
  const [login, setLogin] = useState(name);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sous une fiche, « À ton tour » est plus bas que l'écran : la question y vient.
  useEffect(() => ref.current?.scrollIntoView({ block: "center" }), []);
  useEffect(() => {
    if (typing && candidate && !isTouch()) inputRef.current?.focus();
  }, [typing, candidate]);

  const suggestions = useSuggestions(login, { github: true }, busy || !touched || !typing);
  const box = useSuggestBox({
    id: `${uid}-sg`,
    items: suggestions,
    label: a.label,
    onPick: (item) => {
      if (item.kind !== "github") return;
      setLogin(item.login);
      onAnswer(item.login);
    },
  });

  const submit = (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (busy) return;
    const gh = parseLogin(login);
    if (gh) return onAnswer(gh);
    // Un nom : une seule personne proposée, c'est elle ; plusieurs, la liste ; aucune, l'erreur.
    if (resolveDoor("github", login).kind === "name") {
      setTouched(true);
      if (suggestions.length === 1 && suggestions[0]!.kind === "github") return onAnswer(suggestions[0]!.login);
      if (suggestions.length) return box.show();
      if (touched) setError(t.home.errPick);
      return;
    }
    setError(login.trim() ? t.home.errLogin : t.home.errEmptyLogin);
  };

  if (candidate && !typing) {
    const href = githubHref(candidate.login);
    return (
      <FoundConfirm
        face={<Face url={candidate.avatarUrl} />}
        who={
          // Le compte s'ouvre dans un nouvel onglet (§18.108), l'onglet caché met l'attente en pause.
          href ? (
            <a className="propose-name" href={href} target="_blank" rel="noopener noreferrer">
              @{candidate.login}
            </a>
          ) : (
            <span className="propose-name">@{candidate.login}</span>
          )
        }
        sub={candidate.name}
        spoken={[`@${candidate.login}`, candidate.name].filter(Boolean).join(", ")}
        statement={t.home.found.github}
        busy={busy}
        onConfirm={() => onAnswer(candidate.login)}
        onNotMe={() => setTyping(true)}
      />
    );
  }

  return (
    <section ref={ref} className="gh-ask" aria-labelledby={`${uid}-t`}>
      <h2 id={`${uid}-t`} className="gh-ask-q">
        {a.title}
      </h2>
      <div className="gh-ask-form" role="group">
        <div className="field field-who">
          <label htmlFor={`${uid}-gh`} className="sr-only">
            {a.label}
          </label>
          <input
            ref={inputRef}
            id={`${uid}-gh`}
            className="field-input"
            type="text"
            inputMode="text"
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
              setTouched(true);
              if (error) setError(null);
            }}
            onFocus={() => {
              setTouched(true);
              box.show();
            }}
            onBlur={box.close}
            onKeyDown={(e) => {
              // Le champ vit dans le formulaire de l'entrée : Entrée envoie ce pseudo, jamais ce formulaire-là.
              if (box.onKeyDown(e)) return;
              if (e.key === "Enter") submit(e);
            }}
            aria-invalid={!!error}
            aria-describedby={`${uid}-err`}
            {...box.inputProps}
          />
          {box.list}
        </div>
        <p id={`${uid}-err`} className={`entry-error${error ? " is-on" : ""}`} role="alert">
          {error}
        </p>
        <button type="button" className="pill pill-big entry-submit" onClick={submit} disabled={busy} aria-busy={busy}>
          {a.go}
          {busy && <BusyDots />}
        </button>
        <button type="button" className="link-quiet gh-ask-none" onClick={() => onAnswer(null)} disabled={busy}>
          {a.none}
        </button>
      </div>
    </section>
  );
}
