// Garde de l'hôte (docs/19) : tout message d'une mini-app est contrôlé ici avant que le moteur n'y touche. Une mini-app
// est un code qu'on ne maîtrise pas (un jour, celui d'un tiers) : on ne lui fait confiance ni sur la forme, ni sur la
// taille, ni sur ce qu'elle a le droit de demander.
import {
  AI_IMAGE_CARACTERES_MAX,
  AI_IMAGES_MAX,
  AI_INSTRUCTION_MAX,
  REMINDERS_MAX,
  SERVICE_PROVIDER_CODES,
  SERVICE_TIMEOUT_MAX_MS,
  SERVICE_TIMEOUT_MIN_MS,
  type AiImage,
  type PluginToHost,
  type Reminder,
  type SavedFile,
  type ServiceErrorCode,
  type ServiceResult,
  type WidgetCases,
} from "@etabli/sdk/protocol";
import { permissionAppel } from "./permissions";

export const LIMITES = {
  /** Taille JSON d'un document, de réglages, de données publiées ou envoyées. */
  donnees: 4 * 1024 * 1024,
  texte: 2000,
  presse: 1024 * 1024,
  fichier: 20 * 1024 * 1024,
  nomFichier: 120,
  hauteurMin: 160,
  hauteurMax: 20000,
  /** Longueur d'un message d'erreur de service. */
  messageErreur: 500,
} as const;

/** Identifiant d'un appel de service (choisi par l'appelant, rendu tel quel dans la réponse). */
const ID_APPEL = /^[A-Za-z0-9_-]{1,64}$/;
const NOM_SERVICE = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Identifiant d'un rappel (« finances/paie/m3 », « mission:m1@2026-10-05 ») : lettres, chiffres et quelques séparateurs. */
const ID_RAPPEL = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/;
/** « ecritures.ajouter », « soldes.aLaDate » : segments en lettres et chiffres, jamais de « _ » (pas de `__proto__`). */
export const NOM_FONCTION = /^[a-z][A-Za-z0-9]{0,31}(\.[a-z][A-Za-z0-9]{0,31}){0,3}$/;

/** Types qu'un cadre de service a le droit d'envoyer (liste fermée). */
const TYPES_CADRE_SERVICE: ReadonlySet<string> = new Set(["ready", "height", "pluginData", "provide", "serviceReady", "serviceResult", "reminders"]);

/** Identifiant d'un `serviceCall` brut, même refusé : permet de répondre à l'appelant plutôt que de le laisser attendre. */
export function idAppel(brut: unknown): string | null {
  return estObjet(brut) && brut.type === "serviceCall" && typeof brut.id === "string" && ID_APPEL.test(brut.id) ? brut.id : null;
}

/** Extensions qu'une mini-app peut proposer à « Enregistrer sous » : jamais un programme ni un script. */
export const EXTENSIONS_FICHIER: ReadonlySet<string> = new Set(["csv", "tsv", "dxf", "json", "txt", "svg", "md", "xml", "ics", "pdf"]);

export interface Contexte {
  /** Permissions déclarées dans le manifeste (déjà filtrées sur les permissions connues). */
  permissions: readonly string[];
  /** Contrat strict (apiVersion ≥ 2) : sinon, les anciennes mini-apps gardent leurs droits d'avant. */
  strict: boolean;
  /** Noms de service que le manifeste déclare (`provides`). */
  provides: readonly string[];
  /**
   * Vrai pour le cadre invisible `serviceEntry` d'un fournisseur (docs/24, A.1.2) : il ne peut qu'enregistrer ses
   * réglages, publier ses services et répondre aux appels. Ni notification, ni fichier, ni appel.
   */
  service?: boolean;
}

/** `code` : pour un `serviceCall` refusé, l'erreur à renvoyer à l'appelant (sinon il attendrait en vain). */
export type Verdict = { ok: true; message: PluginToHost } | { ok: false; raison: string; code?: ServiceErrorCode };

const refus = (raison: string, code?: ServiceErrorCode): Verdict => ({ ok: false, raison, ...(code ? { code } : {}) });
const bon = (message: PluginToHost): Verdict => ({ ok: true, message });

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const estTexte = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

const CHAMP = /^[A-Za-z0-9_]{1,40}$/;

/** Liste à cocher d'un résumé de widget, recopiée champ par champ ; `null` si elle est mal formée. */
function casesWidget(v: unknown): WidgetCases | null {
  if (!estObjet(v) || !Array.isArray(v.chemin) || v.chemin.length < 1 || v.chemin.length > 8 || !Array.isArray(v.elements)) return null;
  const chemin: WidgetCases["chemin"] = [];
  for (const s of v.chemin) {
    if (typeof s === "string" && CHAMP.test(s)) chemin.push(s);
    else if (estObjet(s) && Object.keys(s).length >= 1 && Object.keys(s).length <= 4) {
      const filtre: Record<string, string | number | boolean | null> = {};
      for (const [k, x] of Object.entries(s)) {
        if (!CHAMP.test(k) || !(x === null || typeof x === "boolean" || (typeof x === "number" && Number.isFinite(x)) || estTexte(x, 40))) return null;
        filtre[k] = x;
      }
      chemin.push(filtre);
    } else return null;
  }
  if (![v.id, v.texte, v.coche].every((c) => typeof c === "string" && CHAMP.test(c))) return null;
  const elements: WidgetCases["elements"] = [];
  for (const e of v.elements.slice(0, 50)) {
    if (!estObjet(e) || !estTexte(e.id, 64) || typeof e.texte !== "string" || typeof e.coche !== "boolean") return null;
    elements.push({ id: e.id, texte: e.texte.slice(0, 80), coche: e.coche });
  }
  return { chemin, id: v.id as string, texte: v.texte as string, coche: v.coche as string, elements };
}

/** Taille JSON, ou `null` si la valeur n'est pas sérialisable (référence circulaire, BigInt…). */
function tailleJson(valeur: unknown): number | null {
  try {
    return JSON.stringify(valeur ?? null).length;
  } catch {
    return null;
  }
}

function donneesValides(valeur: unknown): boolean {
  const t = tailleJson(valeur);
  return t !== null && t <= LIMITES.donnees;
}

/** Nom de fichier proposé : ni chemin, ni caractère interdit sous Windows, ni nom réservé ou caché. */
export function nomFichierSur(nom: unknown): string | null {
  if (typeof nom !== "string") return null;
  const propre = nom.trim();
  if (propre.length === 0 || propre.length > LIMITES.nomFichier) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(propre)) return null;
  if (propre.startsWith(".") || propre.endsWith(".") || propre.endsWith(" ")) return null;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(propre)) return null;
  return propre;
}

function fichierValide(f: unknown): f is SavedFile {
  if (!estObjet(f)) return false;
  const nom = nomFichierSur(f.name);
  if (!nom) return false;
  if (typeof f.extension !== "string" || !EXTENSIONS_FICHIER.has(f.extension.toLowerCase())) return false;
  if (!nom.toLowerCase().endsWith(`.${f.extension.toLowerCase()}`)) return false;
  if (typeof f.content !== "string" || f.content.length > LIMITES.fichier) return false;
  return estTexte(f.description, 80);
}

/** Permission nécessaire à un type de message ; `null` : message toujours permis. */
const PERMISSION_REQUISE: Record<string, string | null> = {
  update: null,
  title: null,
  summary: null,
  notify: null,
  height: null,
  ready: null,
  shortcut: null,
  pluginData: null,
  provide: null,
  copy: "presse-papiers",
  saveFile: "fichiers",
  send: "envoi",
  openSettings: "reglages",
  openPage: null,
  reminders: "notifications",
  ai: "ia",
  route: "trajets",
  remote: "distant",
  openMap: null,
  widgetSummary: null,
  // La permission `appelle:<service>:<accès>` dépend du service : contrôlée plus bas, puis par le routage.
  serviceCall: null,
  serviceReady: null,
  serviceResult: null,
};

/**
 * Contrôle un message brut reçu d'une mini-app. Renvoie le message à traiter (éventuellement corrigé, par exemple la
 * hauteur ramenée dans ses bornes) ou la raison du refus. Ne jette jamais d'exception.
 */
export function controler(brut: unknown, ctx: Contexte): Verdict {
  try {
    if (!estObjet(brut) || typeof brut.type !== "string") return refus("message mal formé");
    const type = brut.type;
    if (!Object.prototype.hasOwnProperty.call(PERMISSION_REQUISE, type)) return refus(`type inconnu : ${type.slice(0, 40)}`);

    if (ctx.service) {
      if (!TYPES_CADRE_SERVICE.has(type)) return refus(`message « ${type} » interdit dans un cadre de service`);
    } else if (type === "serviceReady" || type === "serviceResult") {
      return refus(`message « ${type} » réservé au cadre de service`);
    }

    const requise = PERMISSION_REQUISE[type];
    if (requise && ctx.strict && !ctx.permissions.includes(requise)) return refus(`permission « ${requise} » non déclarée`);

    switch (type) {
      case "update":
      case "pluginData":
        return donneesValides(brut.data) ? bon({ type, data: brut.data } as PluginToHost) : refus("données trop volumineuses ou illisibles");
      case "title":
        return estTexte(brut.title, 300) ? bon({ type, title: brut.title }) : refus("titre invalide");
      case "summary":
        return estTexte(brut.summary, LIMITES.texte) ? bon({ type, summary: brut.summary }) : refus("résumé invalide");
      case "notify":
        return estTexte(brut.text, LIMITES.texte) ? bon({ type, text: brut.text }) : refus("texte invalide");
      case "copy":
        return estTexte(brut.text, LIMITES.presse) ? bon({ type, text: brut.text }) : refus("texte trop long");
      case "height": {
        const v = brut.value;
        if (typeof v !== "number" || !Number.isFinite(v)) return refus("hauteur invalide");
        return bon({ type, value: Math.min(LIMITES.hauteurMax, Math.max(LIMITES.hauteurMin, v)) });
      }
      case "ready":
        return bon({ type });
      case "shortcut":
        if (!estTexte(brut.key, 40) || (brut.code !== undefined && !estTexte(brut.code, 40))) return refus("raccourci invalide");
        return bon({
          type,
          key: brut.key,
          ...(brut.code !== undefined ? { code: brut.code as string } : {}),
          ctrl: brut.ctrl === true,
          shift: brut.shift === true,
          alt: brut.alt === true,
        });
      case "provide":
        if (!estTexte(brut.name, 64) || !/^[a-z0-9-]+$/.test(brut.name)) return refus("nom de service invalide");
        if (!ctx.provides.includes(brut.name)) return refus("service non déclaré dans le manifeste");
        return donneesValides(brut.data) ? bon({ type, name: brut.name, data: brut.data }) : refus("données trop volumineuses ou illisibles");
      case "openSettings":
        if (!estTexte(brut.plugin, 64) || !/^[a-z0-9-]+$/.test(brut.plugin)) return refus("plugin invalide");
        if (brut.hash !== undefined && !estTexte(brut.hash, 200)) return refus("ancre invalide");
        return bon({ type, plugin: brut.plugin, ...(brut.hash !== undefined ? { hash: brut.hash as string } : {}) });
      case "openPage":
        return estTexte(brut.page, 64) && /^[a-z0-9][a-z0-9-]*$/.test(brut.page) ? bon({ type, page: brut.page }) : refus("page invalide");
      case "send":
        if (!estTexte(brut.kind, 64) || !/^[a-z0-9-]+$/.test(brut.kind)) return refus("type d'envoi invalide");
        return donneesValides(brut.data) ? bon({ type, kind: brut.kind, data: brut.data }) : refus("données trop volumineuses ou illisibles");
      case "saveFile":
        return fichierValide(brut.file)
          ? bon({ type, file: { ...brut.file, name: nomFichierSur(brut.file.name)!, extension: brut.file.extension.toLowerCase() } })
          : refus("fichier refusé (nom, extension ou taille)");
      case "serviceReady":
        return bon({ type });
      case "reminders": {
        if (!estTexte(brut.id, 64) || !ID_APPEL.test(brut.id)) return refus("identifiant de demande invalide");
        if (brut.op === "state") return bon({ type, id: brut.id, op: "state" });
        if (brut.op !== "set") return refus("opération de rappels inconnue");
        if (!Array.isArray(brut.items) || brut.items.length > REMINDERS_MAX) return refus(`au plus ${REMINDERS_MAX} rappels`);
        const ids = new Set<string>();
        const items: Reminder[] = [];
        for (const r of brut.items) {
          if (!estObjet(r)) return refus("rappel mal formé");
          if (!estTexte(r.id, 160) || !ID_RAPPEL.test(r.id) || ids.has(r.id)) return refus("identifiant de rappel invalide ou en double");
          if (typeof r.at !== "number" || !Number.isSafeInteger(r.at) || r.at < 0 || r.at > 8.64e15) return refus("instant de rappel invalide");
          if (!estTexte(r.title, 120) || r.title.trim() === "") return refus("titre de rappel invalide");
          if (r.text !== undefined && !estTexte(r.text, 300)) return refus("texte de rappel invalide");
          ids.add(r.id);
          items.push({ id: r.id, at: r.at, title: r.title, ...(r.text !== undefined ? { text: r.text as string } : {}) });
        }
        return bon({ type, id: brut.id, op: "set", items });
      }
      case "ai": {
        if (!estTexte(brut.id, 64) || !ID_APPEL.test(brut.id)) return refus("identifiant de demande invalide");
        if (!estTexte(brut.instruction, AI_INSTRUCTION_MAX) || brut.instruction.trim() === "") return refus("consigne vide ou trop longue");
        let images: AiImage[] | undefined;
        if (brut.images !== undefined) {
          if (!Array.isArray(brut.images) || brut.images.length > AI_IMAGES_MAX) return refus(`au plus ${AI_IMAGES_MAX} photos`);
          images = [];
          for (const img of brut.images) {
            if (!estObjet(img) || (img.mime !== "image/jpeg" && img.mime !== "image/png" && img.mime !== "image/webp")) return refus("type de photo non pris en charge");
            if (typeof img.data !== "string" || img.data.length === 0 || img.data.length > AI_IMAGE_CARACTERES_MAX || !/^[A-Za-z0-9+/]+={0,2}$/.test(img.data)) return refus("photo illisible ou trop lourde");
            images.push({ mime: img.mime, data: img.data });
          }
        }
        if (brut.schema !== undefined && !donneesValides(brut.schema)) return refus("schéma trop volumineux ou illisible");
        if (brut.recherche !== undefined && typeof brut.recherche !== "boolean") return refus("« recherche » doit valoir vrai ou faux");
        return bon({ type, id: brut.id, instruction: brut.instruction, ...(images ? { images } : {}), ...(brut.schema !== undefined ? { schema: brut.schema } : {}), ...(brut.recherche === true ? { recherche: true } : {}) });
      }
      case "remote": {
        if (!estTexte(brut.id, 64) || !ID_APPEL.test(brut.id)) return refus("identifiant de demande invalide");
        if (!estTexte(brut.outil, 64) || !/^[a-z][a-z0-9_]{0,63}$/.test(brut.outil)) return refus("nom d'outil invalide");
        if (!donneesValides(brut.args)) return refus("arguments trop volumineux ou illisibles");
        return bon({ type, id: brut.id, outil: brut.outil, args: brut.args });
      }
      case "route": {
        if (!estTexte(brut.id, 64) || !ID_APPEL.test(brut.id)) return refus("identifiant de demande invalide");
        if (!estTexte(brut.vers, 200) || brut.vers.trim() === "") return refus("adresse d'arrivée vide ou trop longue");
        if (brut.depuis !== undefined && (!estTexte(brut.depuis, 200) || brut.depuis.trim() === "")) return refus("adresse de départ vide ou trop longue");
        if (brut.arriveeAvant !== undefined && !(typeof brut.arriveeAvant === "number" && Number.isFinite(brut.arriveeAvant))) return refus("heure d'arrivée invalide");
        return bon({ type, id: brut.id, vers: brut.vers, ...(brut.depuis !== undefined ? { depuis: brut.depuis } : {}), ...(brut.arriveeAvant !== undefined ? { arriveeAvant: brut.arriveeAvant } : {}) });
      }
      case "widgetSummary": {
        const r = estObjet(brut.resume) ? brut.resume : null;
        if (!estTexte(brut.widget, 40) || !/^[a-z0-9-]+$/.test(brut.widget)) return refus("identifiant de widget invalide");
        // Texte trop long : coupé plutôt que refusé, sinon le widget du téléphone reste vide.
        const couper = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);
        if (!r || typeof r.titre !== "string" || r.titre.length > 2000) return refus("titre du résumé absent ou illisible");
        if (r.valeur !== undefined && (typeof r.valeur !== "string" || r.valeur.length > 2000)) return refus("valeur du résumé illisible");
        if (r.page !== undefined && (!estTexte(r.page, 64) || !/^[a-z0-9-]+$/.test(r.page))) return refus("page du résumé invalide");
        if (r.lignes !== undefined && (!Array.isArray(r.lignes) || r.lignes.length > 50 || !r.lignes.every((l) => typeof l === "string" && l.length <= 2000))) return refus("lignes du résumé illisibles");
        const lignes = r.lignes === undefined ? undefined : (r.lignes as string[]).slice(0, 5).map((l) => couper(l, 80));
        const cases = r.cases === undefined ? undefined : casesWidget(r.cases);
        if (cases === null) return refus("liste à cocher du résumé invalide");
        return bon({ type, widget: brut.widget, resume: { titre: couper(r.titre, 60), ...(r.valeur !== undefined ? { valeur: couper(r.valeur as string, 40) } : {}), ...(lignes ? { lignes } : {}), ...(r.page !== undefined ? { page: r.page } : {}), ...(cases ? { cases } : {}) } });
      }
      case "openMap": {
        if (!estTexte(brut.destination, 200) || brut.destination.trim() === "") return refus("destination vide ou trop longue");
        return bon({ type, destination: brut.destination });
      }
      case "serviceCall": {
        if (!estTexte(brut.id, 64) || !ID_APPEL.test(brut.id)) return refus("identifiant d'appel invalide");
        if (!estTexte(brut.service, 64) || !NOM_SERVICE.test(brut.service)) return refus("nom de service invalide", "argument_invalide");
        if (!estTexte(brut.fn, 140) || !NOM_FONCTION.test(brut.fn)) return refus("nom de fonction invalide", "argument_invalide");
        // Seuls les plugins de contrat ^2 appellent, et seulement les services pour lesquels ils ont une permission.
        if (!ctx.strict) return refus("appel de service réservé aux plugins de contrat ^2", "permission_refusee");
        if (!ctx.permissions.some((p) => permissionAppel(p)?.service === brut.service)) {
          return refus(`permission « appelle:${brut.service}:… » non déclarée`, "permission_refusee");
        }
        if (!donneesValides(brut.args)) return refus("arguments trop volumineux ou illisibles", "argument_invalide");
        let timeoutMs: number | undefined;
        if (brut.timeoutMs !== undefined) {
          if (typeof brut.timeoutMs !== "number" || !Number.isFinite(brut.timeoutMs)) return refus("délai invalide", "argument_invalide");
          timeoutMs = Math.round(Math.min(SERVICE_TIMEOUT_MAX_MS, Math.max(SERVICE_TIMEOUT_MIN_MS, brut.timeoutMs)));
        }
        return bon({
          type,
          id: brut.id,
          service: brut.service,
          fn: brut.fn,
          args: brut.args ?? null,
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        });
      }
      case "serviceResult": {
        if (!estTexte(brut.id, 64) || !ID_APPEL.test(brut.id)) return refus("identifiant d'appel invalide");
        const r = brut.result;
        if (!estObjet(r)) return refus("réponse de service mal formée");
        if (r.ok === true) {
          if (!donneesValides(r.valeur)) return refus("réponse trop volumineuse ou illisible");
          return bon({ type, id: brut.id, result: { ok: true, valeur: r.valeur ?? null } });
        }
        if (r.ok !== false) return refus("réponse de service mal formée");
        if (typeof r.code !== "string" || !(SERVICE_PROVIDER_CODES as readonly string[]).includes(r.code)) return refus("code d'erreur de service interdit");
        if (!estTexte(r.message, LIMITES.messageErreur)) return refus("message d'erreur de service invalide");
        return bon({ type, id: brut.id, result: { ok: false, code: r.code as ServiceErrorCode, message: r.message } });
      }
      default:
        return refus("type inconnu");
    }
  } catch {
    return refus("message illisible");
  }
}

/** Erreur toute prête, pour répondre à un appelant. */
export const erreurService = (code: ServiceErrorCode, message: string): ServiceResult => ({ ok: false, code, message });
