// La phrase de la fiche (SPEC §18.107) : un champ de plus à la fin des deux
// lectures, écrit dans le même appel. Contrôlée ensuite par shared/punchline.ts ;
// mauvaise ou vide, la fiche tire la sienne au recueil. Texte figé : toute
// modification invalide le cache de prompt.

const RULES = `card_line is the only creative field: everything above stays a faithful extraction, and card_line never changes any other field.

The card is a playful "wanted poster" in a crime-dossier universe (case file, rap sheet, stakeout, alibi, hideout, heist, accomplice, informant). Write ONE short, funny, affectionate line about this person, the kind of line they would be proud to share. Build it on one or two precise, real facts of SOURCE (never invent one). Return it twice, the same joke in both languages:
- card_line.fr: French, speaking to the person with "tu" (never "vous").
- card_line.en: English, speaking to the person with "you".

Rules, for both:
1. About 40 to 65 characters, short enough for two lines of a phone screen. One sentence, no line break, no quotation marks around it, no emoji, no hashtag.
2. Never a school or university name (a generic "école d'ingé" or "engineering school" is fine). At most one company name, and only RULE_COMPANY; a past employer is described, never named ("ex-audit", "ex-banque", "ex-consulting").
3. No URL, email address, @handle or phone number.
4. Never about age, gender, origin, nationality, religion, health, family, body or appearance.
5. No insult, no swear word, no slur, nothing that mocks a company, a brand, a school or a technology's users.
6. No real accusation (fraud, lying, theft, plagiarism, drugs): the crime universe is a game, the person is never accused of anything real.
7. French without gender: no adjective or past participle that agrees with the person ("tu as monté ta boîte", not "tu es devenu fondateur"; "à peine en ville", not "à peine arrivé"); no "il" or "elle" about the person, no inclusive writing.
8. Never copy or paraphrase an example below: they only show the tone, their facts are invented. Every line must hold a fact that belongs to this person alone (a name of company, technology or project, a number, a turn in the career), so that two people never get the same line.
9. Almost every profile has a fact worth a line: write one. Return "" for both only when the source is empty or every fact breaks a rule above.`;

/** Les exemples des consignes : une phrase qui les reprend est rejetée (shared/punchline.ts, `forbid`). */
export const CARD_LINE_EXAMPLES = {
  cv: [
    { fr: "Cinq ans de Fortran au CNES, et la fusée décolle toujours", en: "Five years of Fortran at CNES, and the rocket still flies" },
    { fr: "De la boulangerie au Kotlin : tu pétris maintenant des API", en: "From bakery to Kotlin: now you knead APIs" },
  ],
  code: [{ fr: "Un parser de 900 lignes dans lexer.c : la brigade enquête", en: "A 900-line parser in lexer.c: the squad is on it" }],
};

const examples = (list: { fr: string; en: string }[]) => list.map((e) => `- ${JSON.stringify(e)}`).join("\n");

/** Lecture du parcours : sur le CV ou le profil LinkedIn. */
export const CARD_LINE_CV = `
# 11. card_line: the personal line on the card

${RULES.replace("SOURCE", "the text (current employer, a technology really used, years in the trade, a company founded, a career change, a contest won, a run of internships)").replace("RULE_COMPANY", "the current employer")}

Tone only (invented facts, never reuse):
${examples(CARD_LINE_EXAMPLES.cv)}
`;

/** Lecture du code : sur les fichiers lus. */
export const CARD_LINE_CODE = `
# 12. card_line: the personal line on the card

${RULES.replace("SOURCE", "the files received (a repository name, a habit seen in the code, a language, a test suite, a giant function, a perfectly typed module)").replace("RULE_COMPANY", "a company that owns one of the repositories")}

Tone only (invented facts, never reuse):
${examples(CARD_LINE_EXAMPLES.code)}
`;
