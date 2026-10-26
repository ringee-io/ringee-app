import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { ContactService } from "./contact.service";

/** Reading a file touches no repository, so the bare service is enough. */
const service = Object.create(ContactService.prototype) as ContactService;

const APOLLO_EXPORT = [
  '"First Name","Last Name","Title","Company Name","Email","Mobile Phone","Work Direct Phone","Corporate Phone","SEO Description","City","State"',
  // A quoted description that spans two lines is still one contact.
  `"Jane","Doe","VP Sales","Acme","jane@acme.com","","'+1 415-555-2671","+1 415-555-0000","Acme builds\nsales software, fast.","San Francisco","California"`,
  '"John","Roe","CTO","Beta","email_not_unlocked@domain.com","","","","","Austin","Texas"',
].join("\r\n");

describe("ContactService.parseContactsCsv — Ringee template", () => {
  it("reads the rows, reports a bad one by its row and keeps a repeated number once", () => {
    const parsed = service.parseContactsCsv(
      [
        "phoneNumber,name,email",
        "+14155552671,Jane Doe,jane@acme.com",
        "+14155552672,,",
        "+14155552671,Jane Again,",
        "",
        ",,",
        '+14155552673,"Doe, John",',
      ].join("\n"),
    );

    assert.equal(parsed.totalRows, 4);
    assert.deepEqual(
      parsed.rows.map((row) => [row.phoneNumber, row.name]),
      [
        ["+14155552671", "Jane Doe"],
        ["+14155552673", "Doe, John"],
      ],
    );
    assert.deepEqual(parsed.errors, [
      {
        row: 3,
        field: "name",
        message: "Required field 'name' is missing or empty",
      },
    ]);
  });

  it("refuses a file without the template's required columns", () => {
    assert.throws(
      () => service.parseContactsCsv("phone,whatever\n1,2"),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message === "Missing required columns: phoneNumber, name",
    );
  });

  it("retains sales context from custom columns after validation", () => {
    const parsed = service.parseContactsCsv(
      'phoneNumber,name,Need,Current provider,Empty\n+14155552671,Jane Doe,"Better reporting",Example CRM,',
    );

    assert.deepEqual(parsed.rows[0].customFields, {
      name: "Jane Doe",
      Need: "Better reporting",
      "Current provider": "Example CRM",
    });
  });
});

describe("ContactService.parseContactsCsv — tool exports", () => {
  it("imports an Apollo export as Apollo wrote it", () => {
    const parsed = service.parseContactsCsv(APOLLO_EXPORT, "apollo");

    assert.equal(parsed.totalRows, 2);
    assert.equal(parsed.rows.length, 1);
    assert.deepEqual(parsed.rows[0].customFields, {
      "First Name": "Jane",
      "Last Name": "Doe",
      "Company Name": "Acme",
      Email: "jane@acme.com",
      City: "San Francisco",
      "Corporate Phone": "+1 415-555-0000",
      "SEO Description": "Acme builds\nsales software, fast.",
    });
    assert.deepEqual(
      {
        phoneNumber: parsed.rows[0].phoneNumber,
        name: parsed.rows[0].name,
        email: parsed.rows[0].email,
        company: parsed.rows[0].company,
        jobTitle: parsed.rows[0].jobTitle,
        location: parsed.rows[0].location,
        state: parsed.rows[0].state,
      },
      {
        phoneNumber: "+14155552671",
        name: "Jane Doe",
        email: "jane@acme.com",
        company: "Acme",
        jobTitle: "VP Sales",
        location: "San Francisco",
        state: "California",
      },
    );
    // Nobody to call: the row is reported, not imported.
    assert.deepEqual(parsed.errors, [
      {
        row: 3,
        field: "phoneNumber",
        message: "Required field 'phoneNumber' is missing or empty",
      },
    ]);
  });

  it("still reads an Apollo export left on Ringee's template", () => {
    assert.deepEqual(
      service.parseContactsCsv(APOLLO_EXPORT),
      service.parseContactsCsv(APOLLO_EXPORT, "apollo"),
    );
  });

  it("says which columns a Prospeo export is missing", () => {
    assert.throws(
      () =>
        service.parseContactsCsv(
          "Full name,Email\nJean Dupont,jean@acme.fr",
          "prospeo",
        ),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message.startsWith(
          "This Prospeo export is missing a phone column (Mobile international format, Mobile, Company HQ Phone)",
        ),
    );
  });
});
