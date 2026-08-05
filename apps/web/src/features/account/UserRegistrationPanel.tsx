import { useEffect, useState, type FormEvent } from "react";

type RegisteredUser = {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string;
};

type Session = {
  authenticated: boolean;
  user: RegisteredUser | null;
};

type RequestState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

async function requestSession(path: string, init?: RequestInit): Promise<Session> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers
    }
  });
  const body = await response.json().catch(() => ({})) as Session & {
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(body.error?.message || `HTTP ${response.status}`);
  return body;
}

export function UserRegistrationPanel() {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [session, setSession] = useState<Session>({ authenticated: false, user: null });
  const [state, setState] = useState<RequestState>({ status: "idle" });

  useEffect(() => {
    let active = true;
    void requestSession("/api/auth/session")
      .then((value) => { if (active) setSession(value); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

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
      setSession(next);
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
      setSession(next);
      setState({ status: "success", message: "Вы вышли из аккаунта." });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Не удалось выйти."
      });
    }
  };

  return (
    <section className="registration-panel" aria-labelledby="registration-title">
      <div className="registration-panel__copy">
        <span>{session.authenticated ? "Аккаунт" : "Регистрация"}</span>
        <h2 id="registration-title">
          {session.user ? `Здравствуйте, ${session.user.name}` : "Создайте пользователя ProSmet"}
        </h2>
        <p>
          {session.user
            ? `${session.user.company} · ${session.user.email}`
            : "Аккаунт сохраняется на сервере и станет основой для ролей, организаций и личной истории смет."}
        </p>
      </div>

      {session.user ? (
        <div className="registration-panel__session">
          <strong>{session.user.name}</strong>
          <span>{session.user.email}</span>
          <small>{session.user.company} · {session.user.role}</small>
          <button type="button" onClick={() => void logout()} disabled={state.status === "sending"}>
            {state.status === "sending" ? "Выходим…" : "Выйти"}
          </button>
          {state.status === "success" ? <p className="registration-panel__success" role="status">{state.message}</p> : null}
          {state.status === "error" ? <p className="registration-panel__error" role="alert">{state.message}</p> : null}
        </div>
      ) : (
        <form className="registration-panel__form" onSubmit={(event) => void submit(event)} aria-busy={state.status === "sending"}>
          <div className="registration-panel__switch" role="tablist" aria-label="Аккаунт ProSmet">
            <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => setMode("register")}>Регистрация</button>
            <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => setMode("login")}>Вход</button>
          </div>
          {mode === "register" ? (
            <label><span>Имя</span><input required name="name" autoComplete="name" maxLength={160} /></label>
          ) : null}
          <label><span>Email</span><input required name="email" type="email" autoComplete="email" maxLength={320} /></label>
          {mode === "register" ? (
            <label><span>Компания</span><input required name="company" autoComplete="organization" maxLength={220} /></label>
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
            />
          </label>
          {state.status === "error" ? <p className="registration-panel__error" role="alert">{state.message}</p> : null}
          {state.status === "success" ? <p className="registration-panel__success" role="status">{state.message}</p> : null}
          <button type="submit" disabled={state.status === "sending"}>
            {state.status === "sending"
              ? "Подождите…"
              : mode === "register" ? "Зарегистрироваться" : "Войти"}
          </button>
        </form>
      )}
    </section>
  );
}
