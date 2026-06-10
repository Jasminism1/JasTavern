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
  /** Variables accumulated via {{setvar::name::value}} during assembly. Merge into chat.variables. */
  setVars: Record<string, string>;
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

  // ---- 6. SillyTavern role alternation algorithm ----
  // Walk blocks in order. First role → first message. New role → new message.
  // Already-used role → merge into current message.
  // setvar blocks are side-effects only, never emitted.
  const messages: { role: OutputRole; content: string }[] = [];
  const usedRoles = new Set<OutputRole>();
  let curRole: OutputRole | null = null;
  let curContent = '';
  let hasChatHistory = false;

  for (const block of promptBlocks) {
    // chatHistory — inject conversation history
    if (block.identifier === 'chatHistory') {
      hasChatHistory = true;
      // Finish current message before inserting history
      if (curContent.trim()) {
        messages.push({ role: curRole!, content: curContent.trim() });
        curContent = '';
      }
      for (const h of recentHistory) {
        pushMessage(messages, usedRoles, { role: h.role, content: h.content }, curRole, curContent);
        // Update curRole/curContent from pushMessage's side effects...
        // Actually pushMessage handles the alternation internally.
      }
      // After chatHistory, we need to continue with the next block
      // Reset tracking so the next block starts fresh
      if (messages.length > 0) {
        curRole = messages[messages.length - 1].role;
        curContent = '';
        usedRoles.add(curRole);
      }
      continue;
    }

    const rawContent = resolveBlockContent(block, {
      preset, uniqueEntries, structuredPreset, variables,
    });

    if (!rawContent || !rawContent.trim()) continue;

    const resolved = replaceMacros(rawContent, macroCtx, macroRegistry);
    if (!resolved.trim()) continue;

    // SillyTavern alternation: first role → first msg, new role → new msg, same/used → merge
    const role = block.role;

    if (curRole === null) {
      // First block
      curRole = role;
      curContent = resolved;
      usedRoles.add(role);
    } else if (role === curRole) {
      // Same role — append
      curContent += '\n\n' + resolved;
    } else if (!usedRoles.has(role)) {
      // New role, not yet used — start new message
      if (curContent.trim()) {
        messages.push({ role: curRole, content: curContent.trim() });
      }
      curRole = role;
      curContent = resolved;
      usedRoles.add(role);
    } else {
      // Role already used — merge into current message
      curContent += '\n\n' + resolved;
    }
  }

  // Push final message
  if (curContent.trim()) {
    messages.push({ role: curRole!, content: curContent.trim() });
  }

  // If chatHistory wasn't inserted, append it now
  if (!hasChatHistory) {
    for (const h of recentHistory) {
      pushMessage(messages, usedRoles, { role: h.role, content: h.content }, curRole, curContent);
    }
    if (messages.length > 0) {
      curRole = messages[messages.length - 1].role;
    }
  }

  // ---- 7. Ensure system message at top ----
  const finalMessages = ensureSystemTop(messages);

  // Append user input as final message (always a user message)
  const resolvedUserInput = replaceMacros(userInput, macroCtx, macroRegistry);
  emitMessage(finalMessages, { role: 'user', content: resolvedUserInput });

  const systemPrompt = finalMessages
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n\n');

  // ---- 8. Context template serialization ----
  let outputMessages = finalMessages;
  let finalPrompt: string | undefined;
  let stopSeqs: string[] = [];

  if (contextTemplate && contextTemplate.name !== 'openai') {
    const wiBefore = uniqueEntries.filter(e => e.entry.position !== 'at_depth')
      .map(e => replaceMacros(e.entry.content, macroCtx, macroRegistry)).join('\n\n');
    const wiAfter = uniqueEntries.filter(e => e.entry.position === 'at_depth')
      .map(e => replaceMacros(e.entry.content, macroCtx, macroRegistry)).join('\n\n');
    const result = serializeContext({
      systemMessages: finalMessages.filter(m => m.role === 'system'),
      history: finalMessages.filter(m => m.role !== 'system' && m.role !== 'user'),
      userInput: resolvedUserInput,
      wiBefore,
      wiAfter,
      template: contextTemplate,
    });
    if (result.prompt) {
      finalPrompt = result.prompt;
      outputMessages = [];
    }
    stopSeqs = result.stop;
  }

  const presetStops = structuredPreset?.sampling?.stop || [];
  stopSeqs = [...new Set([...stopSeqs, ...presetStops])];

  return {
    messages: outputMessages,
    prompt: finalPrompt,
    matchedEntries: uniqueEntries,
    systemPrompt,
    stopSequences: stopSeqs,
    setVars: macroCtx.setVars || {},
  };
}

// ========== Message helpers ==========

/** Simple emit: merge same-role consecutive messages. */
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

/** Push a message respecting ST alternation rules. */
function pushMessage(
  list: { role: OutputRole; content: string }[],
  usedRoles: Set<OutputRole>,
  msg: { role: OutputRole; content: string },
  _curRole: OutputRole | null,
  _curContent: string,
): void {
  if (!msg.content.trim()) return;

  if (!usedRoles.has(msg.role)) {
    // New role — start a new message
    list.push({ role: msg.role, content: msg.content });
    usedRoles.add(msg.role);
  } else {
    // Already-used role — merge into last message
    const last = list[list.length - 1];
    if (last) {
      last.content += '\n\n' + msg.content;
    } else {
      list.push({ role: msg.role, content: msg.content });
    }
  }
}

/** Ensure exactly one system message at the top. If none, prepend empty system. */
function ensureSystemTop(
  msgs: { role: OutputRole; content: string }[],
): { role: OutputRole; content: string }[] {
  const result: { role: OutputRole; content: string }[] = [];
  let sysContent = '';

  for (const m of msgs) {
    if (m.role === 'system') {
      sysContent += (sysContent ? '\n\n' : '') + m.content;
    } else {
      result.push(m);
    }
  }

  // Always prepend system — use empty content if none found
  result.unshift({ role: 'system', content: sysContent || '\n\n\n\n\n\n' });

  return result;
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
  // Only use custom content if non-empty — else fall through to direct settings
  if (custom?.content) return custom.content;

  // For built-in identifiers (main, nsfw, jailbreak, etc.) → preset.settings[identifier]
  const direct = preset.settings[block.identifier];
  if (typeof direct === 'string' && direct.trim()) return direct;

  // If block has its own content (from structuredPreset importer)
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
    setVars: {}, // populated during macro replacement, read by caller
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
