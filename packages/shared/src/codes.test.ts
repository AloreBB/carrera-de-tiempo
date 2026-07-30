import { describe, expect, it } from "vitest";
import {
  RACE_CODE_ALPHABET,
  RACE_CODE_LENGTH,
  generateRaceCode,
  isValidRaceCode,
  normalizeRaceCode,
} from "./codes";

describe("generateRaceCode", () => {
  it("positive: produces fixed length from alphabet", () => {
    // Arrange
    const random = () => 0;

    // Act
    const code = generateRaceCode(random);

    // Assert
    expect(code).toHaveLength(RACE_CODE_LENGTH);
    for (const ch of code) {
      expect(RACE_CODE_ALPHABET).toContain(ch);
    }
  });

  it("positive: maps high random (0.999) to last alphabet char", () => {
    const code = generateRaceCode(() => 0.999);
    expect(code).toBe(RACE_CODE_ALPHABET.at(-1)!.repeat(RACE_CODE_LENGTH));
  });

  it("positive: uses Math.random by default and stays valid", () => {
    for (let i = 0; i < 50; i++) {
      expect(isValidRaceCode(generateRaceCode())).toBe(true);
    }
  });

  it("counter: always returns exactly RACE_CODE_LENGTH chars", () => {
    const codes = Array.from({ length: 20 }, () => generateRaceCode());
    expect(codes.every((c) => c.length === RACE_CODE_LENGTH)).toBe(true);
    expect(new Set(codes.map((c) => c.length)).size).toBe(1);
  });
});

describe("isValidRaceCode", () => {
  it.each([
    ["ABCDEF", true],
    ["234567", true],
    ["abcdefgh", false], // length 8
    ["ABCDE", false], // length 5
    ["ABCDE1", false], // 1 not in alphabet
    ["ABCDE0", false], // 0 not in alphabet
    ["ABCDEI", false], // I ambiguous
    ["ABCDEO", false], // O ambiguous
    ["", false],
    ["ABC DEF", false],
  ])("code %j → %s", (code, expected) => {
    expect(isValidRaceCode(code)).toBe(expected);
  });

  it("positive: accepts lowercase letters from alphabet (normalized check uses toUpperCase)", () => {
    // isValidRaceCode uppercases each char before alphabet check
    expect(isValidRaceCode("abcdef")).toBe(true);
  });

  it("negative: rejects ambiguous digits/letters at any position", () => {
    expect(isValidRaceCode("A0BCDE")).toBe(false);
    expect(isValidRaceCode("A1BCDE")).toBe(false);
    expect(isValidRaceCode("AIBCDE")).toBe(false);
    expect(isValidRaceCode("AOBCDE")).toBe(false);
  });
});

describe("normalizeRaceCode", () => {
  it.each([
    [" ab12cd ", "AB12CD"],
    ["xyz789", "XYZ789"],
    ["  CODE  ", "CODE"],
    ["\tmixEd\n", "MIXED"],
  ])("normalize(%j) → %j", (input, expected) => {
    expect(normalizeRaceCode(input)).toBe(expected);
  });
});

describe("RACE_CODE_ALPHABET invariants", () => {
  it("excludes ambiguous characters I O 0 1", () => {
    for (const bad of ["I", "O", "0", "1"]) {
      expect(RACE_CODE_ALPHABET).not.toContain(bad);
    }
  });

  it("counter: alphabet length is stable for indexing", () => {
    expect(RACE_CODE_ALPHABET.length).toBe(32);
    expect(RACE_CODE_LENGTH).toBe(6);
  });
});
