// src/bridge/types.ts

export interface STMessage {
  is_user: boolean
  is_name: boolean
  send_date: number
  mes: string
  extra?: {
    api_response?: any
    tokens?: number
    [key: string]: any
  }
}

export interface STContext {
  chat: STMessage[]
  characterId: string | number
  characters: any[]
  eventSource: {
    on(event: string, callback: (...args: any[]) => void): void
    off(event: string, callback: (...args: any[]) => void): void
    emit(event: string, ...args: any[]): void
  }
  event_types: {
    MESSAGE_RECEIVED: string
    CHAT_CHANGED: string
    CHARACTER_MESSAGE_RENDERED: string
    [key: string]: string
  }
}

// Global window extension
export interface SillyTavernGlobal {
  getContext(): STContext
}
