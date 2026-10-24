<script lang="ts">
  // Paramètres → service distant (le cerveau de Hameau, par exemple) : la clé d'accès et, au besoin, une autre adresse.
  // Elles restent sur cet appareil ; les plugins qui ont la permission « distant » appellent le service sans jamais les voir.
  import { appelerDistant, configDistant, enregistrerConfigDistant } from "$lib/distant";
  import { distribution } from "$lib/distribution";

  const depart = configDistant();
  let jeton = $state("");
  let url = $state(depart.url);
  let enregistree = $state(depart.jeton !== "");
  let message = $state("");
  let reussi = $state(false);
  let occupe = $state(false);

  const jetonEffectif = (): string => (jeton.trim() !== "" ? jeton.trim() : configDistant().jeton);

  function enregistrer(): void {
    enregistrerConfigDistant({ url, jeton: jetonEffectif() });
    const apres = configDistant();
    enregistree = apres.jeton !== "";
    jeton = "";
    reussi = enregistree;
    message = enregistree ? "Enregistré sur cet appareil." : "Cette clé n'a pas l'air valable : collez-la telle quelle, sans espace.";
  }

  async function essayer(): Promise<void> {
    occupe = true;
    message = "";
    const r = await appelerDistant("briefing", {}, { url, jeton: jetonEffectif() });
    occupe = false;
    reussi = r.ok;
    message = r.ok ? "Connexion réussie." : r.message;
  }
</script>

<div class="box">
  <h3>Clé d'accès</h3>
  <p class="hint">La clé vous a été donnée par le service (pour Hameau : envoyée par Max). Elle reste sur cet appareil.</p>
  <div class="champs">
    <label>
      Clé
      <input class="text-input" type="password" bind:value={jeton} placeholder={enregistree ? "Clé enregistrée (laissez vide pour la garder)" : "Collez votre clé"} autocomplete="off" spellcheck="false" />
    </label>
    <label>
      Adresse (facultatif)
      <input class="text-input" bind:value={url} placeholder={distribution.distant?.url ?? "https://…"} autocomplete="off" spellcheck="false" />
    </label>
    <div class="buttons">
      <button class="btn primary" onclick={enregistrer}>Enregistrer</button>
      <button class="btn" onclick={essayer} disabled={occupe || (!enregistree && jeton.trim() === "")}>{occupe ? "Essai…" : "Essayer"}</button>
    </div>
    {#if message}<p class:erreur={!reussi} class:ok={reussi} role="status">{message}</p>{/if}
  </div>
</div>

<style>
  .champs {
    display: grid;
    gap: 12px;
    max-width: 520px;
  }
  label {
    display: grid;
    gap: 4px;
    font-weight: 600;
  }
  .buttons {
    display: flex;
    gap: 8px;
  }
  .erreur {
    color: var(--danger, #c0392b);
  }
  .ok {
    color: var(--success, #2e7d32);
  }
</style>
