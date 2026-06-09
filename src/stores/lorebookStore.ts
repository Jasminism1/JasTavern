/**
 * Lorebook Store (Pinia)
 *
 * Single source of truth for world book / lorebook management.
 * - Wraps Dexie 'lorebooks' table for persistence
 * - Every mutation writes to Dexie immediately
 * - globalLorebookId and activeLorebookIds stored in AppSettings
 *
 * Concepts:
 *   globalLorebook  — applies to ALL characters (keywords scanned, not unconditional)
 *   activeLorebooks — character-specific (currently just "activated" since no character system yet)
 *   constant entry  — always injected regardless of keyword match
 *   trigger entry   — injected only when keywords match user input + recent history
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  getLorebooks, saveLorebook, deleteLorebook,
  getSettings, saveSettings,
} from '../sillytavern/database';
import type { Lorebook, LorebookEntry } from '../sillytavern/types';

/** Default empty entry for "new entry" flow. */
export function createEmptyEntry(): LorebookEntry {
  return {
    id: crypto.randomUUID(),
    keys: [],
    secondaryKeys: [],
    content: '',
    order: 100,
    position: 'after_char',
    selective: false,
    selectiveLogic: 'and_any',
    constant: false,
    probability: 100,
    addMemo: false,
    recursive: false,
  };
}

/** Default empty lorebook for "new book" flow. */
function createEmptyBook(name: string): Lorebook {
  return {
    id: crypto.randomUUID(),
    name,
    entries: [],
    recursiveScanning: false,
    caseSensitive: false,
    matchWholeWords: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export const useLorebookStore = defineStore('lorebook', () => {
  // ---- state ----
  const books = ref<Lorebook[]>([]);
  const activeIds = ref<string[]>([]);
  const globalId = ref<string | null>(null);
  const loaded = ref(false);

  // ---- computed ----
  const globalBook = computed(() =>
    globalId.value ? books.value.find(b => b.id === globalId.value) || null : null);

  const activeBooks = computed(() =>
    books.value.filter(b => activeIds.value.includes(b.id)));

  // ---- init ----
  async function loadAll(): Promise<void> {
    const [b, s] = await Promise.all([getLorebooks(), getSettings()]);
    books.value = b;
    activeIds.value = s?.activeLorebookIds || [];
    globalId.value = s?.globalLorebookId || null;
    loaded.value = true;
  }

  // ---- CRUD ----
  async function create(name?: string): Promise<Lorebook> {
    const book = createEmptyBook(name || '新世界书');
    await saveLorebook(book);
    books.value.push(book);
    return book;
  }

  /** Save (create or update) a lorebook. */
  async function save(book: Lorebook): Promise<void> {
    const plain = JSON.parse(JSON.stringify(book)) as Lorebook;
    plain.updatedAt = Date.now();
    await saveLorebook(plain);
    const idx = books.value.findIndex(b => b.id === plain.id);
    if (idx >= 0) {
      books.value[idx] = plain;
    } else {
      books.value.push(plain);
    }
  }

  async function remove(id: string): Promise<void> {
    await deleteLorebook(id);
    books.value = books.value.filter(b => b.id !== id);
    if (globalId.value === id) {
      await setGlobal(null);
    }
    if (activeIds.value.includes(id)) {
      const newIds = activeIds.value.filter(i => i !== id);
      await persistActiveIds(newIds);
      activeIds.value = newIds;
    }
  }

  // ---- Global world book ----
  async function setGlobal(id: string | null): Promise<void> {
    globalId.value = id;
    const s = await getSettings();
    if (s) {
      await saveSettings({ ...s, globalLorebookId: id });
    }
  }

  // ---- Active lorebooks ----
  async function toggleActive(id: string): Promise<void> {
    const newIds = activeIds.value.includes(id)
      ? activeIds.value.filter(i => i !== id)
      : [...activeIds.value, id];
    await persistActiveIds(newIds);
    activeIds.value = newIds;
  }

  /** Check if a lorebook is currently activated. */
  function isActive(id: string): boolean {
    return activeIds.value.includes(id);
  }

  async function persistActiveIds(ids: string[]): Promise<void> {
    const s = await getSettings();
    if (s) {
      await saveSettings({ ...s, activeLorebookIds: ids });
    }
  }

  // ---- Entry helpers (delegated to save) ----
  async function addEntry(bookId: string, entry: LorebookEntry): Promise<void> {
    const book = books.value.find(b => b.id === bookId);
    if (!book) return;
    const next = { ...book, entries: [...book.entries, entry], updatedAt: Date.now() };
    await save(next);
  }

  async function updateEntry(bookId: string, entryId: string, patch: Partial<LorebookEntry>): Promise<void> {
    const book = books.value.find(b => b.id === bookId);
    if (!book) return;
    const nextEntries = book.entries.map(e => e.id === entryId ? { ...e, ...patch } : e);
    const next = { ...book, entries: nextEntries, updatedAt: Date.now() };
    await save(next);
  }

  async function removeEntry(bookId: string, entryId: string): Promise<void> {
    const book = books.value.find(b => b.id === bookId);
    if (!book) return;
    const next = { ...book, entries: book.entries.filter(e => e.id !== entryId), updatedAt: Date.now() };
    await save(next);
  }

  /** Move an entry up or down in its book's entry array. */
  async function moveEntry(bookId: string, entryId: string, direction: 'up' | 'down'): Promise<void> {
    const book = books.value.find(b => b.id === bookId);
    if (!book) return;
    const idx = book.entries.findIndex(e => e.id === entryId);
    if (idx < 0) return;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= book.entries.length) return;
    const nextEntries = book.entries.slice();
    [nextEntries[idx], nextEntries[target]] = [nextEntries[target], nextEntries[idx]];
    const next = { ...book, entries: nextEntries, updatedAt: Date.now() };
    await save(next);
  }

  // ---- Import / Export ----
  async function importFromJson(jsonText: string, fileName?: string): Promise<Lorebook> {
    const data = JSON.parse(jsonText);
    // Accept {name, entries, ...} or SillyTavern world info format
    const name = fileName?.replace(/\.json$/i, '') || data.name || '导入世界书';
    const book: Lorebook = {
      id: crypto.randomUUID(),
      name,
      description: data.description || '',
      entries: Array.isArray(data.entries)
        ? data.entries.map((e: any, i: number) => ({
            id: e.id || e.uid?.toString() || crypto.randomUUID(),
            keys: Array.isArray(e.keys) ? e.keys : (Array.isArray(e.key) ? e.key : []),
            secondaryKeys: Array.isArray(e.secondaryKeys) ? e.secondaryKeys : (Array.isArray(e.keysecondary) ? e.keysecondary : []),
            content: e.content || '',
            comment: e.comment || '',
            order: e.order ?? i * 10,
            position: typeof e.position === 'number'
              ? (['before_char','after_char','before_example','after_example','at_depth','example_msg_top','example_msg_bottom','outlet'][e.position] || 'after_char')
              : (e.position || 'after_char'),
            selective: e.selective ?? false,
            selectiveLogic: e.selectiveLogic || 'and_any',
            constant: e.constant ?? false,
            probability: e.probability ?? 100,
            useProbability: e.useProbability ?? false,
            addMemo: e.addMemo ?? false,
            depth: e.depth,
            weight: e.weight ?? 100,
            recursive: e.recursive ?? false,
          }))
        : [],
      recursiveScanning: data.recursiveScanning ?? false,
      caseSensitive: data.caseSensitive ?? false,
      matchWholeWords: data.matchWholeWords ?? false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveLorebook(book);
    books.value.push(book);
    return book;
  }

  function exportToJson(book: Lorebook): string {
    const plain = JSON.parse(JSON.stringify(book)) as Lorebook;
    return JSON.stringify({
      name: plain.name,
      description: plain.description,
      entries: plain.entries.map(e => ({
        keys: e.keys,
        secondaryKeys: e.secondaryKeys,
        content: e.content,
        comment: e.comment,
        constant: e.constant,
        position: e.position,
        depth: e.depth,
        weight: e.weight,
        recursive: e.recursive,
        selective: e.selective,
        selectiveLogic: e.selectiveLogic,
        probability: e.probability,
      })),
      recursiveScanning: plain.recursiveScanning,
      caseSensitive: plain.caseSensitive,
      matchWholeWords: plain.matchWholeWords,
    }, null, 2);
  }

  // ---- auto-load ----
  loadAll();

  return {
    books,
    activeIds,
    globalId,
    loaded,
    globalBook,
    activeBooks,
    loadAll,
    create,
    save,
    remove,
    setGlobal,
    toggleActive,
    isActive,
    addEntry,
    updateEntry,
    removeEntry,
    moveEntry,
    importFromJson,
    exportToJson,
  };
});
