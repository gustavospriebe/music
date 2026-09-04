const storageKey = 'resenha:story-creation-key';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let memoryKey: string | null = null;

const newKey = (): string => {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    const part = () =>
      Math.floor(Math.random() * 0x1_0000)
        .toString(16)
        .padStart(4, '0');
    return `${part()}${part()}-${part()}-4${part().slice(1)}-8${part().slice(1)}-${part()}${part()}${part()}`;
  }
};

export const creationKey = (storage: Storage = window.localStorage): string => {
  try {
    const stored = storage.getItem(storageKey);
    if (stored && uuidPattern.test(stored)) {
      memoryKey = stored;
      return stored;
    }
  } catch {
    // O fallback em memória ainda mantém a mesma tentativa nesta aba.
  }
  memoryKey ??= newKey();
  try {
    storage.setItem(storageKey, memoryKey);
  } catch {
    // Storage bloqueado: a tentativa continua estável em memória.
  }
  return memoryKey;
};

export const clearCreationKey = (storage: Storage = window.localStorage): void => {
  memoryKey = null;
  try {
    storage.removeItem(storageKey);
  } catch {
    // A conclusão remota não deve falhar por causa do storage local.
  }
};
