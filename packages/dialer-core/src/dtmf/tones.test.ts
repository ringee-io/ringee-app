import { describe, expect, it } from "vitest";
import { isDtmfDigit, letterToDtmfDigit } from "./tones";

describe("letterToDtmfDigit", () => {
  it.each([
    ["A", "2"],
    ["c", "2"],
    ["D", "3"],
    ["Ñ", null],
    ["P", "7"],
    ["S", "7"],
    ["Z", "9"],
    ["AB", null],
    ["", null],
  ])("maps %s to %s", (letter, digit) => {
    expect(letterToDtmfDigit(letter)).toBe(digit);
  });
});

describe("isDtmfDigit", () => {
  it.each(["0", "5", "9", "*", "#", "A", "B", "C", "D"])(
    "accepts %s",
    (digit) => {
      expect(isDtmfDigit(digit)).toBe(true);
    },
  );

  it.each(["E", "+", "a", "12", "", " "])("rejects %s", (digit) => {
    expect(isDtmfDigit(digit)).toBe(false);
  });
});
