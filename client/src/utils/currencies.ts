export const CURRENCIES = ['EUR', 'RUB', 'USD', 'BYN'] as const;
export type AppCurrency = (typeof CURRENCIES)[number];
