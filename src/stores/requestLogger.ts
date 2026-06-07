// src/stores/requestLogger.ts
// In-memory request/response log for debugging API calls.

import { reactive } from 'vue';

export interface LogEntry {
  id: number;
  timestamp: number;
  direction: 'request' | 'response' | 'error';
  label: string;
  detail: string;
  collapsed: boolean;
}

const logs = reactive<LogEntry[]>([]);
let nextId = 1;

function addLog(direction: LogEntry['direction'], label: string, detail: string) {
  logs.unshift({ id: nextId++, timestamp: Date.now(), direction, label, detail, collapsed: true });
  if (logs.length > 200) { logs.pop(); }
}

export function logRequest(endpoint: string, body: any) {
  addLog('request', `POST ${endpoint}`, JSON.stringify(body, null, 2));
}

export function logResponse(status: number, body: any) {
  addLog('response', `HTTP ${status}`, typeof body === 'string' ? body : JSON.stringify(body, null, 2));
}

export function logError(message: string) {
  addLog('error', 'Error', message);
}

export function logInfo(label: string, detail: string) {
  addLog('response', label, detail);
}

export function clearLogs() { logs.splice(0, logs.length); }

export function getLogs(): readonly LogEntry[] { return logs; }
