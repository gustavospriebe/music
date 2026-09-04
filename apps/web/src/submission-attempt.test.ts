import { describe, expect, it } from 'vitest';
import { clearCreationKey, creationKey } from './submission-attempt';

const store = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  } as Storage;
};

describe('tentativa de envio', () => {
  it('reutiliza a mesma UUID até o salvamento remoto terminar', () => {
    const storage = store();
    const first = creationKey(storage);
    expect(first).toMatch(/^[0-9a-f-]{36}$/i);
    expect(creationKey(storage)).toBe(first);
    clearCreationKey(storage);
    expect(creationKey(storage)).not.toBe(first);
  });

  it('mantém a tentativa em memória quando o storage está bloqueado', () => {
    const storage = store();
    storage.getItem = () => {
      throw new DOMException('bloqueado', 'SecurityError');
    };
    storage.setItem = () => {
      throw new DOMException('bloqueado', 'SecurityError');
    };
    expect(creationKey(storage)).toBe(creationKey(storage));
    expect(() => clearCreationKey(storage)).not.toThrow();
  });
});
