/**
 * Maps ISO 3166-2:CA province/territory codes to display names.
 * Used for tooltip and panel display name resolution for Canadian provinces.
 */

/** ISO 3166-2:CA province code → display name */
export const provinceCodeToName: Record<string, string> = {
  'CA-AB': 'Alberta',
  'CA-BC': 'British Columbia',
  'CA-MB': 'Manitoba',
  'CA-NB': 'New Brunswick',
  'CA-NL': 'Newfoundland and Labrador',
  'CA-NS': 'Nova Scotia',
  'CA-NT': 'Northwest Territories',
  'CA-NU': 'Nunavut',
  'CA-ON': 'Ontario',
  'CA-PE': 'Prince Edward Island',
  'CA-QC': 'Quebec',
  'CA-SK': 'Saskatchewan',
  'CA-YT': 'Yukon',
};

/** All CA province/territory codes (used for federal laws like PIPEDA) */
export const allCanadianProvinceCodes = Object.keys(provinceCodeToName);
