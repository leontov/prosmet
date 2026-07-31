import { useEffect, useState } from "react";
import type { AccountProfile, SystemStatus } from "@prosmet/contracts";
import {
  BotIcon,
  Building2Icon,
  CheckCircle2Icon,
  DatabaseIcon,
  LoaderCircleIcon,
  SaveIcon,
  ShieldCheckIcon,
  UserRoundIcon
} from "lucide-react";
import { fetchAccountProfile, fetchSystemStatus, saveAccountProfile } from "../agents/agent-api";

const emptyProfile: AccountProfile = {
  name: "",
  email: "",
  organization: "",
  region: "",
  role: "super_admin",
  updatedAt: ""
};

export function AccountView({ mobile }: { mobile: boolean }) {
  const [profile, setProfile] = useState<AccountProfile>(emptyProfile);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const systemStatus = await fetchSystemStatus().catch(() => null);
      if (!cancelled) setSystem(systemStatus);
      try {
        const account = await fetchAccountProfile();
        if (!cancelled) {
          setProfile(account);
          setAuthorized(true);
        }
      } catch {
        if (!cancelled) setAuthorized(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const updated = await saveAccountProfile(profile);
      setProfile(updated);
      setAuthorized(true);
      setMessage("Профиль сохранён.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить профиль");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={mobile ? "account mobile-account" : "account desktop-account"}>
      <header className="section-title">
        <h1>Кабинет</h1>
        <p>Фактический профиль владельца, состояние сервера и активная интеграция.</p>
      </header>

      {authorized === false ? (
        <div className="account-auth-required">
          <ShieldCheckIcon />
          <div><strong>Требуется сессия супер-администратора</strong><p>Войдите в разделе «Настройки», затем вернитесь в кабинет.</p></div>
        </div>
      ) : (
        <form className="account-profile-form" onSubmit={save}>
          <div className="profile-panel real-profile-panel">
            <div className="profile-avatar"><UserRoundIcon /></div>
            <div>
              <strong>{profile.name || "Профиль не заполнен"}</strong>
              <span>{profile.email || "Укажите имя, организацию и контакт"}</span>
            </div>
            <button type="submit" disabled={saving}>{saving ? <LoaderCircleIcon className="spin" /> : <SaveIcon />} Сохранить</button>
          </div>

          <div className="account-fields">
            <AccountField id="profile-name" label="Имя"><input id="profile-name" name="profile-name" value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} autoComplete="name" /></AccountField>
            <AccountField id="profile-email" label="Электронная почта"><input id="profile-email" name="profile-email" type="email" value={profile.email} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} autoComplete="email" /></AccountField>
            <AccountField id="profile-organization" label="Организация"><input id="profile-organization" name="profile-organization" value={profile.organization} onChange={(event) => setProfile((current) => ({ ...current, organization: event.target.value }))} autoComplete="organization" /></AccountField>
            <AccountField id="profile-region" label="Регион"><input id="profile-region" name="profile-region" value={profile.region} onChange={(event) => setProfile((current) => ({ ...current, region: event.target.value }))} /></AccountField>
          </div>
          {message ? <p className="account-save-message" role="status">{message}</p> : null}
        </form>
      )}

      <div className="account-grid live-account-grid">
        <article className="account-card">
          <span className="account-card-icon"><Building2Icon /></span>
          <div><small>Организация</small><h2>{profile.organization || "Не настроена"}</h2><p>{profile.region || "Регион не указан"}</p></div>
        </article>
        <article className="account-card">
          <span className="account-card-icon"><BotIcon /></span>
          <div><small>Активный агент</small><h2>{system?.activeAgent?.name || "Не подключён"}</h2><p>{system?.activeAgent ? `${system.activeAgent.type}${system.activeAgent.model ? ` · ${system.activeAgent.model}` : ""}` : "Откройте настройки агентов"}</p></div>
        </article>
      </div>

      <div className="account-block">
        <div className="account-block-title"><h2>Состояние системы</h2><span>{system?.ok ? <><CheckCircle2Icon /> Доступна</> : "Нет соединения"}</span></div>
        <div className="status-row"><span><DatabaseIcon /> Хранилище конфигурации</span><b>{system?.persistence || "неизвестно"}</b></div>
        <div className="status-row"><span><BotIcon /> Подключено агентов</span><b>{system?.configuredAgents ?? 0}</b></div>
        <div className="status-row"><span><ShieldCheckIcon /> Роль</span><b>super_admin</b></div>
        <div className="status-row"><span>Версия production</span><b className="release-sha">{system?.releaseSha || "недоступно"}</b></div>
      </div>
    </section>
  );
}

function AccountField({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <label className="account-field" htmlFor={id}><span>{label}</span>{children}</label>;
}
