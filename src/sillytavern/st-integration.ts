/**
 * SillyTavern Host Integration
 *
 * Reads ST's active preset / world info / character / API config
 * when running inside the ST extension layer.
 * All data is imported into our local IndexedDB and managed independently.
 */

import type { Lorebook, ChatPreset, AppSettings, StConnectionProfile } from './types';
import { importLorebook, importPreset } from './importer';
import { isInSillyTavern } from '../env';

// Re-export for convenience
export { isInSillyTavern };

// ---- Type for ST character object (partial — what we need) ----

interface StCharacter {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  data?: {
    character_version?: string;
    worldinfo?: Record<string, any>;
  };
}

interface StContext {
  characters?: StCharacter[];
  characterId?: string | number;
  chat?: Array<{ is_user: boolean; mes: string; send_date: number }>;
}

// ---- 1. Read ST active character ----

export function readStCharacter(): { name: string; description: string; personality: string; scenario: string } | null {
  try {
    const ctx = (window as any).SillyTavern?.getContext() as StContext | undefined;
    if (!ctx?.characters?.length) return null;

    const idx = typeof ctx.characterId === 'number' ? ctx.characterId : 0;
    const char = ctx.characters[idx] || ctx.characters[0];
    if (!char) return null;

    return {
      name: char.name || 'AI',
      description: char.description || '',
      personality: char.personality || '',
      scenario: char.scenario || '',
    };
  } catch {
    return null;
  }
}

// ---- 2. Detect ST's API connection profile ----

/**
 * Try to read ST's active API connection profile.
 * ST stores connection profiles in its settings / localStorage.
 */
export function detectStConnection(): StConnectionProfile | null {
  try {
    // ST stores API settings in the global context or localStorage
    const st = (window as any).SillyTavern;
    if (!st) return null;

    // Try to read from ST's settings object
    const ctx = st.getContext() as any;

    // Attempt 1: direct context properties (varies by ST version)
    if (ctx.apiUrl) {
      return {
        baseUrl: ctx.apiUrl.replace(/\/+$/, ''),
        apiKey: ctx.apiKey || '',
        model: ctx.model || 'gpt-3.5-turbo',
      };
    }

    // Attempt 2: read from ST's localStorage profiles
    const settingsRaw = localStorage.getItem('SillyTavern_settings');
    if (settingsRaw) {
      const settings = JSON.parse(settingsRaw);
      const api = settings?.api || settings?.openai || settings?.connection || {};

      // Check OpenAI-compatible provider
      const baseUrl = api.base_url || api.url || api.baseUrl || '';
      const apiKey = api.api_key || api.key || api.apiKey || '';

      if (baseUrl && apiKey) {
        return {
          baseUrl: baseUrl.replace(/\/+$/, ''),
          apiKey,
          model: api.model || api.chat_model || 'gpt-3.5-turbo',
        };
      }
    }

    // Attempt 3: try ST's per-profile settings
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.includes('api') && key.includes('SillyTavern')) {
        try {
          const val = JSON.parse(localStorage.getItem(key) || '');
          if (val?.api_key && val?.base_url) {
            return {
              baseUrl: val.base_url.replace(/\/+$/, ''),
              apiKey: val.api_key,
              model: val.model || 'gpt-3.5-turbo',
            };
          }
        } catch { /* continue */ }
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ---- 3. Read ST's active preset ----

/**
 * Build a ChatPreset from ST's active settings.
 * We only need the prompt assembly fields — sampling params stay defaults.
 */
export function readStPreset(): { preset: Omit<ChatPreset, 'id' | 'createdAt' | 'updatedAt'>; characterOverrides: Record<string, string> } | null {
  try {
    const ctx = (window as any).SillyTavern?.getContext() as any;
    if (!ctx) return null;

    const characterOverrides: Record<string, string> = {};

    // Try to read character description/personality from ST's active character
    const char = readStCharacter();
    if (char) {
      if (char.description) characterOverrides.character_description = char.description;
      if (char.personality) characterOverrides.character_personality = char.personality;
      if (char.scenario) characterOverrides.scenario = char.scenario;
    }

    // Try to read from ST's power-user settings / extensions
    const stSettingsRaw = localStorage.getItem('SillyTavern_settings');
    let stSettings: any = {};
    if (stSettingsRaw) {
      try { stSettings = JSON.parse(stSettingsRaw); } catch { /* ignore */ }
    }

    // Build a minimal preset from ST's available data
    const presetName = char?.name
      ? `${char.name} 的 ST 预设`
      : 'ST 导入预设';

    const settings: Record<string, any> = {
      ...stSettings,
      // Inject character fields
      ...characterOverrides,
      // Fallback main prompt
      main: stSettings.main || stSettings.main_prompt || 'Write {{char}}\'s next reply in a fictional chat between {{char}} and {{user}}.',
      temp_openai: stSettings.temp_openai ?? stSettings.temperature ?? 0.8,
      openai_max_context: stSettings.openai_max_context ?? stSettings.max_context ?? 4096,
      openai_max_tokens: stSettings.openai_max_tokens ?? stSettings.max_tokens ?? 2048,
      openai_model: stSettings.openai_model ?? 'gpt-3.5-turbo',
      chat_completion_source: 'openai',
    };

    // Preserve ST's prompt_order if available
    if (stSettings.prompt_order && Array.isArray(stSettings.prompt_order)) {
      settings.prompt_order = stSettings.prompt_order;
    }

    // Preserve ST's custom prompts
    if (stSettings.prompts && Array.isArray(stSettings.prompts)) {
      settings.prompts = stSettings.prompts;
    }

    return {
      preset: { name: presetName, settings },
      characterOverrides,
    };
  } catch {
    return null;
  }
}

// ---- 4. Read ST's world info (lorebook) ----

export function readStWorldInfo(): Array<Omit<Lorebook, 'id' | 'createdAt' | 'updatedAt'>> {
  const books: Array<Omit<Lorebook, 'id' | 'createdAt' | 'updatedAt'>> = [];

  try {
    // Attempt 1: read from ST context
    const ctx = (window as any).SillyTavern?.getContext() as any;
    if (ctx?.worldInfo) {
      const raw = ctx.worldInfo;
      if (typeof raw === 'object') {
        try {
          const imported = importLorebook({ name: 'ST 世界书', entries: raw.entries || raw });
          books.push(imported);
        } catch { /* ignore */ }
      }
    }

    // Attempt 2: read from localStorage (ST's world info storage)
    const wiRaw = localStorage.getItem('SillyTavern_worldinfo');
    if (wiRaw) {
      try {
        const wi = JSON.parse(wiRaw);
        if (wi?.entries) {
          const imported = importLorebook({ name: 'ST 世界书', entries: wi.entries });
          books.push(imported);
        }
      } catch { /* ignore */ }
    }

    // Attempt 3: character-embedded world info
    const char = readStCharacter();
    // We'll handle this case by reading from the character data if available
  } catch { /* ignore */ }

  return books;
}

// ---- 5. Full sync: run once on init ----

export interface StSyncResult {
  connected: boolean;
  characterName: string | null;
  importedPreset: boolean;
  importedLorebooks: number;
  apiProfile: StConnectionProfile | null;
}

/**
 * One-shot sync from ST host into our IndexedDB.
 * Safe to call multiple times — only imports if data doesn't exist.
 */
export async function syncFromSt(
  context: {
    getSettings: () => Promise<AppSettings | undefined>;
    saveSettings: (s: AppSettings) => Promise<void>;
    getPresets: () => Promise<ChatPreset[]>;
    savePreset: (p: ChatPreset) => Promise<string>;
    getLorebooks: () => Promise<Lorebook[]>;
    saveLorebook: (l: Lorebook) => Promise<string>;
  }
): Promise<StSyncResult> {
  const result: StSyncResult = {
    connected: isInSillyTavern(),
    characterName: null,
    importedPreset: false,
    importedLorebooks: 0,
    apiProfile: null,
  };

  if (!isInSillyTavern()) return result;

  // A. Detect ST API connection
  result.apiProfile = detectStConnection();

  // B. Update settings with ST character name + API mode
  const settings = await context.getSettings();
  if (settings) {
    const char = readStCharacter();
    let updated = false;

    if (char?.name) {
      result.characterName = char.name;
      settings.characterName = char.name;
      updated = true;
    }

    // Default to st-builtin when running inside ST
    if (!settings.apiSource || settings.apiSource === 'custom') {
      settings.apiSource = 'st-builtin';
      updated = true;
    }

    if (updated) {
      await context.saveSettings(settings);
    }
  }

  // C. Import preset from ST (only if none exist)
  const existingPresets = await context.getPresets();
  if (existingPresets.length === 0) {
    const stPreset = readStPreset();
    if (stPreset) {
      const preset: ChatPreset = {
        ...stPreset.preset,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await context.savePreset(preset);
      result.importedPreset = true;
    }
  }

  // D. Import world info from ST (only if none exist)
  const existingBooks = await context.getLorebooks();
  if (existingBooks.length === 0) {
    const stBooks = readStWorldInfo();
    for (const book of stBooks) {
      const lb: Lorebook = {
        ...book,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await context.saveLorebook(lb);
      result.importedLorebooks++;
    }
  }

  return result;
}
