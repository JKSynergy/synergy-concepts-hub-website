/**
 * Utility functions for date parsing and formatting
 */

/**
 * Parse a date string that might be in DD/MM/YYYY format from CSV
 * @param dateString - The date string to parse
 * @returns A valid Date object or null if parsing fails
 */
export const parseDate = (dateString: string): Date | null => {
  try {
    if (!dateString || dateString === 'Invalid Date' || dateString === '') {
      return null;
    }
    
    // Handle DD/MM/YYYY format from CSV
    if (dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts.length === 3) {
        // Convert DD/MM/YYYY to MM/DD/YYYY for JavaScript Date constructor
        const [day, month, year] = parts;
        const date = new Date(`${month}/${day}/${year}`);
        
        // Check if the date is valid
        if (isNaN(date.getTime())) {
          return null;
        }
        
        return date;
      }
    }
    
    // Try parsing as-is for other formats
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      return null;
    }
    
    return date;
  } catch {
    return null;
  }
};

/**
 * Format a date string for display
 * @param dateString - The date string to format
 * @param format - The format type ('short', 'long', 'iso', 'ddmmyyyy')
 * @returns A formatted date string or 'Invalid Date' if parsing fails
 */
export const formatDate = (dateString: string, format: 'short' | 'long' | 'iso' | 'ddmmyyyy' = 'ddmmyyyy'): string => {
  const date = parseDate(dateString);
  
  if (!date) {
    return 'Invalid Date';
  }
  
  switch (format) {
    case 'long':
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    case 'iso':
      return date.toISOString().split('T')[0];
    case 'short':
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    case 'ddmmyyyy':
    default:
      // Format as "dd mm yyyy" (e.g., "11 10 2025")
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day} ${month} ${year}`;
  }
};

/**
 * Format an application date for display in the applications table
 * @param dateString - The date string to format
 * @returns A formatted date string like "11 10 2025"
 */
export const formatApplicationDate = (dateString: string): string => {
  const date = parseDate(dateString);
  
  if (!date) {
    return 'Invalid Date';
  }
  
  // Format as "dd mm yyyy" (e.g., "11 10 2025")
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};

/**
 * Check if a date is within a specific time range
 * @param dateString - The date string to check
 * @param range - The time range ('today', 'week', 'month', 'year')
 * @returns Boolean indicating if the date falls within the range
 */
export const isDateInRange = (dateString: string, range: string): boolean => {
  const date = parseDate(dateString);
  
  if (!date) {
    return false;
  }
  
  const now = new Date();
  const timeDiff = now.getTime() - date.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  
  switch (range.toLowerCase()) {
    case 'today':
      return daysDiff <= 1;
    case 'week':
      return daysDiff <= 7;
    case 'month':
      return daysDiff <= 30;
    case 'year':
      return daysDiff <= 365;
    default:
      return false;
  }
};

/**
 * Check if two dates are in the same month and year
 * @param dateString1 - First date string
 * @param dateString2 - Second date string (optional, defaults to current date)
 * @returns Boolean indicating if dates are in same month/year
 */
export const isSameMonth = (dateString1: string, dateString2?: string): boolean => {
  const date1 = parseDate(dateString1);
  const date2 = dateString2 ? parseDate(dateString2) : new Date();
  
  if (!date1 || !date2) {
    return false;
  }
  
  return date1.getMonth() === date2.getMonth() && 
         date1.getFullYear() === date2.getFullYear();
};