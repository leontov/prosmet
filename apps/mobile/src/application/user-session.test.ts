import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined)
}));

import {
  loginMobileUser,
  registerMobileUser,
  restoreUserSession
} from "./user-session";

const sessionBody = {
  authenticated: true,
  user: {
    id: "user-1",
    name: "QA User",
    email: "qa@example.com",
    company: "QA Строй",
    role: "owner",
    status: "active",
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z"
  }
};

describe("mobile user session gateway", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("registers through the public scope without an admin credential", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(sessionBody), {
      status: 201,
      headers: { "content-type": "application/json" }
    }));

    const result = await registerMobileUser({
      name: "QA User",
      email: " QA@Example.com ",
      company: "QA Строй",
      password: "strong-password"
    });

    expect(result.authenticated).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://kolibriai.online/api/register");
    expect(init.credentials).toBe("omit");
    expect(new Headers(init.headers).has("x-prosmet-admin-token")).toBe(false);
    expect(JSON.parse(String(init.body))).toMatchObject({ email: "qa@example.com" });
  });

  it("uses the user cookie container for login and session restore", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(sessionBody), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(sessionBody), { status: 200 }));

    await loginMobileUser({ email: "qa@example.com", password: "strong-password" });
    await restoreUserSession();

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://kolibriai.online/api/auth/login");
    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe("include");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://kolibriai.online/api/auth/session");
    expect(fetchMock.mock.calls[1]?.[1]?.credentials).toBe("include");
    for (const [, init] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
      expect(new Headers(init.headers).has("x-prosmet-admin-token")).toBe(false);
    }
  });
});
