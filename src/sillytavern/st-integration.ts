/**
 * SillyTavern Host Integration
 *
 * Reads ST's active preset / world info / character / API config
 * when running inside the ST extension layer.
 * All data is imported into our local IndexedDB and managed independently.
 */

import type { Lorebook, ChatPreset, AppSettings } from './types';
import { importLorebook } from './importer';
import { isInSillyTavern } from '../env';

export { isInSillyTavern };

/** Deep clone via JSON to strip non-structurally-cloneable values before IndexedDB write. */
function sanitize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

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
  };

  if (!isInSillyTavern()) return result;

  // A. Update settings with ST character name
  const settings = await context.getSettings();
  if (settings) {
    const char = readStCharacter();
    if (char?.name && settings.characterName === 'AI') {
      settings.characterName = char.name;
      await context.saveSettings(sanitize(settings));
    }
    result.characterName = char?.name || null;
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
      await context.savePreset(sanitize(preset));
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
      await context.saveLorebook(sanitize(lb));
      result.importedLorebooks++;
    }
  }

  return result;
}
