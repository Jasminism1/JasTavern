/**
 * Context Template System
 *
 * Defines how system prompt, history, world info, and user input are assembled
 * into the final text sent to the LLM.
 *
 * Built-in templates: openai (JSON array), chatml, alpaca, llama3
 * Users can select one per preset or leave it as "openai" (default).
 */

import type { ContextTemplate } from './types';

// ========== Built-in Templates ==========

const BUILTIN_TEMPLATES: ContextTemplate[] = [
  {
    name: 'openai',
    label: 'OpenAI / JSON (默认)',
    systemPrefix: '',
    systemSuffix: '',
    userPrefix: '',
    userSuffix: '',
    assistantPrefix: '',
    assistantSuffix: '',
    defaultStop: [],
    wiBeforeSlot: 'after_system',
    wiAfterSlot: 'before_user',
  },
  {
    name: 'chatml',
    label: 'ChatML',
    systemPrefix: '<|im_start|>system\n',
    systemSuffix: '<|im_end|>\n',
    userPrefix: '<|im_start|>user\n',
    userSuffix: '<|im_end|>\n',
    assistantPrefix: '<|im_start|>assistant\n',
    assistantSuffix: '<|im_end|>\n',
    defaultStop: ['<|im_start|>', '<|im_end|>'],
    wiBeforeSlot: 'after_system',
    wiAfterSlot: 'before_user',
  },
  {
    name: 'alpaca',
    label: 'Alpaca',
    systemPrefix: '### Instruction:\n',
    systemSuffix: '\n\n',
    userPrefix: '### Input:\n',
    userSuffix: '\n\n',
    assistantPrefix: '### Response:\n',
    assistantSuffix: '\n\n',
    defaultStop: ['### Instruction:', '### Input:', '### Response:'],
    wiBeforeSlot: 'after_system',
    wiAfterSlot: 'before_user',
  },
  {
    name: 'llama3',
    label: 'Llama 3',
    systemPrefix: '<|start_header_id|>system<|end_header_id|>\n\n',
    systemSuffix: '<|eot_id|>',
    userPrefix: '<|start_header_id|>user<|end_header_id|>\n\n',
    userSuffix: '<|eot_id|>',
    assistantPrefix: '<|start_header_id|>assistant<|end_header_id|>\n\n',
    assistantSuffix: '<|eot_id|>',
    defaultStop: ['<|start_header_id|>', '<|eot_id|>'],
    wiBeforeSlot: 'after_system',
    wiAfterSlot: 'before_user',
  },
];

const templateMap = new Map<string, ContextTemplate>();
for (const t of BUILTIN_TEMPLATES) templateMap.set(t.name, t);

/** Get a built-in template by name. Returns undefined if not found. */
export function getBuiltinTemplate(name: string): ContextTemplate | undefined {
  return templateMap.get(name);
}

/** List all available built-in template names + labels. */
export function listBuiltinTemplates(): { name: string; label: string }[] {
  return BUILTIN_TEMPLATES.map(t => ({ name: t.name, label: t.label }));
}

// ========== Serialization ==========

export interface SerializeInput {
  systemMessages: { content: string }[];
  history: { role: 'system' | 'user' | 'assistant'; content: string }[];
  userInput: string;
  wiBefore: string;   // world info to inject before
  wiAfter: string;     // world info to inject after
  template: ContextTemplate;
}

export interface SerializeOutput {
  /** For templates that produce a single text prompt (ChatML, Alpaca, Llama3). */
  prompt?: string;
  /** For OpenAI/default template — passes through as messages array. */
  messages?: { role: 'system' | 'user' | 'assistant'; content: string }[];
  /** Merged stop sequences (template defaults + preset stops). */
  stop: string[];
}

/**
 * Serialize assembled messages using the given context template.
 *
 * For "openai" template: output is a messages array (no wrapping).
 * For ChatML / Alpaca / Llama3: output is a single concatenated prompt string.
 */
export function serializeContext(input: SerializeInput): SerializeOutput {
  const { systemMessages, history, userInput, wiBefore, wiAfter, template } = input;

  // For OpenAI, just return messages array with world info injected into system
  if (template.name === 'openai') {
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];

    // Build system prompt from systemMessages + world info
    const systemParts: string[] = [];

    if (template.wiBeforeSlot === 'before_system' && wiBefore) {
      systemParts.push(wiBefore);
    }

    for (const sm of systemMessages) {
      systemParts.push(sm.content);
    }

    if (template.wiBeforeSlot === 'after_system' && wiBefore) {
      systemParts.push(wiBefore);
    }
    if (template.wiAfterSlot === 'after_system' && wiAfter) {
      systemParts.push(wiAfter);
    }

    const systemContent = systemParts.filter(Boolean).join('\n\n');
    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }

    // Inject wiAfter before user input if configured
    for (const h of history) {
      // inject wi as a system message before user messages
      if (template.wiAfterSlot === 'before_user' && h.role === 'user' && wiAfter) {
        messages.push({ role: 'system', content: wiAfter });
      }
      messages.push(h);
    }

    if (template.wiAfterSlot === 'before_user' && wiAfter) {
      messages.push({ role: 'system', content: wiAfter });
    }

    messages.push({ role: 'user', content: userInput });

    return { messages, stop: [...template.defaultStop] };
  }

  // For text-based templates (ChatML, Alpaca, Llama3): serialize to single prompt
  const parts: string[] = [];

  // System prompt(s)
  const systemParts: string[] = [];
  if (template.wiBeforeSlot === 'before_system' && wiBefore) {
    systemParts.push(wiBefore);
  }
  for (const sm of systemMessages) {
    systemParts.push(sm.content);
  }
  if (template.wiBeforeSlot === 'after_system' && wiBefore) {
    systemParts.push(wiBefore);
  }
  if (template.wiAfterSlot === 'after_system' && wiAfter) {
    systemParts.push(wiAfter);
  }

  const sysContent = systemParts.filter(Boolean).join('\n\n');
  if (sysContent) {
    parts.push(template.systemPrefix + sysContent + template.systemSuffix);
  }

  // History
  for (const h of history) {
    if (template.wiAfterSlot === 'before_user' && h.role === 'user' && wiAfter) {
      parts.push(template.systemPrefix + wiAfter + template.systemSuffix);
    }
    if (h.role === 'system') {
      parts.push(template.systemPrefix + h.content + template.systemSuffix);
    } else if (h.role === 'user') {
      parts.push(template.userPrefix + h.content + template.userSuffix);
    } else if (h.role === 'assistant') {
      parts.push(template.assistantPrefix + h.content + template.assistantSuffix);
    }
  }

  // User input
  parts.push(template.userPrefix + userInput + template.userSuffix);
  // Add assistant prefix to prompt the model to generate
  parts.push(template.assistantPrefix);

  return {
    prompt: parts.join(''),
    stop: [...template.defaultStop],
  };
}