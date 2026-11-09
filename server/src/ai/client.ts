// Appel structuré via OpenRouter (API compatible OpenAI, `fetch` natif) : sortie
// JSON contrainte par schéma (`response_format: json_schema`, strict), puis
// validation côté code. Une sortie invalide relance une fois, puis rend null (SPEC §12).
// Plafond du jour atteint, solde sous AI_MIN_CREDIT_USD, 402 ou réponse tronquée
// (OpenRouter rabote `max_tokens` quand le crédit baisse, sans 402) : lève
// AiClosedError, la fiche échoue en `closed` au lieu de sortir sans lecture (SPEC §2.3).

import { z } from "zod";
import {
  AiClosedError,
  aiConfigured,
  creditsBelowMin,
  noteCreditsExhausted,
  noteCreditsOk,
  recordUsage,
  withinBudget,
  type UsageLike,
} from "./budget";
import { refreshCredits } from "./credits";

// ---------------------------------------------------------------------------
// Transport

export type ChatContentPart = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  temperature?: number;
  response_format?: {
    type: "json_schema";
    json_schema: { name: string; strict: true; schema: Record<string, unknown> };
  };
  tools?: {
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown>; strict?: boolean };
  }[];
  tool_choice?: { type: "function"; function: { name: string } };
  provider?: { require_parameters?: boolean };
}

export interface ChatResponse {
  choices?: {
    finish_reason?: string | null;
    message?: {
      content?: string | null | { type: string; text?: string }[];
      tool_calls?: { function?: { name?: string; arguments?: string } }[];
    };
    error?: { code?: number | string; message?: string };
  }[];
  usage?: UsageLike;
  error?: { code?: number | string; message?: string };
}

/** Client injectable : un appel de complétion. Les tests passent un faux client. */
export interface ChatClient {
  complete(body: ChatRequest, options?: { signal?: AbortSignal }): Promise<ChatResponse>;
}

/** Erreur HTTP d'OpenRouter, sans contenu de la requête. */
export class ChatHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ChatHttpError";
  }
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
/** Timeout par requête HTTP ; le signal de l'appelant borne le tout (30 s par carte). */
const REQUEST_TIMEOUT_MS = 25_000;

/** Client OpenRouter par défaut. Lit la clé à chaque appel. */
export const openRouterClient: ChatClient = {
  async complete(body, options) {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.BASE_URL || "https://skills.azerit.tech",
        "X-Title": "Testyourskills",
      },
      body: JSON.stringify(body),
      signal,
    });
    const json = (await res.json().catch(() => null)) as ChatResponse | null;
    if (!res.ok) {
      // Le code du corps prime : OpenRouter y range parfois le 402 sous un autre statut.
      const status = isCreditCode(json?.error?.code) ? 402 : res.status;
      throw new ChatHttpError(status, json?.error?.message ?? `HTTP ${res.status}`);
    }
    if (!json) throw new ChatHttpError(res.status, "réponse illisible");
    return json;
  },
};

// ---------------------------------------------------------------------------
// Crédit épuisé (402)
//
// OpenRouter signale un crédit insuffisant par un HTTP 402 et un corps
// `{"error":{"code":402,"message":"Insufficient credits…"}}` (ou « This request
// requires more credits, or fewer max_tokens… »). Le même objet peut aussi
// arriver dans une réponse 200, au niveau racine ou dans `choices[0].error`.

const CREDIT_MESSAGE_RE = /insufficient credits|more credits/i;

function isCreditCode(code: unknown): boolean {
  return Number(code) === 402;
}

/** L'erreur levée par le client est-elle un manque de crédit ? */
export function isCreditError(err: unknown): boolean {
  return err instanceof ChatHttpError && (err.status === 402 || CREDIT_MESSAGE_RE.test(err.message));
}

/** La réponse, bien que reçue, porte-t-elle une erreur de crédit dans son corps ? */
export function creditErrorIn(res: ChatResponse): boolean {
  const errors = [res.error, res.choices?.[0]?.error];
  return errors.some((e) => !!e && (isCreditCode(e.code) || CREDIT_MESSAGE_RE.test(e.message ?? "")));
}

// ---------------------------------------------------------------------------
// Modèles

export const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

/** Température 0 seulement là où le modèle l'accepte (la génération 5 de Claude la refuse). */
function supportsTemperature(model: string): boolean {
  return !/claude-(haiku|sonnet|opus)-5|claude-fable/.test(model);
}

/** Modèles pour lesquels aucun fournisseur n'accepte `response_format` : repli sur un outil forcé. */
const toolModeModels = new Set<string>();

/** L'erreur indique-t-elle qu'aucun fournisseur ne gère les paramètres demandés ? */
function isUnsupportedParams(err: unknown): boolean {
  return (
    err instanceof ChatHttpError &&
    (err.status === 400 || err.status === 404) &&
    /response_format|structured|json_schema|require|parameters|endpoints/i.test(err.message)
  );
}

// ---------------------------------------------------------------------------
// Appel structuré

export type Validation<T> =
  | { ok: true; value: T }
  | { ok: false; issues: string[]; /** Résultat dégradé acceptable au dernier essai. */ fallback?: T | null };

export interface StructuredCall<T> {
  label: string;
  /** Nom du schéma (lettres, chiffres, _). */
  name: string;
  model: string;
  system: string;
  schema: Record<string, unknown>;
  userText: string;
  maxTokens: number;
  validate: (raw: unknown) => Validation<T>;
  signal?: AbortSignal;
  client?: ChatClient;
}

const MAX_ATTEMPTS = 2;

function buildRequest(call: StructuredCall<unknown>, userParts: ChatContentPart[], toolMode: boolean): ChatRequest {
  const body: ChatRequest = {
    model: call.model,
    max_tokens: call.maxTokens,
    messages: [
      // Bloc système stable, marqué pour le cache de prompt (modèles Anthropic).
      { role: "system", content: [{ type: "text", text: call.system, cache_control: { type: "ephemeral" } }] },
      { role: "user", content: userParts },
    ],
    // Ne router que vers un fournisseur qui respecte tous les paramètres (schéma compris).
    provider: { require_parameters: true },
  };
  if (supportsTemperature(call.model)) body.temperature = 0;
  if (toolMode) {
    body.tools = [
      {
        type: "function",
        function: {
          name: call.name,
          description: "Return the result, following the system instructions.",
          parameters: call.schema,
          strict: true,
        },
      },
    ];
    body.tool_choice = { type: "function", function: { name: call.name } };
  } else {
    body.response_format = { type: "json_schema", json_schema: { name: call.name, strict: true, schema: call.schema } };
  }
  return body;
}

/** Texte JSON rendu par le modèle, selon le mode. */
function outputText(res: ChatResponse, toolMode: boolean): string {
  const msg = res.choices?.[0]?.message;
  if (toolMode) {
    const args = msg?.tool_calls?.[0]?.function?.arguments;
    if (args) return args;
  }
  const c = msg?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((p) => p.text ?? "").join("");
  return "";
}

export async function callStructured<T>(call: StructuredCall<T>): Promise<T | null> {
  const client = call.client ?? openRouterClient;
  let issues: string[] = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (call.signal?.aborted) return null;
    // Sans client injecté il faut une clé : sans elle, l'IA n'est pas configurée (dev).
    if (!call.client && !aiConfigured()) return null;
    // Plafond du jour atteint : la fiche échoue en `closed`, aucun appel n'est fait.
    if (!withinBudget()) {
      console.warn(`[ai] ${call.label}: plafond du jour atteint, commissariat fermé`);
      throw new AiClosedError("budget");
    }
    // Solde sous le seuil : OpenRouter tronquerait la réponse, on n'appelle pas.
    if (creditsBelowMin()) {
      console.warn(`[ai] ${call.label}: solde OpenRouter sous le seuil, commissariat fermé`);
      throw new AiClosedError("credits");
    }

    const isLast = attempt === MAX_ATTEMPTS - 1;
    const userParts: ChatContentPart[] = [{ type: "text", text: call.userText }];
    if (attempt > 0) {
      userParts.push({
        type: "text",
        text:
          "Your previous answer was rejected by the validator for these reasons:\n- " +
          issues.slice(0, 8).join("\n- ") +
          "\nAnswer again, following the system instructions exactly.",
      });
    }

    let toolMode = toolModeModels.has(call.model);
    let res: ChatResponse;
    try {
      try {
        res = await client.complete(buildRequest(call, userParts, toolMode), { signal: call.signal });
      } catch (err) {
        // Aucun fournisseur n'accepte response_format : on réessaie avec un outil forcé.
        if (toolMode || !isUnsupportedParams(err)) throw err;
        toolMode = true;
        toolModeModels.add(call.model);
        res = await client.complete(buildRequest(call, userParts, toolMode), { signal: call.signal });
      }
    } catch (err) {
      if (call.signal?.aborted) return null;
      if (isCreditError(err)) {
        noteCreditsExhausted();
        void refreshCredits();
        console.warn(`[ai] ${call.label}: crédit OpenRouter épuisé (HTTP 402), commissariat fermé`);
        throw new AiClosedError("credits");
      }
      // On ne loggue jamais le contenu, seulement la nature de l'erreur.
      const status = err instanceof ChatHttpError ? ` (HTTP ${err.status})` : "";
      console.warn(`[ai] ${call.label}: échec de l'appel${status}`);
      return null;
    }

    if (res.usage) recordUsage(call.model, res.usage);
    else recordUsage(call.model, { prompt_tokens: 0, completion_tokens: 0 });

    if (creditErrorIn(res)) {
      noteCreditsExhausted();
      void refreshCredits();
      console.warn(`[ai] ${call.label}: crédit OpenRouter épuisé (402 dans la réponse), commissariat fermé`);
      throw new AiClosedError("credits");
    }

    issues = [];
    const choice = res.choices?.[0];
    const finish = choice?.finish_reason;
    // Réponse coupée par max_tokens : c'est ainsi qu'OpenRouter signale un crédit
    // bas (il rabote max_tokens au lieu de répondre 402). Traitée comme un crédit
    // épuisé, pas comme une sortie invalide ordinaire : pas de fiche sans lecture.
    if (finish === "length" && !res.error && !choice?.error) {
      noteCreditsExhausted();
      void refreshCredits();
      console.warn(`[ai] ${call.label}: réponse tronquée (crédit OpenRouter bas ?), commissariat fermé`);
      throw new AiClosedError("credits");
    }
    noteCreditsOk();
    if (res.error || choice?.error || !choice) issues.push("the provider returned an error");
    else if (finish === "content_filter") issues.push("the request was refused");

    if (issues.length === 0) {
      let raw: unknown;
      try {
        raw = JSON.parse(outputText(res, toolMode));
      } catch {
        issues.push("the answer was not valid JSON");
      }
      if (issues.length === 0) {
        const v = call.validate(raw);
        if (v.ok) return v.value;
        issues = v.issues.length ? v.issues : ["invalid answer"];
        if (isLast && v.fallback) return v.fallback;
      }
    }
    console.warn(`[ai] ${call.label}: sortie invalide (essai ${attempt + 1}/${MAX_ATTEMPTS})`);
    // Une sortie invalide peut cacher un crédit qui fond : on relit le solde
    // (délai borné), et sous le seuil la fiche échoue en `closed`.
    await refreshCredits();
    if (creditsBelowMin()) {
      console.warn(`[ai] ${call.label}: solde OpenRouter sous le seuil, commissariat fermé`);
      throw new AiClosedError("credits");
    }
  }
  return null;
}

/** Pour les tests uniquement. */
export function resetToolModeForTests(): void {
  toolModeModels.clear();
}

// ---------------------------------------------------------------------------
// Utilitaires

/** Encadre un contenu non fiable. Neutralise toute balise imitée dans le contenu. */
export function fence(tag: string, attrs: Record<string, string>, content: string): string {
  const attrText = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${v.replace(/["<>&]/g, "_")}"`)
    .join("");
  const safe = content.replace(new RegExp(`<(/?)(${tag})`, "gi"), "<$1$2_");
  return `<${tag}${attrText}>\n${safe}\n</${tag}>`;
}

// Mots-clés JSON Schema acceptés en mode strict. Le reste (bornes numériques,
// longueurs…) est retiré et vérifié côté code par zod.
const KEPT_KEYS = new Set([
  "type", "properties", "required", "items", "enum", "const", "anyOf",
  "$ref", "$defs", "description", "additionalProperties",
]);

/**
 * Convertit un schéma zod en JSON Schema strict pour `response_format` : objets
 * fermés, `enum` conservés (décodage contraint des listes fermées), types
 * nullables exprimés en `anyOf`.
 */
export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (!KEPT_KEYS.has(k)) continue;
      if (k === "properties" || k === "$defs") {
        out[k] = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([n, s]) => [n, clean(s)]));
      } else if (k === "enum" || k === "const" || k === "required" || k === "type") {
        out[k] = v;
      } else {
        out[k] = clean(v);
      }
    }
    if (out.type === "object") out.additionalProperties = false;
    // ["string", "null"] → anyOf, mieux pris en charge par les fournisseurs.
    if (Array.isArray(out.type)) {
      const types = out.type as string[];
      delete out.type;
      out.anyOf = types.map((t) => ({ type: t }));
    }
    return out;
  };
  return clean(z.toJSONSchema(schema)) as Record<string, unknown>;
}
