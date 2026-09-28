import { describe, expect, it } from "vitest";
import { readCrmCampaignField } from "../../campaign-field";
import type { CrmCallLogInput, CrmMeetingInput } from "../../types";
import { HUBSPOT_BODY_LIMIT, HUBSPOT_CALL_DISPOSITION } from "./hubspot.api";
import {
  buildHubSpotCallProperties,
  buildHubSpotCompanyProperties,
  buildHubSpotContactProperties,
  buildHubSpotMeetingProperties,
  buildHubSpotNoteBody,
  hubspotContactGaps,
  hubspotPhoneFilterGroups,
  mapHubSpotCompanyToSyncResult,
  mapHubSpotContactToMatch,
  mapHubSpotContactToSyncResult,
  playableRecordingUrl,
  splitHubSpotName,
} from "./hubspot.mapper";
import type { HubSpotObject, HubSpotProperties } from "./hubspot.types";

function contact(properties: HubSpotProperties, id = "101"): HubSpotObject {
  return { id, properties };
}

function callInput(overrides: Partial<CrmCallLogInput> = {}): CrmCallLogInput {
  return {
    idempotencyKey: "key-1",
    ringeeCallId: "call-1",
    direction: "outbound",
    from: "+14155550000",
    to: "+14155552671",
    startedAt: new Date("2026-09-01T10:00:00.000Z"),
    endedAt: new Date("2026-09-01T10:02:05.000Z"),
    durationSeconds: 125,
    linkedRecords: [{ externalId: "101", externalType: "person" }],
    ...overrides,
  };
}

describe("HubSpot contact mapping", () => {
  it("prefers HubSpot's calculated E.164 value over the locally typed one", () => {
    const record = contact({
      phone: "(415) 555-2671",
      hs_calculated_phone_number: "+14155552671",
      mobilephone: "809-555-1234",
      hs_calculated_mobile_number: "+18095551234",
    });

    expect(mapHubSpotContactToSyncResult(record).phones).toEqual([
      "+14155552671",
      "+18095551234",
    ]);
  });

  it("does not add a wrongly-normalized copy of a calculated number", () => {
    // Normalized against the default region, this UK local number would come
    // out as a different, junk E.164 — it must not ride along.
    const record = contact({
      phone: "020 7946 0958",
      hs_calculated_phone_number: "+442079460958",
    });

    expect(mapHubSpotContactToSyncResult(record).phones).toEqual([
      "+442079460958",
    ]);
  });

  it("falls back to the typed number when HubSpot calculated none", () => {
    const record = contact({ mobilephone: "415-555-2671" });

    expect(mapHubSpotContactToSyncResult(record).phones).toEqual([
      "+14155552671",
    ]);
  });

  it("reads the primary and additional e-mails once each", () => {
    const record = contact({
      email: "ada@example.com",
      hs_additional_emails: "ADA@example.com;ada.work@example.com; ",
    });

    expect(mapHubSpotContactToSyncResult(record).emails).toEqual([
      "ada@example.com",
      "ada.work@example.com",
    ]);
  });

  it("maps names, job title, owner, company and the campaign field", () => {
    const campaignId = "3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    const result = mapHubSpotContactToSyncResult(
      contact({
        firstname: "Ada",
        lastname: "Lovelace",
        jobtitle: "Engineer",
        hubspot_owner_id: "77",
        associatedcompanyid: "900",
        ringee_campaign_id: campaignId,
        phone: "+14155552671",
      }),
    );

    expect(result).toMatchObject({
      contact: { externalId: "101", externalType: "person" },
      firstName: "Ada",
      lastName: "Lovelace",
      displayName: "Ada Lovelace",
      jobTitle: "Engineer",
      owner: { externalId: "77" },
      company: { externalId: "900", externalType: "company" },
    });
    expect(readCrmCampaignField(result.customFields)?.campaignId).toBe(
      campaignId,
    );
  });

  it("marks a suffix-only phone match as such", () => {
    const match = mapHubSpotContactToMatch(
      contact({ phone: "4155552671", firstname: "Ada" }),
      "+14155552671",
    );
    expect(match.matchedOn).toBe("phone_exact");

    // Same last nine digits under another country code.
    const suffix = mapHubSpotContactToMatch(
      contact({ phone: "+44155552671" }),
      "+14155552671",
    );
    expect(suffix.matchedOn).toBe("phone_suffix");
  });
});

describe("HubSpot contact writes", () => {
  it("splits a display name into first and last name", () => {
    expect(splitHubSpotName({ displayName: "Ana María de la Cruz" })).toEqual({
      firstname: "Ana",
      lastname: "María de la Cruz",
    });
    expect(
      splitHubSpotName({ firstName: "Ada", lastName: "Lovelace" }),
    ).toEqual({ firstname: "Ada", lastname: "Lovelace" });
  });

  it("never writes a phone number into the name", () => {
    expect(splitHubSpotName({ displayName: "+1 415 555 2671" })).toEqual({
      firstname: null,
      lastname: null,
    });
    expect(
      buildHubSpotContactProperties({
        displayName: "+14155552671",
        phoneE164: "+14155552671",
      }),
    ).toEqual({ phone: "+14155552671" });
  });

  it("fills only the gaps of an existing contact", () => {
    const existing: HubSpotProperties = {
      firstname: "Bob",
      lastname: "",
      email: null,
      mobilephone: "+14155552671",
    };
    const desired = buildHubSpotContactProperties({
      displayName: "Robert Smith",
      email: "robert@example.com",
      phoneE164: "+14155559999",
    });

    // The name someone typed and the number HubSpot already has are kept.
    expect(hubspotContactGaps(existing, desired)).toEqual({
      lastname: "Smith",
      email: "robert@example.com",
    });
  });

  it("leaves HubSpot's enumerated company fields alone", () => {
    expect(
      buildHubSpotCompanyProperties({
        name: " Acme ",
        domain: "https://www.Acme.com/about",
        industry: "Software",
        size: "11-50",
      }),
    ).toEqual({
      name: "Acme",
      domain: "acme.com",
      website: "https://acme.com",
    });
  });

  it("maps a company, humanizing HubSpot's industry value", () => {
    const result = mapHubSpotCompanyToSyncResult({
      id: "900",
      properties: {
        name: "Acme",
        domain: "www.acme.com",
        industry: "COMPUTER_SOFTWARE",
        numberofemployees: "42",
        phone: "(415) 555-2671",
      },
    });

    expect(result).toMatchObject({
      company: { externalId: "900", externalType: "company" },
      name: "Acme",
      domain: "acme.com",
      industry: "Computer Software",
      size: "42",
      phone: "+14155552671",
      website: "https://acme.com",
    });
  });
});

describe("hubspotPhoneFilterGroups", () => {
  it("searches the national number HubSpot indexes, plus exact E.164", () => {
    const groups = hubspotPhoneFilterGroups("+14155552671", "4155552671");

    expect(groups).toHaveLength(5);
    expect(groups.flatMap((group) => group.filters)).toEqual([
      {
        propertyName: "hs_searchable_calculated_phone_number",
        operator: "EQ",
        value: "4155552671",
      },
      {
        propertyName: "hs_searchable_calculated_phone_number",
        operator: "CONTAINS_TOKEN",
        value: "*4155552671",
      },
      {
        propertyName: "hs_searchable_calculated_mobile_number",
        operator: "CONTAINS_TOKEN",
        value: "*4155552671",
      },
      { propertyName: "phone", operator: "EQ", value: "+14155552671" },
      { propertyName: "mobilephone", operator: "EQ", value: "+14155552671" },
    ]);
  });

  it("keeps to the typed properties without a national number", () => {
    expect(hubspotPhoneFilterGroups("+14155552671", null)).toHaveLength(2);
  });
});

describe("HubSpot call properties", () => {
  it("builds a native call activity", () => {
    const properties = buildHubSpotCallProperties(
      callInput({
        outcome: "meeting_booked",
        outcomeLabel: "Meeting Booked",
        answered: true,
        recordingUrl: "https://cdn.example.com/rec/public-1.mp3",
      }),
    );

    expect(properties).toMatchObject({
      hs_timestamp: "2026-09-01T10:00:00.000Z",
      hs_call_title: "Ringee call — Meeting Booked",
      hs_call_direction: "OUTBOUND",
      hs_call_status: "COMPLETED",
      hs_call_duration: "125000",
      hs_call_from_number: "+14155550000",
      hs_call_to_number: "+14155552671",
      hs_call_recording_url: "https://cdn.example.com/rec/public-1.mp3",
      hs_call_disposition: HUBSPOT_CALL_DISPOSITION.connected,
    });
    // The recording plays inline, so the body does not repeat it as a link.
    expect(properties.hs_call_body).not.toContain("Listen to recording");
  });

  it("does not read a positive duration as a connected call", () => {
    // Ringee measures from placement: a missed inbound call rang for seconds.
    const properties = buildHubSpotCallProperties(
      callInput({ direction: "inbound", answered: false, durationSeconds: 25 }),
    );

    expect(properties.hs_call_status).toBe("NO_ANSWER");
    expect(properties.hs_call_disposition).toBe(
      HUBSPOT_CALL_DISPOSITION.noAnswer,
    );
    expect(properties.hs_call_direction).toBe("INBOUND");
  });

  it("maps Ringee outcomes to HubSpot's built-in ones where they exist", () => {
    const disposition = (outcome: string) =>
      buildHubSpotCallProperties(callInput({ outcome })).hs_call_disposition;

    expect(disposition("voicemail")).toBe(
      HUBSPOT_CALL_DISPOSITION.leftVoicemail,
    );
    expect(disposition("wrong_number")).toBe(
      HUBSPOT_CALL_DISPOSITION.wrongNumber,
    );
    expect(disposition("no_answer")).toBe(HUBSPOT_CALL_DISPOSITION.noAnswer);
    // No honest equivalent: the label still lands in the body.
    expect(disposition("gatekeeper")).toBeUndefined();
  });

  it("omits the disposition when nothing is known about the call", () => {
    const properties = buildHubSpotCallProperties(callInput());
    expect(properties.hs_call_status).toBe("COMPLETED");
    expect(properties).not.toHaveProperty("hs_call_disposition");
  });

  it("only plays HTTPS .mp3/.wav recordings inline", () => {
    expect(playableRecordingUrl("https://x.test/a.mp3?sig=1")).toBe(
      "https://x.test/a.mp3?sig=1",
    );
    expect(playableRecordingUrl("https://x.test/a.WAV")).toBe(
      "https://x.test/a.WAV",
    );
    expect(playableRecordingUrl("http://x.test/a.mp3")).toBeNull();
    expect(playableRecordingUrl("https://x.test/a.ogg")).toBeNull();
    expect(playableRecordingUrl("javascript:alert(1)//a.mp3")).toBeNull();

    const properties = buildHubSpotCallProperties(
      callInput({ recordingUrl: "http://x.test/a.mp3" }),
    );
    expect(properties).not.toHaveProperty("hs_call_recording_url");
    expect(properties.hs_call_body).toContain("Listen to recording");
  });

  it("escapes what people typed and said", () => {
    const body = buildHubSpotCallProperties(
      callInput({
        notes: "<img src=x onerror=alert(1)>\nsecond line",
        transcript: "Caller: <script>alert(1)</script>",
        agentName: "Ana & Co",
      }),
    ).hs_call_body;

    expect(body).not.toContain("<img");
    expect(body).not.toContain("<script>");
    expect(body).toContain("&lt;img src=x onerror=alert(1)&gt;<br>second line");
    expect(body).toContain("Ana &amp; Co");
  });

  it("shortens the transcript, not the markup, to stay under the limit", () => {
    const body = buildHubSpotCallProperties(
      callInput({
        notes: "Keep me",
        transcript: "word ".repeat(40_000),
      }),
    ).hs_call_body;

    expect(body.length).toBeLessThanOrEqual(HUBSPOT_BODY_LIMIT);
    expect(body).toContain("Keep me");
    expect(body).toContain("[truncated]");
    expect(body.endsWith("</em></p>")).toBe(true);
  });
});

describe("HubSpot meetings and notes", () => {
  it("builds a scheduled meeting with its links", () => {
    const input: CrmMeetingInput = {
      idempotencyKey: "meeting-key",
      ringeeMeetingId: "meeting-1",
      title: "Demo",
      startAt: new Date("2026-09-02T15:00:00.000Z"),
      endAt: new Date("2026-09-02T15:30:00.000Z"),
      meetingUrl: "https://meet.example.com/abc",
      ringeeMeetingUrl: "javascript:alert(1)",
      attendees: [{ name: "Ada", email: "ada@example.com" }],
      linkedRecords: [{ externalId: "101", externalType: "person" }],
    };

    const properties = buildHubSpotMeetingProperties(input);

    expect(properties).toMatchObject({
      hs_timestamp: "2026-09-02T15:00:00.000Z",
      hs_meeting_title: "Demo",
      hs_meeting_start_time: "2026-09-02T15:00:00.000Z",
      hs_meeting_end_time: "2026-09-02T15:30:00.000Z",
      hs_meeting_outcome: "SCHEDULED",
      hs_meeting_external_url: "https://meet.example.com/abc",
    });
    expect(properties.hs_meeting_body).toContain("Ada — ada@example.com");
    expect(properties.hs_meeting_body).not.toContain("javascript:");
  });

  it("turns the services' markdown into a titled HTML note", () => {
    const body = buildHubSpotNoteBody(
      "Call Disposition",
      "**Outcome:** Interested\n\n**Notes**\nCall back <tomorrow>\n\n[Join meeting](https://meet.example.com/x)",
    );

    expect(body).toBe(
      "<p><strong>Call Disposition</strong></p>" +
        "<p><strong>Outcome:</strong> Interested</p>" +
        "<p><strong>Notes</strong><br>Call back &lt;tomorrow&gt;</p>" +
        '<p><a href="https://meet.example.com/x" target="_blank" rel="noopener noreferrer">Join meeting</a></p>',
    );
  });

  it("links a bare recording URL and keeps unsafe links as text", () => {
    const body = buildHubSpotNoteBody(
      null,
      "Recording link for call: https://cdn.example.com/a.mp3. [x](javascript:alert(1))",
    );

    expect(body).toContain(
      '<a href="https://cdn.example.com/a.mp3" target="_blank" rel="noopener noreferrer">https://cdn.example.com/a.mp3</a>.',
    );
    expect(body).not.toContain('href="javascript');
  });

  it("keeps emphasis markers out of a linked URL", () => {
    expect(buildHubSpotNoteBody(null, "**https://ringee.test/r/1**")).toBe(
      '<p><strong><a href="https://ringee.test/r/1" target="_blank" rel="noopener noreferrer">https://ringee.test/r/1</a></strong></p>',
    );
  });
});
