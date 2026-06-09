/**
 * Prompt Assembler
 */

import type { ChatPreset, Lorebook, ChatMessage, MatchedEntry, PromptBlock, StructuredPreset, ContextTemplate } from './types';
import { createLorebookEngine } from './lorebook-engine';
import { formatVariablesForPrompt } from './variables';
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
  /** Optional macro registry for {{user}}, {{char}}, etc. */
  macroRegistry?: MacroRegistry;
  /** Current model name for {{model}} macro */
  model?: string;
  /** P1: structured preset with promptBlocks — if provided, overrides prompt_order */
  structuredPreset?: StructuredPreset;
  /** P1: context template name — "openai" (default), "chatml", "alpaca", "llama3" */
  contextTemplateName?: string;
}

export interface AssembleResult {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  /** For text-based templates — single concatenated prompt string */
  prompt?: string;
  matchedEntries: MatchedEntry[];
  systemPrompt: string;
  /** Merged stop sequences (from template + preset) */
  stopSequences: string[];
}

export function assemblePrompt(options: AssembleOptions): AssembleResult {
  const { userInput, history, preset, lorebooks, userName, characterName, variables, extraVariables, formatPrompt, macroRegistry, model, structuredPreset, contextTemplateName } = options;

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

  // ---- 3. Resolve Context Template ----
  let contextTemplate: ContextTemplate | undefined;
  const tplName = contextTemplateName || structuredPreset?.contextTemplate || 'openai';
  if (tplName !== 'openai') {
    contextTemplate = getBuiltinTemplate(tplName);
  }

  // ---- 4. Build macro context ----
  // Step A: collect raw history first (cannot resolve macros yet — macroCtx not built)
  const rawHistory: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'system') continue;
    const msgTokens = msg.content.length / 4;
    if (currentTokens + msgTokens > maxContextTokens * 0.8) break;
    rawHistory.unshift({ role: msg.role, content: msg.content });
    currentTokens += msgTokens;
  }

  // Step B: build macroCtx from raw history
  const macroCtx: MacroContext = buildMacroContext({
    userName, characterName, userInput, variables, model,
    preset, structuredPreset, recentHistory: rawHistory, macroRegistry,
  });

  // Step C: now re-resolve history messages with macroCtx
  const recentHistory = rawHistory.map(h => ({
    ...h,
    content: replaceMacros(h.content, macroCtx, macroRegistry),
  }));

  // ---- 5. Collect injectable blocks ----
  // promptBlocks from structured preset (if available), or from legacy preset.settings.prompts
  const hasPromptBlocks = !!(structuredPreset?.promptBlocks && structuredPreset.promptBlocks.length > 0);
  const promptBlocks: PromptBlock[] = hasPromptBlocks
    ? structuredPreset!.promptBlocks.filter(b => b.enabled)
    : buildLegacyPromptBlocks(preset);

  // Separate system-level blocks (before_char, after_char, before_example, after_example)
  // from depth-based blocks (at_depth)
  const systemBlocks = promptBlocks.filter(
    b => b.injection_position !== 4 // 4 = at_depth
  );
  const depthBlocks = promptBlocks.filter(
    b => b.injection_position === 4 // at_depth
  );

  // ---- 6. Build system accumulator from system blocks + lorebook entries ----
  let systemAccumulator = '';

  // Group by position
  const positionGroups = new Map<number, string[]>();
  for (const b of systemBlocks) {
    const pos = b.injection_position;
    if (!positionGroups.has(pos)) positionGroups.set(pos, []);
    positionGroups.get(pos)!.push(replaceMacros(b.content, macroCtx, macroRegistry));
  }

  // Lorebook entries → worldInfoBefore (position 4=at_depth handled below)
  const wiBeforeContent = uniqueEntries
    .filter(e => e.entry.position !== 'at_depth')
    .map(e => replaceMacros(e.entry.content, macroCtx, macroRegistry))
    .join('\n\n');

  const wiAfterContent = uniqueEntries
    .filter(e => e.entry.position === 'at_depth')
    .map(e => replaceMacros(e.entry.content, macroCtx, macroRegistry))
    .join('\n\n');

  // Build system prompt skeleton following position order
  // 0=before_char: character description, personality, scenario go here
  const charBlocks = positionGroups.get(0) || []; // before_char
  if (characterName) {
    systemAccumulator += charBlocks.join('\n\n');
  }
  if (wiBeforeContent) {
    systemAccumulator += (systemAccumulator ? '\n\n' : '') + wiBeforeContent;
  }

  // 1=after_char: after character info (default for most prompt blocks)
  const afterCharBlocks = positionGroups.get(1) || [];
  systemAccumulator += (systemAccumulator ? '\n\n' : '') + afterCharBlocks.join('\n\n');

  // 2,3 = before/after example
  const exampleBlocks = [
    ...(positionGroups.get(2) || []),
    ...(positionGroups.get(3) || []),
  ];
  if (exampleBlocks.length > 0) {
    systemAccumulator += (systemAccumulator ? '\n\n' : '') + exampleBlocks.join('\n\n');
  }

  // 5,6,7 = example_msg_top, example_msg_bottom, outlet
  const extraBlocks = [
    ...(positionGroups.get(5) || []),
    ...(positionGroups.get(6) || []),
    ...(positionGroups.get(7) || []),
  ];
  if (extraBlocks.length > 0) {
    systemAccumulator += (systemAccumulator ? '\n\n' : '') + extraBlocks.join('\n\n');
  }

  // Add variables + format prompt
  const variablesBlock = formatVariablesForPrompt(variables || {});
  if (variablesBlock) {
    systemAccumulator += (systemAccumulator ? '\n\n' : '') + replaceMacros(variablesBlock, macroCtx, macroRegistry);
  }
  if (formatPrompt) {
    systemAccumulator += (systemAccumulator ? '\n\n' : '') + replaceMacros(formatPrompt, macroCtx, macroRegistry);
  }

  // ---- 7. Depth-based interleaving into history ----
  // Collect all at_depth items (prompt blocks + lorebook entries with depth)
  interface DepthItem {
    content: string;
    role: 'system' | 'user' | 'assistant';
    depth: number;
    order: number;
  }

  const depthItems: DepthItem[] = [];

  for (const b of depthBlocks) {
    depthItems.push({
      content: replaceMacros(b.content, macroCtx, macroRegistry),
      role: b.role,
      depth: b.injection_depth,
      order: b.order,
    });
  }

  // Lorebook entries with position=at_depth
  for (const e of uniqueEntries.filter(e => e.entry.position === 'at_depth')) {
    depthItems.push({
      content: replaceMacros(e.entry.content, macroCtx, macroRegistry),
      role: 'system',
      depth: e.entry.depth ?? 0,
      order: e.entry.order,
    });
  }

  // Sort depth items: shallower depth = closer to user input
  depthItems.sort((a, b) => a.depth - b.depth || a.order - b.order);

  // Build interleaved message list
  // Safety: clamp all depth values to [0, hLen] to prevent out-of-range insertion
  const interleavedMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  const hLen = recentHistory.length;
  const clampedDepthItems = depthItems.map(d => ({
    ...d,
    depth: Math.max(0, Math.min(d.depth, hLen)),
  }));

  // Group depth items by their (clamped) depth
  const depthGroups = new Map<number, typeof clampedDepthItems>();
  for (const d of clampedDepthItems) {
    const depth = d.depth;
    if (!depthGroups.has(depth)) depthGroups.set(depth, []);
    depthGroups.get(depth)!.push(d);
  }

  // Walk history from oldest to newest
  // depth=N means insert after the Nth message from the END
  //   N=0: after last history message (right before user input)
  //   N=hLen: before first history message
  for (let i = 0; i < hLen; i++) {
    const depth = hLen - i; // distance from end

    if (i === 0) {
      // Items at depth >= hLen go before first history message
      const deep = depthGroups.get(hLen) || [];
      for (const item of deep) {
        interleavedMessages.push({ role: item.role, content: item.content });
      }
    }

    // Items at exact depth
    const items = depthGroups.get(depth) || [];
    for (const item of items) {
      interleavedMessages.push({ role: item.role, content: item.content });
    }

    // History message
    interleavedMessages.push(recentHistory[i]);
  }

  // Handle hLen=0 edge case: inject ALL depth items (clamped to 0) before user input
  if (hLen === 0) {
    const allItems = depthGroups.get(0) || [];
    for (const item of allItems) {
      interleavedMessages.push({ role: item.role, content: item.content });
    }
  }

  // Items at depth 0 (closest to user input)
  const zeroItems = depthGroups.get(0) || [];
  // Only add if hLen > 0 (they were already added above in the hLen=0 branch)
  if (hLen > 0) {
    for (const item of zeroItems) {
      interleavedMessages.push({ role: item.role, content: item.content });
    }
  }

  // ---- 8. Assemble final messages ----
  const assembledMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];

  if (systemAccumulator.trim()) {
    assembledMessages.push({ role: 'system', content: systemAccumulator });
  }
  assembledMessages.push(...interleavedMessages);

  const resolvedUserInput = replaceMacros(userInput, macroCtx, macroRegistry);
  assembledMessages.push({ role: 'user', content: resolvedUserInput });

  // WiAfter at_depth entries as trailing system note
  if (wiAfterContent && contextTemplate?.wiAfterSlot === 'before_user') {
    // Insert before user input
    const lastIdx = assembledMessages.length - 1;
    assembledMessages.splice(lastIdx, 0, { role: 'system', content: wiAfterContent });
  }

  // ---- 9. Context template serialization ----
  let finalMessages = assembledMessages;
  let finalPrompt: string | undefined;
  let stopSeqs: string[] = [];

  if (contextTemplate && contextTemplate.name !== 'openai') {
    const result = serializeContext({
      systemMessages: assembledMessages.filter(m => m.role === 'system'),
      history: assembledMessages.filter(m => m.role !== 'system' && m.role !== 'user').concat(
        assembledMessages.filter(m => m.role === 'user').slice(0, -1)
      ),
      userInput: resolvedUserInput,
      wiBefore: wiBeforeContent,
      wiAfter: wiAfterContent,
      template: contextTemplate,
    });
    if (result.prompt) {
      finalPrompt = result.prompt;
      finalMessages = []; // text-based templates don't use messages array
    }
    stopSeqs = result.stop;
  }

  // Collect stop sequences from template + preset
  const presetStops = structuredPreset?.sampling?.stop || [];
  stopSeqs = [...new Set([...stopSeqs, ...presetStops])];

  const systemPrompt = assembledMessages
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n\n');

  return {
    messages: finalMessages,
    prompt: finalPrompt,
    matchedEntries: uniqueEntries,
    systemPrompt,
    stopSequences: stopSeqs,
  };
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

/** Build PromptBlock[] from legacy preset.settings.prompt_order + prompts for backward compat. */
function buildLegacyPromptBlocks(preset: ChatPreset): PromptBlock[] {
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

  const blocks: PromptBlock[] = [];

  for (let i = 0; i < promptOrder.length; i++) {
    const item = promptOrder[i];
    if (item.enabled === false) continue;

    // Resolve content
    let content = '';
    if (item.identifier === 'charDescription') {
      content = preset.settings.character_description || '';
    } else if (item.identifier === 'charPersonality') {
      content = preset.settings.character_personality || '';
    } else if (item.identifier === 'scenario') {
      content = preset.settings.scenario || '';
    } else if (item.identifier === 'worldInfoBefore' || item.identifier === 'worldInfoAfter') {
      continue; // handled by lorebook matching
    } else if (item.identifier === 'chatHistory') {
      continue; // handled by history
    } else {
      const custom = prompts.find(p => p.identifier === item.identifier);
      if (custom?.content) {
        content = custom.content;
      } else {
        const direct = preset.settings[item.identifier];
        if (typeof direct === 'string') content = direct;
      }
    }

    if (!content.trim()) continue;

    blocks.push({
      name: item.name || item.identifier,
      identifier: item.identifier,
      content,
      enabled: true,
      role: item.role || 'system',
      injection_position: 1, // default after_char
      injection_depth: 0,
      order: i,
    });
  }

  return blocks;
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
