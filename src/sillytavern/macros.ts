/**
 * Pluggable Macro Registry
 *
 * - register / unregister macros at runtime
 * - per-macro enable/disable
 * - global on/off switch
 * - recursive resolution with depth limit (prevents cycles)
 * - scan() returns macro names found in text
 * - category-based grouping for UI display
 */

export type MacroCategory = 'character' | 'context' | 'system' | 'custom';

export interface MacroDef {
  name: string;       // without {{ }} — e.g. "user"
  description: string; // Chinese description for UI
  category: MacroCategory;
  /** Return the replacement string, or null/undefined to skip (macro stays as-is). */
  handler: (ctx: MacroContext) => string | null | undefined;
  enabled: boolean;
}

export interface MacroContext {
  userName: string;
  characterName: string;
  userInput: string;
  variables?: Record<string, string | number>;
  /** Available for context macros like {{lastMessage}} */
  lastMessage?: string;
  lastUserMessage?: string;
  lastCharMessage?: string;
  /** Current model name */
  model?: string;
  /** Character fields */
  characterDescription?: string;
  characterPersonality?: string;
  scenario?: string;
  /** Generic bag for custom macros */
  extra?: Record<string, any>;
  /** Accumulated setvar calls during macro replacement. Callers should merge into chat.variables. */
  setVars?: Record<string, string>;
}

const MAX_RECURSIVE_DEPTH = 3;

export class MacroRegistry {
  private macros = new Map<string, MacroDef>();
  private _enabled = true; // global switch

  get enabled(): boolean {
    return this._enabled;
  }

  /** Enable/disable ALL macros globally. */
  setEnabled(on: boolean): void {
    this._enabled = on;
  }

  /** Register a macro. Overwrites if name already exists. */
  register(macro: MacroDef): void {
    this.macros.set(macro.name, { ...macro });
  }

  /** Remove a macro by name. */
  unregister(name: string): boolean {
    return this.macros.delete(name);
  }

  /** Enable a single macro. */
  enable(name: string): void {
    const m = this.macros.get(name);
    if (m) m.enabled = true;
  }

  /** Disable a single macro. */
  disable(name: string): void {
    const m = this.macros.get(name);
    if (m) m.enabled = false;
  }

  /** Toggle a single macro. */
  toggle(name: string): boolean {
    const m = this.macros.get(name);
    if (m) m.enabled = !m.enabled;
    return m?.enabled ?? false;
  }

  /** Enable all macros. */
  enableAll(): void {
    this.macros.forEach(m => { m.enabled = true; });
  }

  /** Disable all macros (global stays on, individual off). */
  disableAll(): void {
    this.macros.forEach(m => { m.enabled = false; });
  }

  /** Get macro metadata (for UI display). */
  get(name: string): MacroDef | undefined {
    return this.macros.get(name);
  }

  /** List all macros grouped by category. */
  list(): MacroDef[] {
    return Array.from(this.macros.values());
  }

  /** List macros in a specific category. */
  listByCategory(cat: MacroCategory): MacroDef[] {
    return this.list().filter(m => m.category === cat);
  }

  /** List enabled macros only. */
  listEnabled(): MacroDef[] {
    return this.list().filter(m => m.enabled);
  }

  /**
   * Resolve a single macro name → replacement string.
   * Returns empty string if the macro is disabled / doesn't exist / handler returns null.
   */
  resolve(name: string, ctx: MacroContext, _depth: number = 0): string {
    if (_depth > MAX_RECURSIVE_DEPTH) return `{{${name}}}`;
    const m = this.macros.get(name);
    if (!m || !m.enabled) return `{{${name}}}`;
    try {
      const val = m.handler(ctx);
      if (val == null) return `{{${name}}}`;
      // Recursively resolve macros inside the resolved value
      return this.replaceAll(val, ctx, _depth + 1);
    } catch {
      return `{{${name}}}`;
    }
  }

  /**
   * Replace all {{macro}} occurrences in a template string.
   * Also resolves ${VARIABLE} placeholders from ctx.variables.
   */
  replaceAll(template: string, ctx: MacroContext, _depth: number = 0): string {
    if (!this._enabled || _depth > MAX_RECURSIVE_DEPTH) {
      // Global off — only replace ${VAR} style variables
      return template.replace(/\{\{([^{}]+)\}\}/g, (_m, key) => {
        const k = String(key).trim();
        const v = ctx.variables?.[k];
        return v !== undefined ? String(v) : _m;
      });
    }

    return template.replace(/\{\{([^{}]+)\}\}/g, (_match, rawKey) => {
      const raw = String(rawKey).trim();

      // Handle {{setvar::name::value}} — side-effect-only, returns ''
      if (raw.startsWith('setvar::')) {
        const parts = raw.split('::');
        if (parts.length >= 3) {
          const varName = parts[1].trim();
          const varValue = parts.slice(2).join('::').trim();
          if (ctx.setVars) {
            ctx.setVars[varName] = varValue;
          }
        }
        return '';
      }

      // Handle {{getvar::name}} — read from variables
      if (raw.startsWith('getvar::')) {
        const varName = raw.split('::').slice(1).join('::').trim();
        if (ctx.variables && varName in ctx.variables) return String(ctx.variables[varName]);
        if (ctx.setVars && varName in ctx.setVars) return String(ctx.setVars[varName]);
        return '';
      }
      const key = String(rawKey).trim();

      // Try variable first ({{hp}}, {{gold}} style numeric vars)
      if (ctx.variables && key in ctx.variables) {
        return String(ctx.variables[key]);
      }

      // Try macro registry
      const m = this.macros.get(key);
      if (m && m.enabled) {
        try {
          const val = m.handler(ctx);
          if (val != null) {
            // Recursively resolve macros inside the resolved value
            return this.replaceAll(val, ctx, _depth + 1);
          }
        } catch { /* fall through */ }
      }

      return _match; // keep as-is
    });
  }

  /**
   * Scan text for all {{...}} macro names. Returns deduplicated list.
   * Useful for UI to show "this template uses macros: user, char, ..."
   */
  scan(text: string): string[] {
    const found = new Set<string>();
    const re = /\{\{([^{}]+)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const key = String(m[1]).trim();
      if (this.macros.has(key)) found.add(key);
    }
    return Array.from(found);
  }
}

/** Create a registry pre-loaded with the standard built-in macros. */
export function createDefaultRegistry(): MacroRegistry {
  const reg = new MacroRegistry();

  // ---- Character macros ----
  reg.register({
    name: 'user', description: '用户名称', category: 'character',
    handler: (ctx) => ctx.userName, enabled: true,
  });
  reg.register({
    name: 'char', description: '角色名称', category: 'character',
    handler: (ctx) => ctx.characterName, enabled: true,
  });
  reg.register({
    name: 'description', description: '角色描述', category: 'character',
    handler: (ctx) => ctx.characterDescription ?? null, enabled: true,
  });
  reg.register({
    name: 'personality', description: '角色性格', category: 'character',
    handler: (ctx) => ctx.characterPersonality ?? null, enabled: true,
  });
  reg.register({
    name: 'scenario', description: '场景设定', category: 'character',
    handler: (ctx) => ctx.scenario ?? null, enabled: true,
  });

  // ---- Context macros ----
  reg.register({
    name: 'lastMessage', description: '最后一条消息（任意角色）', category: 'context',
    handler: (ctx) => ctx.lastMessage ?? null, enabled: true,
  });
  reg.register({
    name: 'lastUserMessage', description: '本轮用户消息', category: 'context',
    handler: (ctx) => ctx.userInput ?? null, enabled: true,
  });
  reg.register({
    name: 'lastCharMessage', description: '最后一条 AI 消息', category: 'context',
    handler: (ctx) => ctx.lastCharMessage ?? null, enabled: true,
  });

  // ---- System macros ----
  reg.register({
    name: 'model', description: '当前模型名', category: 'system',
    handler: (ctx) => ctx.model ?? null, enabled: true,
  });

  return reg;
}
