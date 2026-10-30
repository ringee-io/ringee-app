/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { htmlToText, requirePublicUrl } from "./public-url";

describe("htmlToText", () => {
  it("keeps the readable text and drops tags", () => {
    assert.equal(
      htmlToText(
        "<h1>Molu&nbsp;Supply</h1>\n<p>Restaurant <b>supplies</b></p>",
      ),
      "Molu Supply Restaurant supplies",
    );
  });

  it("drops scripts and styles however their end tag is written", () => {
    const text = htmlToText(
      [
        "<script>alert(1)</script >",
        "<SCRIPT type='module'>steal()</SCRIPT foo=\"bar\">",
        "<style>.a{color:red}</style\t>",
        "<p>Visible</p>",
      ].join(""),
    );
    assert.equal(text, "Visible");
  });

  it("drops comments, including those closed by --!>", () => {
    assert.equal(
      htmlToText("<!-- note -->Shown<!-- <script>x()</script> --!>Too"),
      "Shown Too",
    );
  });

  it("treats an unclosed script as hiding the rest of the page", () => {
    assert.equal(htmlToText("<p>Shown</p><script>steal() <p>x</p>"), "Shown");
  });

  it("stays linear on pages built to make a pattern backtrack", () => {
    const hostile = [
      "<script".repeat(20_000),
      "<".repeat(50_000),
      "<!--".repeat(20_000),
    ];
    for (const html of hostile) {
      const started = Date.now();
      htmlToText(html);
      assert.ok(Date.now() - started < 500, "htmlToText took too long");
    }
  });
});

describe("requirePublicUrl", () => {
  it("refuses loopback and metadata addresses however IPv6 spells them", () => {
    for (const raw of [
      "http://127.0.0.1/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:7f00:1]/",
      "http://[::ffff:a9fe:a9fe]/",
      "http://[64:ff9b::a9fe:a9fe]/",
      "http://[2002:7f00:1::]/",
      "http://[fd00::1]/",
    ]) {
      assert.throws(() => requirePublicUrl(raw), raw);
    }
  });

  it("accepts a public address", () => {
    assert.equal(
      requirePublicUrl("https://[2606:4700:4700::1111]/").hostname,
      "[2606:4700:4700::1111]",
    );
    assert.equal(requirePublicUrl("example.com").hostname, "example.com");
  });
});
