import { describe, expect, it } from "vitest";

import {
  ALL_CSV_FIELDS,
  OPTIONAL_CSV_FIELDS,
  validateCsvRow,
} from "./csv-import.schema";

describe("CSV contact LinkedIn fields", () => {
  it("recognizes personal and company LinkedIn columns as optional", () => {
    expect(ALL_CSV_FIELDS).toContain("linkedinUrl");
    expect(ALL_CSV_FIELDS).toContain("companyLinkedinUrl");
    expect(OPTIONAL_CSV_FIELDS).toContain("linkedinUrl");
    expect(OPTIONAL_CSV_FIELDS).toContain("companyLinkedinUrl");
  });

  it("keeps both LinkedIn values in the validated contact row", () => {
    const result = validateCsvRow(
      {
        phoneNumber: "+14155552671",
        name: "John Doe",
        linkedinUrl: " https://linkedin.com/in/john-doe ",
        companyLinkedinUrl: " https://linkedin.com/company/acme ",
      },
      2,
    );

    expect(result).toEqual({
      valid: true,
      data: expect.objectContaining({
        linkedinUrl: "https://linkedin.com/in/john-doe",
        companyLinkedinUrl: "https://linkedin.com/company/acme",
      }),
      errors: [],
    });
  });
});
