<script lang="ts">
  // Paramètres → Trajets : mes domiciles (chez maman, chez mamie…) dont un principal, et la clé TomTom. Les jours sans mission, je suis
  // au domicile principal ; une mission d'intérim choisit son logement (Travail). Tout reste sur cet appareil ; les plugins qui ont la
  // permission « trajets » voient les NOMS des domiciles, jamais leurs adresses ni la clé.
  import { calculerTrajetDetaille, configTrajets, enregistrerConfigTrajets, type Domicile } from "$lib/trajets";

  const depart0 = configTrajets();
  let cle = $state("");
  let domiciles = $state<Domicile[]>(depart0.domiciles.map((d) => ({ ...d })));
  let principal = $state(depart0.principal);
  let sansPeage = $state(depart0.sansPeage);
  let enregistree = $state(depart0.cle !== "");
  let essaiVers = $state("");
  let message = $state("");
  let reussi = $state(false);
  let occupe = $state(false);

  const cleEffective = (): string => (cle.trim() !== "" ? cle.trim() : configTrajets().cle);
  const config = () => ({ cle: cleEffective(), depart: domiciles[0]?.adresse ?? "", sansPeage, domiciles: domiciles.filter((d) => d.nom.trim() && d.adresse.trim()), principal, pays: "FR" });

  function enregistrer(): void {
    enregistrerConfigTrajets(config());
    const apres = configTrajets();
    domiciles = apres.domiciles.map((d) => ({ ...d }));
    principal = apres.principal;
    enregistree = apres.cle !== "";
    cle = "";
    reussi = enregistree;
    message = enregistree ? "Enregistré sur cet appareil." : "Cette clé ne ressemble pas à une clé TomTom : collez-la telle quelle.";
  }

  async function essayer(): Promise<void> {
    occupe = true;
    message = "";
    const r = await calculerTrajetDetaille({ vers: essaiVers.trim() }, config());
    occupe = false;
    reussi = r.ok;
    message = r.ok
      ? `${r.minutes} min avec la circulation actuelle, ${r.distanceKm.toLocaleString("fr-FR")} km. Départ trouvé : ${r.depart || "?"}. Arrivée trouvée : ${r.arrivee || "?"}.`
      : r.message;
  }

</script>

<div class="box">
  <h3>Mes domiciles</h3>
  <p class="hint">Les endroits où vous dormez (chez maman, chez mamie…). Cochez le <b>domicile principal</b> : celui où vous êtes les jours sans mission. Pour une mission d'intérim loin, choisissez son logement dans Travail : le premier matin part du domicile principal, le soir du dernier jour vous y rentrez.</p>
  <div class="champs">
    {#each domiciles as d, i (i)}
      <div class="domicile">
        <label class="radio" title="Domicile principal"><input type="radio" name="principal" checked={principal === d.nom} onchange={() => ((principal = d.nom), enregistrer())} aria-label="{d.nom || 'Ce domicile'} est mon domicile principal" /></label>
        <input class="text-input nom" bind:value={d.nom} placeholder="Chez maman" aria-label="Nom du domicile" maxlength="40" />
        <input class="text-input" bind:value={d.adresse} placeholder="103 Route des crêtes, 64300 Castetner" aria-label="Adresse" autocomplete="street-address" />
        <button class="btn" onclick={() => (domiciles = domiciles.filter((_, j) => j !== i))} aria-label="Retirer {d.nom}">✕</button>
      </div>
    {/each}
    <p class="hint">◉ = domicile principal. Une adresse corrigée fait recalculer tous les trajets de l'agenda.</p>
    <div class="buttons">
      <button class="btn" onclick={() => (domiciles = [...domiciles, { nom: "", adresse: "" }])}>+ Domicile</button>
      <button class="btn primary" onclick={enregistrer}>Enregistrer</button>
    </div>
  </div>
</div>

<div class="box">
  <h3>Clé TomTom</h3>
  <p class="hint">Créez un compte gratuit sur <b>developer.tomtom.com</b>, copiez votre clé d'API (« API Key »), collez-la ici. Elle reste sur cet appareil.</p>
  <div class="champs">
    <label>
      Clé d'API
      <input class="text-input" type="password" bind:value={cle} placeholder={enregistree ? "Clé enregistrée (laissez vide pour la garder)" : "Collez votre clé"} autocomplete="off" spellcheck="false" />
    </label>
    <label class="case"><input type="checkbox" bind:checked={sansPeage} /> Éviter les péages</label>
    <div class="buttons"><button class="btn primary" onclick={enregistrer}>Enregistrer</button></div>
  </div>
</div>

<div class="box">
  <h3>Essayer</h3>
  <p class="hint">Vérifiez que les adresses sont bien trouvées : les deux adresses retenues par TomTom s'affichent.</p>
  <div class="champs">
    <label>
      Vers une adresse
      <input class="text-input" bind:value={essaiVers} placeholder="Armar, Anglet" autocomplete="off" />
    </label>
    <div class="buttons">
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
  .champs label.case {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  .domicile {
    display: grid;
    grid-template-columns: auto minmax(110px, 1fr) minmax(0, 2.5fr) auto;
    gap: 8px;
    align-items: center;
  }
  .champs label.radio {
    flex-direction: row;
  }
  @media (max-width: 640px) {
    .domicile {
      grid-template-columns: auto 1fr auto;
    }
    .domicile .text-input:not(.nom) {
      grid-column: 2 / 3;
    }
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
