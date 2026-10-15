// Partie pure du dialogue avec l'IA : lecture de la configuration, forme des requêtes, lecture des réponses. Sans réseau ni stockage : testée seule.
// Deux services : Gemini (Google, clé personnelle) et « cerveau » (un modèle local, par exemple Qwen, derrière un serveur compatible OpenAI
// sur le réseau privé de l'utilisateur). Le cerveau ne lit pas les photos : une demande avec photos part chez Gemini s'il est configuré.
import type { AiErrorCode, AiImage, AiResult } from "@etabli/sdk/protocol";

export type Fournisseur = "gemini" | "cerveau";

export interface ConfigIa {
  /** Le service qui répond aux demandes sans photo. */
  fournisseur: Fournisseur;
  /** Clé d'API Gemini personnelle ; vide : Gemini non configuré. */
  cle: string;
  modele: string;
  /** Adresse du cerveau (https, réseau privé), sans « /v1 » ; vide : non configuré. */
  urlCerveau: string;
  /** Jeton d'accès au cerveau ; vide : non configuré. */
  jetonCerveau: string;
}

export const MODELE_DEFAUT = "gemini-3.5-flash-lite";
/** Modèles proposés dans les Paramètres ; l'utilisateur peut en saisir un autre. */
export const MODELES = [
  { id: "gemini-3.5-flash-lite", nom: "3.5 Flash-Lite (le moins cher, suffit pour des tickets)" },
  { id: "gemini-3.1-flash-lite", nom: "3.1 Flash-Lite" },
  { id: "gemini-3.8-flash", nom: "3.8 Flash (plus précis)" },
] as const;

export const CONFIG_DEFAUT: ConfigIa = { fournisseur: "gemini", cle: "", modele: MODELE_DEFAUT, urlCerveau: "", jetonCerveau: "" };
export const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const jeton = (v: unknown): string => {
  const t = typeof v === "string" ? v.trim().replace(/^["'«»]+|["'«»]+$/g, "").trim().slice(0, 400) : "";
  return /^[\x21-\x7e]{10,400}$/.test(t) ? t : "";
};

/** Lecture défensive de ce qui est enregistré : seuls des jetons imprimables, un nom de modèle propre et une adresse https sont gardés. */
export function lireConfigIa(brut: unknown): ConfigIa {
  const o = typeof brut === "object" && brut !== null ? (brut as Record<string, unknown>) : {};
  // Le format des clés de Google change (« AIza… », puis « AQ.… » avec un point) : on ne vérifie que ce qui est sûr à mettre dans un en-tête,
  // des caractères imprimables sans espace. C'est le service qui dit si la clé est bonne (bouton « Essayer »). Les guillemets collés avec elle sont retirés.
  const modele = typeof o.modele === "string" && /^[a-z0-9][a-z0-9._-]{1,60}$/.test(o.modele.trim()) ? o.modele.trim() : MODELE_DEFAUT;
  const url = typeof o.urlCerveau === "string" ? o.urlCerveau.trim().replace(/\/+$/, "").replace(/\/v1$/, "") : "";
  const urlCerveau = /^https:\/\/[a-z0-9.-]+(:\d{1,5})?(\/[\w./-]*)?$/i.test(url) && url.length <= 200 ? url : "";
  return { fournisseur: o.fournisseur === "cerveau" ? "cerveau" : "gemini", cle: jeton(o.cle), modele, urlCerveau, jetonCerveau: jeton(o.jetonCerveau) };
}

export const cerveauConfigure = (c: ConfigIa): boolean => c.urlCerveau !== "" && c.jetonCerveau !== "";

/** Qui répond à cette demande : le cerveau pour du texte s'il est choisi et configuré ; Gemini pour les photos (le cerveau ne les lit pas). */
export function choisirService(c: ConfigIa, avecImages: boolean): Fournisseur | null {
  if (avecImages) return c.cle !== "" ? "gemini" : null;
  if (c.fournisseur === "cerveau" && cerveauConfigure(c)) return "cerveau";
  if (c.cle !== "") return "gemini";
  return cerveauConfigure(c) ? "cerveau" : null;
}

const avecFormat = (instruction: string, schema: unknown): string =>
  `${instruction}\n\nRéponds UNIQUEMENT par un objet JSON valide, sans texte autour ni balises, conforme à ce schéma JSON :\n${JSON.stringify(schema)}`;

/** Le corps de la requête Gemini : la consigne, les photos, et la réponse en JSON quand un schéma est donné. */
export function construireRequete(options: { instruction: string; images?: readonly AiImage[]; schema?: unknown; recherche?: boolean }): Record<string, unknown> {
  const avecSchema = options.schema !== undefined;
  const recherche = options.recherche === true;
  const consigne = avecSchema ? avecFormat(options.instruction, options.schema) : options.instruction;
  return {
    contents: [
      {
        role: "user",
        parts: [{ text: consigne }, ...(options.images ?? []).map((i) => ({ inline_data: { mime_type: i.mime, data: i.data } }))],
      },
    ],
    // Avec la recherche sur internet, Gemini ne sait pas imposer le format JSON : on le demande seulement dans la consigne (déjà fait ci-dessus).
    ...(recherche ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: { temperature: recherche ? 0.5 : 0.1, ...(avecSchema && !recherche ? { response_mime_type: "application/json" } : {}) },
  };
}

/** Le corps de la requête au cerveau (format « chat completions » d'OpenAI). Pas de recherche sur internet : le modèle travaille avec ce qu'on lui donne. */
export function construireRequeteCerveau(options: { instruction: string; schema?: unknown }): Record<string, unknown> {
  const avecSchema = options.schema !== undefined;
  return {
    model: "local",
    messages: [{ role: "user", content: avecSchema ? avecFormat(options.instruction, options.schema) : options.instruction }],
    temperature: 0.3,
    max_tokens: 8000,
    ...(avecSchema ? { response_format: { type: "json_object" } } : {}),
  };
}

const MOTS: Record<number, [AiErrorCode, string]> = {
  400: ["refuse", "Le service a refusé la demande (clé invalide ou photo illisible)."],
  401: ["refuse", "Clé d'API refusée."],
  403: ["refuse", "Clé d'API refusée ou sans droit sur ce modèle."],
  404: ["erreur", "Modèle introuvable : choisissez-en un autre dans les Paramètres."],
  429: ["limite", "Limite d'utilisation gratuite atteinte : réessayez dans un moment."],
};

function erreurHttp(statut: number, o: Record<string, any>): AiResult {
  const [code, message] = MOTS[statut] ?? (statut >= 500 ? (["reseau", "Le service est indisponible pour l'instant."] as [AiErrorCode, string]) : (["erreur", `Erreur ${statut} du service.`] as [AiErrorCode, string]));
  const brut = o.error?.message ?? o.error;
  const detail = typeof brut === "string" ? ` (${brut.slice(0, 160)})` : "";
  return { ok: false, code, message: message + detail };
}

/** Lit la réponse de Gemini : le texte, ou une erreur claire en français. `statut` : code HTTP (0 : le réseau a échoué). */
export function lireReponse(statut: number, json: unknown): AiResult {
  const o = typeof json === "object" && json !== null ? (json as Record<string, any>) : {};
  if (statut === 0) return { ok: false, code: "reseau", message: "Pas de réponse du service : vérifiez la connexion." };
  if (statut >= 400) return erreurHttp(statut, o);
  const bloque = o.promptFeedback?.blockReason;
  if (typeof bloque === "string") return { ok: false, code: "bloque", message: "Le service a refusé d'analyser cette demande." };
  const parts = o.candidates?.[0]?.content?.parts;
  const texte = Array.isArray(parts) ? parts.map((p: { text?: unknown }) => (typeof p.text === "string" ? p.text : "")).join("").trim() : "";
  return texte === "" ? { ok: false, code: "erreur", message: "Le service n'a rien répondu." } : { ok: true, texte };
}

/** Lit la réponse du cerveau (format OpenAI). Les balises de réflexion (`<think>…</think>`) d'un modèle local sont retirées. */
export function lireReponseCerveau(statut: number, json: unknown): AiResult {
  const o = typeof json === "object" && json !== null ? (json as Record<string, any>) : {};
  if (statut === 0) return { ok: false, code: "reseau", message: "Le cerveau ne répond pas : vérifiez que Tailscale est actif sur cet appareil." };
  if (statut === 401 || statut === 403) return { ok: false, code: "refuse", message: "Jeton du cerveau refusé : vérifiez-le dans Paramètres → Intelligence artificielle." };
  if (statut >= 400) return erreurHttp(statut, o);
  const brut = o.choices?.[0]?.message?.content;
  const texte = typeof brut === "string" ? brut.replace(/<think>[\s\S]*?<\/think>/g, "").trim() : "";
  return texte === "" ? { ok: false, code: "erreur", message: "Le cerveau n'a rien répondu." } : { ok: true, texte };
}
