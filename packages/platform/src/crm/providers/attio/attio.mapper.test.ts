import { describe, it, expect } from "vitest";
import {
  buildAttioPersonName,
  mapAttioCompanyToSyncResult,
  mapAttioPersonToMatch,
  mapAttioPersonToSyncResult,
} from "./attio.mapper";
import type { AttioCompanyRecord, AttioPersonRecord } from "./attio.types";

function personWithPhone(
  phone: NonNullable<AttioPersonRecord["values"]["phone_numbers"]>[number],
): AttioPersonRecord {
  return {
    id: {
      workspace_id: "workspace-1",
      object_id: "people",
      record_id: "person-1",
    },
    values: { phone_numbers: [phone] },
  };
}

describe("buildAttioPersonName", () => {
  // Attio's object syntax requires first_name, last_name AND full_name to all
  // be strings — a missing key is a non-retryable 400 that kills the call-log
  // note, so every non-null result must carry the three of them.
  const assertComplete = (v: unknown) => {
    expect(v).toEqual({
      first_name: expect.any(String),
      last_name: expect.any(String),
      full_name: expect.any(String),
    });
  };

  it("splits a display-name-only contact (the shape that used to 400)", () => {
    const v = buildAttioPersonName({
      displayName: "Brian Foster",
      firstName: null,
      lastName: null,
    });
    assertComplete(v);
    expect(v).toEqual({
      first_name: "Brian",
      last_name: "Foster",
      full_name: "Brian Foster",
    });
  });

  it("keeps an empty last name for a single-token display name", () => {
    const v = buildAttioPersonName({ displayName: "Brian" });
    assertComplete(v);
    expect(v?.last_name).toBe("");
  });

  it("puts every extra token in the last name", () => {
    expect(
      buildAttioPersonName({ displayName: "Ana María de la Cruz" }),
    ).toEqual({
      first_name: "Ana",
      last_name: "María de la Cruz",
      full_name: "Ana María de la Cruz",
    });
  });

  it("prefers explicit first/last and derives full_name from them", () => {
    expect(
      buildAttioPersonName({ firstName: "Ada", lastName: "Lovelace" }),
    ).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
      full_name: "Ada Lovelace",
    });
  });

  it("fills the missing half when only one of first/last is known", () => {
    const v = buildAttioPersonName({ displayName: "Ada L.", firstName: "Ada" });
    assertComplete(v);
    expect(v).toEqual({
      first_name: "Ada",
      last_name: "",
      full_name: "Ada L.",
    });
  });

  it("returns null when there is no usable name", () => {
    expect(buildAttioPersonName({})).toBeNull();
    expect(
      buildAttioPersonName({ displayName: "  ", firstName: " ", lastName: "" }),
    ).toBeNull();
  });
});

describe("Attio phone mapping", () => {
  it("uses Attio's normalized_phone_number for a locally formatted person number", () => {
    const record = personWithPhone({
      original_phone_number: "(415) 555-2671",
      normalized_phone_number: "+14155552671",
      country_code: "US",
    });

    expect(mapAttioPersonToSyncResult(record).phones).toEqual(["+14155552671"]);
    expect(mapAttioPersonToMatch(record, "+14155552671").phoneNumbers).toEqual([
      "+14155552671",
    ]);
  });

  it("uses country_code when an older payload omits the normalized value", () => {
    const record = personWithPhone({
      original_phone_number: "020 7946 0958",
      country_code: "GB",
    });

    expect(mapAttioPersonToSyncResult(record).phones).toEqual([
      "+442079460958",
    ]);
  });

  it("discovers workspace-defined phone and email attribute slugs", () => {
    const record: AttioPersonRecord = {
      id: {
        workspace_id: "workspace-1",
        object_id: "people",
        record_id: "person-1",
      },
      values: {
        mobile: [
          {
            attribute_type: "phone-number",
            original_phone_number: "809-555-1234",
            normalized_phone_number: "+18095551234",
            country_code: "DO",
          },
        ],
        work_email: [
          {
            attribute_type: "email-address",
            email_address: "person@example.com",
          },
        ],
      },
    };

    const result = mapAttioPersonToSyncResult(record);

    expect(result.phones).toEqual(["+18095551234"]);
    expect(result.emails).toEqual(["person@example.com"]);
  });

  it("keeps supporting legacy phone_number payloads", () => {
    const record = personWithPhone({ phone_number: "+33142345678" });

    expect(mapAttioPersonToSyncResult(record).phones).toEqual(["+33142345678"]);
  });

  it("uses the normalized value for company phone numbers too", () => {
    const record: AttioCompanyRecord = {
      id: {
        workspace_id: "workspace-1",
        object_id: "companies",
        record_id: "company-1",
      },
      values: {
        name: [{ value: "Acme" }],
        domains: [],
        phone_numbers: [
          {
            original_phone_number: "809-555-1234",
            normalized_phone_number: "+18095551234",
            country_code: "DO",
          },
        ],
      },
    };

    expect(mapAttioCompanyToSyncResult(record).phone).toBe("+18095551234");
  });
});
