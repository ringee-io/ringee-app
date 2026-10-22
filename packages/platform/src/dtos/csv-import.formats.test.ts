import { describe, expect, it } from "vitest";

import { readCsvHeader, splitCsvRecords } from "./csv-import.formats";

/** Reads one data row of `csv` the way the contacts import does. */
function readFirstRow(
  csv: string,
  format: Parameters<typeof readCsvHeader>[1],
) {
  const [headers, ...rows] = splitCsvRecords(csv);
  const reading = readCsvHeader(headers, format);
  if (!reading.ok) throw new Error(reading.message);
  return { format: reading.format, row: reading.readRow(rows[0]) };
}

const APOLLO_HEADER =
  '"First Name","Last Name","Title","Company Name","Company Name for Emails","Email","Email Status","Seniority","Work Direct Phone","Home Phone","Mobile Phone","Corporate Phone","Other Phone","# Employees","Industry","Keywords","Person Linkedin Url","Website","Company Linkedin Url","City","State","Country","Company Address","SEO Description","Annual Revenue","Apollo Contact Id"';

const PROSPEO_HEADER =
  "First name,Last name,Full name,Person LinkedIn URL,Email,Email status,Mobile,Mobile status,Mobile international format,Mobile national format,Job title,Person country,Person state,Person city,Company name,Company website,Company employee range,Company domain,Company LinkedIn URL,Company HQ Phone,Company revenue range,Company description";

describe("splitCsvRecords", () => {
  it("keeps commas, line breaks and doubled quotes inside a quoted field", () => {
    expect(
      splitCsvRecords(
        'name,about\n"Doe, Jane","Builds CRMs.\nSays ""hi"" a lot."\r\nJohn,plain\r\n',
      ),
    ).toEqual([
      ["name", "about"],
      ["Doe, Jane", 'Builds CRMs.\nSays "hi" a lot.'],
      ["John", "plain"],
    ]);
  });

  it("treats a quote inside an unquoted field as text", () => {
    expect(splitCsvRecords('Big "Mike" Doe,+14155552671')).toEqual([
      ['Big "Mike" Doe', "+14155552671"],
    ]);
  });

  it("opens a quoted field after leading spaces or a byte-order mark", () => {
    expect(splitCsvRecords('﻿"First Name", "Doe, Jane"')).toEqual([
      ["First Name", "Doe, Jane"],
    ]);
  });
});

describe("readCsvHeader — Ringee template", () => {
  it("reads the contact fields by name, whatever their case", () => {
    const { format, row } = readFirstRow(
      "PhoneNumber,NAME,email,unknown\n(415) 555-2671 , Jane Doe ,jane@acme.com,x",
      "ringee",
    );

    expect(format).toBe("ringee");
    expect(row).toMatchObject({
      // The template keeps a number as it was typed.
      phoneNumber: "(415) 555-2671",
      name: "Jane Doe",
      email: "jane@acme.com",
      company: "",
    });
  });

  it("names the required columns a file is missing", () => {
    expect(readCsvHeader(["email", "company"], "ringee")).toEqual({
      ok: false,
      message: "Missing required columns: phoneNumber, name",
    });
  });
});

describe("readCsvHeader — Apollo export", () => {
  it("maps an Apollo row to the contact fields", () => {
    const { format, row } = readFirstRow(
      `${APOLLO_HEADER}\n"Jane","Doe","VP Sales","Acme","Acme","email_not_unlocked@domain.com","Unavailable","VP","'+1 415-555-2671","","","+1 415-555-0000","","120","Software","crm, sales","http://www.linkedin.com/in/janedoe","http://www.acme.com","http://www.linkedin.com/company/acme","San Francisco","California","United States","1 Market St, San Francisco","Acme builds\nsales software.","25000000","5f1a"`,
      "apollo",
    );

    expect(format).toBe("apollo");
    expect(row).toEqual({
      phoneNumber: "+14155552671",
      name: "Jane Doe",
      // Apollo's stand-in for an email it has not revealed.
      email: "",
      company: "Acme",
      jobTitle: "VP Sales",
      location: "San Francisco",
      state: "California",
      website: "http://www.acme.com",
      linkedinUrl: "http://www.linkedin.com/in/janedoe",
      companyLinkedinUrl: "http://www.linkedin.com/company/acme",
      revenue: "25000000",
      companySize: "120",
    });
  });

  it("calls the mobile first and the switchboard last", () => {
    const header =
      "First Name,Last Name,Corporate Phone,Work Direct Phone,Mobile Phone";
    expect(
      readFirstRow(
        `${header}\nA,B,+14155550000,+14155550001,+14155550002`,
        "apollo",
      ).row.phoneNumber,
    ).toBe("+14155550002");
    expect(
      readFirstRow(`${header}\nA,B,+14155550000,,`, "apollo").row.phoneNumber,
    ).toBe("+14155550000");
  });

  it("reads the older Company header and drops an email that is not one", () => {
    const { row } = readFirstRow(
      "First Name,Last Name,Company,Email,Mobile Phone\nJane,,Acme,n/a,+14155552671",
      "apollo",
    );

    expect(row).toMatchObject({ name: "Jane", company: "Acme", email: "" });
  });

  it("says which columns an Apollo export needs", () => {
    expect(
      readCsvHeader(["First Name", "Last Name", "Email"], "apollo"),
    ).toEqual({
      ok: false,
      message:
        "This Apollo export is missing a phone column (Mobile Phone, Work Direct Phone, Corporate Phone, …)",
    });
  });
});

describe("readCsvHeader — Prospeo export", () => {
  it("maps a Prospeo row to the contact fields", () => {
    const { format, row } = readFirstRow(
      `${PROSPEO_HEADER}\nJean,Dupont,Jean Dupont,https://www.linkedin.com/in/jeandupont,jean@acme.fr,VERIFIED,+33612345678,VERIFIED,+33 6 12 34 56 78,06 12 34 56 78,Head of Sales,France,Île-de-France,Paris,Acme,https://acme.fr,51-200,acme.fr,https://www.linkedin.com/company/acme,+33 1 23 45 67 89,$10M-$50M,"We build things,\nwell."`,
      "prospeo",
    );

    expect(format).toBe("prospeo");
    expect(row).toEqual({
      phoneNumber: "+33612345678",
      name: "Jean Dupont",
      email: "jean@acme.fr",
      company: "Acme",
      jobTitle: "Head of Sales",
      location: "Paris",
      state: "Île-de-France",
      website: "https://acme.fr",
      linkedinUrl: "https://www.linkedin.com/in/jeandupont",
      companyLinkedinUrl: "https://www.linkedin.com/company/acme",
      revenue: "$10M-$50M",
      companySize: "51-200",
    });
  });

  it("joins first and last name when the full name is empty", () => {
    const { row } = readFirstRow(
      "First name,Last name,Full name,Mobile\nJean,Dupont,,+33612345678",
      "prospeo",
    );

    expect(row.name).toBe("Jean Dupont");
  });
});

describe("readCsvHeader — a file uploaded under the wrong format", () => {
  it("reads an Apollo export picked as Ringee's template as Apollo", () => {
    const [headers] = splitCsvRecords(APOLLO_HEADER);
    expect(readCsvHeader(headers, "ringee")).toMatchObject({
      ok: true,
      format: "apollo",
    });
  });

  it("reads Ringee's template picked as Prospeo as the template", () => {
    expect(readCsvHeader(["phoneNumber", "name"], "prospeo")).toMatchObject({
      ok: true,
      format: "ringee",
    });
  });

  it("keeps the chosen format's message when nothing can read the file", () => {
    expect(readCsvHeader(["Phone", "Name"], "prospeo")).toEqual({
      ok: false,
      message:
        "This Prospeo export is missing a phone column (Mobile international format, Mobile, Company HQ Phone) and a name column (Full name, First name, Last name)",
    });
  });
});
