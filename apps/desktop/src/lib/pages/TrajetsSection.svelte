<script lang="ts">
  // Paramètres → Trajets : la clé TomTom et l'adresse de départ. Elles restent sur cet appareil ; les plugins qui ont la permission
  // « trajets » demandent un temps de trajet sans jamais voir la clé.
  import { calculerTrajet, configTrajets, enregistrerConfigTrajets } from "$lib/trajets";

  const depart0 = configTrajets();
  let cle = $state("");
  let depart = $state(depart0.depart);
  let enregistree = $state(depart0.cle !== "");
  let essaiVers = $state("");
  let message = $state("");
  let reussi = $state(false);
  let occupe = $state(false);

  const cleEffective = (): string => (cle.trim() !== "" ? cle.trim() : configTrajets().cle);

  function enregistrer(): void {
    enregistrerConfigTrajets({ cle: cleEffective(), depart });
    const apres = configTrajets();
    enregistree = apres.cle !== "";
    cle = "";
    reussi = enregistree;
    message = enregistree ? "Enregistré sur cet appareil." : "Cette clé ne ressemble pas à une clé TomTom : collez-la telle quelle.";
  }

  async function essayer(): Promise<void> {
    occupe = true;
    message = "";
    const r = await calculerTrajet({ vers: essaiVers.trim() || depart }, { cle: cleEffective(), depart });
    occupe = false;
    reussi = r.ok;
    message = r.ok ? `Trajet trouvé : ${r.minutes} min avec la circulation actuelle, ${r.distanceKm.toLocaleString("fr-FR")} km.` : r.message;
  }
</script>

<div class="box">
  <h3>Clé TomTom</h3>
  <p class="hint">Créez un compte gratuit sur <b>developer.tomtom.com</b>, copiez votre clé d'API (« API Key »), collez-la ici. Elle reste sur cet appareil.</p>
  <div class="champs">
    <label>
      Clé d'API
      <input class="text-input" type="password" bind:value={cle} placeholder={enregistree ? "Clé enregistrée (laissez vide pour la garder)" : "Collez votre clé"} autocomplete="off" spellcheck="false" />
    </label>
    <label>
      Adresse de départ (domicile)
      <input class="text-input" bind:value={depart} placeholder="12 rue des Lilas, 69003 Lyon" autocomplete="street-address" />
    </label>
    <label>
      Essayer vers une adresse
      <input class="text-input" bind:value={essaiVers} placeholder="Gare de la Part-Dieu, Lyon" autocomplete="off" />
    </label>
    <div class="buttons">
      <button class="btn primary" onclick={enregistrer}>Enregistrer</button>
      <button class="btn" onclick={essayer} disabled={occupe || (!enregistree && cle.trim() === "") || essaiVers.trim() === ""}>{occupe ? "Calcul…" : "Essayer"}</button>
    </div>
    {#if message}<p class:erreur={!reussi} class:ok={reussi} role="status">{message}</p>{/if}
  </div>
</div>

<div class="box">
  <h3>Ce qui est envoyé à TomTom</h3>
  <p class="hint">Pour calculer un trajet, l'adresse de départ et celle d'arrivée partent chez TomTom, seulement quand un trajet est demandé. Le bouton « Ouvrir dans Waze » ne passe pas par TomTom.</p>
</div>

<style>
  .champs {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .champs label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .erreur {
    color: var(--err);
  }
  .ok {
    color: var(--ok);
  }
</style>