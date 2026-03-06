/**
 * CSV Import Schema and Types
 * Defines the structure and validation for contacts CSV import
 */

// Configuration constants
export const CSV_IMPORT_CONFIG = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_ROWS: 10000,
  BATCH_SIZE: 200,
  ALLOWED_DELIMITERS: [",", ";", "\t", "|"],
} as const;

// CSV field definitions based on Contact model
export const CSV_FIELDS = {
  phoneNumber: { required: true, maxLength: 20 },
  name: { required: true, maxLength: 100 },
  email: { required: false, maxLength: 100 },
  company: { required: false, maxLength: undefined },
} as const;

export type CsvFieldName = keyof typeof CSV_FIELDS;

export const REQUIRED_CSV_FIELDS: CsvFieldName[] = Object.entries(CSV_FIELDS)
  .filter(([_, config]) => config.required)
  .map(([field]) => field as CsvFieldName);

export const OPTIONAL_CSV_FIELDS: CsvFieldName[] = Object.entries(CSV_FIELDS)
  .filter(([_, config]) => !config.required)
  .map(([field]) => field as CsvFieldName);

export const ALL_CSV_FIELDS: CsvFieldName[] = Object.keys(
  CSV_FIELDS
) as CsvFieldName[];

// Import row types
export interface CsvContactRow {
  phoneNumber: string;
  name: string;
  email?: string;
  company?: string;
}

export interface CsvRowError {
  row: number;
  field?: string;
  message: string;
}

export interface CsvImportSummary {
  totalRows: number;
  inserted: number;
  duplicatesSkipped: number;
  invalidRows: number;
  errors: CsvRowError[];
}

export interface CsvImportResult {
  success: boolean;
  summary: CsvImportSummary;
}

// Validation helpers
export function validateCsvHeaders(
  headers: string[]
): { valid: boolean; missingRequired: string[]; unknownHeaders: string[] } {
  const normalizedHeaders = headers.map((h) => h.trim().toLowerCase());
  const validFields = ALL_CSV_FIELDS.map((f) => f.toLowerCase());

  const missingRequired = REQUIRED_CSV_FIELDS.filter(
    (field) => !normalizedHeaders.includes(field.toLowerCase())
  );

  const unknownHeaders = headers.filter(
    (h) => !validFields.includes(h.trim().toLowerCase())
  );

  return {
    valid: missingRequired.length === 0,
    missingRequired,
    unknownHeaders,
  };
}

export function validateCsvRow(
  row: Record<string, string>,
  rowIndex: number
): { valid: boolean; data?: CsvContactRow; errors: CsvRowError[] } {
  const errors: CsvRowError[] = [];

  // Check required fields
  for (const field of REQUIRED_CSV_FIELDS) {
    const value = row[field]?.trim();
    if (!value) {
      errors.push({
        row: rowIndex,
        field,
        message: `Required field '${field}' is missing or empty`,
      });
    }
  }

  // Validate field lengths
  for (const [field, config] of Object.entries(CSV_FIELDS)) {
    const value = row[field]?.trim();
    if (value && config.maxLength && value.length > config.maxLength) {
      errors.push({
        row: rowIndex,
        field,
        message: `Field '${field}' exceeds maximum length of ${config.maxLength}`,
      });
    }
  }

  // Validate email format if provided
  const email = row.email?.trim();
  if (email && !isValidEmail(email)) {
    errors.push({
      row: rowIndex,
      field: "email",
      message: "Invalid email format",
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      phoneNumber: row.phoneNumber.trim(),
      name: row.name.trim(),
      email: row.email?.trim() || undefined,
      company: row.company?.trim() || undefined,
    },
    errors: [],
  };
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
