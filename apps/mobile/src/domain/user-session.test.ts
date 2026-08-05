import { describe, expect, it } from "vitest";
import {
  normalizeUserEmail,
  parseUserSession,
  validateLoginInput,
  validateRegistrationInput
} from "./user-session";

describe("mobile user session domain", () => {
  it("normalizes and validates registration fields", () => {
    expect(normalizeUserEmail("  USER@Example.COM ")).toBe("user@example.com");
    expect(validateRegistrationInput({
      name: "",
      email: "wrong",
      company: "",
      password: "short"
    })).toEqual({
      name: "Укажите имя.",
      email: "Укажите корректный email.",
      company: "Укажите организацию.",
      password: "Минимум 8 символов."
    });
  });

  it("accepts a complete authenticated session", () => {
    expect(parseUserSession({
      authenticated: true,
      user: {
        id: "user-1",
        name: "Владислав",
        email: "USER@example.com",
        company: "ProSmet",
        role: "owner",
        status: "active",
        createdAt: "2026-08-05T00:00:00.000Z",
        updatedAt: "2026-08-05T00:00:00.000Z"
      }
    })).toMatchObject({
      authenticated: true,
      user: { email: "user@example.com", role: "owner", status: "active" }
    });
  });

  it("rejects malformed authenticated sessions", () => {
    expect(() => parseUserSession({ authenticated: true, user: { id: "missing-fields" } }))
      .toThrow("неполный профиль");
  });

  it("does not require a profile for an anonymous session", () => {
    expect(parseUserSession({ authenticated: false, user: { unexpected: true } }))
      .toEqual({ authenticated: false, user: null });
    expect(validateLoginInput({ email: "", password: "" })).toEqual({
      email: "Укажите корректный email.",
      password: "Введите пароль."
    });
  });
});
