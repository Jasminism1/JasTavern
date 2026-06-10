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
  // Format messages array with each entry on its own line, proper \n display
  const detail = typeof body === 'object' && body.messages
    ? formatMessages(body)
    : JSON.stringify(body, null, 2);
  addLog('request', `POST ${endpoint}`, detail);
}

function formatMessages(body: any): string {
  const parts: string[] = [];
  parts.push('{');
  parts.push(`  "model": ${JSON.stringify(body.model)},`);
  parts.push(`  "messages": [`);
  for (let i = 0; i < body.messages.length; i++) {
    const m = body.messages[i];
    const role = m.role;
    // Show content with actual newlines visible
    const contentPreview = m.content
      .replace(/\\n/g, '\n')  // un-escape JSON \n
      .slice(0, 200);          // truncate long content
    const suffix = m.content.length > 200 ? '...' : '';
    parts.push(`    { role: "${role}", content: ${JSON.stringify(contentPreview + suffix)} }`);
    if (i < body.messages.length - 1) parts[parts.length - 1] += ',';
  }
  parts.push('  ]');
  if (body.temperature !== undefined) parts[parts.length - 1] += ',';
  // Include other params
  for (const key of ['temperature','top_p','max_tokens','stream','stop','frequency_penalty','presence_penalty']) {
    if (body[key] !== undefined) {
      parts.push(`  "${key}": ${JSON.stringify(body[key])},`);
    }
  }
  parts.push('}');
  return parts.join('\n');
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
