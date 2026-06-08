# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JasTavern — a Vue 3 + TypeScript + Vite + Pinia immersive game UI that replaces SillyTavern's native frontend. It's built as an **IIFE library** (`st-custom-ui.js`) injected into SillyTavern via an extension's `layer0.html`, which posts character context via `postMessage`. Also runs standalone with a dev-mode "Enter UI" button.

## Commands

```bash
npm install              # Install dependencies
npm run dev              # Start Vite dev server on port 5173
npm run build            # IIFE build → dist/st-custom-ui.js
npm run preview          # Preview built output
```

- **No test framework** is configured. Manual verification via `npm run dev` and real SillyTavern integration testing.
- `npm run build` auto-runs `scripts/build-dist-html.js` (postbuild) which generates `dist/index.html` for standalone hosting (Vercel, etc.).

## Architecture

### Dual-environment boot (`src/main.ts`)
- **Inside ST**: mounts to `#st-custom-ui-root` (fixed 100vw overlay at z-index 999999), auto-calls `enterUI()`.
- **Standalone**: mounts to `#app`, shows a floating "Enter UI" button.
- Bridge listener (`listenForStBridge()`) starts before mount to catch early postMessage data.
- Database init (`initializeDatabase()`) creates default preset + settings if empty.
- Fallback error UI is rendered on fatal mount failure.

### Core engine (`src/sillytavern/`)
| Module | Purpose |
|---|---|
| `types.ts` | All domain types: `Lorebook`, `LorebookEntry`, `ChatPreset`, `AppSettings`, `ChatSession`, `ChatMessage`, `ParsedTags`, `VarsPatch`. Also `DEFAULT_SETTINGS`, `DEFAULT_PROMPT_ORDER`, `DEFAULT_FORMAT_PROMPT`, `createDefaultPreset()`. |
| `database.ts` | Dexie wrapper over `SillyTavernWebDB` (v3). Tables: `lorebooks`, `presets`, `settings`, `chats`. Full backup/restore via `exportAllData()`/`importAllData()`. |
| `lorebook-engine.ts` | `LorebookEngine` class: keyword matching with selective logic (and_any/not_all/not_any/and_all), recursive scanning, position grouping. |
| `prompt-assembler.ts` | `assemblePrompt()`: builds the final LLM messages array from preset prompt_order, lorebook matches, history (token-budget-aware truncation), variables block, and format prompt. `replaceMacros()` handles `{{user}}`, `{{char}}`, `{{original}}`, and custom variable placeholders. |
| `variables.ts` | `extractVariables()`: parses `<var name="x" value="y" />` tags from AI output. `truncateChatAt()`, `branchChat()`, `aggregateEvents()`. Exports `USER_ROLE`. |
| `vars-merger.ts` | `parseVarsBlock()`: JSON-parses `<vars>` content. `applyVarsPatch()`: deep-merges parsed vars into existing state. |
| `stream-parser.ts` | `StreamTagParser`: state machine (NORMAL → BUFFER_TAG → TAGGED/OPAQUE) for parsing streaming XML-like responses. Emits `tag-open`, `tag-chunk`, `tag-close`, `option-line`, `raw` events. |
| `importer.ts` | Converts between native SillyTavern lorebook/preset JSON formats and internal types. Handles position mapping (0–7), selective logic mapping (0–3), character filter translation. Also scans ST's own IndexedDB for data import. |
| `st-integration.ts` | **The bridge**: `listenForStBridge()` listens for `postMessage({type:'st-context'})`. `readStCharacter()` reads character info (name/description/personality/scenario) from bridged data or direct `window.SillyTavern.getContext()`. `isInSillyTavern()` detects ST environment. |
| `api-router.ts` | API endpoint resolution and dual-model routing (primary/secondary). |
| `editor-utils.ts` | Utility helpers for the ST editor integration. |

### State management (`src/stores/`)
| Store | Key responsibility |
|---|---|
| `app.ts` (`useAppStore`) | UI visibility (`isUIActive`), modal toggling (`activeModal`), AI-generation status, character status (HP/SP/mood/affection — driven by AI JSON output). |
| `conversationTree.ts` | **Branching conversation tree** persisted to IndexedDB (`st-ui-conversations`). Supports: addChildNode, deleteSubtree, summarizeNode (context pruning), buildContext (LLM-ready messages), jsonl export/import. Computed: `activePath`, `activePathMessages`. |
| `background.ts` | Background image management: built-in (auto-scanned from `src/assets/backgrounds/` via `import.meta.glob`) + user-uploaded (Object URLs). Persists current selection to localStorage. Fullscreen preview support. |
| `settings.ts` (`useSettingsStore`) | Game display settings: font, animation mode, opacity, font size. Placeholder modules for story/background/recall/other panels. |
| `apiStorage.ts` | Securely stores API credentials (baseUrl, apiKey, model) in a **separate** IndexedDB (`sillytavern-ui`) — not in the Dexie-managed database. |
| `requestLogger.ts` | In-memory ring buffer (max 200 entries) of API request/response/error logs for the RequestLogPanel debugging UI. |

### Composable (`src/composables/useSillytavern.ts`)
**The primary orchestrator** — `useSillytavern()` connects stores ↔ ST engine ↔ API. Module-level reactive state (shared across all callers):
- `sendMessage()`: the core pipeline — tree node creation → lorebook matching → prompt assembly → fetch API → variable extraction → save to both conversation tree (IndexedDB) and chat session (Dexie).
- `editMessage()`: truncates chat at edited message, re-sends.
- `branchFromMessage()`: creates a new chat session branched from a specific message index.
- CRUD for lorebooks, presets, chats, settings.

### Services (`src/services/db.ts`)
Separate raw IndexedDB wrapper (`st-ui-conversations`) for conversation tree nodes. Provides `saveNode`, `loadAllNodes`, `deleteNodes`, `clearAll`, `exportToJsonl`, `importFromJsonl`. Uses `TreeNode` interface with tree-specific fields (parentId, layer, isSummarized, summaryContent).

### Component hierarchy
```
App.vue
├── TopBar.vue                    # Top navigation bar
├── PortraitLayer.vue             # Left column — character portrait / Live2D
├── DialoguePanel.vue             # Center column — message flow + input area
├── StatusPanel.vue               # Right column — character stats (HP/SP/mood/affection)
├── CharDetailPanel.vue           # Modal — character details
├── EventLogPanel.vue             # Modal — event log
├── MapPanel.vue                  # Modal — world map
├── SettingsPanel.vue             # Modal — settings (tabs)
│   ├── InterfacePanel.vue        #   Font, animation, opacity settings
│   ├── StoryPanel.vue            #   Story/plot settings (placeholder)
│   ├── BackgroundPanel.vue       #   Background selection (built-in + upload)
│   ├── RecallingPanel.vue        #   Replay/CG gallery (placeholder)
│   ├── OtherPanel.vue            #   Volume, shortcuts, data reset (placeholder)
│   ├── LorebookManager.vue       #   World book / lorebook management
│   ├── PresetManager.vue         #   Chat completion preset management
│   ├── RequestLogPanel.vue       #   API request/response debug log viewer
│   └── ApiPanel.vue              #   API key + endpoint configuration
└── OthersPanel.vue               # Modal — miscellaneous
```

### Key data flows

1. **Message send**: `DialoguePanel` → `useSillytavern().sendMessage()` → `conversationTree.onNewMessage('user')` → `assemblePrompt(history, preset, lorebooks, variables)` → `fetch(apiEndpoint)` → `extractVariables(reply)` → `conversationTree.onNewMessage('assistant')` → `saveChat()` to Dexie.

2. **ST integration**: `layer0.html` (ST extension) posts `{type:'st-context', data:{characters, characterId}}` → `listenForStBridge()` captures it → `useSillytavern().loadAll()` reads character name/description/personality/scenario and auto-fills preset fields.

3. **Variable system**: AI outputs `<vars>{"gold":+10,"hp":38}</vars>` → `parseVarsBlock()` → `applyVarsPatch()` deep-merges into `chat.variables` → displayed in StatusPanel and injected into subsequent prompts via `formatVariablesForPrompt()`.

4. **Conversation branching**: Users can branch from any message → `branchFromMessage()` creates a new `ChatSession` with messages truncated at the branch point → stored as a separate chat in Dexie.

### Build output contract
- **IIFE** named `STCustomUI`, single file `dist/st-custom-ui.js`.
- CSS is inlined into JS (via `vite-plugin-css-injected-by-js`), no separate stylesheet in the IIFE.
- `cssCodeSplit: false` ensures all CSS is captured by the injection plugin.
- `dist/index.html` is generated post-build for standalone hosting.
- The IIFE bundle is designed to be loaded by SillyTavern's extension system alongside a `layer0.html` that provides the postMessage bridge.

### Environment detection
`src/env.ts` exports `isInSillyTavern()` which checks `window.SillyTavern`. The `st-integration.ts` module has its own version that also considers `bridgeReceived` (postMessage flag). Both are used in different contexts — `env.ts` for quick checks, `st-integration.ts` for bridge-aware logic.
