// Service distant de la distribution : la clé enregistrée sur cet appareil et l'appel. Seule l'interface hôte parle au service ;
// un plugin demande (message `remote`, permission `distant`) sans jamais voir l'adresse ni la clé. L'adresse doit être
// autorisée par la distribution (`connect-src` de sa configuration Tauri).
import type { RemoteResult } from "@etabli/sdk/protocol";
import { CONFIG_DISTANT_DEFAUT, corpsAppel, lireConfigDistant, lireReponse, type ConfigDistant } from "./distantPur";
import { distribution } from "./distribution";
import { load, save } from "./storage";

export type { ConfigDistant } from "./distantPur";

export const configDistant = (): ConfigDistant => lireConfigDistant(load("distant", CONFIG_DISTANT_DEFAUT));
export const enregistrerConfigDistant = (c: ConfigDistant): void => save("distant", lireConfigDistant(c));

let compteur = 0;

/** Appelle un outil du service distant. Ne jette jamais. */
export async function appelerDistant(outil: string, args: unknown, brute: ConfigDistant = configDistant()): Promise<RemoteResult> {
  const config = lireConfigDistant(brute);
  const url = config.url || distribution.distant?.url || "";
  if (!url) return { ok: false, code: "non_configure", message: "Cette application n'a pas de service distant." };
  if (!config.jeton) return { ok: false, code: "non_configure", message: `Ajoutez votre clé dans Paramètres → ${distribution.distant?.nom ?? "Service distant"}.` };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${config.jeton}` },
      body: corpsAppel(outil, args, ++compteur),
      signal: AbortSignal.timeout(60_000),
    });
    return lireReponse(r.status, await r.json().catch(() => null));
  } catch {
    return lireReponse(0, null);
  }
}
