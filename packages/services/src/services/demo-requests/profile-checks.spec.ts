/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkProfile,
  domainsMatch,
  type ProfileInput,
  type ProfileProbes,
  type WebsiteProbe,
} from "./profile-checks";

const LIVE_PAGE: WebsiteProbe = {
  status: 200,
  finalUrl: "https://www.molusupply.com/",
  title: "Molu Supply — Restaurant supplies",
  text: "Molu Supply delivers restaurant supplies across New York.",
};

const GOOD: ProfileInput = {
  email: "mluria@molusupply.com",
  phoneNumber: "+12125550142",
  companyWebsite: "molusupply.com",
  country: "US",
};

/** DNS and the web, answered from memory; records which sites were opened. */
function probes(
  over: { mx?: boolean | null; page?: WebsiteProbe } = {},
): ProfileProbes & { opened: string[] } {
  const opened: string[] = [];
  return {
    opened,
    receivesEmail: async () => (over.mx === undefined ? true : over.mx),
    fetchWebsite: async (url) => {
      opened.push(url.href);
      return over.page ?? LIVE_PAGE;
    },
  };
}

describe("domainsMatch", () => {
  it("accepts the same domain, www and subdomains either way", () => {
    assert.equal(domainsMatch("acme.com", "acme.com"), true);
    assert.equal(domainsMatch("acme.com", "www.acme.com"), true);
    assert.equal(domainsMatch("mail.acme.com", "acme.com"), true);
    assert.equal(domainsMatch("acme.com", "shop.acme.com"), true);
    assert.equal(domainsMatch("ACME.com.", "Acme.COM"), true);
  });

  it("refuses look-alikes that only share a suffix or a prefix", () => {
    assert.equal(domainsMatch("acme.com", "evil-acme.com"), false);
    assert.equal(domainsMatch("acme.com", "acme.com.evil.io"), false);
    assert.equal(domainsMatch("acme.com", "acme.co"), false);
  });
});

describe("checkProfile", () => {
  it("raises nothing for a work email on the company's own live website", async () => {
    const checks = await checkProfile(GOOD, probes());

    assert.deepEqual(checks.issues, []);
    assert.equal(checks.facts.domainMatches, true);
    assert.equal(checks.facts.phoneValid, true);
    assert.equal(checks.facts.websiteStatus, 200);
    assert.match(checks.websiteText ?? "", /restaurant supplies/);
  });

  it("asks for a work email when the address is at a free provider", async () => {
    const checks = await checkProfile(
      { ...GOOD, email: "mordechai@gmail.com" },
      probes(),
    );

    assert.deepEqual(
      checks.issues.map((issue) => issue.field),
      ["email"],
    );
    assert.match(checks.issues[0].problem, /gmail\.com is a personal email/);
    assert.match(checks.issues[0].request, /work email/);
  });

  it("refuses a temporary inbox", async () => {
    const checks = await checkProfile(
      { ...GOOD, email: "x@mailinator.com" },
      probes(),
    );
    assert.match(checks.issues[0].problem, /temporary inbox/);
  });

  it("asks for the company website instead of a social profile, without opening it", async () => {
    const web = probes();
    const checks = await checkProfile(
      {
        ...GOOD,
        email: "jane@gmail.com",
        companyWebsite: "linkedin.com/in/janedoe",
      },
      web,
    );

    assert.deepEqual(web.opened, []);
    assert.equal(checks.facts.socialProfile, true);
    assert.deepEqual(
      checks.issues.map((issue) => issue.field),
      ["email", "company_website"],
    );
    assert.match(checks.issues[1].problem, /linkedin\.com is a social profile/);
  });

  it("flags an email and a website on different domains", async () => {
    const checks = await checkProfile(
      { ...GOOD, companyWebsite: "othercompany.com" },
      probes({
        page: { ...LIVE_PAGE, finalUrl: "https://othercompany.com/" },
      }),
    );

    assert.equal(checks.facts.domainMatches, false);
    assert.deepEqual(
      checks.issues.map((issue) => issue.field),
      ["email"],
    );
    assert.match(checks.issues[0].problem, /different domains/);
  });

  it("accepts a website that redirected to the email's domain", async () => {
    const checks = await checkProfile(
      { ...GOOD, companyWebsite: "molu.nyc" },
      probes(),
    );
    assert.equal(checks.facts.domainMatches, true);
    assert.deepEqual(checks.issues, []);
  });

  it("asks for a working website when nothing answered", async () => {
    const checks = await checkProfile(
      GOOD,
      probes({
        page: { status: null, finalUrl: null, title: null, text: null },
      }),
    );
    assert.deepEqual(
      checks.issues.map((issue) => issue.field),
      ["company_website"],
    );
    assert.match(checks.issues[0].problem, /couldn't open molusupply\.com/);
  });

  it("leaves a site that blocks robots to the review, as no check failed", async () => {
    const checks = await checkProfile(
      GOOD,
      probes({
        page: {
          status: 403,
          finalUrl: "https://molusupply.com/",
          title: null,
          text: null,
        },
      }),
    );
    assert.deepEqual(checks.issues, []);
    assert.equal(checks.websiteText, null);
  });

  it("flags a domain that does not receive email", async () => {
    const checks = await checkProfile(GOOD, probes({ mx: false }));
    assert.match(checks.issues[0].problem, /isn't set up to receive email/);
  });

  it("does not hold an unanswered DNS lookup against the requester", async () => {
    const checks = await checkProfile(GOOD, probes({ mx: null }));
    assert.deepEqual(checks.issues, []);
  });

  it("flags an invalid phone number and a website that is not an address", async () => {
    const checks = await checkProfile(
      { ...GOOD, phoneNumber: "+1 555", companyWebsite: "http://localhost" },
      probes(),
    );
    assert.deepEqual(
      checks.issues.map((issue) => issue.field),
      ["company_website", "phone"],
    );
  });
});
