/**
 * Minimal environment detection — replaces the old bridge layer.
 */

export function isInSillyTavern(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).SillyTavern !== 'undefined';
}
