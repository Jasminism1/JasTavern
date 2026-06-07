/**
 * SillyTavern Host Integration
 *
 * Dual-path data access:
 *   Path A (iframe + postMessage): layer0.html reads ST data on top window,
 *     serializes it, and sends via postMessage into the cross-origin iframe.
 *   Path B (direct injection): runs on ST's window, reads window.SillyTavern directly.
 *
 * All data is imported into our local IndexedDB and managed independently.
 */

import type { Lorebook, ChatPreset, AppSettings } from './types';
import { importLorebook } from './importer';

// ---- Bridged ST data (populated via postMessage) ----

interface StBridgedChar {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
}

interface StBridgedChatMsg {
  is_user: boolean;
  mes: string;
  send_date: number;
}

interface StBridgedData {
  characters?: StBridgedChar[];
  characterId?: string | number;
  worldInfo?: any;
  worldInfoString?: string | null;
  settings?: any;
  settingsString?: string | null;
  chat?: StBridgedChatMsg[];
}

let bridgeData: StBridgedData | null = null;
let bridgeReceived = false;

export { bridgeReceived as hasStBridgeData };

/** Called on app init to listen for postMessage from layer0.html */
export function listenForStBridge() {
  if (bridgeReceived) return;

  window.addEventListener('message', (event) => {
    if (!event.data || event.data.type !== 'st-context') return;
    if (!event.data.data || typeof event.data.data !== 'object') return;

    bridgeData = event.data.data;
    bridgeReceived = true;
    const bd = bridgeData;
    console.log('[st-integration] Received ST bridge data via postMessage:', {
      charCount: bd.characters?.length || 0,
      hasWorldInfo: !!bd.worldInfo || !!bd.worldInfoString,
      hasSettings: !!bd.settings || !!bd.settingsString,
      chatCount: bd.chat?.length || 0,
    });
  });
}

// ---- Detect ST environment ----

export function isInSillyTavern(): boolean {
  if (bridgeReceived) return true;
  return typeof window !== 'undefined' && typeof (window as any).SillyTavern !== 'undefined';
}

// ---- Helpers ----

function sanitize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

function getChar(idx?: string | number): StBridgedChar | null {
  if (bridgeData?.characters?.length) {
    const i = typeof idx === 'number' ? idx : 0;
    return bridgeData.characters[i] || bridgeData.characters[0] || null;
  }
  return null;
}

// ---- 1. Read ST active character ----

export function readStCharacter(): { name: string; description: string; personality: string; scenario: string } | null {
  // Path A: bridged data
  if (bridgeData?.characters?.length) {
    const idx = typeof bridgeData.characterId === 'number' ? bridgeData.characterId : 0;
    const char = bridgeData.characters[idx] || bridgeData.characters[0];
    if (char) {
      return {
        name: char.name || 'AI',
        description: char.description || '',
        personality: char.personality || '',
        scenario: char.scenario || '',
      };
    }
  }

  // Path B: direct access
  try {
    const ctx = (window as any).SillyTavern?.getContext();
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

// ---- 2. Read ST's active preset ----

export function readStPreset(): { preset: Omit<ChatPreset, 'id' | 'createdAt' | 'updatedAt'>; characterOverrides: Record<string, string> } | null {
  let stSettings: any = {};
  const characterOverrides: Record<string, string> = {};

  // Path A: bridged data
  if (bridgeData) {
    if (bridgeData.settings) {
      stSettings = bridgeData.settings;
    } else if (bridgeData.settingsString) {
      try { stSettings = JSON.parse(bridgeData.settingsString); } catch { /* ignore */ }
    }
    const char = getChar();
    if (char) {
      if (char.description) characterOverrides.character_description = char.description;
      if (char.personality) characterOverrides.character_personality = char.personality;
      if (char.scenario) characterOverrides.scenario = char.scenario;
    }
  } else {
    // Path B: direct access
    try {
      const stRaw = localStorage.getItem('SillyTavern_settings');
      if (stRaw) {
        try { stSettings = JSON.parse(stRaw); } catch { /* ignore */ }
      }
      const char = readStCharacter();
      if (char) {
        if (char.description) characterOverrides.character_description = char.description;
        if (char.personality) characterOverrides.character_personality = char.personality;
        if (char.scenario) characterOverrides.scenario = char.scenario;
      }
    } catch { /* ignore */ }
  }

  if (!stSettings || Object.keys(stSettings).length === 0) {
    // No ST data at all — return null so the default preset is used
    return null;
  }

  const char = getChar() || readStCharacter();
  const presetName = char?.name ? `${char.name} 的 ST 预设` : 'ST 导入预设';

  const settings: Record<string, any> = {
    main: stSettings.main || stSettings.main_prompt || 'Write {{char}}\'s next reply in a fictional chat between {{char}} and {{user}}.',
    temp_openai: stSettings.temp_openai ?? stSettings.temperature ?? 0.8,
    openai_max_context: stSettings.openai_max_context ?? stSettings.max_context ?? 4096,
    openai_max_tokens: stSettings.openai_max_tokens ?? stSettings.max_tokens ?? 2048,
    openai_model: stSettings.openai_model ?? 'gpt-3.5-turbo',
    chat_completion_source: 'openai',
  };

  // Only copy safe ST settings (strings, numbers) — skip complex objects
  const SAFE_KEYS = [
    'main', 'nsfw', 'jailbreak', 'enhanceDefinitions', 'impersonation_prompt',
    'new_chat_prompt', 'new_group_chat_prompt', 'new_example_chat_prompt',
    'continue_nudge_prompt', 'wi_format', 'group_nudge_prompt',
    'scenario_format', 'personality_format',
  ];
  for (const key of SAFE_KEYS) {
    if (typeof stSettings[key] === 'string' && stSettings[key].trim()) {
      settings[key] = stSettings[key];
    }
  }

  if (characterOverrides.character_description) settings.character_description = characterOverrides.character_description;
  if (characterOverrides.character_personality) settings.character_personality = characterOverrides.character_personality;
  if (characterOverrides.scenario) settings.scenario = characterOverrides.scenario;

  if (Array.isArray(stSettings.prompt_order)) {
    settings.prompt_order = stSettings.prompt_order.map((item: any) => ({
      identifier: item.identifier || '',
      name: item.name || '',
      role: item.role || 'system',
      enabled: item.enabled !== false,
    }));
  }

  if (Array.isArray(stSettings.prompts)) {
    settings.prompts = stSettings.prompts.map((p: any) => ({
      identifier: p.identifier || '',
      role: p.role || 'system',
      content: typeof p.content === 'string' ? p.content : '',
    }));
  }

  return { preset: { name: presetName, settings }, characterOverrides };
}

// ---- 3. Read ST's world info (lorebook) ----

export function readStWorldInfo(): Array<Omit<Lorebook, 'id' | 'createdAt' | 'updatedAt'>> {
  const books: Array<Omit<Lorebook, 'id' | 'createdAt' | 'updatedAt'>> = [];

  // Path A: bridged data
  if (bridgeData) {
    if (bridgeData.worldInfo && typeof bridgeData.worldInfo === 'object') {
      try {
        const raw = bridgeData.worldInfo;
        const imported = importLorebook({ name: 'ST 世界书', entries: raw.entries || raw });
        books.push(imported);
      } catch { /* ignore */ }
    }
    if (bridgeData.worldInfoString) {
      try {
        const wi = JSON.parse(bridgeData.worldInfoString);
        if (wi?.entries) {
          const imported = importLorebook({ name: 'ST 世界书', entries: wi.entries });
          books.push(imported);
        }
      } catch { /* ignore */ }
    }
    return books;
  }

  // Path B: direct access
  try {
    const ctx = (window as any).SillyTavern?.getContext();
    if (ctx?.worldInfo && typeof ctx.worldInfo === 'object') {
      const raw = ctx.worldInfo;
      try {
        const imported = importLorebook({ name: 'ST 世界书', entries: raw.entries || raw });
        books.push(imported);
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  try {
    const wiRaw = localStorage.getItem('SillyTavern_worldinfo');
    if (wiRaw) {
      const wi = JSON.parse(wiRaw);
      if (wi?.entries) {
        const imported = importLorebook({ name: 'ST 世界书', entries: wi.entries });
        books.push(imported);
      }
    }
  } catch { /* ignore */ }

  return books;
}

// ---- 4. Full sync ----

export interface StSyncResult {
  connected: boolean;
  characterName: string | null;
  importedPreset: boolean;
  importedLorebooks: number;
}

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

  // B. Import preset from ST (only if none exist)
  const existingPresets = await context.getPresets();
  if (existingPresets.length === 0) {
    const stPreset = readStPreset();
    if (stPreset) {
      const preset: ChatPreset = sanitize({
        ...stPreset.preset,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await context.savePreset(preset);
      result.importedPreset = true;
    }
  }

  // C. Import world info from ST (only if none exist)
  const existingBooks = await context.getLorebooks();
  if (existingBooks.length === 0) {
    const stBooks = readStWorldInfo();
    for (const book of stBooks) {
      const lb: Lorebook = sanitize({
        ...book,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await context.saveLorebook(lb);
      result.importedLorebooks++;
    }
  }

  return result;
}
