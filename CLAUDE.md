# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JasTavern — a standalone Vue 3 + TypeScript + Vite + Pinia AI chat web application, inspired by SillyTavern. It's a self-contained immersive game UI built as an **IIFE library** (`st-custom-ui.js`), deployed via GitHub Pages at `jasminism1.github.io/JasTavern/`.

- **Standalone mode** (default): Mounts to `#app`, shows a floating "Enter UI" button to start the game UI.
- **SillyTavern embed** (optional): `layer0.html` serves as an entry point for ST users. The Vue app can be loaded in an iframe inside ST. No postMessage bridge — ST users interact with the app as a standalone web page.

## Commands

```bash
npm install              # Install dependencies
npm run dev              # Start Vite dev server on port 5173
npm run build            # IIFE build → dist/st-custom-ui.js + dist/index.html
npm run preview          # Preview built output
```

- **No test framework** is configured. Manual verification via `npm run dev`.
- `npm run build` auto-runs `scripts/build-dist-html.js` (postbuild) which generates `dist/index.html`.

## Tags

- `safe-v2` — Last known stable commit (f413260) before major refactoring. Tagged 2026-06-08.

## Architecture

### Boot sequence (`src/main.ts`)

Standalone boot: database init → `createApp(App)` + `createPinia()` → mount to `#app`. Fallback error UI on fatal mount failure. No ST environment detection, no bridge listener.

### Core engine (`src/sillytavern/`)

| Module | Purpose |
|---|---|
| `types.ts` | All domain types: `Lorebook`, `LorebookEntry`, `ChatPreset`, `AppSettings`, `ChatSession`, `ChatMessage`, `ParsedTags`, `VarsPatch`. Also `DEFAULT_SETTINGS`, `DEFAULT_PROMPT_ORDER`, `DEFAULT_FORMAT_PROMPT`, `createDefaultPreset()`. |
| `database.ts` | Dexie wrapper over `SillyTavernWebDB` (v3). Tables: `lorebooks`, `presets`, `settings`, `chats`. Full backup/restore via `exportAllData()`/`importAllData()`. |
| `lorebook-engine.ts` | `LorebookEngine` class: keyword matching with selective logic (and_any/not_all/not_any/and_all), recursive scanning, position grouping. |
| `prompt-assembler.ts` | `assemblePrompt()`: builds the final LLM messages array from preset prompt_order, lorebook matches, history (token-budget-aware truncation), variables block, and format prompt. `replaceMacros()` handles `{{user}}`, `{{char}}`, `{{original}}`, and custom variable placeholders. |
| `variables.ts` | `extractVariables()`: parses `<var name="x" value="y" />` tags from AI output. `truncateChatAt()`, `branchChat()`, `aggregateEvents()`. Exports `USER_ROLE`. |
| `vars-merger.ts` | `parseVarsBlock()`: JSON-parses `<vars>` content. `applyVarsPatch()`: deep-merges parsed vars into existing state. |
| `stream-parser.ts` | `StreamTagParser`: state machine (NORMAL → BUFFER_TAG → TAGGED/OPAQUE) for parsing streaming XML-like responses. |
| `importer.ts` | Converts between native SillyTavern lorebook/preset JSON formats and internal types. Handles position mapping (0–7), selective logic mapping (0–3), character filter translation. |
| `api-router.ts` | API endpoint resolution and dual-model routing (primary/secondary). |
| `editor-utils.ts` | Pure utility functions for lorebook/preset CRUD: `createDefaultEntry()`, `createDefaultLorebook()`, `updateEntry()`, `removeEntry()`, `movePromptItem()`, `clampNumber()`. |

### State management (`src/stores/`)

| Store | Key responsibility |
|---|---|
| `app.ts` (`useAppStore`) | UI visibility (`isUIActive`), modal toggling (`activeModal`), AI-generation status, character status (HP/SP/mood/affection — driven by AI JSON output). |
| `conversationTree.ts` | **Branching conversation tree** persisted to IndexedDB (`st-ui-conversations`). Supports: addChildNode, deleteSubtree, summarizeNode (context pruning), buildContext (LLM-ready messages), jsonl export/import. |
| `background.ts` | Background image management: built-in (auto-scanned from `src/assets/backgrounds/`) + user-uploaded. Persists current selection to localStorage. Fullscreen preview support. |
| `settings.ts` (`useSettingsStore`) | Game display settings: font, animation mode, opacity, font size. Placeholder modules for story/background/recall/other panels. |
| `apiStorage.ts` | API credentials (baseUrl, apiKey, model) in a **separate** IndexedDB (`sillytavern-ui`) — not in the Dexie database. |
| `requestLogger.ts` | In-memory ring buffer (max 200 entries) of API request/response/error logs for RequestLogPanel debugging. |

### Composable (`src/composables/useSillytavern.ts`)

**The primary orchestrator** — `useSillytavern()` connects stores ↔ engine ↔ API. Module-level reactive state (shared across all callers):

- `sendMessage()`: core pipeline — tree node → lorebook matching → prompt assembly → fetch API → variable extraction → save to tree + chat session.
- `editMessage()`: truncates chat at edited message, re-sends.
- `branchFromMessage()`: creates branched chat session from a specific message index.
- CRUD for lorebooks, presets, chats, settings.

### Component hierarchy

```
App.vue
├── TopBar.vue                    # Top navigation bar (floating, scroll-aware)
├── PortraitLayer.vue             # Left column — character portrait / Live2D
├── DialoguePanel.vue             # Center column — message flow + input area
├── StatusPanel.vue               # Right column — character stats (HP/SP/mood/affection)
├── CharDetailPanel.vue           # Modal — character details
├── EventLogPanel.vue             # Modal — event log
├── MapPanel.vue                  # Modal — world map
├── SettingsPanel.vue             # Modal — settings (tabbed: story, background, interface, recall, api, log, other)
│   ├── InterfacePanel.vue        #   Font, animation, opacity settings
│   ├── StoryPanel.vue            #   Story/plot settings (placeholder)
│   ├── BackgroundPanel.vue       #   Background selection (built-in + upload)
│   ├── RecallingPanel.vue        #   Replay/CG gallery (placeholder)
│   ├── OtherPanel.vue            #   Volume, shortcuts, data reset (placeholder)
│   ├── ApiPanel.vue              #   API key + endpoint configuration
│   └── RequestLogPanel.vue       #   API request/response debug log viewer
└── OthersPanel.vue               # Modal — miscellaneous
```

### Key data flows

1. **Message send**: `DialoguePanel` → `useSillytavern().sendMessage()` → `conversationTree.onNewMessage('user')` → `assemblePrompt(history, preset, lorebooks, variables)` → `fetch(apiEndpoint)` → `extractVariables(reply)` → `conversationTree.onNewMessage('assistant')` → `saveChat()` to Dexie.

2. **Variable system**: AI outputs `<vars>{"gold":+10,"hp":38}</vars>` → `parseVarsBlock()` → `applyVarsPatch()` deep-merges into `chat.variables` → displayed in StatusPanel and injected into subsequent prompts via `formatVariablesForPrompt()`.

3. **Conversation branching**: Users can branch from any message → `branchFromMessage()` creates a new `ChatSession` with messages truncated at the branch point → stored as a separate chat in Dexie.

### Build output contract

- **IIFE** named `STCustomUI`, single file `dist/st-custom-ui.js`.
- CSS inlined into JS via `vite-plugin-css-injected-by-js`. `cssCodeSplit: false`.
- `dist/index.html` generated post-build for standalone hosting (GitHub Pages).
- `layer0.html` at repo root is the ST extension entry point — not part of the Vue build. ST users get the standalone build loaded in an iframe.
