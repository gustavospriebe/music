import { useEffect, useState } from 'react';

export type Draft = Record<string, unknown>;
const key = 'resenha:v1:story-draft';

export function readDraft(): Draft {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Draft) : {};
  } catch {
    return {};
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage bloqueado não invalida um salvamento remoto já concluído.
  }
}

/** The draft belongs to this browser; the customer can clear it before submission. */
export function useDraft(values: Draft, enabled = true) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  useEffect(() => {
    if (!enabled) {
      clearDraft();
      setStatus('idle');
      return;
    }
    setStatus('saving');
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(values));
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [values, enabled]);
  return status;
}
