/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ContactBrief } from "@ringee/database";
import { buildContactBrief, webUrl } from "./my-day-brief";

function contact(overrides: Partial<ContactBrief> = {}): ContactBrief {
  return {
    id: "contact-1",
    jobTitle: "VP of Operations",
    email: "maria@brightlinelogistics.com",
    company: "Brightline Logistics",
    revenue: null,
    companySize: null,
    linkedinUrl: null,
    websiteUrl: null,
    locationCity: null,
    locationRegion: null,
    locationCountry: null,
    affiliations: [],
    ...overrides,
  };
}

const noCalls = { total: 0, calls: [] };

describe("webUrl", () => {
  it("adds https to a bare host and keeps http(s) links", () => {
    assert.equal(
      webUrl("linkedin.com/in/mariagonzalez"),
      "https://linkedin.com/in/mariagonzalez",
    );
    assert.equal(
      webUrl("http://brightline.com/about"),
      "http://brightline.com/about",
    );
    assert.equal(webUrl("  https://x.io  "), "https://x.io/");
  });

  it("drops any other scheme and anything that is not a web address", () => {
    assert.equal(webUrl("javascript:alert(1)"), null);
    assert.equal(webUrl("data:text/html,hi"), null);
    assert.equal(webUrl("mailto:maria@x.com"), null);
    assert.equal(webUrl("localhost:3000"), null);
    assert.equal(webUrl("not a link"), null);
    assert.equal(webUrl(""), null);
    assert.equal(webUrl(null), null);
  });
});

describe("buildContactBrief", () => {
  it("prefers the linked company's profile over the contact's own fields", () => {
    const brief = buildContactBrief(
      contact({
        revenue: "$1M-$10M",
        companySize: "11-50",
        affiliations: [
          {
            company: {
              name: "Brightline Logistics Inc.",
              industry: "Freight & logistics",
              revenueRange: "$10M-$50M",
              employeeCountRange: "201-500",
              employeeCount: 320,
              website: "brightlinelogistics.com",
              domain: "brightlinelogistics.com",
              linkedinUrl: "linkedin.com/company/brightline",
            },
          },
        ],
      }),
      noCalls,
    );
    assert.deepEqual(brief.company, {
      name: "Brightline Logistics Inc.",
      revenue: "$10M-$50M",
      employees: "201-500",
      industry: "Freight & logistics",
      website: "https://brightlinelogistics.com/",
      linkedinUrl: "https://linkedin.com/company/brightline",
    });
  });

  it("falls back to the contact's fields when no company is linked", () => {
    const brief = buildContactBrief(
      contact({
        revenue: "$10M-$50M",
        companySize: "201-500",
        websiteUrl: "brightlinelogistics.com",
        locationCity: "Chicago",
        locationRegion: "IL",
        linkedinUrl: "javascript:alert(1)",
      }),
      noCalls,
    );
    assert.equal(brief.company?.name, "Brightline Logistics");
    assert.equal(brief.company?.revenue, "$10M-$50M");
    assert.equal(brief.company?.employees, "201-500");
    assert.equal(brief.company?.website, "https://brightlinelogistics.com/");
    assert.equal(brief.place, "Chicago, IL");
    assert.equal(brief.linkedinUrl, null);
  });

  it("says nothing about a company it knows nothing about", () => {
    const brief = buildContactBrief(
      contact({ company: null, jobTitle: "  " }),
      noCalls,
    );
    assert.equal(brief.company, null);
    assert.equal(brief.jobTitle, null);
    assert.equal(brief.place, null);
  });

  it("lists the calls as given, with the total", () => {
    const at = new Date("2026-11-03T21:12:00.000Z");
    const brief = buildContactBrief(contact(), {
      total: 7,
      calls: [
        {
          id: "call-1",
          createdAt: at,
          direction: "outbound",
          status: "completed",
          outcome: "callback_scheduled",
          outcomeNote: " Wants dispatch calls off desk phones. ",
          durationSeconds: 384,
        } as never,
      ],
    });
    assert.equal(brief.calls.total, 7);
    assert.deepEqual(brief.calls.recent, [
      {
        id: "call-1",
        at,
        direction: "outbound",
        status: "completed",
        outcome: "callback_scheduled",
        durationSeconds: 384,
        note: "Wants dispatch calls off desk phones.",
      },
    ]);
  });
});
