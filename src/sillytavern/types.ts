/**
 * SillyTavern Web - Core Types
 */

// ========== World Book (Lorebook) Types ==========

export interface LorebookEntry {
  id: string;
  keys: string[];
  secondaryKeys: string[];
  content: string;
  comment?: string;
  order: number;
  /** SillyTavern position: 0=before_char, 1=after_char, 2=before_example(AN top), 3=after_example(AN bottom), 4=at_depth, 5=example_msg_top, 6=example_msg_bottom, 7=outlet */
  position: 'before_char' | 'after_char' | 'before_example' | 'after_example' | 'at_depth' | 'example_msg_top' | 'example_msg_bottom' | 'outlet';
  depth?: number;
  role?: number;
  selective: boolean;
  /** 0=and_any(not_any?), 1=or(not_all?), actual SillyTavern has 4 logics but we normalize to and/or where possible */
  selectiveLogic: 'and_any' | 'not_all' | 'not_any' | 'and_all';
  constant: boolean;
  probability: number;
  useProbability?: boolean;
  addMemo: boolean;
  sticky?: number;
  cooldown?: number;
  delay?: number;
  weight?: number;
  scanDepth?: number;
  caseSensitive?: boolean;
  matchWholeWords?: boolean;
  excludeRecursion?: boolean;
  preventRecursion?: boolean;
  /** P2: when true, content of this entry is scanned for further keyword matches (recursive activation). Default false. */
  recursive?: boolean;
  useGroupScoring?: boolean;
  matchPersonaDescription?: boolean;
  matchCharacterDescription?: boolean;
  matchCharacterPersonality?: boolean;
  matchCharacterDepthPrompt?: boolean;
  matchScenario?: boolean;
  matchCreatorNotes?: boolean;
  group?: string;
  decorators?: string[];
  characterFilter?: {
    isExclude?: boolean;
    names?: string[];
    tags?: number[];
  };
}

export interface Lorebook {
  id: string;
  name: string;
  description?: string;
  entries: LorebookEntry[];
  recursiveScanning: boolean;
  caseSensitive: boolean;
  matchWholeWords: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SillyTavernLorebookExport {
  name: string;
  description?: string;
  entries: Record<string, {
    uid: number;
    key: string[];
    keysecondary: string[];
    comment: string;
    content: string;
    constant: boolean;
    selective: boolean;
    selectiveLogic: 0 | 1 | 2 | 3;
    addMemo: boolean;
    order: number;
    position: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
    role: number;
    disable: boolean;
    probability: number;
    depth: number;
    group: string;
    useProbability: boolean;
    excluded: boolean;
    sticky: number;
    cooldown: number;
    delay: number;
    weight: number;
    scanDepth: number;
    caseSensitive: boolean;
    matchWholeWords: boolean;
    excludeRecursion: boolean;
    preventRecursion: boolean;
    useGroupScoring: boolean;
    matchPersonaDescription: boolean;
    matchCharacterDescription: boolean;
    matchCharacterPersonality: boolean;
    matchCharacterDepthPrompt: boolean;
    matchScenario: boolean;
    matchCreatorNotes: boolean;
    decorators: string[];
    characterFilter: {
      isExclude?: boolean;
      names?: string[];
      tags?: number[];
    };
  }>;
  settings?: {
    recursive_scanning?: boolean;
    case_sensitive?: boolean;
    match_whole_words?: boolean;
  };
}

export interface MatchedEntry {
  entry: LorebookEntry;
  score: number;
  matchedKeywords: string[];
}

// ========== Preset Types ==========

/** SillyTavern-compatible chat completion preset.
 *  `settings` stores the raw SillyTavern preset JSON (temp_openai, prompt_order, prompts, etc.)
 */
export interface ChatPreset {
  id: string;
  name: string;
  description?: string;
  /** Raw SillyTavern preset fields. For OpenAI presets this includes temp_openai, prompt_order, prompts, etc. */
  settings: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

// ========== P1: Structured Preset Types ==========

/** Sampling parameters — whitelist-only, type-checked on import. */
export interface SamplingParams {
  temperature: number;
  top_p: number;
  top_k: number;           // local models / aggregators only
  min_p: number;           // local models / aggregators only
  top_a: number;           // local models / aggregators only
  frequency_penalty: number;
  presence_penalty: number;
  repetition_penalty: number; // local models / aggregators only
  stop: string[];          // stop sequences
}

/** Message-related parameters. */
export interface MessagingParams {
  max_context: number;       // default 128000
  max_tokens: number;        // default 10000
  num_generations: number;   // default 1
  stream: boolean;
  continue_prefill: boolean;
  truncate_on_overflow: boolean;
  request_thinking: boolean;
  reasoning_effort: string | null;
}

/** Default sampling params (same order as SamplingParams). */
export const DEFAULT_SAMPLING_PARAMS: SamplingParams = {
  temperature: 0.8,
  top_p: 0.9,
  top_k: 0,
  min_p: 0,
  top_a: 0,
  frequency_penalty: 0,
  presence_penalty: 0,
  repetition_penalty: 1,
  stop: [],
};

export const DEFAULT_MESSAGING_PARAMS: MessagingParams = {
  max_context: 128000,
  max_tokens: 10000,
  num_generations: 1,
  stream: false,
  continue_prefill: false,
  truncate_on_overflow: true,
  request_thinking: false,
  reasoning_effort: null,
};

/** Sampling param keys that OpenAI / Anthropic native APIs reject (400). */
export const LOCAL_ONLY_SAMPLING_KEYS: (keyof SamplingParams)[] = [
  'top_k', 'min_p', 'top_a', 'repetition_penalty',
];

/** A single prompt block within a preset. */
export interface PromptBlock {
  name: string;
  identifier: string;        // unique within preset
  content: string;           // supports {{macros}}
  enabled: boolean;
  role: 'system' | 'user' | 'assistant';
  injection_position: number; // 0=before_char … 7=outlet (same as LorebookEntry.position)
  injection_depth: number;    // 0-4, relative distance from latest user message
  order: number;              // sort order within same position
}

/** Full structured preset — used by the importer and UI. */
export interface StructuredPreset {
  name: string;
  description: string;
  sampling: SamplingParams;
  messaging: MessagingParams;
  promptBlocks: PromptBlock[];
  contextTemplate?: string;   // template name, e.g. "openai", "chatml", "alpaca"
  customTemplate?: string;    // inline custom template definition (JSON string)
}

// ========== Context Template Types ==========

export interface ContextTemplate {
  name: string;
  label: string;              // display name in UI
  systemPrefix: string;
  systemSuffix: string;
  userPrefix: string;
  userSuffix: string;
  assistantPrefix: string;
  assistantSuffix: string;
  defaultStop: string[];      // appended before preset's stop
  /** Where {{wiBefore}} gets injected */
  wiBeforeSlot: 'before_system' | 'after_system' | 'before_user';
  /** Where {{wiAfter}} gets injected */
  wiAfterSlot: 'after_system' | 'before_user' | 'after_user';
}

// ========== Settings Types ==========

export interface ApiSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeout: number;
  secondary?: {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  };
}

export interface AppSettings {
  key?: string;
  api: ApiSettings;
  apiMode: 'single' | 'dual';
  activePresetId: string | null;
  activeLorebookIds: string[];
  /** P2: global world book id — applies to all characters. Null = none selected. */
  globalLorebookId: string | null;
  userName: string;
  characterName: string;
  theme: 'dark' | 'light';
  language: 'zh' | 'en';
  autoSave: boolean;
  autoSaveInterval: number;
  uiMode: 'game' | 'chat';
  customTags: string[];
  formatPromptTemplate: string;
  thinkingDisplay: 'fold' | 'hide' | 'inline';
}

export const DEFAULT_FORMAT_PROMPT = `你必须严格按照以下 XML 标签格式输出回复，不要使用 Markdown 包裹：
<thinking>……</thinking>     ← 可选；内部任何字符都视为思考过程，不被解析
<maintext>……</maintext>     ← 必填；本回合的剧情正文，可多段，保留换行
<option>选项 A
选项 B
选项 C</option>              ← 必填；至少 2 项，每行一个
<sum>……</sum>               ← 必填；本回合一句话总结
<vars>{ "金钱": +10, "HP": 38 }</vars>   ← 选填；JSON 深合并`;

export const DEFAULT_TAGS = ['maintext', 'option', 'sum', 'vars', 'thinking', 'think'] as const;
export const DEFAULT_OPAQUE_TAGS = ['thinking', 'think'] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  api: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-3.5-turbo',
    timeout: 60000,
  },
  apiMode: 'single',
  activePresetId: null,
  activeLorebookIds: [],
  globalLorebookId: null,
  userName: '用户',
  characterName: 'AI',
  theme: 'dark',
  language: 'zh',
  autoSave: true,
  autoSaveInterval: 30,
  uiMode: 'game',
  customTags: ['maintext', 'option', 'sum', 'vars', 'thinking', 'think'],
  formatPromptTemplate: DEFAULT_FORMAT_PROMPT,
  thinkingDisplay: 'fold',
};

// ========== Chat Types ==========

export interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
  variables?: Record<string, string | number>;
  metadata?: {
    tokenCount?: number;
    lorebookEntries?: string[];
    processingTime?: number;
  };
  parsed?: ParsedTags;
  variablesAfter?: Record<string, any>;
  apiUsed?: ApiTarget;
}

export interface ChatSession {
  id: string;
  name: string;
  messages: ChatMessage[];
  characterName: string;
  userName: string;
  presetId: string | null;
  lorebookIds: string[];
  variables: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

// ========== Constants ==========

/** Common SillyTavern prompt_order identifiers used in OpenAI presets. */
export const DEFAULT_PROMPT_ORDER = [
  { identifier: 'main', name: 'Main Prompt', role: 'system' as const },
  { identifier: 'worldInfoBefore', name: 'World Info (Before)', role: 'system' as const },
  { identifier: 'charDescription', name: 'Character Description', role: 'system' as const },
  { identifier: 'charPersonality', name: 'Character Personality', role: 'system' as const },
  { identifier: 'scenario', name: 'Scenario', role: 'system' as const },
  { identifier: 'personaDescription', name: 'Persona Description', role: 'system' as const },
  { identifier: 'dialogueExamples', name: 'Dialogue Examples', role: 'system' as const },
  { identifier: 'chatHistory', name: 'Chat History', role: 'system' as const },
  { identifier: 'worldInfoAfter', name: 'World Info (After)', role: 'system' as const },
  { identifier: 'groupNudge', name: 'Group Nudge', role: 'system' as const },
];

export function createDefaultPreset(): Omit<ChatPreset, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: '默认预设',
    description: 'SillyTavern 兼容的默认 OpenAI 预设',
    settings: {
      temp_openai: 0.8,
      freq_pen_openai: 0,
      pres_pen_openai: 0,
      top_p_openai: 0.9,
      top_k_openai: 0,
      top_a_openai: 0,
      min_p_openai: 0,
      repetition_penalty_openai: 1,
      openai_max_context: 4096,
      openai_max_tokens: 2048,
      stream_openai: false,
      max_context_unlocked: false,
      chat_completion_source: 'openai',
      openai_model: 'gpt-3.5-turbo',
      main: 'Write {{char}}\'s next reply in a fictional chat between {{char}} and {{user}}.',
      nsfw: '',
      jailbreak: '',
      enhanceDefinitions: '',
      impersonation_prompt: '',
      new_chat_prompt: '',
      new_group_chat_prompt: '',
      new_example_chat_prompt: '',
      continue_nudge_prompt: '',
      wi_format: '',
      group_nudge_prompt: '',
      scenario_format: '',
      personality_format: '',
      prompts: [],
      prompt_order: DEFAULT_PROMPT_ORDER.map((p, i) => ({ ...p, enabled: true })),
    },
  };
}

// ========== v3 Game Mode Types ==========

export interface ParsedTags {
  thinking: string;
  maintext: string;
  options: string[];
  sum: string;
  varsRaw: string;
  varsCommands: VarsPatch;
  unknown: Record<string, string>;
}

export interface VarsPatch {
  /** Object that will be deep-merged into chat.variables */
  merge: Record<string, any>;
}

export type Task = 'story' | 'summary' | 'vars';
export type ApiTarget = 'primary' | 'secondary';
