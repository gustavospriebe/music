import { describe, expect, it, vi } from 'vitest';
import { MY_ORDERS_CAP, readMyOrders, rememberMyOrder } from './my-orders';

const store = (initial?: string) => {
  const data = new Map<string, string>(initial ? [['resenha:my-orders', initial]] : []);
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

describe('minhas músicas (localStorage)', () => {
  it('guarda o pedido mais recente no topo, sem duplicar', () => {
    const storage = store();
    rememberMyOrder('order-aaaa-1', storage);
    rememberMyOrder('order-bbbb-2', storage);
    rememberMyOrder('order-aaaa-1', storage);
    expect(readMyOrders(storage)).toEqual(['order-aaaa-1', 'order-bbbb-2']);
  });

  it('limita a lista aos 20 mais recentes', () => {
    const storage = store();
    for (let i = 0; i < MY_ORDERS_CAP + 5; i += 1)
      rememberMyOrder(`order-${String(i).padStart(4, '0')}-x`, storage);
    const ids = readMyOrders(storage);
    expect(ids).toHaveLength(MY_ORDERS_CAP);
    expect(ids[0]).toBe(`order-${String(MY_ORDERS_CAP + 4).padStart(4, '0')}-x`);
  });

  it('ignora publicIds inválidos e JSON corrompido', () => {
    expect(readMyOrders(store('não-json{{'))).toEqual([]);
    expect(readMyOrders(store('"só-string"'))).toEqual([]);
    expect(readMyOrders(store(JSON.stringify(['order-aaaa-1', 42, 'curto', null])))).toEqual([
      'order-aaaa-1',
    ]);
    const storage = store();
    rememberMyOrder('curto', storage);
    expect(readMyOrders(storage)).toEqual([]);
  });

  it('não quebra a criação quando o storage falha', () => {
    const storage = store();
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(() => rememberMyOrder('order-aaaa-1', storage)).not.toThrow();
    vi.spyOn(storage, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(readMyOrders(storage)).toEqual([]);
  });
});
