import { describe, expect, it } from "vitest";
import { isFileId, normalizeFileType } from "@/lib/storage/local-files";

describe("owner-scoped file validation", () => {
  it("accepts only allowlisted extension and MIME pairs", () => {
    expect(normalizeFileType("estimate.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
      .toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(normalizeFileType("drawing.ifc", "application/octet-stream")).toBe("application/x-step");
    expect(normalizeFileType("photo.jpg", "image/png")).toBeNull();
    expect(normalizeFileType("payload.exe", "image/png")).toBeNull();
  });

  it("requires canonical UUID file identifiers", () => {
    expect(isFileId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isFileId("../../etc/passwd---------------------")).toBe(false);
    expect(isFileId("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")).toBe(false);
  });
});
