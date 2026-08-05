import type {
  RegisteredUser,
  UserLoginInput,
  UserRegistrationInput,
  UserSessionStatus
} from "@prosmet/contracts";

export type AuthMode = "register" | "login";

export type AuthFieldErrors = Partial<Record<
  "name" | "email" | "company" | "password",
  string
>>;

export const emptyRegistrationInput: UserRegistrationInput = {
  name: "",
  email: "",
  company: "",
  password: ""
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function normalizeUserEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validateRegistrationInput(input: UserRegistrationInput): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  if (!input.name.trim()) errors.name = "Укажите имя.";
  if (!/^\S+@\S+\.\S+$/u.test(normalizeUserEmail(input.email))) {
    errors.email = "Укажите корректный email.";
  }
  if (!input.company.trim()) errors.company = "Укажите организацию.";
  if (input.password.length < 8) errors.password = "Минимум 8 символов.";
  return errors;
}

export function validateLoginInput(input: UserLoginInput): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  if (!/^\S+@\S+\.\S+$/u.test(normalizeUserEmail(input.email))) {
    errors.email = "Укажите корректный email.";
  }
  if (!input.password) errors.password = "Введите пароль.";
  return errors;
}

export function parseRegisteredUser(value: unknown): RegisteredUser {
  const source = record(value);
  if (!source) throw new Error("Сервер вернул некорректный профиль пользователя.");
  const role = source.role === "member" ? "member" : source.role === "owner" ? "owner" : null;
  const status = source.status === "active" || source.status === "locked" || source.status === "revoked"
    ? source.status
    : null;
  const user: RegisteredUser = {
    id: text(source.id),
    name: text(source.name),
    email: normalizeUserEmail(text(source.email)),
    company: text(source.company),
    role: role || "member",
    status: status || "active",
    createdAt: text(source.createdAt),
    updatedAt: text(source.updatedAt)
  };
  if (!user.id || !user.name || !user.email || !user.company || !role || !status) {
    throw new Error("Сервер вернул неполный профиль пользователя.");
  }
  return user;
}

export function parseUserSession(value: unknown): UserSessionStatus {
  const source = record(value);
  if (!source || typeof source.authenticated !== "boolean") {
    throw new Error("Сервер вернул некорректное состояние сессии.");
  }
  if (!source.authenticated) return { authenticated: false, user: null };
  return {
    authenticated: true,
    user: parseRegisteredUser(source.user)
  };
}
