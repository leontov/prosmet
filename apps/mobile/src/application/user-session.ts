import type {
  UserLoginInput,
  UserRegistrationInput,
  UserSessionStatus
} from "@prosmet/contracts";
import { mobileApiJson } from "../agent-session";
import {
  normalizeUserEmail,
  parseUserSession
} from "../domain/user-session";

export async function restoreUserSession(): Promise<UserSessionStatus> {
  return parseUserSession(await mobileApiJson<unknown>("user", "/api/auth/session"));
}

export async function registerMobileUser(input: UserRegistrationInput): Promise<UserSessionStatus> {
  return parseUserSession(await mobileApiJson<unknown>("public", "/api/register", {
    method: "POST",
    body: JSON.stringify({
      name: input.name.trim(),
      email: normalizeUserEmail(input.email),
      company: input.company.trim(),
      password: input.password
    })
  }));
}

export async function loginMobileUser(input: UserLoginInput): Promise<UserSessionStatus> {
  return parseUserSession(await mobileApiJson<unknown>("user", "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: normalizeUserEmail(input.email),
      password: input.password
    })
  }));
}

export async function logoutMobileUser(): Promise<UserSessionStatus> {
  return parseUserSession(await mobileApiJson<unknown>("user", "/api/auth/logout", {
    method: "DELETE"
  }));
}
