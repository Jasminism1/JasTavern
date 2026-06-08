/**
 * Preset Importer — whitelist-based JSON import with type validation and defaults.
 *
 * Strategy: only recognize known fields, silently drop everything else.
 * Every field gets type-checked; mismatched types fall back to defaults.
 * Missing required fields are filled with sensible defaults.
 */

import type { SamplingParams, MessagingParams, PromptBlock, StructuredPreset } from './types';
import { DEFAULT_SAMPLING_PARAMS, DEFAULT_MESSAGING_PARAMS } from './types';

// ========== Whitelists ==========

const SAMPLING_KEYS: (keyof SamplingParams)[] = [
  'temperature', 'top_p', 'top_k', 'min_p', 'top_a',
  'frequency_penalty', 'presence_penalty', 'repetition_penalty', 'stop',
];

const MESSAGING_KEYS: (keyof MessagingParams)[] = [
  'max_context', 'max_tokens', 'num_generations', 'stream',
  'continue_prefill', 'truncate_on_overflow', 'request_thinking', 'reasoning_effort',
];

const PROMPT_BLOCK_KEYS: (keyof PromptBlock)[] = [
  'name', 'identifier', 'content', 'enabled', 'role', 'injection_position', 'injection_depth', 'order',
];

const STRUCTURED_PRESET_KEYS: (keyof StructuredPreset)[] = [
  'name', 'description', 'sampling', 'messaging', 'promptBlocks', 'contextTemplate', 'customTemplate',
];

// ========== Type coercers ==========

function asNumber(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asBoolean(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 0 || v === 'false' || v === '0') return false;
  if (v === 1 || v === 'true' || v === '1') return true;
  return fallback;
}

function asString(v: unknown, fallback: string): string {
  if (typeof v === 'string' && v.trim()) return v;
  if (typeof v === 'number') return String(v);
  return fallback;
}

function asStringArray(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  return v.map(item => typeof item === 'string' ? item : String(item)).filter(s => s.length > 0);
}

function asStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return asString(v, '');
}

function asRole(v: unknown): PromptBlock['role'] {
  if (v === 'system' || v === 'user' || v === 'assistant') return v;
  return 'system';
}

// ========== Field-level parsers ==========

function parseSamplingParams(raw: unknown): SamplingParams {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SAMPLING_PARAMS };
  const obj = raw as Record<string, unknown>;
  return {
    temperature: asNumber(obj.temperature, DEFAULT_SAMPLING_PARAMS.temperature),
    top_p: asNumber(obj.top_p, DEFAULT_SAMPLING_PARAMS.top_p),
    top_k: asNumber(obj.top_k, DEFAULT_SAMPLING_PARAMS.top_k),
    min_p: asNumber(obj.min_p, DEFAULT_SAMPLING_PARAMS.min_p),
    top_a: asNumber(obj.top_a, DEFAULT_SAMPLING_PARAMS.top_a),
    frequency_penalty: asNumber(obj.frequency_penalty, DEFAULT_SAMPLING_PARAMS.frequency_penalty),
    presence_penalty: asNumber(obj.presence_penalty, DEFAULT_SAMPLING_PARAMS.presence_penalty),
    repetition_penalty: asNumber(obj.repetition_penalty, DEFAULT_SAMPLING_PARAMS.repetition_penalty),
    stop: asStringArray(obj.stop, DEFAULT_SAMPLING_PARAMS.stop),
  };
}

function parseMessagingParams(raw: unknown): MessagingParams {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_MESSAGING_PARAMS };
  const obj = raw as Record<string, unknown>;
  return {
    max_context: asNumber(obj.max_context, DEFAULT_MESSAGING_PARAMS.max_context),
    max_tokens: asNumber(obj.max_tokens, DEFAULT_MESSAGING_PARAMS.max_tokens),
    num_generations: Math.max(1, asNumber(obj.num_generations, DEFAULT_MESSAGING_PARAMS.num_generations)),
    stream: asBoolean(obj.stream, DEFAULT_MESSAGING_PARAMS.stream),
    continue_prefill: asBoolean(obj.continue_prefill, DEFAULT_MESSAGING_PARAMS.continue_prefill),
    truncate_on_overflow: asBoolean(obj.truncate_on_overflow, DEFAULT_MESSAGING_PARAMS.truncate_on_overflow),
    request_thinking: asBoolean(obj.request_thinking, DEFAULT_MESSAGING_PARAMS.request_thinking),
    reasoning_effort: asStringOrNull(obj.reasoning_effort),
  };
}

function parsePromptBlock(raw: unknown, index: number): PromptBlock {
  if (!raw || typeof raw !== 'object') {
    return createDefaultPromptBlock(`block_${index}`);
  }
  const obj = raw as Record<string, unknown>;
  return {
    name: asString(obj.name, `提示词块 ${index + 1}`),
    identifier: asString(obj.identifier, `block_${crypto.randomUUID ? crypto.randomUUID() : 'id_' + index}`),
    content: asString(obj.content, ''),
    enabled: asBoolean(obj.enabled ?? obj.enable, true),
    role: asRole(obj.role),
    injection_position: asNumber(obj.injection_position ?? obj.position, 1), // default after_char
    injection_depth: asNumber(obj.injection_depth ?? obj.depth, 0),
    order: asNumber(obj.order ?? index, index),
  };
}

function parsePromptBlocks(raw: unknown): PromptBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, i) => parsePromptBlock(item, i));
}

// ========== Main importer ==========

export interface ImportResult {
  preset: StructuredPreset;
  warnings: string[];
  unknownKeys: string[];  // logged but ignored
}

/**
 * Import a preset from arbitrary JSON (community SILA preset, local export, etc.).
 * Only recognized keys are extracted. Everything else is silently dropped.
 * Every field is type-checked and filled with defaults if invalid.
 */
export function importPreset(data: unknown): ImportResult {
  const warnings: string[] = [];
  const unknownKeys: string[] = [];

  if (!data || typeof data !== 'object') {
    throw new Error('预设导入失败：JSON 数据格式无效，期望一个对象');
  }

  const obj = data as Record<string, unknown>;

  // Collect unknown keys for diagnostics
  for (const key of Object.keys(obj)) {
    if (!(STRUCTURED_PRESET_KEYS as string[]).includes(key) &&
        !(SAMPLING_KEYS as string[]).includes(key) &&
        !(MESSAGING_KEYS as string[]).includes(key)) {
      // Skip known aliases from community presets
      if (key === 'prompts' || key === 'prompt_order' || key === 'settings' ||
          key === 'id' || key === 'createdAt' || key === 'updatedAt' ||
          key === 'temp_openai' || key === 'openai_model' || key === 'chat_completion_source') {
        continue;
      }
      unknownKeys.push(key);
    }
  }

  // Detect community SILA preset — may have sampling params at top level rather than in a nested "sampling" object
  let samplingRaw: unknown = obj.sampling;
  if (!samplingRaw || typeof samplingRaw !== 'object') {
    // Try top-level community keys
    const hasSamplingKeys = SAMPLING_KEYS.some(k => k !== 'stop' && obj[k] !== undefined);
    if (hasSamplingKeys) {
      samplingRaw = {};
      for (const k of SAMPLING_KEYS) {
        if (obj[k] !== undefined) (samplingRaw as Record<string, unknown>)[k] = obj[k];
      }
      warnings.push('检测到社区预设格式（参数在顶层），已自动提取采样参数');
    }
  }
  const sampling = parseSamplingParams(samplingRaw);

  // Detect community preset messaging params
  let messagingRaw: unknown = obj.messaging;
  if (!messagingRaw || typeof messagingRaw !== 'object') {
    const hasMsgKeys = MESSAGING_KEYS.some(k => obj[k] !== undefined);
    if (hasMsgKeys) {
      messagingRaw = {};
      for (const k of MESSAGING_KEYS) {
        if (obj[k] !== undefined) (messagingRaw as Record<string, unknown>)[k] = obj[k];
      }
    }
  }
  const messaging = parseMessagingParams(messagingRaw);

  // Prompt blocks — accept prompts array or promptBlocks array
  let blocksRaw: unknown = obj.promptBlocks ?? obj.prompts;
  const promptBlocks = parsePromptBlocks(blocksRaw);

  // Validate stop — warn if empty (critical for preventing infinite loops)
  if (sampling.stop.length === 0) {
    warnings.push('提示：预设未包含停止符（stop），建议添加如 "\\nUser:" 或 "<|im_end|>" 以避免模型无限复读');
  }

  const preset: StructuredPreset = {
    name: asString(obj.name, '未命名预设'),
    description: asString(obj.description ?? obj.desc, ''),
    sampling,
    messaging,
    promptBlocks,
    contextTemplate: asStringOrNull(obj.contextTemplate ?? obj.context_template) || undefined,
    customTemplate: asStringOrNull(obj.customTemplate ?? obj.custom_template) || undefined,
  };

  return { preset, warnings, unknownKeys };
}

/**
 * Export a preset to clean JSON (only known fields, no internal noise).
 */
export function exportPreset(preset: StructuredPreset): Record<string, unknown> {
  return {
    name: preset.name,
    description: preset.description,
    sampling: { ...preset.sampling },
    messaging: { ...preset.messaging },
    promptBlocks: preset.promptBlocks.map(b => ({ ...b })),
    contextTemplate: preset.contextTemplate || undefined,
    customTemplate: preset.customTemplate || undefined,
  };
}

/**
 * Create a default empty preset (for "new preset" flow).
 */
export function createEmptyPreset(): StructuredPreset {
  return {
    name: '新预设',
    description: '',
    sampling: { ...DEFAULT_SAMPLING_PARAMS },
    messaging: { ...DEFAULT_MESSAGING_PARAMS },
    promptBlocks: [],
    contextTemplate: 'openai',
    customTemplate: undefined,
  };
}

function createDefaultPromptBlock(identifier: string): PromptBlock {
  return {
    name: '系统提示',
    identifier,
    content: 'Write {{char}}\'s next reply in a fictional chat between {{char}} and {{user}}.',
    enabled: true,
    role: 'system',
    injection_position: 0, // before_char
    injection_depth: 0,
    order: 0,
  };
}