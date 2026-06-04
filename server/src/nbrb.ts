export interface NbrbRate {
  Cur_Scale: number;
  Cur_OfficialRate: number;
}

const cache = new Map<string, NbrbRate>();

function cacheKey(currency: string, onDate: string): string {
  return `${onDate}:${currency}`;
}

export function roundByn(n: number): number {
  return Math.round(n * 100) / 100;
}

export function convertToByn(
  amount: number,
  currency: string,
  rate: NbrbRate | null,
): number {
  if (currency === 'BYN') return roundByn(amount);
  if (!rate) throw new Error(`Нет курса НБРБ для ${currency}`);
  return roundByn(amount * (rate.Cur_OfficialRate / rate.Cur_Scale));
}

export async function fetchNbrbRate(
  currency: string,
  onDate: string,
  apiBase: string,
): Promise<NbrbRate> {
  const key = cacheKey(currency, onDate);
  const hit = cache.get(key);
  if (hit) return hit;

  const url = new URL(`/exrates/rates/${encodeURIComponent(currency)}`, apiBase);
  url.searchParams.set('parammode', '2');
  url.searchParams.set('periodicity', '0');
  url.searchParams.set('ondate', onDate);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`НБРБ: не удалось получить курс ${currency} на ${onDate}`);
  }

  const data = (await res.json()) as {
    Cur_Scale?: number;
    Cur_OfficialRate?: number;
  };

  const rate: NbrbRate = {
    Cur_Scale: Number(data.Cur_Scale ?? 1),
    Cur_OfficialRate: Number(data.Cur_OfficialRate),
  };

  if (!Number.isFinite(rate.Cur_OfficialRate) || rate.Cur_OfficialRate <= 0) {
    throw new Error(`НБРБ: некорректный курс ${currency} на ${onDate}`);
  }

  cache.set(key, rate);
  return rate;
}

export function clearNbrbCache(): void {
  cache.clear();
}
