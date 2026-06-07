// src/bridge/index.ts
import { stEventBus } from './eventBus'
import { useConversationTreeStore } from '../stores/conversationTree'
import type { STMessage } from './types'

export function isInSillyTavern(): boolean {
  return typeof window !== 'undefined' && typeof window.SillyTavern !== 'undefined'
}

let isInitialized = false

/**
 * Initialize the bridge. Called before Vue mounts.
 */
export function initBridge() {
  if (isInitialized) return
  isInitialized = true

  if (!isInSillyTavern()) {
    console.warn('[ST-Bridge] Running in standalone development mode (Mock).')
    setupMockBridge()
    return
  }

  console.log('[ST-Bridge] Connected to SillyTavern host environment.')
  const context = window.SillyTavern.getContext()
  const { eventSource, event_types } = context

  // Forward ST events to our EventBus
  eventSource.on(event_types.MESSAGE_RECEIVED, (messageId: number) => {
    // In ST, typically the last message is the newly received one
    const context = window.SillyTavern.getContext()
    const msg = context.chat[context.chat.length - 1]
    if (msg) {
      handleNewMessage(msg)
    }
  })

  eventSource.on(event_types.CHAT_CHANGED, () => {
    console.log('[ST-Bridge] Chat changed.')
    // Let the stores reset themselves via the event bus
    stEventBus.emit('st:chat-changed')
  })

  // Expose bridge functions globally
  window.ST_Bridge = {
    getChat: () => window.SillyTavern.getContext().chat,
    // Add other exposed utility functions here
  }
}

function handleNewMessage(msg: STMessage) {
  const store = useConversationTreeStore()
  // Try to extract token counts if available from ST's extra field
  const tokens = msg.extra?.tokens ?? 0
  
  store.onNewMessage(
    msg.mes,
    msg.is_user ? 'user' : 'assistant',
    { output: tokens } // We map total tokens to output for simplicity, can be refined
  )
}

function setupMockBridge() {
  // Simulate an initial chat change
  setTimeout(() => {
    stEventBus.emit('st:chat-changed')
  }, 100)
}

/**
 * Function to send a message via SillyTavern.
 */
export function sendMessageToST(text: string) {
  if (!isInSillyTavern()) {
    console.log(`[ST-Bridge Mock] Sent: ${text}`)
    // Simulate AI response
    setTimeout(() => {
      const store = useConversationTreeStore()
      store.onNewMessage(`Mock AI reply to: ${text}`, 'assistant', { output: 20 })
    }, 1000)
    return
  }

  // TODO: Actual ST send logic.
  // ST typically exposes methods like `sendMessageAsUser` or handles input via DOM manipulation if API is missing.
  console.log('[ST-Bridge] Sending message not fully implemented yet.', text)
}
