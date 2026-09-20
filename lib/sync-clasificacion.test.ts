import { describe, it, expect } from "vitest";
import { clasificarStatus, clasificarFalloSync } from "./sync-clasificacion";
import { ApiClientError } from "./api-client";

describe("clasificarStatus", () => {
  it.each([undefined, 0, 500, 502, 503, 429, 401])("%s → red", (s) => {
    expect(clasificarStatus(s as number | undefined)).toBe("red");
  });
  it.each([400, 403, 404, 409, 413, 422])("%s → rechazo", (s) => {
    expect(clasificarStatus(s)).toBe("rechazo");
  });
});

describe("clasificarFalloSync", () => {
  it("ApiClientError 400 → rechazo", () => {
    expect(clasificarFalloSync(new ApiClientError("x", 400))).toBe("rechazo");
  });
  it("ApiClientError 503 → red", () => {
    expect(clasificarFalloSync(new ApiClientError("x", 503))).toBe("red");
  });
  it("Error de red sin status → red", () => {
    expect(clasificarFalloSync(new Error("Failed to fetch"))).toBe("red");
  });
});
