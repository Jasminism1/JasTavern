// src/bridge/env.d.ts

import { SillyTavernGlobal } from './types'

declare global {
  interface Window {
    SillyTavern: SillyTavernGlobal
    ST_Bridge: any
  }
}

export {}
