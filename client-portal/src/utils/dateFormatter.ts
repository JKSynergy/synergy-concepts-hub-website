/**
 * Safely format a date string, handling invalid dates gracefully
 * @param dateString - The date string to format
 * @param fallback - The fallback string to display if date is invalid (default: 'N/A')
 * @returns Formatted date string or fallback
 */
export const formatDate = (dateString: string | null | undefined, fallback: string = 'N/A'): string => {
  if (!dateString) return fallback;
  
  try {
    const date = new Date(dateString);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date string:', dateString);
      return fallback;
    }
    
    return date.toLocaleDateString('en-UG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch (error) {
    console.error('Error formatting date:', error, dateString);
    return fallback;
  }
};

/**
 * Format a date to a relative time string (e.g., "2 days ago", "in 5 days")
 * @param dateString - The date string to format
 * @returns Relative time string
 */
export const formatRelativeDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid date';
    
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays > 0) return `in ${diffDays} days`;
    return `${Math.abs(diffDays)} days ago`;
  } catch (error) {
    console.error('Error formatting relative date:', error);
    return 'N/A';
  }
};

/**
 * Format a date and time
 * @param dateString - The date string to format
 * @param fallback - The fallback string to display if date is invalid
 * @returns Formatted date and time string
 */
export const formatDateTime = (dateString: string | null | undefined, fallback: string = 'N/A'): string => {
  if (!dateString) return fallback;
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return fallback;
    
    return date.toLocaleString('en-UG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    console.error('Error formatting date time:', error);
    return fallback;
  }
};
