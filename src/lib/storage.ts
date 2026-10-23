import type { AppState } from '../types';
import {
  buildGlobalBackup,
  createInitialAppState,
  migrateLegacyState,
  sanitizeAppState,
  validateBackupPayload,
} from './plans';

export const STORAGE_KEY_V1 = 'cite-royale-placement-v1';
export const STORAGE_KEY_V2 = 'cite-royale-placement-v2';

export function loadState(): AppState {
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as unknown;
      return sanitizeAppState(parsed);
    }

    const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
    if (rawV1) {
      const parsed = JSON.parse(rawV1) as unknown;
      const migrated = migrateLegacyState(parsed);
      if (migrated) {
        saveState(migrated);
        return migrated;
      }
    }

    return createInitialAppState();
  } catch {
    return createInitialAppState();
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(
    STORAGE_KEY_V2,
    JSON.stringify(sanitizeAppState(state)),
  );
}

export function exportGlobalBackup(state: AppState): void {
  const blob = new Blob([buildGlobalBackup(state)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cite-royale-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function restoreGlobalBackup(
  rawText: string,
  current: AppState,
): { ok: true; state: AppState } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, error: 'Le fichier n’est pas un JSON valide.' };
  }

  const validated = validateBackupPayload(parsed);
  if (!validated.ok) return validated;

  // Ne jamais écraser silencieusement : l’appelant doit confirmer.
  void current;
  return { ok: true, state: validated.state };
}
