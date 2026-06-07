import { ref, computed, onMounted } from 'vue';
import {
  getLorebooks, saveLorebook, deleteLorebook,
  getPresets, savePreset, deletePreset,
  getSettings, saveSettings, initializeDatabase,
  getChats, saveChat, deleteChat as deleteChatById,
  assemblePrompt, extractVariables, mergeVariables, USER_ROLE, truncateChatAt, branchChat,
  type Lorebook, type ChatPreset, type AppSettings, type ChatSession, type ChatMessage,
} from '../sillytavern';
import { useConversationTreeStore } from '../stores/conversationTree';
import { isInSillyTavern, syncFromSt } from '../sillytavern/st-integration';
import { loadApiConfig } from '../stores/apiStorage';
import { logRequest, logResponse, logError, logInfo } from '../stores/requestLogger';

export function useSillytavern() {
  const lorebooks = ref<Lorebook[]>([]);
  const presets = ref<ChatPreset[]>([]);
  const settings = ref<AppSettings | null>(null);
  const activeLorebookIds = ref<string[]>([]);
  const chats = ref<ChatSession[]>([]);
  const activeChatId = ref<string | null>(null);
  const isSending = ref(false);
  const isLoading = ref(true);

  const tree = useConversationTreeStore();

  onMounted(() => {
    loadAll();
  });

  const loadAll = async () => {
    isLoading.value = true;
    await initializeDatabase();
    const [l, p, s, c] = await Promise.all([getLorebooks(), getPresets(), getSettings(), getChats()]);
    lorebooks.value = l;
    presets.value = p;
    settings.value = s || null;
    activeLorebookIds.value = s?.activeLorebookIds || [];
    chats.value = c;

    // Sync preset + lorebook from ST host environment (one-shot import if empty)
    if (isInSillyTavern()) {
      try {
        const syncResult = await syncFromSt({
          getSettings,
          saveSettings,
          getPresets,
          savePreset,
          getLorebooks,
          saveLorebook,
        });
        if (syncResult.connected) {
          console.log('[useSillytavern] ST sync result:', syncResult);
          // Reload after sync
          if (syncResult.importedPreset || syncResult.importedLorebooks > 0 || syncResult.characterName) {
            const [l2, p2, s2] = await Promise.all([getLorebooks(), getPresets(), getSettings()]);
            lorebooks.value = l2;
            presets.value = p2;
            settings.value = s2 || null;
            activeLorebookIds.value = s2?.activeLorebookIds || [];
          }
        }
      } catch (err) {
        console.warn('[useSillytavern] ST sync failed (non-fatal):', err);
      }
    }

    isLoading.value = false;
  };

  const activeChat = computed(() => chats.value.find(c => c.id === activeChatId.value) || null);

  const toggleLorebook = async (id: string) => {
    const newIds = activeLorebookIds.value.includes(id)
      ? activeLorebookIds.value.filter(i => i !== id)
      : [...activeLorebookIds.value, id];
    activeLorebookIds.value = newIds;
    if (settings.value) {
      const newSettings = { ...settings.value, activeLorebookIds: newIds };
      await saveSettings(newSettings);
      settings.value = newSettings;
    }
  };

  const updateSettings = async (updates: Partial<AppSettings>) => {
    if (!settings.value) return;
    // JSON round-trip sanitizes non-structurally-cloneable objects before IndexedDB write
    const newSettings = JSON.parse(JSON.stringify({ ...settings.value, ...updates }));
    await saveSettings(newSettings);
    settings.value = newSettings;
  };

  const createChat = async (name?: string) => {
    const s = settings.value;
    if (!s) throw new Error('Settings not loaded');
    const chatCount = chats.value.filter(c => c.characterName === s.characterName).length;
    const chatName = name || `${s.characterName} - 新对话 ${chatCount + 1}`;
    const newChat: ChatSession = {
      id: crypto.randomUUID(),
      name: chatName,
      messages: [],
      characterName: s.characterName,
      userName: s.userName,
      presetId: s.activePresetId || presets.value[0]?.id || null,
      lorebookIds: [...activeLorebookIds.value],
      variables: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveChat(newChat);
    chats.value = [...chats.value, newChat];
    activeChatId.value = newChat.id;
    return newChat.id;
  };

  const loadChat = (id: string) => {
    if (activeChatId.value === id) return;
    activeChatId.value = id;
  };

  const deleteChat = async (id: string) => {
    await deleteChatById(id);
    chats.value = chats.value.filter(c => c.id !== id);
    if (activeChatId.value === id) activeChatId.value = null;
  };

  const updateVariables = async (updates: Record<string, string | number>) => {
    if (!activeChat.value) return;
    const merged = mergeVariables(activeChat.value.variables, updates);
    const updatedChat = { ...activeChat.value, variables: merged, updatedAt: Date.now() };
    await saveChat(updatedChat);
    chats.value = chats.value.map(c => c.id === updatedChat.id ? updatedChat : c);
  };

  /**
   * Core sendMessage — replaces the old mock implementation.
   * Integrates: tree node creation → lorebook matching → prompt assembly → API call → variable extraction → tree node storage.
   */
  const sendMessage = async (content: string) => {
    const s = settings.value;
    const ac = activeChat.value;
    if (!s || !ac) {
      throw new Error('No active chat or settings not loaded');
    }

    // Read API credentials from secure local storage
    const apiConfig = await loadApiConfig();
    if (!apiConfig || !apiConfig.apiKey || !apiConfig.baseUrl) {
      throw new Error('未配置 API Key。请在设置 → API 中配置。');
    }

    // Resolve endpoint URL: only append /chat/completions if not already present
    let apiEndpoint = apiConfig.baseUrl;
    if (apiEndpoint.endsWith('/')) apiEndpoint = apiEndpoint.slice(0, -1);
    if (!apiEndpoint.endsWith('/chat/completions')) {
      apiEndpoint = apiEndpoint + '/chat/completions';
    }

    isSending.value = true;

    try {
      // 1. Ensure conversation tree is ready
      tree.ensureRoot();

      const activePreset = presets.value.find(p => p.id === s.activePresetId) || presets.value[0];
      if (!activePreset) throw new Error('No preset available');

      const activeBooks = lorebooks.value.filter(b => activeLorebookIds.value.includes(b.id));
      const currentVariables = ac.variables || {};

      // 2. Add user message to conversation tree
      tree.onNewMessage(content, 'user');

      // 3. Build ChatMessage history from conversation tree for prompt assembly
      const treeMessages: ChatMessage[] = tree.activePathMessages.map((node, idx) => ({
        id: node.id,
        role: node.type === 'system' ? 'system' : node.type === 'assistant' ? 'assistant' : 'user',
        content: node.content,
        timestamp: node.timestamp,
        variables: { ...currentVariables },
      }));

      // 4. Assemble prompt with lorebooks + preset
      const { messages: promptMessages } = assemblePrompt({
        userInput: content,
        history: treeMessages,
        preset: activePreset,
        lorebooks: activeBooks,
        userName: s.userName,
        characterName: s.characterName,
        variables: currentVariables,
      });

      // 5. Build API request — user's configured model takes priority over preset default
      const activeModel = apiConfig.model || activePreset.settings.openai_model;
      const requestBody: Record<string, any> = {
        model: activeModel,
        messages: promptMessages,
      };
      if (activePreset.settings.temp_openai !== undefined) requestBody.temperature = activePreset.settings.temp_openai;
      if (activePreset.settings.openai_max_tokens !== undefined) requestBody.max_tokens = activePreset.settings.openai_max_tokens;
      if (activePreset.settings.top_p_openai !== undefined) requestBody.top_p = activePreset.settings.top_p_openai;
      if (activePreset.settings.freq_pen_openai !== undefined) requestBody.frequency_penalty = activePreset.settings.freq_pen_openai;
      if (activePreset.settings.pres_pen_openai !== undefined) requestBody.presence_penalty = activePreset.settings.pres_pen_openai;
      if (activePreset.settings.stream_openai !== undefined) requestBody.stream = activePreset.settings.stream_openai;

      // 6. Log the request
      logRequest(apiEndpoint, { model: activeModel, messageCount: promptMessages.length, systemPrompt: promptMessages.filter(m => m.role === 'system').map(m => m.content.slice(0, 200)).join('\n---\n') });

      // 7. Call API
      let rawReply: string;

      try {
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiConfig.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => '(no body)');
          logError(`HTTP ${response.status} — ${errorText.slice(0, 500)}`);
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        rawReply = data.choices?.[0]?.message?.content || '';
        logResponse(response.status, rawReply.slice(0, 2000));
      } catch (err) {
        logError(String(err));
        throw err;
      }
      const { cleanedText: reply, updates: extractedVars } = extractVariables(rawReply);
      const nextVariables = mergeVariables(currentVariables, extractedVars);

      // 7. Add assistant reply to conversation tree
      tree.onNewMessage(reply, 'assistant', {
        input: Math.ceil(JSON.stringify(promptMessages).length / 3),
        output: rawReply.length,
      });

      // 8. Update ChatSession in ST database
      const chatMessages = ac.messages;
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: Date.now() - 1000,
        variables: { ...currentVariables },
      };
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
        variables: { ...nextVariables },
      };
      const updatedChat: ChatSession = {
        ...ac,
        messages: [...chatMessages, userMessage, assistantMessage],
        variables: nextVariables,
        updatedAt: Date.now(),
      };
      await saveChat(updatedChat);
      chats.value = chats.value.map(c => c.id === updatedChat.id ? updatedChat : c);

      return { reply, extractedVars, nextVariables };
    } finally {
      isSending.value = false;
    }
  };

  const editMessage = async (messageId: string, newContent: string) => {
    if (!activeChat.value) return;
    const idx = activeChat.value.messages.findIndex(m => m.id === messageId);
    if (idx === -1) return;
    if (activeChat.value.messages[idx].role !== USER_ROLE) return;

    const updatedChat = truncateChatAt(activeChat.value, idx, activeChat.value.messages[idx].variables);
    await saveChat(updatedChat);
    chats.value = chats.value.map(c => c.id === updatedChat.id ? updatedChat : c);
    await sendMessage(newContent);
  };

  const deleteMessagesFrom = async (messageId: string) => {
    if (!activeChat.value) return;
    const idx = activeChat.value.messages.findIndex(m => m.id === messageId);
    if (idx === -1) return;

    const updatedChat = truncateChatAt(activeChat.value, idx);
    await saveChat(updatedChat);
    chats.value = chats.value.map(c => c.id === updatedChat.id ? updatedChat : c);
  };

  const branchFromMessage = async (messageId: string, name?: string) => {
    const s = settings.value;
    const ac = activeChat.value;
    if (!ac || !s) throw new Error('No active chat');
    const idx = ac.messages.findIndex(m => m.id === messageId);
    if (idx === -1) throw new Error('Message not found');

    const branchCount = chats.value.filter(c => c.characterName === s.characterName).length;
    const branchName = name || `${s.characterName} - 分支 ${branchCount + 1}`;
    const newChat = branchChat(ac, idx, {
      name: branchName,
      presetId: s.activePresetId || presets.value[0]?.id || null,
      lorebookIds: [...activeLorebookIds.value],
      variables: activeChat.value.messages[idx].variables,
    });
    await saveChat(newChat);
    chats.value = [...chats.value, newChat];
    activeChatId.value = newChat.id;
    return newChat.id;
  };

  return {
    lorebooks: computed(() => lorebooks.value),
    presets: computed(() => presets.value),
    settings: computed(() => settings.value),
    activeLorebookIds: computed(() => activeLorebookIds.value),
    chats: computed(() => chats.value),
    activeChatId: computed(() => activeChatId.value),
    activeChat,
    isSending: computed(() => isSending.value),
    isLoading: computed(() => isLoading.value),
    loadAll,
    toggleLorebook,
    updateSettings,
    createChat,
    loadChat,
    deleteChat,
    sendMessage,
    updateVariables,
    editMessage,
    deleteMessagesFrom,
    branchFromMessage,
    saveLorebook,
    deleteLorebook,
    savePreset,
    deletePreset,
  };
}
