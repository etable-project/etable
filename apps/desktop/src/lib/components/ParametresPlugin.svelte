<script lang="ts">
  // Les paramètres d'un plugin, faits par le moteur à partir de ce que le plugin déclare : un champ par paramètre,
  // réuni par groupe. Le plugin n'a aucun écran de réglages à écrire.
  import { parametres } from "$lib/state/parametres.svelte";
  import type { ParameterManifest, PluginManifest } from "$lib/types";
  import Switch from "./Switch.svelte";

  let { plugin }: { plugin: PluginManifest } = $props();

  const valeurs = $derived(parametres.valeurs(plugin));
  /** Les paramètres consécutifs du même groupe sont réunis sous un seul titre. */
  const groupes = $derived(
    plugin.parameters.reduce<{ titre: string; liste: ParameterManifest[] }[]>((acc, p) => {
      const dernier = acc[acc.length - 1];
      if (dernier && dernier.titre === p.group) dernier.liste.push(p);
      else acc.push({ titre: p.group, liste: [p] });
      return acc;
    }, []),
  );

  // Tout s'enregistre dès qu'un champ change : une coche le confirme à côté du champ, une seconde et demie.
  let enregistre = $state<string | null>(null);
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  function definir(id: string, v: string | number | boolean): void {
    parametres.definir(plugin, id, v);
    enregistre = id;
    clearTimeout(minuteur);
    minuteur = setTimeout(() => (enregistre = null), 1500);
  }
  /** « Rétablir » efface tous les réglages du plugin : un deuxième clic le confirme. */
  let confirmer = $state(false);

  /** Saisie numérique : la virgule française est acceptée ; une saisie qui ne convient pas revient à la valeur réglée. */
  function nombre(event: Event, p: Extract<ParameterManifest, { type: "number" }>): void {
    const champ = event.currentTarget as HTMLInputElement;
    const v = Number(champ.value.replace(",", ".").trim());
    if (champ.value.trim() === "" || !Number.isFinite(v) || (p.min !== null && v < p.min) || (p.max !== null && v > p.max)) {
      champ.value = String(valeurs[p.id]);
      return;
    }
    definir(p.id, v);
  }
</script>

<div class="params">
  {#each groupes as groupe (groupe.titre + groupe.liste[0]!.id)}
    <div class="box">
      {#if groupe.titre}<h3>{groupe.titre}</h3>{/if}
      {#each groupe.liste as p (p.id)}
        <div class="setting">
          <label class="text" for={`p-${p.id}`}>
            <b>{p.label}</b>
            {#if p.hint}<small>{p.hint}</small>{/if}
          </label>
          {#if p.type === "number"}
            <span class="champ">
              <input
                id={`p-${p.id}`}
                class="num"
                inputmode="decimal"
                value={String(valeurs[p.id]).replace(".", ",")}
                onchange={(e) => nombre(e, p)}
              />
              {#if p.unit}<span class="unit">{p.unit}</span>{/if}
            </span>
          {:else if p.type === "text"}
            <input id={`p-${p.id}`} class="texte" value={String(valeurs[p.id])} onchange={(e) => definir(p.id, e.currentTarget.value)} />
          {:else if p.type === "time"}
            <input id={`p-${p.id}`} class="heure" type="time" value={String(valeurs[p.id])} onchange={(e) => e.currentTarget.value && definir(p.id, e.currentTarget.value)} />
          {:else if p.type === "boolean"}
            <Switch checked={valeurs[p.id] === true} label={p.label} onchange={(v) => definir(p.id, v)} />
          {:else}
            <select id={`p-${p.id}`} value={String(valeurs[p.id])} onchange={(e) => definir(p.id, e.currentTarget.value)}>
              {#each p.options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
            </select>
          {/if}
          <span class="coche" class:on={enregistre === p.id} aria-live="polite">{enregistre === p.id ? "✓" : ""}</span>
        </div>
      {/each}
    </div>
  {/each}
  <p class="aide">Chaque réglage s'enregistre dès que vous le changez.</p>
  <div class="buttons">
    {#if confirmer}
      <button class="btn primary" onclick={() => ((confirmer = false), parametres.retablir(plugin))}>Oui, tout remettre par défaut</button>
      <button class="btn" onclick={() => (confirmer = false)}>Annuler</button>
    {:else}
      <button class="btn" onclick={() => (confirmer = true)}>Rétablir les valeurs par défaut…</button>
    {/if}
  </div>
</div>

<style>
  .params {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .champ {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .unit {
    color: var(--muted);
    font-size: 13px;
  }
  .num {
    width: 110px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .texte {
    width: min(340px, 45vw);
  }
  .coche {
    width: 14px;
    color: var(--ok);
    font-weight: 700;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .coche.on {
    opacity: 1;
  }
  .aide {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }
  .heure {
    width: 120px;
  }
  input,
  select {
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--field);
    color: var(--text);
    font: inherit;
  }
  input:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .setting {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 6px 0;
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    cursor: default;
  }
  .text b {
    font-weight: 600;
  }
  .text small {
    color: var(--muted);
    font-size: 12.5px;
  }
  .buttons {
    display: flex;
    gap: 8px;
  }
</style>
