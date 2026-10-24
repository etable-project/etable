// Service distant de la distribution (un serveur MCP, comme le cerveau de Hameau) : lecture de la configuration et de la
// réponse JSON-RPC, sans réseau ni stockage (testable).
import type { RemoteResult } from "@etabli/sdk/protocol";

export interface ConfigDistant {
  /** Adresse choisie par l'utilisateur ; vide : celle de la distribution. */
  url: string;
  jeton: string;
}

export const CONFIG_DISTANT_DEFAUT: ConfigDistant = { url: "", jeton: "" };

export function lireConfigDistant(brut: unknown): ConfigDistant {
  const o = typeof brut === "object" && brut !== null ? (brut as Record<string, unknown>) : {};
  const url = typeof o.url === "string" && /^https:\/\/[^\s]{1,300}$/.test(o.url.trim()) ? o.url.trim() : "";
  // une clé : des caractères visibles sans espace, pas plus de 200
  const jeton = typeof o.jeton === "string" && /^[\x21-\x7e]{1,200}$/.test(o.jeton.trim()) ? o.jeton.trim() : "";
  return { url, jeton };
}

/** Corps de l'appel d'un outil MCP. */
export const corpsAppel = (outil: string, args: unknown, id: number): string =>
  JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: outil, arguments: args ?? {} } });

/** Réponse JSON-RPC d'un `tools/call` → résultat pour le plugin. */
export function lireReponse(statut: number, corps: unknown): RemoteResult {
  if (statut === 0) return { ok: false, code: "reseau", message: "Service distant injoignable (réseau, Tailscale ?)." };
  if (statut === 401 || statut === 403) return { ok: false, code: "refuse", message: "Clé refusée par le service distant : vérifiez-la dans Paramètres." };
  if (statut !== 200) return { ok: false, code: "erreur", message: `Le service distant a répondu ${statut}.` };
  const o = typeof corps === "object" && corps !== null ? (corps as Record<string, any>) : {};
  if (o.error) return { ok: false, code: "erreur", message: String(o.error.message ?? "erreur du service distant").slice(0, 500) };
  const texte = Array.isArray(o.result?.content) ? o.result.content.filter((c: any) => c?.type === "text").map((c: any) => String(c.text)).join("\n") : null;
  if (texte === null) return { ok: false, code: "erreur", message: "Réponse illisible du service distant." };
  if (o.result.isError) return { ok: false, code: /droit|refus|autoris/i.test(texte) ? "refuse" : "erreur", message: texte.slice(0, 500) };
  return { ok: true, texte };
}
