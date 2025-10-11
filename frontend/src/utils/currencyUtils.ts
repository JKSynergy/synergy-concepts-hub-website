/**
 * Currency Conversion Utilities
 * 
 * Centralized currency conversion functions for use throughout the application.
 * These utilities work with the currency settings from the Settings page.
 */

export interface CurrencyData {
  rate: number;
  name: string;
  symbol: string;
}

export interface ExchangeRates {
  [key: string]: CurrencyData;
}

// Default exchange rates (should be loaded from settings/API in production)
export const DEFAULT_EXCHANGE_RATES: ExchangeRates = {
  UGX: { rate: 1, name: 'Ugandan Shilling', symbol: 'UGX' },
  USD: { rate: 0.00027, name: 'US Dollar', symbol: '$' },
  EUR: { rate: 0.00025, name: 'Euro', symbol: '€' },
  GBP: { rate: 0.00021, name: 'British Pound', symbol: '£' },
  KES: { rate: 0.035, name: 'Kenyan Shilling', symbol: 'KSh' },
  TZS: { rate: 0.63, name: 'Tanzanian Shilling', symbol: 'TSh' }
};

/**
 * Convert amount from one currency to another
 * 
 * @param amount - The amount to convert
 * @param fromCurrency - Source currency code (e.g., 'UGX')
 * @param toCurrency - Target currency code (e.g., 'USD')
 * @param exchangeRates - Optional custom exchange rates object
 * @returns Converted amount
 * 
 * @example
 * ```typescript
 * const usdAmount = convertCurrency(1000000, 'UGX', 'USD');
 * // Returns: 270
 * ```
 */
export const convertCurrency = (
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  exchangeRates: ExchangeRates = DEFAULT_EXCHANGE_RATES
): number => {
  // If same currency, return original amount
  if (fromCurrency === toCurrency) return amount;
  
  // Get exchange rates for both currencies
  const fromRate = exchangeRates[fromCurrency]?.rate || 1;
  const toRate = exchangeRates[toCurrency]?.rate || 1;
  
  // Convert to base currency (UGX) first, then to target currency
  const baseAmount = amount / fromRate;
  return baseAmount * toRate;
};

/**
 * Format amount with currency symbol and proper decimal places
 * 
 * @param amount - The amount to format
 * @param currency - Currency code (e.g., 'USD')
 * @param exchangeRates - Optional custom exchange rates object
 * @returns Formatted string with currency symbol
 * 
 * @example
 * ```typescript
 * formatCurrency(1000, 'UGX');
 * // Returns: "UGX 1,000"
 * 
 * formatCurrency(100.50, 'USD');
 * // Returns: "$ 100.50"
 * ```
 */
export const formatCurrency = (
  amount: number,
  currency: string,
  exchangeRates: ExchangeRates = DEFAULT_EXCHANGE_RATES
): string => {
  const currencyData = exchangeRates[currency];
  
  if (!currencyData) {
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  
  const symbol = currencyData.symbol;
  const decimals = currency === 'UGX' ? 0 : 2;
  
  const formattedAmount = amount.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  
  return `${symbol} ${formattedAmount}`;
};

/**
 * Format amount with currency symbol (compact - no spaces)
 * 
 * @param amount - The amount to format
 * @param currency - Currency code
 * @param exchangeRates - Optional custom exchange rates object
 * @returns Compact formatted string
 * 
 * @example
 * ```typescript
 * formatCurrencyCompact(1000, 'USD');
 * // Returns: "$1,000.00"
 * ```
 */
export const formatCurrencyCompact = (
  amount: number,
  currency: string,
  exchangeRates: ExchangeRates = DEFAULT_EXCHANGE_RATES
): string => {
  const currencyData = exchangeRates[currency];
  
  if (!currencyData) {
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  
  const symbol = currencyData.symbol;
  const decimals = currency === 'UGX' ? 0 : 2;
  
  const formattedAmount = amount.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  
  return `${symbol}${formattedAmount}`;
};

/**
 * Get currency symbol for a given currency code
 * 
 * @param currency - Currency code
 * @param exchangeRates - Optional custom exchange rates object
 * @returns Currency symbol or empty string if not found
 */
export const getCurrencySymbol = (
  currency: string,
  exchangeRates: ExchangeRates = DEFAULT_EXCHANGE_RATES
): string => {
  return exchangeRates[currency]?.symbol || '';
};

/**
 * Get currency name for a given currency code
 * 
 * @param currency - Currency code
 * @param exchangeRates - Optional custom exchange rates object
 * @returns Full currency name or currency code if not found
 */
export const getCurrencyName = (
  currency: string,
  exchangeRates: ExchangeRates = DEFAULT_EXCHANGE_RATES
): string => {
  return exchangeRates[currency]?.name || currency;
};

/**
 * Get exchange rate between two currencies
 * 
 * @param fromCurrency - Source currency code
 * @param toCurrency - Target currency code
 * @param exchangeRates - Optional custom exchange rates object
 * @returns Exchange rate multiplier
 * 
 * @example
 * ```typescript
 * const rate = getExchangeRate('UGX', 'USD');
 * // Returns: 0.00027
 * ```
 */
export const getExchangeRate = (
  fromCurrency: string,
  toCurrency: string,
  exchangeRates: ExchangeRates = DEFAULT_EXCHANGE_RATES
): number => {
  if (fromCurrency === toCurrency) return 1;
  
  const fromRate = exchangeRates[fromCurrency]?.rate || 1;
  const toRate = exchangeRates[toCurrency]?.rate || 1;
  
  return toRate / fromRate;
};

/**
 * Convert and format in one step
 * 
 * @param amount - Amount to convert
 * @param fromCurrency - Source currency
 * @param toCurrency - Target currency
 * @param exchangeRates - Optional custom exchange rates
 * @returns Formatted string with converted amount
 * 
 * @example
 * ```typescript
 * convertAndFormat(1000000, 'UGX', 'USD');
 * // Returns: "$ 270.00"
 * ```
 */
export const convertAndFormat = (
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  exchangeRates: ExchangeRates = DEFAULT_EXCHANGE_RATES
): string => {
  const converted = convertCurrency(amount, fromCurrency, toCurrency, exchangeRates);
  return formatCurrency(converted, toCurrency, exchangeRates);
};

/**
 * Get all available currency codes
 * 
 * @param exchangeRates - Optional custom exchange rates object
 * @returns Array of currency codes
 */
export const getAvailableCurrencies = (
  exchangeRates: ExchangeRates = DEFAULT_EXCHANGE_RATES
): string[] => {
  return Object.keys(exchangeRates);
};

/**
 * Check if a currency is supported
 * 
 * @param currency - Currency code to check
 * @param exchangeRates - Optional custom exchange rates object
 * @returns True if currency is supported
 */
export const isCurrencySupported = (
  currency: string,
  exchangeRates: ExchangeRates = DEFAULT_EXCHANGE_RATES
): boolean => {
  return currency in exchangeRates;
};

/**
 * Parse formatted currency string to number
 * Removes currency symbols and commas, returns numeric value
 * 
 * @param formattedAmount - Formatted currency string (e.g., "$ 1,000.00")
 * @returns Numeric value
 * 
 * @example
 * ```typescript
 * parseCurrency("$ 1,000.00");
 * // Returns: 1000
 * ```
 */
export const parseCurrency = (formattedAmount: string): number => {
  // Remove all non-numeric characters except decimal point and minus sign
  const cleaned = formattedAmount.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
};

/**
 * Create a multi-currency display object
 * Useful for showing amounts in multiple currencies at once
 * 
 * @param amount - Amount in base currency
 * @param baseCurrency - Base currency code
 * @param targetCurrencies - Array of target currency codes
 * @param exchangeRates - Optional custom exchange rates
 * @returns Object with currency codes as keys and formatted amounts as values
 * 
 * @example
 * ```typescript
 * const amounts = getMultiCurrencyDisplay(1000000, 'UGX', ['USD', 'EUR', 'GBP']);
 * // Returns: {
 * //   USD: "$ 270.00",
 * //   EUR: "€ 250.00",
 * //   GBP: "£ 210.00"
 * // }
 * ```
 */
export const getMultiCurrencyDisplay = (
  amount: number,
  baseCurrency: string,
  targetCurrencies: string[],
  exchangeRates: ExchangeRates = DEFAULT_EXCHANGE_RATES
): Record<string, string> => {
  const result: Record<string, string> = {};
  
  targetCurrencies.forEach(currency => {
    result[currency] = convertAndFormat(amount, baseCurrency, currency, exchangeRates);
  });
  
  return result;
};

/**
 * Calculate percentage difference between two currency amounts
 * Useful for showing profit/loss in different currencies
 * 
 * @param amount1 - First amount
 * @param amount2 - Second amount
 * @returns Percentage difference (positive or negative)
 */
export const getCurrencyPercentageDiff = (amount1: number, amount2: number): number => {
  if (amount1 === 0) return 0;
  return ((amount2 - amount1) / amount1) * 100;
};

/**
 * Round currency amount to appropriate decimal places
 * 
 * @param amount - Amount to round
 * @param currency - Currency code
 * @param exchangeRates - Optional custom exchange rates
 * @returns Rounded amount
 */
export const roundCurrency = (
  amount: number,
  currency: string,
  exchangeRates: ExchangeRates = DEFAULT_EXCHANGE_RATES
): number => {
  const decimals = currency === 'UGX' ? 0 : 2;
  return Math.round(amount * Math.pow(10, decimals)) / Math.pow(10, decimals);
};

export default {
  convertCurrency,
  formatCurrency,
  formatCurrencyCompact,
  getCurrencySymbol,
  getCurrencyName,
  getExchangeRate,
  convertAndFormat,
  getAvailableCurrencies,
  isCurrencySupported,
  parseCurrency,
  getMultiCurrencyDisplay,
  getCurrencyPercentageDiff,
  roundCurrency,
  DEFAULT_EXCHANGE_RATES
};
