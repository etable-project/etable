<script lang="ts">
  // Un bloc de page (titre, ligne d'explication, contenu) avec, en haut à droite, un bouton « + » qui ouvre sa grande fenêtre :
  // réglages, historique, ou simplement la même chose en plus grand. Sans `grand`, pas de bouton.
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";
  import Modal from "./Modal.svelte";

  interface Props {
    titre: string;
    sousTitre?: string;
    children: Snippet;
    /** Contenu de la grande fenêtre ouverte par « + ». */
    grand?: Snippet;
    /** Titre de la grande fenêtre (par défaut celui du bloc). */
    titreGrand?: string;
    /** Largeur maximale de la grande fenêtre, en pixels. */
    largeur?: number;
    /** Boutons en bas de la grande fenêtre. */
    pied?: Snippet;
    classe?: string;
    /** Ouverture de la grande fenêtre, pilotable de l'extérieur. */
    ouvert?: boolean;
  }

  let { titre, sousTitre, children, grand, titreGrand, largeur = 760, pied, classe = "", ouvert = $bindable(false) }: Props = $props();
</script>

<section class="bloc {classe}">
  <header class="bloc-tete">
    <p class="etiquette">{titre}</p>
    {#if grand}
      <button class="bloc-plus" onclick={() => (ouvert = true)} aria-label={`Ouvrir ${titre} en grand`} title="Voir en grand et régler">
        <Icon name="plus" size={15} />
      </button>
    {/if}
  </header>
  {#if sousTitre}<p class="petit">{sousTitre}</p>{/if}
  {@render children()}
</section>

{#if grand}
  <Modal open={ouvert} titre={titreGrand ?? titre} {largeur} onclose={() => (ouvert = false)} {pied}>
    {@render grand()}
  </Modal>
{/if}

<style>
  .bloc-tete {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }
  .bloc-tete .etiquette {
    margin: 0;
  }
  .bloc-plus {
    flex: none;
    width: 26px;
    height: 26px;
    margin: -4px -4px 0 0;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-2);
    color: var(--muted);
    cursor: pointer;
  }
  .bloc-plus:hover {
    color: var(--text);
    border-color: var(--muted);
  }
</style>
