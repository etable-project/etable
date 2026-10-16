<script lang="ts">
  import { distribution } from "$lib/distribution";
  const nom = distribution.name;
  import { api } from "$lib/api";
  import Board from "$lib/components/Board.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { allPages } from "$lib/plugins/registry.svelte";
  import { installation } from "$lib/state/installation.svelte";
  import { tabs } from "$lib/state/tabs.svelte";
  import { ui } from "$lib/state/ui.svelte";

  // L'accueil n'affiche que les widgets ; une page se cherche avec l'aperçu rapide (raccourci clavier).
  ui.focusSearch = false;
</script>
{#if !allPages().length}
  <!-- Premier lancement (l'installateur ne contient aucun plugin) : bienvenue et installation depuis un fichier. -->
  <div class="page">
    <div class="welcome">
      <div class="mark"><Icon name="store" size={30} /></div>
      <h1>Bienvenue dans {nom}</h1>
      <p>
        {nom} est un moteur de plugins : chaque plugin ajoute ses pages et ses réglages. Installez ceux dont vous
        avez besoin, depuis un fichier signé.
      </p>
      {#if api.capacites.plugins}
        <button class="btn primary big" onclick={() => void installation.installFile()}>
          <Icon name="package" size={18} /> Installer un plugin depuis un fichier…
        </button>
        <button class="link" onclick={() => tabs.navigate({ kind: "plugins" })}>Ouvrir la page des plugins</button>
        <p class="hint">Les plugins sont signés : {nom} vérifie chaque installation.</p>
      {:else if api.id === "serveur"}
        <p class="hint">Aucun plugin n'est encore disponible sur ce serveur : demandez à l'administrateur d'en installer (Paramètres → Administration).</p>
      {/if}
    </div>
  </div>
{:else}
<div class="page">
  <Board />
</div>
{/if}

<style>
  .welcome {
    max-width: 620px;
    margin: 48px auto 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    text-align: center;
  }
  .welcome .mark {
    width: 64px;
    height: 64px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .welcome h1 {
    font-size: 26px;
  }
  .welcome p {
    margin: 0;
    color: var(--muted);
    max-width: 52ch;
  }
  .welcome .hint {
    color: var(--faint);
  }
  .big {
    height: 44px;
    padding: 0 20px;
    font-size: 15px;
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    color: var(--accent);
    font-weight: 500;
  }
</style>
