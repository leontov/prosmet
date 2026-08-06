import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { UserSessionStatus } from "@prosmet/contracts";
import {
  CheckCircle2Icon,
  KeyRoundIcon,
  LoaderCircleIcon,
  LogInIcon,
  LogOutIcon,
  MailIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  UserRoundIcon,
  UsersRoundIcon
} from "lucide-react";

type RequestState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type Props = {
  onSessionChange?: (session: UserSessionStatus) => void;
};

async function requestSession(path: string, init?: RequestInit): Promise<UserSessionStatus> {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers
    }
  });
  const body = await response.json().catch(() => ({})) as UserSessionStatus & {
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(body.error?.message || `HTTP ${response.status}`);
  return body;
}

function roleLabel(role: string) {
  return role === "owner" ? "Владелец организации" : "Участник организации";
}

export function UserRegistrationPanel({ onSessionChange }: Props) {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [session, setSession] = useState<UserSessionStatus>({ authenticated: false, user: null });
  const [state, setState] = useState<RequestState>({ status: "idle" });

  const commitSession = useCallback((next: UserSessionStatus) => {
    setSession(next);
    onSessionChange?.(next);
  }, [onSessionChange]);

  useEffect(() => {
    let active = true;
    void requestSession("/api/auth/session")
      .then((value) => { if (active) commitSession(value); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [commitSession]);

  const chooseMode = (next: "register" | "login") => {
    setMode(next);
    setState({ status: "idle" });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setState({ status: "sending" });
    try {
      const payload = mode === "register"
        ? {
            name: data.get("name"),
            email: data.get("email"),
            company: data.get("company"),
            password: data.get("password")
          }
        : {
            email: data.get("email"),
            password: data.get("password")
          };
      const next = await requestSession(
        mode === "register" ? "/api/register" : "/api/auth/login",
        { method: "POST", body: JSON.stringify(payload) }
      );
      commitSession(next);
      setState({
        status: "success",
        message: mode === "register"
          ? "Аккаунт создан. Вы вошли в ProSmet."
          : "Вход выполнен."
      });
      form.reset();
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Не удалось выполнить действие."
      });
    }
  };

  const logout = async () => {
    setState({ status: "sending" });
    try {
      const next = await requestSession("/api/auth/logout", { method: "DELETE" });
      commitSession(next);
      setState({ status: "success", message: "Вы вышли из аккаунта." });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Не удалось выйти."
      });
    }
  };

  return (
    <section className="registration-panel cabinet-panel cabinet-access-panel" aria-labelledby="registration-title">
      <header className="cabinet-access-header">
        <span className="cabinet-panel-icon"><KeyRoundIcon /></span>
        <div className="registration-panel__copy">
          <h2 id="registration-title">Доступ к аккаунту</h2>
          <p>{session.user
            ? "Сессия активна на этом устройстве. Пароль не хранится в браузере."
            : "Войдите или создайте аккаунт для персональной истории проектов и командных ролей."}</p>
        </div>
        <span className={session.authenticated ? "cabinet-access-status positive" : "cabinet-access-status neutral"}>
          {session.authenticated ? <CheckCircle2Icon /> : <ShieldCheckIcon />}
          {session.authenticated ? "Выполнен вход" : "Вход не выполнен"}
        </span>
      </header>

      {session.user ? (
        <div className="registration-panel__session cabinet-session-card">
          <div className="cabinet-session-identity">
            <span><UserRoundIcon /></span>
            <div>
              <strong>{session.user.name}</strong>
              <small>{roleLabel(session.user.role)}</small>
            </div>
          </div>
          <div className="cabinet-session-details">
            <span><MailIcon /><span><small>Электронная почта</small><strong>{session.user.email}</strong></span></span>
            <span><UsersRoundIcon /><span><small>Организация</small><strong>{session.user.company}</strong></span></span>
          </div>
          <button type="button" className="cabinet-secondary-action cabinet-logout" onClick={() => void logout()} disabled={state.status === "sending"}>
            {state.status === "sending" ? <LoaderCircleIcon className="spin" /> : <LogOutIcon />}
            {state.status === "sending" ? "Выходим…" : "Выйти из аккаунта"}
          </button>
          {state.status === "success" ? <p className="registration-panel__success cabinet-form-message" role="status">{state.message}</p> : null}
          {state.status === "error" ? <p className="registration-panel__error cabinet-form-message" role="alert">{state.message}</p> : null}
        </div>
      ) : (
        <form className="registration-panel__form cabinet-access-form" onSubmit={(event) => void submit(event)} aria-busy={state.status === "sending"}>
          <div className="registration-panel__switch cabinet-access-switch" role="tablist" aria-label="Аккаунт ProSmet">
            <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => chooseMode("register")}>
              <UserPlusIcon /> Регистрация
            </button>
            <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => chooseMode("login")}>
              <LogInIcon /> Вход
            </button>
          </div>

          <div className="cabinet-access-fields">
            {mode === "register" ? (
              <label><span>Имя</span><input required name="name" autoComplete="name" maxLength={160} placeholder="Как к вам обращаться" /></label>
            ) : null}
            <label><span>Email</span><input required name="email" type="email" autoComplete="email" maxLength={320} placeholder="name@company.ru" /></label>
            {mode === "register" ? (
              <label><span>Компания</span><input required name="company" autoComplete="organization" maxLength={220} placeholder="Название организации" /></label>
            ) : null}
            <label>
              <span>Пароль</span>
              <input
                required
                name="password"
                type="password"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                minLength={8}
                maxLength={160}
                placeholder="Не менее 8 символов"
              />
            </label>
          </div>

          <div className="cabinet-access-submit-row">
            <div>
              <ShieldCheckIcon />
              <span>Сессия защищена HttpOnly cookie и работает только на текущем домене.</span>
            </div>
            <button type="submit" className="cabinet-primary-action" disabled={state.status === "sending"}>
              {state.status === "sending"
                ? <><LoaderCircleIcon className="spin" /> Подождите…</>
                : mode === "register"
                  ? <><UserPlusIcon /> Создать аккаунт</>
                  : <><LogInIcon /> Войти</>}
            </button>
          </div>

          {state.status === "error" ? <p className="registration-panel__error cabinet-form-message" role="alert">{state.message}</p> : null}
          {state.status === "success" ? <p className="registration-panel__success cabinet-form-message" role="status">{state.message}</p> : null}
        </form>
      )}
    </section>
  );
}
