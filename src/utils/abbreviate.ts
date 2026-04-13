/**
 * Special values that should not be abbreviated
 */
const SPECIAL_ARR_VALUES = ['Not in source', 'N/A', '--', ''] as const;

/**
 * Type for special ARR values
 */
type SpecialARRValue = (typeof SPECIAL_ARR_VALUES)[number];

/**
 * Checks if a value is a special (non-numeric) ARR value
 * @param value - Value to check
 * @returns True if value is a special ARR value
 */
function isSpecialARRValue(value: string): value is SpecialARRValue {
  return (SPECIAL_ARR_VALUES as readonly string[]).includes(value);
}

/**
 * Extracts currency symbol from ARR string
 * @param arrStr - ARR string (e.g., "$100M", "€50M", "£75M")
 * @returns Currency symbol ('$', '€', '£', '¥', 'A$')
 */
function extractCurrencySymbol(arrStr: string): string {
  if (arrStr.includes('A$')) return 'A$';
  if (arrStr.includes('€')) return '€';
  if (arrStr.includes('£')) return '£';
  if (arrStr.includes('¥')) return '¥';
  return '$'; // Default to USD
}

/**
 * Parses numeric value from ARR string, handling currency and multipliers
 * @param numericStr - Numeric portion of ARR string
 * @returns Parsed numeric value
 */
function parseARRNumeric(numericStr: string): number {
  // Trim whitespace first
  numericStr = numericStr.trim();

  // Determine multiplier based on suffix (check before cleaning)
  let multiplier = 1;
  if (/B$/i.test(numericStr)) {
    multiplier = 1000000000;
  } else if (/M$/i.test(numericStr)) {
    multiplier = 1000000;
  } else if (/K$/i.test(numericStr)) {
    multiplier = 1000;
  }

  // Remove non-numeric characters except decimal point
  const cleaned = numericStr.replace(/[^0-9.]/g, '').trim();

  const numeric = parseFloat(cleaned) * multiplier;
  return isNaN(numeric) ? 0 : numeric;
}

/**
 * Abbreviates ARR (Annual Recurring Revenue) to concise format
 * Converts large numbers to B/M/K notation (e.g., $100M, €1.2B, £50K)
 * Returns special values unchanged (Not in source, N/A, etc.)
 *
 * @param arrStr - ARR string in display format (e.g., "$220,000,000", "€120,000,000") or undefined
 * @returns Abbreviated ARR string (e.g., "$220M", "€120M") or original special value
 *
 * @example
 * abbreviateARR('$220,000,000') // returns '$220M'
 * abbreviateARR('€1,200,000,000') // returns '€1.2B'
 * abbreviateARR('£50,000') // returns '£50K'
 * abbreviateARR('Not in source') // returns 'Not in source'
 * abbreviateARR(undefined) // returns undefined
 */
export function abbreviateARR(arrStr: string | undefined): string | undefined {
  // Handle null/undefined
  if (arrStr === null || arrStr === undefined) {
    return arrStr;
  }

  // Trim input
  arrStr = arrStr.trim();

  // Handle special values and empty strings
  if (!arrStr || isSpecialARRValue(arrStr)) {
    return arrStr;
  }

  // Extract currency symbol before processing
  const currencySymbol = extractCurrencySymbol(arrStr);

  // Parse numeric value
  const numeric = parseARRNumeric(arrStr);

  // Convert to appropriate abbreviation
  if (numeric >= 1000000000) {
    const billions = numeric / 1000000000;
    return `${currencySymbol}${billions.toFixed(1)}B`;
  } else if (numeric >= 1000000) {
    const millions = numeric / 1000000;
    return `${currencySymbol}${millions.toFixed(0)}M`;
  } else if (numeric >= 1000) {
    const thousands = numeric / 1000;
    return `${currencySymbol}${thousands.toFixed(0)}K`;
  } else if (numeric > 0) {
    return `${currencySymbol}${numeric.toFixed(0)}`;
  } else {
    return `${currencySymbol}0`;
  }
}
