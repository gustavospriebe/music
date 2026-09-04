import { useEffect, useState } from 'react';

export type Draft = Record<string, unknown>;
const key = 'resenha:story-draft';

export function readDraft(): Draft {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Draft;
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

/** Local recovery is intentional until an opaque story-session token is available from the API. */
export function useDraft(values: Draft) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  useEffect(() => {
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
  }, [values]);
  return status;
}
