import { parsePriceUnit } from "../lib/api";

describe("parsePriceUnit", () => {
  it("extracts lb from '$3.99 / lb'", () => {
    expect(parsePriceUnit("$3.99 / lb")).toBe("lb");
  });
  it("extracts each from '$1.49 / each'", () => {
    expect(parsePriceUnit("$1.49 / each")).toBe("each");
  });
  it("extracts bag from '$5.99 / bag'", () => {
    expect(parsePriceUnit("$5.99 / bag")).toBe("bag");
  });
  it("extracts kg from '$4.99/kg'", () => {
    expect(parsePriceUnit("$4.99/kg")).toBe("kg");
  });
  it("returns empty for '2 for $5.00' (no slash unit)", () => {
    expect(parsePriceUnit("2 for $5.00")).toBe("");
  });
  it("returns empty for empty string", () => {
    expect(parsePriceUnit("")).toBe("");
  });
});
