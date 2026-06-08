/**
 * Prompt Assembler
 */

import type { ChatPreset, Lorebook, ChatMessage, MatchedEntry } from './types';
import { createLorebookEngine } from './lorebook-engine';
import { formatVariablesForPrompt } from './variables';
import { MacroRegistry, type MacroContext } from './macros';

export interface AssembleOptions {
  userInput: string;
  history: ChatMessage[];
  preset: ChatPreset;
  lorebooks: Lorebook[];
  userName: string;
  characterName: string;
  variables?: Record<string, string | number>;
  extraVariables?: Record<string, any>;
  formatPrompt?: string;
  /** Optional macro registry for {{user}}, {{char}}, etc. */
  macroRegistry?: MacroRegistry;
  /** Current model name for {{model}} macro */
  model?: string;
}

export interface AssembleResult {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  matchedEntries: MatchedEntry[];
  systemPrompt: string;
}

export function assemblePrompt(options: AssembleOptions): AssembleResult {
  const { userInput, history, preset, lorebooks, userName, characterName, variables, extraVariables, formatPrompt, macroRegistry, model } = options;

  const allMatchedEntries: MatchedEntry[] = [];
  const scanText = userInput + ' ' + history.slice(-3).map(m => m.content).join(' ');

  for (const book of lorebooks) {
    const engine = createLorebookEngine(book);
    const matches = engine.recursiveScan(scanText, 3);
    allMatchedEntries.push(...matches);
  }

  const uniqueEntries = Array.from(
    new Map(allMatchedEntries.map(e => [e.entry.id, e])).values()
  ).sort((a, b) => a.score - b.score);

  const maxContextTokens = preset.settings.openai_max_context || preset.settings.max_length || 4096;
  let currentTokens = 0;

  const recentHistory: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'system') continue;
    const msgTokens = msg.content.length / 4;
    if (currentTokens + msgTokens > maxContextTokens * 0.8) break;
    recentHistory.unshift({ role: msg.role, content: msg.content });
    currentTokens += msgTokens;
  }

  // ---- Build macro context from available data ----
  const lastUserMsg = [...recentHistory].reverse().find(m => m.role === 'user');
  const lastCharMsg = [...recentHistory].reverse().find(m => m.role === 'assistant');
  const lastAnyMsg = recentHistory.length > 0 ? recentHistory[recentHistory.length - 1] : null;

  const macroCtx: MacroContext = {
    userName,
    characterName,
    userInput,
    variables,
    model: model ?? preset.settings.openai_model ?? null,
    characterDescription: preset.settings.character_description ?? null,
    characterPersonality: preset.settings.character_personality ?? null,
    scenario: preset.settings.scenario ?? null,
    lastMessage: lastAnyMsg?.content ?? null,
    lastUserMessage: lastUserMsg?.content ?? null,
    lastCharMessage: lastCharMsg?.content ?? null,
  };

  const promptOrder = (preset.settings.prompt_order || []) as Array<{
    identifier: string;
    name?: string;
    role?: 'system' | 'user' | 'assistant';
    enabled?: boolean;
  }>;

  const prompts = (preset.settings.prompts || []) as Array<{
    identifier: string;
    role?: 'system' | 'user' | 'assistant';
    content?: string;
  }>;

  function resolvePromptContent(identifier: string): string | null {
    if (identifier === 'worldInfoBefore' || identifier === 'worldInfoAfter') {
      const content = uniqueEntries.map(e => e.entry.content).join('\n\n');
      return content || null;
    }
    if (identifier === 'charDescription') {
      return preset.settings.character_description || null;
    }
    if (identifier === 'charPersonality') {
      return preset.settings.character_personality || null;
    }
    if (identifier === 'scenario') {
      return preset.settings.scenario || null;
    }
    if (identifier === 'personaDescription') {
      return preset.settings.persona_description || null;
    }
    if (identifier === 'dialogueExamples') {
      return preset.settings.dialogue_examples || null;
    }
    if (identifier === 'groupNudge') {
      return preset.settings.group_nudge_prompt || null;
    }
    if (identifier === 'impersonate') {
      return preset.settings.impersonation_prompt || null;
    }
    if (identifier === 'quietPrompt') {
      return preset.settings.quiet_prompt || null;
    }
    if (identifier === 'bias') {
      return null;
    }
    const custom = prompts.find(p => p.identifier === identifier);
    if (custom?.content) return custom.content;
    const direct = preset.settings[identifier];
    if (typeof direct === 'string' && direct.trim()) return direct;
    return null;
  }

  const assembledMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  let systemAccumulator = '';
  let hasChatHistory = false;

  for (const item of promptOrder) {
    if (item.enabled === false) continue;

    if (item.identifier === 'chatHistory') {
      hasChatHistory = true;
      if (systemAccumulator) {
        assembledMessages.push({ role: 'system', content: systemAccumulator });
        systemAccumulator = '';
      }
      assembledMessages.push(...recentHistory);
      continue;
    }

    const rawContent = resolvePromptContent(item.identifier);
    if (!rawContent) continue;

    let content = replaceMacros(rawContent, macroCtx, macroRegistry);
    if (!content.trim()) continue;

    const role = item.role || 'system';
    if (role === 'system') {
      systemAccumulator += (systemAccumulator ? '\n\n' : '') + content;
    } else {
      if (systemAccumulator) {
        assembledMessages.push({ role: 'system', content: systemAccumulator });
        systemAccumulator = '';
      }
      assembledMessages.push({ role, content });
    }
  }

  const variablesBlock = formatVariablesForPrompt(variables || {});
  if (variablesBlock) {
    systemAccumulator += (systemAccumulator ? '\n\n' : '') + variablesBlock;
  }

  if (extraVariables && Object.keys(extraVariables).length > 0) {
    const extraBlock = formatVariablesForPrompt(extraVariables);
    if (extraBlock) {
      systemAccumulator += (systemAccumulator ? '\n\n' : '') + extraBlock;
    }
  }

  if (formatPrompt) {
    systemAccumulator += (systemAccumulator ? '\n\n' : '') + formatPrompt;
  }

  if (systemAccumulator) {
    assembledMessages.unshift({ role: 'system', content: systemAccumulator });
  }

  if (!hasChatHistory) {
    assembledMessages.push(...recentHistory);
  }

  assembledMessages.push({ role: 'user', content: userInput });

  const systemPrompt = assembledMessages
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n\n');

  return {
    messages: assembledMessages,
    matchedEntries: uniqueEntries,
    systemPrompt,
  };
}

interface MacroContext {
  userName: string;
  characterName: string;
  userInput: string;
  variables?: Record<string, string | number>;
}

/**
 * Replace macros in a template string. Uses the macro registry when available,
 * falling back to legacy hardcoded behavior for backwards compatibility.
 */
export function replaceMacros(
  template: string,
  context: MacroContext,
  registry?: MacroRegistry,
): string {
  // If a registry is provided, delegate resolution to it
  if (registry && registry.enabled) {
    return registry.replaceAll(template, context);
  }

  // Legacy fallback (no registry) — keep existing behavior
  let result = template
    .replace(/\{\{user\}\}/g, context.userName)
    .replace(/\{\{char\}\}/g, context.characterName)
    .replace(/\{\{original\}\}/g, context.userInput);

  if (context.variables) {
    result = result.replace(/\{\{([^{}]+)\}\}/g, (match, key) => {
      const value = context.variables?.[key.trim()];
      return value !== undefined ? String(value) : match;
    });
  }

  return result;
}

export const SUPPORTED_MACROS = [
  { name: '{{user}}', description: '用户名' },
  { name: '{{char}}', description: 'AI角色名' },
  { name: '{{original}}', description: '用户原始输入' },
  { name: '{{变量名}}', description: '自定义变量（例如 {{hp}}）' },
] as const;
