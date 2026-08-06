import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { AccountProfile, SystemStatus, UserSessionStatus } from "@prosmet/contracts";
import {
  ActivityIcon,
  BotIcon,
  Building2Icon,
  CheckCircle2Icon,
  DatabaseIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  LockKeyholeIcon,
  MailIcon,
  MapPinIcon,
  SaveIcon,
  ServerIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  UsersRoundIcon,
  WifiIcon,
  WifiOffIcon
} from "lucide-react";
import { fetchAccountProfile, fetchSystemStatus, saveAccountProfile } from "../agents/agent-api";
import { UserRegistrationPanel } from "./UserRegistrationPanel";
import "../../web-account-workspace.css";

const emptyProfile: AccountProfile = {
  name: "",
  email: "",
  organization: "",
  region: "",
  role: "super_admin",
  updatedAt: ""
};

const emptySession: UserSessionStatus = {
  authenticated: false,
  user: null
};

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "PS";
  return parts.slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("ru-RU") || "").join("");
}

function updatedLabel(value: string) {
  if (!value) return "Ещё не сохранено";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Дата недоступна";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function roleLabel(role: string | undefined) {
  if (role === "owner") return "Владелец организации";
  if (role === "member") return "Участник организации";
  return "Гостевой доступ";
}

async function loadUserSession(): Promise<UserSessionStatus> {
  const response = await fetch("/api/auth/session", {
    cache: "no-store",
    credentials: "same-origin"
  });
  if (!response.ok) return emptySession;
  return response.json() as Promise<UserSessionStatus>;
}

export function AccountView({ mobile }: { mobile: boolean }) {
  const [profile, setProfile] = useState<AccountProfile>(emptyProfile);
  const [session, setSession] = useState<UserSessionStatus>(emptySession);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [systemStatus, userSession] = await Promise.all([
        fetchSystemStatus().catch(() => null),
        loadUserSession().catch(() => emptySession)
      ]);
      if (!cancelled) {
        setSystem(systemStatus);
        setSession(userSession);
      }
      try {
        const account = await fetchAccountProfile();
        if (!cancelled) {
          setProfile(account);
          setAuthorized(true);
        }
      } catch {
        if (!cancelled) setAuthorized(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const identity = useMemo(() => {
    const name = session.user?.name || profile.name || "Профиль ProSmet";
    const company = session.user?.company || profile.organization || "Организация не указана";
    const email = session.user?.email || profile.email || "Контакт не указан";
    return { name, company, email };
  }, [profile, session.user]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const updated = await saveAccountProfile(profile);
      setProfile(updated);
      setAuthorized(true);
      setMessage("Реквизиты организации сохранены.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить профиль");
    } finally {
      setSaving(false);
    }
  };

  const focusAccess = () => {
    document.querySelector<HTMLElement>(".cabinet-access-panel")?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  };

  return (
    <section className={`account cabinet-workspace ${mobile ? "mobile-account" : "desktop-account"}`} data-testid="account-workspace">
      <header className="cabinet-hero">
        <div className="cabinet-identity">
          <div className="cabinet-avatar" aria-hidden="true">{initials(identity.name)}</div>
          <div className="cabinet-identity-copy">
            <div className="cabinet-badges">
              <span className={session.authenticated ? "positive" : "neutral"}>
                {session.authenticated ? <CheckCircle2Icon /> : <UserRoundIcon />}
                {session.authenticated ? "Аккаунт активен" : "Гостевой режим"}
              </span>
              <span className={system?.ok ? "positive" : "warning"}>
                {system?.ok ? <WifiIcon /> : <WifiOffIcon />}
                {system?.ok ? "Сервис доступен" : "Нет связи с сервисом"}
              </span>
            </div>
            <h1>{identity.name}</h1>
            <p>{identity.company}<span aria-hidden="true">·</span>{identity.email}</p>
          </div>
        </div>
        <div className="cabinet-hero-actions">
          <button type="button" className="cabinet-secondary-action" onClick={focusAccess}>
            <KeyRoundIcon /> Управление входом
          </button>
          {authorized ? (
            <button type="submit" form="cabinet-profile-form" className="cabinet-primary-action" disabled={saving}>
              {saving ? <LoaderCircleIcon className="spin" /> : <SaveIcon />}
              {saving ? "Сохраняем…" : "Сохранить изменения"}
            </button>
          ) : null}
        </div>
      </header>

      <div className="cabinet-status-strip" aria-label="Состояние кабинета">
        <StatusFact
          icon={<UsersRoundIcon />}
          label="Роль"
          value={roleLabel(session.user?.role)}
        />
        <StatusFact
          icon={<Building2Icon />}
          label="Организация"
          value={identity.company}
        />
        <StatusFact
          icon={<BotIcon />}
          label="Расчётный агент"
          value={system?.activeAgent?.name || "Не подключён"}
        />
        <StatusFact
          icon={<ActivityIcon />}
          label="Версия"
          value={system?.releaseSha ? system.releaseSha.slice(0, 10) : "недоступна"}
          mono
        />
      </div>

      <div className="cabinet-layout">
        <main className="cabinet-main-column">
          <section className="cabinet-panel cabinet-profile-panel">
            <PanelHeader
              icon={<Building2Icon />}
              title="Профиль организации"
              description="Данные исполнителя, которые используются в сметах, коммерческих предложениях и договорах."
              meta={authorized ? `Обновлено ${updatedLabel(profile.updatedAt)}` : "Технический доступ закрыт"}
            />

            {loading ? (
              <div className="cabinet-loading"><LoaderCircleIcon className="spin" /> Загружаем профиль</div>
            ) : authorized ? (
              <form id="cabinet-profile-form" className="account-profile-form cabinet-profile-form" onSubmit={save}>
                <div className="cabinet-form-grid">
                  <AccountField id="profile-name" label="Ответственное лицо" icon={<UserRoundIcon />}>
                    <input
                      id="profile-name"
                      name="profile-name"
                      value={profile.name}
                      onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))}
                      autoComplete="name"
                      placeholder="Имя и фамилия"
                    />
                  </AccountField>
                  <AccountField id="profile-email" label="Рабочая почта" icon={<MailIcon />}>
                    <input
                      id="profile-email"
                      name="profile-email"
                      type="email"
                      value={profile.email}
                      onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))}
                      autoComplete="email"
                      placeholder="name@company.ru"
                    />
                  </AccountField>
                  <AccountField id="profile-organization" label="Организация" icon={<Building2Icon />}>
                    <input
                      id="profile-organization"
                      name="profile-organization"
                      value={profile.organization}
                      onChange={(event) => setProfile((current) => ({ ...current, organization: event.target.value }))}
                      autoComplete="organization"
                      placeholder="ООО «СтройПроект»"
                    />
                  </AccountField>
                  <AccountField id="profile-region" label="Основной регион" icon={<MapPinIcon />}>
                    <input
                      id="profile-region"
                      name="profile-region"
                      value={profile.region}
                      onChange={(event) => setProfile((current) => ({ ...current, region: event.target.value }))}
                      placeholder="Республика Татарстан"
                    />
                  </AccountField>
                </div>
                <div className="cabinet-form-footer">
                  <span><ShieldCheckIcon /> Изменения применяются к новым документам и следующим версиям смет.</span>
                  <button type="submit" className="cabinet-primary-action" disabled={saving}>
                    {saving ? <LoaderCircleIcon className="spin" /> : <SaveIcon />}
                    {saving ? "Сохраняем…" : "Сохранить"}
                  </button>
                </div>
                {message ? <p className="account-save-message cabinet-message" role="status">{message}</p> : null}
              </form>
            ) : (
              <div className="account-auth-required cabinet-locked-state">
                <span><LockKeyholeIcon /></span>
                <div>
                  <strong>Профиль организации защищён</strong>
                  <p>Редактирование реквизитов доступно после входа супер-администратора в разделе «Настройки».</p>
                </div>
              </div>
            )}
          </section>

          <UserRegistrationPanel onSessionChange={setSession} />
        </main>

        <aside className="cabinet-inspector" aria-label="Состояние аккаунта и сервиса">
          <section className="cabinet-panel cabinet-agent-panel">
            <PanelHeader
              icon={<BotIcon />}
              title="ИИ-подключение"
              description="Агент, который отвечает за расчёты и формирование смет."
            />
            <div className="cabinet-agent-summary">
              <span className={system?.activeAgent ? "online" : "offline"}><BotIcon /></span>
              <div>
                <small>{system?.activeAgent ? "Активен" : "Не настроен"}</small>
                <strong>{system?.activeAgent?.name || "Расчётный агент не подключён"}</strong>
                <p>{system?.activeAgent?.model || "Откройте настройки и выберите рабочую модель."}</p>
              </div>
            </div>
          </section>

          <section className="cabinet-panel account-block cabinet-system-panel">
            <PanelHeader
              icon={<ServerIcon />}
              title="Состояние сервиса"
              description="Техническая информация без лишних административных деталей."
            />
            <div className="cabinet-status-list">
              <SystemRow
                icon={<ActivityIcon />}
                label="API и web-приложение"
                value={system?.ok ? "Работают" : "Недоступны"}
                tone={system?.ok ? "positive" : "danger"}
              />
              <SystemRow
                icon={<DatabaseIcon />}
                label="Хранилище"
                value={system?.persistence || "неизвестно"}
              />
              <SystemRow
                icon={<BotIcon />}
                label="Подключено агентов"
                value={String(system?.configuredAgents ?? 0)}
              />
              <SystemRow
                icon={<ShieldCheckIcon />}
                label="Технический доступ"
                value={authorized ? "Подтверждён" : "Требуется вход"}
                tone={authorized ? "positive" : "warning"}
              />
              <SystemRow
                icon={<ServerIcon />}
                label="Production SHA"
                value={system?.releaseSha || "недоступно"}
                mono
              />
            </div>
          </section>

          <section className="cabinet-panel cabinet-security-panel">
            <PanelHeader
              icon={<ShieldCheckIcon />}
              title="Разделение доступа"
              description="Пользовательский аккаунт и технический доступ администратора — разные уровни."
            />
            <div className="cabinet-security-note">
              <span><UserRoundIcon /></span>
              <div><strong>Аккаунт пользователя</strong><p>Вход, роль, компания и будущая история личных проектов.</p></div>
            </div>
            <div className="cabinet-security-note">
              <span><LockKeyholeIcon /></span>
              <div><strong>Супер-администратор</strong><p>Агенты, секреты провайдеров и серверные реквизиты.</p></div>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function PanelHeader({ icon, title, description, meta }: {
  icon: ReactNode;
  title: string;
  description: string;
  meta?: string;
}) {
  return (
    <header className="cabinet-panel-header">
      <span className="cabinet-panel-icon">{icon}</span>
      <div><h2>{title}</h2><p>{description}</p></div>
      {meta ? <small>{meta}</small> : null}
    </header>
  );
}

function StatusFact({ icon, label, value, mono = false }: {
  icon: ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="cabinet-status-fact">
      <span>{icon}</span>
      <div><small>{label}</small><strong className={mono ? "mono" : ""}>{value}</strong></div>
    </div>
  );
}

function SystemRow({ icon, label, value, tone = "neutral", mono = false }: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "warning" | "danger";
  mono?: boolean;
}) {
  return (
    <div className="status-row cabinet-system-row">
      <span>{icon}<span>{label}</span></span>
      <b className={`${tone}${mono ? " mono" : ""}`}>{value}</b>
    </div>
  );
}

function AccountField({ id, label, icon, children }: {
  id: string;
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="account-field cabinet-field" htmlFor={id}>
      <span>{icon}{label}</span>
      {children}
    </label>
  );
}
