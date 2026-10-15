// Intelligence artificielle de l'utilisateur : Gemini (clé personnelle) ou son « cerveau » (modèle local par son réseau privé). Seule l'interface
// hôte parle au service : un plugin ne fait que demander (message `ai`, permission `ia`), il ne voit jamais la clé ni le jeton. Les adresses
// doivent être autorisées par la distribution (`connect-src` de sa configuration Tauri) ; sans cela, le navigateur du moteur refuse l'appel.
import type { AiImage, AiResult } from "@etabli/sdk/protocol";
import { BASE, choisirService, construireRequete, construireRequeteCerveau, lireConfigIa, lireReponse, lireReponseCerveau, type ConfigIa } from "./iaPur";
import { load, save } from "./storage";

export { CONFIG_DEFAUT, MODELE_DEFAUT, MODELES, cerveauConfigure, type ConfigIa, type Fournisseur } from "./iaPur";

export const configIa = (): ConfigIa => lireConfigIa(load("ia", null));
export const enregistrerConfigIa = (c: ConfigIa): void => save("ia", lireConfigIa(c));
export const iaConfiguree = (): boolean => choisirService(configIa(), false) !== null;

type Demande = { instruction: string; images?: readonly AiImage[]; schema?: unknown; recherche?: boolean };

async function demanderGemini(options: Demande, config: ConfigIa): Promise<AiResult> {
  try {
    const reponse = await fetch(`${BASE}/${encodeURIComponent(config.modele)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": config.cle },
      body: JSON.stringify(construireRequete(options)),
      signal: AbortSignal.timeout(80_000),
    });
    return lireReponse(reponse.status, await reponse.json().catch(() => null));
  } catch {
    return lireReponse(0, null);
  }
}

async function demanderCerveau(options: Demande, config: ConfigIa): Promise<AiResult> {
  try {
    const reponse = await fetch(`${config.urlCerveau}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.jetonCerveau}` },
      body: JSON.stringify(construireRequeteCerveau(options)),
      // un modèle local écrit moins vite qu'un service en ligne : un plan de repas peut prendre quelques minutes
      signal: AbortSignal.timeout(280_000),
    });
    return lireReponseCerveau(reponse.status, await reponse.json().catch(() => null));
  } catch {
    return lireReponseCerveau(0, null);
  }
}

/** Appelle le service choisi avec la configuration enregistrée. Ne jette jamais. */
export async function demander(options: Demande, brute: ConfigIa = configIa()): Promise<AiResult> {
  const config = lireConfigIa(brute);
  const avecImages = (options.images ?? []).length > 0;
  const service = choisirService(config, avecImages);
  if (service === null) {
    return avecImages
      ? { ok: false, code: "non_configure", message: "Lire une photo demande une clé Gemini (le cerveau ne lit pas les images) : Paramètres → Intelligence artificielle." }
      : { ok: false, code: "non_configure", message: "L'IA n'est pas configurée : Paramètres → Intelligence artificielle." };
  }
  return service === "cerveau" ? demanderCerveau(options, config) : demanderGemini(options, config);
}

/** Essai : une demande minuscule, pour vérifier la clé (ou le jeton) et l'adresse sans rien envoyer d'autre. */
export const tester = (config: ConfigIa): Promise<AiResult> => demander({ instruction: "Réponds simplement par le mot OK." }, config);
