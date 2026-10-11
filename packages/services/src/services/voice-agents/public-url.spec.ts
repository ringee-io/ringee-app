/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { htmlToText } from "./public-url";

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
});
