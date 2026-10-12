<script lang="ts">
  // En-tête d'une page de plugin : le moteur ne dessine plus de titre, chaque page trace le sien.
  import type { Snippet } from "svelte";

  interface Props {
    titre: string;
    /** Boutons à droite du titre. */
    actions?: Snippet;
  }

  let { titre, actions }: Props = $props();
</script>

<header>
  <h1>{titre}</h1>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    flex-direction: column;
    justify-content: center;
    gap: 10px 16px;
  }
  /* Le titre est déjà affiché par la barre de l'application : gardé pour les lecteurs d'écran, sans place à l'écran. */
  h1 {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.03em;
    text-align: center;
  }
  .actions {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>