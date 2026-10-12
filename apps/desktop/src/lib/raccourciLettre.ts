// Raccourci Windows (aperçu rapide) : réparation des anciens réglages AZERTY.
export interface RaccourciGlobal {
  accelerator: string;
  label: string;
}

/**
 * Anciens raccourcis Windows enregistrés par l'emplacement de la touche : en AZERTY, « Ctrl + Maj + Q » était gardé comme
 * KeyA et Windows attendait la lettre A. On remet la lettre affichée (Ctrl + Maj + Q → KeyQ).
 */
export function corrigerLettreGlobale<S extends RaccourciGlobal>(s: S): S {
  if (typeof s?.label !== "string" || typeof s.accelerator !== "string") return s;
  const lettre = /(?:^|\s)([A-Z])$/.exec(s.label)?.[1];
  const code = /Key([A-Z])$/.exec(s.accelerator)?.[1];
  return lettre && code && lettre !== code ? { ...s, accelerator: s.accelerator.replace(/Key[A-Z]$/, `Key${lettre}`) } : s;
}
