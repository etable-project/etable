<script lang="ts">
  // Paramètres → Intelligence artificielle : le service qui répond (Gemini ou le cerveau de l'utilisateur), la clé Gemini et l'accès au cerveau.
  // Tout reste sur ce poste (réglages du moteur) ; les plugins qui ont la permission « ia » demandent à l'IA, sans jamais voir la clé ni le jeton.
  import { cerveauConfigure, configIa, enregistrerConfigIa, MODELE_DEFAUT, MODELES, tester, type ConfigIa, type Fournisseur } from "$lib/ia";

  const depart = configIa();
  let fournisseur = $state<Fournisseur>(depart.fournisseur);
  let cle = $state("");
  let modele = $state(depart.modele);
  let urlCerveau = $state(depart.urlCerveau);
  let jetonCerveau = $state("");
  let cleEnregistree = $state(depart.cle !== "");
  let jetonEnregistre = $state(depart.jetonCerveau !== "");
  let message = $state("");
  let reussi = $state(false);
  let occupe = $state(false);

  /** La configuration telle qu'elle serait enregistrée : un champ secret laissé vide garde la valeur déjà enregistrée. */
  function saisie(): ConfigIa {
    const avant = configIa();
    return {
      fournisseur,
      cle: cle.trim() !== "" ? cle.trim() : avant.cle,
      modele,
      urlCerveau: urlCerveau.trim(),
      jetonCerveau: jetonCerveau.trim() !== "" ? jetonCerveau.trim() : avant.jetonCerveau,
    };
  }

  function enregistrer(): void {
    enregistrerConfigIa(saisie());
    const apres = configIa();
    cleEnregistree = apres.cle !== "";
    jetonEnregistre = apres.jetonCerveau !== "";
    urlCerveau = apres.urlCerveau;
    cle = jetonCerveau = "";
    if (fournisseur === "cerveau" && !cerveauConfigure(apres)) {
      reussi = false;
      message = "Pour le cerveau, il faut une adresse https et un jeton : vérifiez-les.";
      return;
    }
    reussi = true;
    message = "Enregistré sur ce poste.";
  }

  async function essayer(): Promise<void> {
    occupe = true;
    message = "";
    const resultat = await tester(saisie());
    occupe = false;
    reussi = resultat.ok;
    message = resultat.ok ? `${fournisseur === "cerveau" ? "Le cerveau" : "Gemini"} a répondu : tout fonctionne.` : resultat.message;
  }

  function retirer(quoi: "cle" | "jeton"): void {
    const c = configIa();
    enregistrerConfigIa(quoi === "cle" ? { ...c, cle: "" } : { ...c, jetonCerveau: "" });
    if (quoi === "cle") cleEnregistree = false;
    else jetonEnregistre = false;
    reussi = false;
    message = quoi === "cle" ? "Clé Gemini retirée de ce poste." : "Jeton du cerveau retiré de ce poste.";
  }
</script>

<div class="box">
  <h3>Qui répond</h3>
  <div class="choix" role="radiogroup" aria-label="Service d'IA">
    <label class="option"><input type="radio" bind:group={fournisseur} value="cerveau" /> <span><b>Mon cerveau</b> (modèle local, par Tailscale) : repas, recettes, listes. Rien ne sort de chez vous.</span></label>
    <label class="option"><input type="radio" bind:group={fournisseur} value="gemini" /> <span><b>Gemini</b> (Google, clé personnelle).</span></label>
  </div>
  <p class="hint">Les photos (tickets de caisse) passent toujours par Gemini quand une clé est enregistrée : le cerveau ne lit pas les images.</p>
</div>

<div class="box">
  <h3>Mon cerveau</h3>
  <p class="hint">L'adresse de votre cerveau et le jeton du client « quotidien » (panneau du cerveau → Accès). Tailscale doit être actif sur l'appareil.</p>
  <div class="champs">
    <label>Adresse<input class="text-input" bind:value={urlCerveau} placeholder="https://vm-cerveau2.tail11578e.ts.net" autocomplete="off" spellcheck="false" /></label>
    <label>
      Jeton
      <input class="text-input" type="password" bind:value={jetonCerveau} placeholder={jetonEnregistre ? "Jeton enregistré (laissez vide pour le garder)" : "cv_…"} autocomplete="off" spellcheck="false" />
    </label>
    {#if jetonEnregistre}<div class="buttons"><button class="btn" onclick={() => retirer("jeton")}>Retirer le jeton</button></div>{/if}
  </div>
</div>

<div class="box">
  <h3>Gemini (Google)</h3>
  <p class="hint">Créez une clé gratuite sur <b>aistudio.google.com</b> (« Get API key »), collez-la ici. Elle reste sur cet ordinateur.</p>
  <div class="champs">
    <label>
      Clé d'API
      <input class="text-input" type="password" bind:value={cle} placeholder={cleEnregistree ? "Clé enregistrée (laissez vide pour la garder)" : "Collez votre clé"} autocomplete="off" spellcheck="false" />
    </label>
    <label>
      Modèle
      <input class="text-input" list="modeles-ia" bind:value={modele} placeholder={MODELE_DEFAUT} autocomplete="off" />
      <datalist id="modeles-ia">{#each MODELES as m (m.id)}<option value={m.id}>{m.nom}</option>{/each}</datalist>
    </label>
    {#if cleEnregistree}<div class="buttons"><button class="btn" onclick={() => retirer("cle")}>Retirer la clé</button></div>{/if}
  </div>
</div>

<div class="box">
  <div class="buttons">
    <button class="btn primary" onclick={enregistrer}>Enregistrer</button>
    <button class="btn" onclick={essayer} disabled={occupe}>{occupe ? "Essai…" : "Essayer"}</button>
  </div>
  {#if message}<p class:erreur={!reussi} class:ok={reussi} role="status">{message}</p>{/if}
</div>

<div class="box">
  <h3>Ce qui est envoyé, et à qui</h3>
  <p class="hint">
    Avec le cerveau, vos demandes restent chez vous (votre serveur, par votre réseau privé). Avec Gemini, la photo d'un ticket ou votre demande part chez
    Google ; avec une clé gratuite, ses conditions permettent d'utiliser ces données pour améliorer ses produits : ne photographiez que ce que vous
    acceptez de partager. Rien n'est envoyé sans que vous le demandiez.
  </p>
</div>

<style>
  .choix {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 8px;
  }
  .option {
    flex-direction: row;
    align-items: flex-start;
    gap: 8px;
    font-weight: 400;
  }
  .champs {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 420px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
  }
  .text-input {
    width: 100%;
    height: 36px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    background: var(--field);
    font: 500 14px var(--font);
    color: var(--text);
    outline: none;
  }
  .text-input:focus {
    border-color: var(--accent);
    background: var(--surface);
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .erreur {
    margin: 0;
    color: var(--err);
    font-size: 13px;
  }
  .ok {
    margin: 0;
    color: var(--ok);
    font-size: 13px;
  }
  .hint {
    margin: 0 0 10px;
    color: var(--muted);
    font-size: 13px;
  }
</style>