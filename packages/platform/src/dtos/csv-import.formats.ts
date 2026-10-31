/**
 * The files a contacts import reads, and how each one is read.
 *
 * `ringee` is Ringee's own template: its headers are the contact fields of
 * `CSV_FIELDS`. The others are exports from prospecting tools. Each tool names
 * its columns its own way, so the file is read through that tool's headers and
 * uploaded exactly as the tool wrote it — nobody has to rename a column first.
 */
import { IsIn, IsOptional } from "class-validator";
import { normalizePhoneE164 } from "../crm/phone";
import {
  ALL_CSV_FIELDS,
  CSV_IMPORT_CONFIG,
  type CsvContactInput,
  type CsvFieldName,
  isValidCsvEmail,
  validateCsvHeaders,
} from "./csv-import.schema";

export const CSV_IMPORT_FORMATS = ["ringee", "apollo", "prospeo"] as const;

export type CsvImportFormat = (typeof CSV_IMPORT_FORMATS)[number];

/** The multipart field an upload names its format with; absent means Ringee's template. */
export class CsvImportFormatDto {
  @IsOptional()
  @IsIn(CSV_IMPORT_FORMATS)
  format?: CsvImportFormat;
}

type ExportFormat = Exclude<CsvImportFormat, "ringee">;
type ExportField = Exclude<CsvFieldName, "phoneNumber" | "name">;

// Imports reuse an existing contact without overwriting its identity or city.
// Retain these original cells too, so the upload's context remains available
// even when the contact already has different values in its canonical fields.
const RETAIN_SOURCE_FIELDS = new Set<CsvFieldName>([
  "name",
  "email",
  "company",
  "location",
]);

/** Where a tool's export keeps each contact field, best header first. */
interface ExportColumns {
  /** The tool, as messages name it. */
  label: string;
  /** The number to call: the first of these with a value in the row. */
  phone: readonly string[];
  /** The whole name, when the export has it in one column. */
  fullName: readonly string[];
  /** First and last name, joined when the row has no whole name. */
  nameParts: readonly string[];
  /** Every other contact field: the first of its headers with a value. */
  fields: Partial<Record<ExportField, readonly string[]>>;
  /** What the tool writes in place of an email it has not revealed. */
  placeholderEmails?: readonly string[];
}

const EXPORT_COLUMNS: Record<ExportFormat, ExportColumns> = {
  // Apollo's contacts export. Its CSV enrichment keeps the uploaded columns
  // and adds the numbers it found as "Enriched … phone".
  apollo: {
    label: "Apollo",
    // A mobile or a direct line reaches the person; a corporate number
    // reaches the front desk, which still beats no number at all.
    phone: [
      "Mobile Phone",
      "Work Direct Phone",
      "Corporate Phone",
      "Other Phone",
      "Home Phone",
      "Company Phone",
      "Enriched mobile phone",
      "Enriched work direct phone",
      "Enriched corporate phone",
      "Enriched other phone",
      "Enriched home phone",
    ],
    fullName: [],
    nameParts: ["First Name", "Last Name"],
    fields: {
      email: ["Email"],
      company: ["Company Name", "Company", "Company Name for Emails"],
      jobTitle: ["Title"],
      location: ["City"],
      state: ["State"],
      website: ["Website"],
      linkedinUrl: ["Person Linkedin Url"],
      companyLinkedinUrl: ["Company Linkedin Url"],
      revenue: ["Annual Revenue"],
      companySize: ["# Employees"],
    },
    placeholderEmails: ["email_not_unlocked@domain.com"],
  },
  // Prospeo's People Search export.
  prospeo: {
    label: "Prospeo",
    phone: ["Mobile international format", "Mobile", "Company HQ Phone"],
    fullName: ["Full name"],
    nameParts: ["First name", "Last name"],
    fields: {
      email: ["Email"],
      company: ["Company name"],
      jobTitle: ["Job title"],
      location: ["Person city"],
      state: ["Person state"],
      website: ["Company website", "Company domain"],
      linkedinUrl: ["Person LinkedIn URL"],
      companyLinkedinUrl: ["Company LinkedIn URL"],
      revenue: ["Company revenue range"],
      companySize: ["Company employee range", "Company employee count"],
    },
  },
};

/** One data row in Ringee's columns, ready for `validateCsvRow`. */
export type CsvRowReader = (
  values: string[],
) => Record<CsvFieldName, string> & Pick<CsvContactInput, "customFields">;

export type CsvHeaderReading =
  | { ok: true; format: CsvImportFormat; readRow: CsvRowReader }
  | { ok: false; message: string };

type Readable = Extract<CsvHeaderReading, { ok: true }>;

/**
 * How to read a file whose first row is `headers`, uploaded as `format`. When
 * that format cannot read it but exactly one other can, the file is read as
 * that one: an Apollo export uploaded as Ringee's template is still an Apollo
 * export. Otherwise the message names what the chosen format is missing.
 */
export function readCsvHeader(
  headers: string[],
  format: CsvImportFormat,
): CsvHeaderReading {
  if (headers.length > CSV_IMPORT_CONFIG.MAX_COLUMNS) {
    return {
      ok: false,
      message: `The file has ${headers.length} columns; at most ${CSV_IMPORT_CONFIG.MAX_COLUMNS} are read.`,
    };
  }
  const columns = new Map<string, number>();
  headers.forEach((header, index) => columns.set(headerKey(header), index));

  const chosen = readAs(format, headers, columns);
  if (chosen.ok) return chosen;

  const readable = CSV_IMPORT_FORMATS.filter((other) => other !== format)
    .map((other) => readAs(other, headers, columns))
    .filter((reading): reading is Readable => reading.ok);
  return readable.length === 1 ? readable[0] : chosen;
}

/**
 * Splits CSV text into records of raw fields (RFC 4180). A quoted field may
 * hold commas, line breaks and doubled quotes — exports write a company's
 * description that way — while a quote inside an unquoted field is just text.
 */
export function splitCsvRecords(content: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (content[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
      }
    } else if (char === '"' && field.trim() === "") {
      field = "";
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && content[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/** A header as it is matched: case, spacing and underscores do not count. */
function headerKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, " ");
}

function cell(values: string[], index: number | undefined): string {
  return index === undefined ? "" : (values[index] ?? "").trim();
}

/** Keep source labels and multiline values for the agent's contact briefing. */
function additionalColumns(
  headers: string[],
  values: string[],
  used: Set<number>,
): Record<string, string> | undefined {
  const labels = new Set<string>();
  // Where each label's numbering continues, so a file that repeats one header
  // thousands of times is numbered in one pass, not by recounting from 2.
  const nextSuffix = new Map<string, number>();
  const entries = headers.flatMap((header, index) => {
    const sourceLabel = header.trim();
    const value = cell(values, index);
    if (used.has(index) || !sourceLabel || !value) return [];
    let label = sourceLabel;
    let suffix = nextSuffix.get(sourceLabel) ?? 2;
    while (labels.has(label)) {
      label = `${sourceLabel} (${suffix})`;
      suffix++;
    }
    nextSuffix.set(sourceLabel, suffix);
    labels.add(label);
    return [[label, value]];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function readAs(
  format: CsvImportFormat,
  headers: string[],
  columns: Map<string, number>,
): CsvHeaderReading {
  return format === "ringee"
    ? readTemplate(headers, columns)
    : readExport(format, EXPORT_COLUMNS[format], headers, columns);
}

/** Ringee's template: every column is a contact field, kept as written. */
function readTemplate(
  headers: string[],
  columns: Map<string, number>,
): CsvHeaderReading {
  const { missingRequired } = validateCsvHeaders(headers);
  if (missingRequired.length > 0) {
    return {
      ok: false,
      message: `Missing required columns: ${missingRequired.join(", ")}`,
    };
  }

  const at = ALL_CSV_FIELDS.map(
    (field) => [field, columns.get(headerKey(field))] as const,
  );
  const used = new Set(
    at.flatMap(([field, index]) =>
      index === undefined || RETAIN_SOURCE_FIELDS.has(field) ? [] : [index],
    ),
  );
  return {
    ok: true,
    format: "ringee",
    readRow: (values) => {
      const row = {} as Record<CsvFieldName, string>;
      for (const [field, index] of at) row[field] = cell(values, index);
      const customFields = additionalColumns(headers, values, used);
      return customFields ? { ...row, customFields } : row;
    },
  };
}

function readExport(
  format: ExportFormat,
  spec: ExportColumns,
  headers: string[],
  columns: Map<string, number>,
): CsvHeaderReading {
  const find = (headers: readonly string[]) =>
    headers.flatMap((header) => {
      const index = columns.get(headerKey(header));
      return index === undefined ? [] : [index];
    });

  const phone = find(spec.phone);
  const fullName = find(spec.fullName);
  const nameParts = find(spec.nameParts);

  const missing: string[] = [];
  if (phone.length === 0) {
    missing.push(`a phone column (${preview(spec.phone)})`);
  }
  if (fullName.length === 0 && nameParts.length === 0) {
    missing.push(
      `a name column (${preview([...spec.fullName, ...spec.nameParts])})`,
    );
  }
  if (missing.length > 0) {
    return {
      ok: false,
      message: `This ${spec.label} export is missing ${missing.join(" and ")}`,
    };
  }

  const fields = Object.entries(spec.fields).map(
    ([field, headers]) => [field as ExportField, find(headers)] as const,
  );
  const placeholders = new Set(
    spec.placeholderEmails?.map((email) => email.toLowerCase()),
  );

  return {
    ok: true,
    format,
    readRow: (values) => {
      const used = new Set<number>();
      const first = (
        indexes: number[],
        clean = (value: string) => value,
        retainSource = false,
      ) => {
        for (const index of indexes) {
          const value = clean(cell(values, index));
          if (value) {
            if (!retainSource) used.add(index);
            return value;
          }
        }
        return "";
      };

      const row = Object.fromEntries(
        ALL_CSV_FIELDS.map((field) => [field, ""]),
      ) as Record<CsvFieldName, string>;
      for (const [field, indexes] of fields) {
        row[field] = first(indexes, undefined, RETAIN_SOURCE_FIELDS.has(field));
      }
      row.phoneNumber = first(phone, exportPhone);
      row.name =
        first(fullName, undefined, true) ||
        nameParts
          .map((index) => cell(values, index))
          .filter(Boolean)
          .join(" ");
      // The export is taken as the tool wrote it: an email cell that holds
      // no address leaves the contact without one instead of costing the row.
      if (
        placeholders.has(row.email.toLowerCase()) ||
        (row.email && !isValidCsvEmail(row.email))
      ) {
        row.email = "";
      }
      const customFields = additionalColumns(headers, values, used);
      return customFields ? { ...row, customFields } : row;
    },
  };
}

/**
 * A tool's phone cell as Ringee stores it: E.164 whenever it parses. A
 * leading apostrophe is how a spreadsheet keeps "+1 415…" as text, not part
 * of the number.
 */
function exportPhone(value: string): string {
  const phone = value.replace(/^'+/, "").trim();
  return phone ? (normalizePhoneE164(phone) ?? phone) : "";
}

/** The first few header names, for a message. */
function preview(headers: readonly string[]): string {
  const shown = headers.slice(0, 3).join(", ");
  return headers.length > 3 ? `${shown}, …` : shown;
}
