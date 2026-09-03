/** "Minhas músicas" sem cadastro: lista de publicIds no navegador do usuário. */

export const MY_ORDERS_KEY = 'resenha:my-orders';
export const MY_ORDERS_CAP = 20;

const isPublicId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{8,32}$/.test(value);

export function readMyOrders(storage: Storage = window.localStorage): string[] {
  let raw: string | null = null;
  try {
    raw = storage.getItem(MY_ORDERS_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPublicId).slice(0, MY_ORDERS_CAP);
  } catch {
    return [];
  }
}

/** Guarda no topo, sem duplicar; retorna a lista resultante. Nunca quebra o fluxo. */
export function rememberMyOrder(
  publicId: string,
  storage: Storage = window.localStorage,
): string[] {
  if (!isPublicId(publicId)) return readMyOrders(storage);
  const next = [publicId, ...readMyOrders(storage).filter((id) => id !== publicId)].slice(
    0,
    MY_ORDERS_CAP,
  );
  try {
    storage.setItem(MY_ORDERS_KEY, JSON.stringify(next));
  } catch {
    // quota/privado: mantém sessionStorage como fallback, sem quebrar a criação
  }
  return next;
}
