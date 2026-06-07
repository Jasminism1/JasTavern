// src/bridge/eventBus.ts
import { ref } from 'vue'

type EventHandler = (...args: any[]) => void

class EventBus {
  private handlers: Record<string, EventHandler[]> = {}

  on(event: string, handler: EventHandler) {
    if (!this.handlers[event]) {
      this.handlers[event] = []
    }
    this.handlers[event].push(handler)
  }

  off(event: string, handler: EventHandler) {
    if (!this.handlers[event]) return
    this.handlers[event] = this.handlers[event].filter(h => h !== handler)
  }

  emit(event: string, ...args: any[]) {
    if (!this.handlers[event]) return
    this.handlers[event].forEach(h => h(...args))
  }
}

export const stEventBus = new EventBus()
