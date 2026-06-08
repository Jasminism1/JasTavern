/**
 * Preset Store (Pinia)
 *
 * SINGLE SOURCE OF TRUTH for all preset management.
 * - Wraps Dexie (SillyTavernWebDB) for persistence
 * - Every mutation writes to Dexie immediately
 * - Reactive state shared by PresetPanel and useSillytavern
 * - No stale-cache problem — always reads from the same refs
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  getPresets, savePreset, deletePreset as dbDeletePreset,
  getSettings, saveSettings,
} from '../sillytavern/database';
import { importPreset, exportPreset, createEmptyPreset } from '../sillytavern/preset-importer';
import type { ChatPreset, StructuredPreset } from '../sillytavern/types';

export const usePresetStore = defineStore('preset', () => {
  // ---- state ----
  const presets = ref<ChatPreset[]>([]);
  const activePresetId = ref<string | null>(null);
  const loaded = ref(false);

  // ---- computed ----
  const activePreset = computed(() =>
    presets.value.find(p => p.id === activePresetId.value) || null);

  /** Structured preset extracted from active (null if legacy / no active). */
  const activeStructured = computed<StructuredPreset | null>(() => {
    const ap = activePreset.value;
    if (!ap) return null;
    return ap.settings?._structuredPreset || null;
  });

  // ---- init ----
  async function loadAll(): Promise<void> {
    const [p, s] = await Promise.all([getPresets(), getSettings()]);
    presets.value = p;
    activePresetId.value = s?.activePresetId || null;
    loaded.value = true;
  }

  // ---- CRUD ----
  async function create(name?: string): Promise<ChatPreset> {
    const sp = createEmptyPreset();
    if (name) sp.name = name;
    const cp: ChatPreset = {
      id: crypto.randomUUID(),
      name: sp.name,
      description: sp.description,
      settings: {
        _structuredPreset: sp,
        temp_openai: sp.sampling.temperature,
        top_p_openai: sp.sampling.top_p,
        freq_pen_openai: sp.sampling.frequency_penalty,
        pres_pen_openai: sp.sampling.presence_penalty,
        openai_max_context: sp.messaging.max_context,
        openai_max_tokens: sp.messaging.max_tokens,
        stream_openai: sp.messaging.stream,
        prompt_order: [],
        prompts: [],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await savePreset(cp);
    presets.value.push(cp);
    return cp;
  }

  /** Save (create or update) a preset with its structured data. */
  async function save(structured: StructuredPreset, id?: string): Promise<ChatPreset> {
    const existing = id ? presets.value.find(p => p.id === id) : null;
    const cp: ChatPreset = {
      id: id || crypto.randomUUID(),
      name: structured.name,
      description: structured.description,
      settings: {
        _structuredPreset: structured,
        temp_openai: structured.sampling.temperature,
        top_p_openai: structured.sampling.top_p,
        freq_pen_openai: structured.sampling.frequency_penalty,
        pres_pen_openai: structured.sampling.presence_penalty,
        openai_max_context: structured.messaging.max_context,
        openai_max_tokens: structured.messaging.max_tokens,
        stream_openai: structured.messaging.stream,
        prompt_order: structured.promptBlocks
          .filter(b => b.enabled)
          .map(b => ({ identifier: b.identifier, name: b.name, role: b.role, enabled: true })),
        prompts: structured.promptBlocks
          .filter(b => b.enabled)
          .map(b => ({ identifier: b.identifier, role: b.role, content: b.content })),
      },
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    await savePreset(cp);
    // Replace or append in reactive array
    const idx = presets.value.findIndex(p => p.id === cp.id);
    if (idx >= 0) {
      presets.value[idx] = cp;
    } else {
      presets.value.push(cp);
    }
    return cp;
  }

  /** Import from JSON text. */
  async function importFromJson(jsonText: string, fileName?: string): Promise<ChatPreset> {
    const data = JSON.parse(jsonText);
    const result = importPreset(data);
    const name = fileName?.replace(/\.json$/i, '') || result.preset.name;
    result.preset.name = name;
    return save(result.preset);
  }

  /** Delete a preset by id. */
  async function remove(id: string): Promise<void> {
    await dbDeletePreset(id);
    presets.value = presets.value.filter(p => p.id !== id);
    if (activePresetId.value === id) {
      await setActive(null);
    }
  }

  /** Activate a preset. Pass null to deactivate. */
  async function setActive(id: string | null): Promise<void> {
    activePresetId.value = id;
    const s = await getSettings();
    if (s) {
      await saveSettings({ ...s, activePresetId: id });
    }
  }

  // ---- auto-load ----
  loadAll();

  return {
    presets,
    activePresetId,
    activePreset,
    activeStructured,
    loaded,
    loadAll,
    create,
    save,
    importFromJson,
    remove,
    setActive,
  };
});
