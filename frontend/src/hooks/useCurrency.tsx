/**
 * useCurrency Hook
 * 
 * React hook for currency conversion and formatting throughout the application.
 * Provides access to currency conversion functions with the current exchange rates.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  convertCurrency as convertCurrencyUtil,
  formatCurrency as formatCurrencyUtil,
  formatCurrencyCompact,
  getCurrencySymbol,
  getCurrencyName,
  getExchangeRate,
  convertAndFormat,
  getAvailableCurrencies,
  isCurrencySupported,
  parseCurrency,
  getMultiCurrencyDisplay,
  roundCurrency,
  DEFAULT_EXCHANGE_RATES,
  ExchangeRates
} from '../utils/currencyUtils';

interface UseCurrencyReturn {
  // Conversion functions
  convertCurrency: (amount: number, from: string, to: string) => number;
  formatCurrency: (amount: number, currency: string) => string;
  formatCurrencyCompact: (amount: number, currency: string) => string;
  convertAndFormat: (amount: number, from: string, to: string) => string;
  
  // Utility functions
  getCurrencySymbol: (currency: string) => string;
  getCurrencyName: (currency: string) => string;
  getExchangeRate: (from: string, to: string) => number;
  parseCurrency: (formatted: string) => number;
  roundCurrency: (amount: number, currency: string) => number;
  getMultiCurrencyDisplay: (amount: number, base: string, targets: string[]) => Record<string, string>;
  
  // State
  exchangeRates: ExchangeRates;
  baseCurrency: string;
  availableCurrencies: string[];
  isSupported: (currency: string) => boolean;
  
  // Rate management
  updateRates: (newRates: ExchangeRates) => void;
  setBaseCurrency: (currency: string) => void;
  refreshRates: () => Promise<void>;
  lastUpdate: Date | null;
}

/**
 * Custom hook for currency operations
 * 
 * @param initialBaseCurrency - Optional base currency (defaults to 'UGX')
 * @param initialRates - Optional initial exchange rates
 * @returns Currency conversion functions and state
 * 
 * @example
 * ```typescript
 * const { convertCurrency, formatCurrency, baseCurrency } = useCurrency();
 * 
 * const usdAmount = convertCurrency(1000000, 'UGX', 'USD');
 * const formatted = formatCurrency(usdAmount, 'USD');
 * ```
 */
export const useCurrency = (
  initialBaseCurrency: string = 'UGX',
  initialRates: ExchangeRates = DEFAULT_EXCHANGE_RATES
): UseCurrencyReturn => {
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>(initialRates);
  const [baseCurrency, setBaseCurrency] = useState<string>(initialBaseCurrency);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Load rates from localStorage on mount
  useEffect(() => {
    const savedRates = localStorage.getItem('currencyRates');
    const savedBaseCurrency = localStorage.getItem('baseCurrency');
    const savedLastUpdate = localStorage.getItem('currencyLastUpdate');
    
    if (savedRates) {
      try {
        setExchangeRates(JSON.parse(savedRates));
      } catch (e) {
        console.error('Failed to parse saved currency rates:', e);
      }
    }
    
    if (savedBaseCurrency) {
      setBaseCurrency(savedBaseCurrency);
    }
    
    if (savedLastUpdate) {
      setLastUpdate(new Date(savedLastUpdate));
    }
  }, []);

  // Save rates to localStorage when they change
  useEffect(() => {
    localStorage.setItem('currencyRates', JSON.stringify(exchangeRates));
    localStorage.setItem('baseCurrency', baseCurrency);
    if (lastUpdate) {
      localStorage.setItem('currencyLastUpdate', lastUpdate.toISOString());
    }
  }, [exchangeRates, baseCurrency, lastUpdate]);

  // Conversion function with current rates
  const convertCurrency = useCallback(
    (amount: number, from: string, to: string): number => {
      return convertCurrencyUtil(amount, from, to, exchangeRates);
    },
    [exchangeRates]
  );

  // Format function with current rates
  const formatCurrency = useCallback(
    (amount: number, currency: string): string => {
      return formatCurrencyUtil(amount, currency, exchangeRates);
    },
    [exchangeRates]
  );

  // Compact format function
  const formatCurrencyCompactFn = useCallback(
    (amount: number, currency: string): string => {
      return formatCurrencyCompact(amount, currency, exchangeRates);
    },
    [exchangeRates]
  );

  // Convert and format function
  const convertAndFormatFn = useCallback(
    (amount: number, from: string, to: string): string => {
      return convertAndFormat(amount, from, to, exchangeRates);
    },
    [exchangeRates]
  );

  // Get currency symbol
  const getCurrencySymbolFn = useCallback(
    (currency: string): string => {
      return getCurrencySymbol(currency, exchangeRates);
    },
    [exchangeRates]
  );

  // Get currency name
  const getCurrencyNameFn = useCallback(
    (currency: string): string => {
      return getCurrencyName(currency, exchangeRates);
    },
    [exchangeRates]
  );

  // Get exchange rate
  const getExchangeRateFn = useCallback(
    (from: string, to: string): number => {
      return getExchangeRate(from, to, exchangeRates);
    },
    [exchangeRates]
  );

  // Round currency
  const roundCurrencyFn = useCallback(
    (amount: number, currency: string): number => {
      return roundCurrency(amount, currency, exchangeRates);
    },
    [exchangeRates]
  );

  // Get multi-currency display
  const getMultiCurrencyDisplayFn = useCallback(
    (amount: number, base: string, targets: string[]): Record<string, string> => {
      return getMultiCurrencyDisplay(amount, base, targets, exchangeRates);
    },
    [exchangeRates]
  );

  // Get available currencies
  const availableCurrencies = useCallback(
    (): string[] => {
      return getAvailableCurrencies(exchangeRates);
    },
    [exchangeRates]
  )();

  // Check if currency is supported
  const isSupported = useCallback(
    (currency: string): boolean => {
      return isCurrencySupported(currency, exchangeRates);
    },
    [exchangeRates]
  );

  // Update exchange rates
  const updateRates = useCallback((newRates: ExchangeRates) => {
    setExchangeRates(newRates);
    setLastUpdate(new Date());
  }, []);

  // Refresh rates from API
  const refreshRates = useCallback(async () => {
    try {
      // TODO: Replace with actual API call
      // const response = await fetch('https://api.exchangerate-api.com/v4/latest/UGX');
      // const data = await response.json();
      
      // Simulate API call with slight rate variations
      const updatedRates = { ...exchangeRates };
      Object.keys(updatedRates).forEach(key => {
        if (key !== baseCurrency) {
          const current = updatedRates[key].rate;
          const variation = (Math.random() - 0.5) * 0.02; // ±1% variation
          updatedRates[key].rate = current * (1 + variation);
        }
      });
      
      setExchangeRates(updatedRates);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to refresh exchange rates:', error);
      throw error;
    }
  }, [exchangeRates, baseCurrency]);

  return {
    // Conversion functions
    convertCurrency,
    formatCurrency,
    formatCurrencyCompact: formatCurrencyCompactFn,
    convertAndFormat: convertAndFormatFn,
    
    // Utility functions
    getCurrencySymbol: getCurrencySymbolFn,
    getCurrencyName: getCurrencyNameFn,
    getExchangeRate: getExchangeRateFn,
    parseCurrency,
    roundCurrency: roundCurrencyFn,
    getMultiCurrencyDisplay: getMultiCurrencyDisplayFn,
    
    // State
    exchangeRates,
    baseCurrency,
    availableCurrencies,
    isSupported,
    
    // Rate management
    updateRates,
    setBaseCurrency,
    refreshRates,
    lastUpdate
  };
};

export default useCurrency;
