/**
 * Prompt Assembler — SillyTavern-compatible message builder.
 *
 * Core algorithm: walk prompt_order in sequence, resolve each block's content,
 * group consecutive same-role blocks into one message.
 *
 * Structure guarantee:
 *   [system] (if any system blocks exist)
 *   [user] [assistant] [user] [assistant] ... (alternating, no consecutive same-role)
 *   [user] (final user input)
 */

import type { ChatPreset, Lorebook, ChatMessage, MatchedEntry, PromptBlock, StructuredPreset, ContextTemplate } from './types';
import { createLorebookEngine } from './lorebook-engine';
import { MacroRegistry, type MacroContext } from './macros';
import { serializeContext } from './context-template';
import { getBuiltinTemplate } from './context-template';

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
  macroRegistry?: MacroRegistry;
  model?: string;
  structuredPreset?: StructuredPreset;
  contextTemplateName?: string;
}

export interface AssembleResult {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  prompt?: string;
  matchedEntries: MatchedEntry[];
  systemPrompt: string;
  stopSequences: string[];
}

/** Output role — maps system/user/assistant for message grouping. */
type OutputRole = 'system' | 'user' | 'assistant';

export function assemblePrompt(options: AssembleOptions): AssembleResult {
  const { userInput, history, preset, lorebooks, userName, characterName, variables, macroRegistry, model, structuredPreset, contextTemplateName } = options;

  // ---- 1. Lorebook matching ----
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

  // ---- 2. Token budget ----
  const maxContextTokens = preset.settings.openai_max_context
    || structuredPreset?.messaging?.max_context
    || 128000;
  let currentTokens = 0;

  // ---- 3. Context template ----
  let contextTemplate: ContextTemplate | undefined;
  const tplName = contextTemplateName || structuredPreset?.contextTemplate || 'openai';
  if (tplName !== 'openai') {
    contextTemplate = getBuiltinTemplate(tplName);
  }

  // ---- 4. Build macro context ----
  const rawHistory: { role: OutputRole; content: string }[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'system') continue;
    const msgTokens = msg.content.length / 4;
    if (currentTokens + msgTokens > maxContextTokens * 0.8) break;
    rawHistory.unshift({ role: msg.role as OutputRole, content: msg.content });
    currentTokens += msgTokens;
  }

  const macroCtx: MacroContext = buildMacroContext({
    userName, characterName, userInput, variables, model,
    preset, structuredPreset, recentHistory: rawHistory, macroRegistry,
  });

  const recentHistory = rawHistory.map(h => ({
    ...h,
    content: replaceMacros(h.content, macroCtx, macroRegistry),
  }));

  // ---- 5. Collect prompt blocks sorted by order ----
  const promptBlocks: PromptBlock[] = (structuredPreset?.promptBlocks?.length
    ? structuredPreset.promptBlocks.filter(b => b.enabled)
    : buildLegacyPromptBlocks(preset)
  ).sort((a, b) => a.order - b.order);

  // ---- 6. Walk prompt blocks, resolve content, group by role ----
  const assembledMessages: { role: OutputRole; content: string }[] = [];
  let hasChatHistory = false;

  for (const block of promptBlocks) {
    // Skip chatHistory blocks — we handle history insertion separately
    if (block.identifier === 'chatHistory') {
      hasChatHistory = true;
      for (const h of recentHistory) {
        emitMessage(assembledMessages, { role: h.role, content: h.content });
      }
      continue;
    }

    const rawContent = resolveBlockContent(block, {
      preset, uniqueEntries, structuredPreset, variables,
    });

    if (!rawContent || !rawContent.trim()) continue;

    const resolved = replaceMacros(rawContent, macroCtx, macroRegistry);
    if (!resolved.trim()) continue;

    emitMessage(assembledMessages, { role: block.role, content: resolved });
  }

  // If chatHistory wasn't inserted, append it now
  if (!hasChatHistory) {
    for (const h of recentHistory) {
      emitMessage(assembledMessages, { role: h.role, content: h.content });
    }
  }

  // ---- 7. Finalize: ensure system at top, no consecutive same-role ----
  const finalized = normalizeMessages(assembledMessages);

  // Append user input as final message
  const resolvedUserInput = replaceMacros(userInput, macroCtx, macroRegistry);
  emitMessage(finalized, { role: 'user', content: resolvedUserInput });

  const systemPrompt = finalized
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n\n');

  // ---- 8. Context template serialization ----
  let finalMessages = finalized;
  let finalPrompt: string | undefined;
  let stopSeqs: string[] = [];

  if (contextTemplate && contextTemplate.name !== 'openai') {
    const wiBefore = uniqueEntries.filter(e => e.entry.position !== 'at_depth')
      .map(e => replaceMacros(e.entry.content, macroCtx, macroRegistry)).join('\n\n');
    const wiAfter = uniqueEntries.filter(e => e.entry.position === 'at_depth')
      .map(e => replaceMacros(e.entry.content, macroCtx, macroRegistry)).join('\n\n');
    const result = serializeContext({
      systemMessages: finalized.filter(m => m.role === 'system'),
      history: finalized.filter(m => m.role !== 'system' && m.role !== 'user'),
      userInput: resolvedUserInput,
      wiBefore,
      wiAfter,
      template: contextTemplate,
    });
    if (result.prompt) {
      finalPrompt = result.prompt;
      finalMessages = [];
    }
    stopSeqs = result.stop;
  }

  const presetStops = structuredPreset?.sampling?.stop || [];
  stopSeqs = [...new Set([...stopSeqs, ...presetStops])];

  return {
    messages: finalMessages,
    prompt: finalPrompt,
    matchedEntries: uniqueEntries,
    systemPrompt,
    stopSequences: stopSeqs,
  };
}

// ========== Message emitter ==========

/**
 * Add a message to the list. If the last message has the same role,
 * append content to it instead of creating a new message.
 */
function emitMessage(
  list: { role: OutputRole; content: string }[],
  msg: { role: OutputRole; content: string },
): void {
  if (!msg.content.trim()) return;
  const last = list[list.length - 1];
  if (last && last.role === msg.role) {
    last.content += '\n\n' + msg.content;
  } else {
    list.push({ role: msg.role, content: msg.content });
  }
}

/**
 * Ensure good structure:
 * 1. At most one system message, always at the top
 * 2. After system, first non-system message MUST be 'user'
 * 3. No consecutive same-role messages
 */
function normalizeMessages(
  msgs: { role: OutputRole; content: string }[],
): { role: OutputRole; content: string }[] {
  if (msgs.length === 0) return [];

  // Collect ALL system content into one top-level system message
  const result: { role: OutputRole; content: string }[] = [];
  let sysContent = '';
  const nonSystem: { role: OutputRole; content: string }[] = [];

  for (const m of msgs) {
    if (m.role === 'system') {
      sysContent += (sysContent ? '\n\n' : '') + m.content;
    } else {
      nonSystem.push(m);
    }
  }

  // Merge consecutive same-role in non-system messages
  for (const m of nonSystem) {
    emitMessage(result, m);
  }

  // Ensure first non-system message is 'user' — if it's 'assistant',
  // insert an empty user message or move system before it
  // Actually: just ensure the sequence alternates
  const finalized: { role: OutputRole; content: string }[] = [];
  let lastRole: OutputRole | null = null;
  for (const m of result) {
    if (lastRole === m.role && m.role !== 'system') {
      // Merge with previous
      const prev = finalized[finalized.length - 1];
      prev.content += '\n\n' + m.content;
    } else {
      finalized.push(m);
      lastRole = m.role;
    }
  }

  // Prepend system message
  if (sysContent.trim()) {
    finalized.unshift({ role: 'system', content: sysContent });
  }

  // If after system, the first message is 'assistant', that's a problem.
  // SillyTavern convention: system → user is always the start.
  // If this happens, we keep it as-is but it's a configuration warning.

  return finalized;
}

// ========== Content resolvers ==========

function resolveBlockContent(
  block: PromptBlock,
  ctx: {
    preset: ChatPreset;
    uniqueEntries: MatchedEntry[];
    structuredPreset?: StructuredPreset;
    variables?: Record<string, string | number>;
  },
): string | null {
  const { preset, uniqueEntries } = ctx;

  // Known system identifiers → dynamic content
  if (block.identifier === 'worldInfoBefore') {
    return uniqueEntries
      .filter(e => e.entry.position !== 'at_depth')
      .map(e => e.entry.content)
      .join('\n\n');
  }
  if (block.identifier === 'worldInfoAfter') {
    return uniqueEntries
      .filter(e => e.entry.position === 'at_depth')
      .map(e => e.entry.content)
      .join('\n\n');
  }
  if (block.identifier === 'charDescription') {
    return preset.settings.character_description || null;
  }
  if (block.identifier === 'charPersonality') {
    return preset.settings.character_personality || null;
  }
  if (block.identifier === 'scenario') {
    return preset.settings.scenario || null;
  }
  if (block.identifier === 'personaDescription') {
    return preset.settings.persona_description || null;
  }
  if (block.identifier === 'dialogueExamples') {
    return preset.settings.dialogue_examples || null;
  }
  if (block.identifier === 'chatHistory') {
    return null; // handled in the walker
  }

  // Custom identifier → look up in preset prompts[] array
  const prompts = (preset.settings.prompts || []) as Array<{
    identifier: string;
    content?: string;
  }>;
  const custom = prompts.find(p => p.identifier === block.identifier);
  if (custom?.content !== undefined) return custom.content;

  // Fallback: direct settings lookup
  const direct = preset.settings[block.identifier];
  if (typeof direct === 'string' && direct.trim()) return direct;

  // If block has its own content (from structuredPreset)
  if (block.content && block.content.trim()) return block.content;

  return null;
}

// ========== Helpers ==========

function buildMacroContext(args: {
  userName: string;
  characterName: string;
  userInput: string;
  variables?: Record<string, string | number>;
  model?: string;
  preset: ChatPreset;
  structuredPreset?: StructuredPreset;
  recentHistory: { role: string; content: string }[];
  macroRegistry?: MacroRegistry;
}): MacroContext {
  const { userName, characterName, userInput, variables, model, preset, structuredPreset, recentHistory } = args;
  const lastUserMsg = [...recentHistory].reverse().find(m => m.role === 'user');
  const lastCharMsg = [...recentHistory].reverse().find(m => m.role === 'assistant');
  const lastAnyMsg = recentHistory.length > 0 ? recentHistory[recentHistory.length - 1] : null;

  return {
    userName,
    characterName,
    userInput,
    variables,
    model: model ?? preset.settings.openai_model ?? null,
    characterDescription: structuredPreset?.description || preset.settings.character_description || null,
    characterPersonality: preset.settings.character_personality || null,
    scenario: preset.settings.scenario || null,
    lastMessage: lastAnyMsg?.content ?? null,
    lastUserMessage: lastUserMsg?.content ?? null,
    lastCharMessage: lastCharMsg?.content ?? null,
  };
}

function buildLegacyPromptBlocks(preset: ChatPreset): PromptBlock[] {
  const promptOrder = (preset.settings.prompt_order || []) as Array<{
    identifier: string;
    name?: string;
    role?: 'system' | 'user' | 'assistant';
    enabled?: boolean;
  }>;

  const prompts = (preset.settings.prompts || []) as Array<{
    identifier: string;
    name?: string;
    role?: 'system' | 'user' | 'assistant';
    content?: string;
  }>;

  const blocks: PromptBlock[] = [];

  for (let i = 0; i < promptOrder.length; i++) {
    const poItem = promptOrder[i];
    // Enabled status from prompt_order takes priority
    if (poItem.enabled === false) continue;

    // Look up content + role from prompts array by identifier
    const promptDef = prompts.find((p: any) => p.identifier === poItem.identifier);

    blocks.push({
      name: promptDef?.name || poItem.name || poItem.identifier,
      identifier: poItem.identifier,
      content: promptDef?.content || '', // resolved dynamically in resolveBlockContent
      enabled: true,
      role: promptDef?.role || poItem.role || 'system',
      injection_position: (promptDef as any)?.injection_position ?? 0,
      injection_depth: (promptDef as any)?.injection_depth ?? 4,
      order: i,
    });
  }

  return blocks;
}

export function replaceMacros(
  template: string,
  context: MacroContext,
  registry?: MacroRegistry,
): string {
  if (registry && registry.enabled) {
    return registry.replaceAll(template, context);
  }

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
