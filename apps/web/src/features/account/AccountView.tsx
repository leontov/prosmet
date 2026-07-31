import { useEffect, useState } from "react";
import { BotIcon, CheckCircle2Icon, CircleUserRoundIcon, DatabaseIcon, ServerIcon, ShieldCheckIcon } from "lucide-react";

type Identity = {
  authenticated: boolean;
  role: string;
  superAdminConfigured: boolean;
  agentConfiguration: string;
};

type Health = {
  ok: boolean;
  releaseSha: string;
  runtime: string;
  agents?: { configured: boolean; enabled: number; defaultAgentId: string };
};

export function AccountView({ mobile }: { mobile: boolean }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/identity", { cache: "no-store" }),
      fetch("/api/health", { cache: "no-store" })
    ])
      .then(async ([identityResponse, healthResponse]) => {
        if (!identityResponse.ok || !healthResponse.ok) throw new Error("Сервер не вернул состояние кабинета");
        return Promise.all([identityResponse.json() as Promise<Identity>, healthResponse.json() as Promise<Health>]);
      })
      .then(([nextIdentity, nextHealth]) => {
        if (!active) return;
        setIdentity(nextIdentity);
        setHealth(nextHealth);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить кабинет"); });
    return () => { active = false; };
  }, []);

  const localEstimate = (() => {
    try { return Boolean(window.localStorage.getItem("prosmet-greenfield-estimate")); } catch { return false; }
  })();

  return (
    <section className={mobile ? "account mobile-account" : "account desktop-account"}>
      <header className="section-title">
        <h1>Кабинет</h1>
        <p>Только фактическое состояние текущего браузера и production-сервера.</p>
      </header>

      <div className="profile-panel account-live-profile">
        <div className="profile-avatar"><CircleUserRoundIcon /></div>
        <div>
          <strong>{identity?.authenticated ? "Авторизованный пользователь" : "Гостевой сеанс"}</strong>
          <span>{identity?.role || "Состояние загружается"}</span>
        </div>
      </div>

      {error ? <p className="account-error">{error}</p> : null}

      <div className="account-grid">
        <article className="account-card">
          <span className="account-card-icon"><ServerIcon /></span>
          <div><small>Production</small><h2>{health?.ok ? "Доступен" : "Нет подтверждения"}</h2><p>{health?.releaseSha ? health.releaseSha.slice(0, 12) : "Release SHA не получен"}</p></div>
        </article>
        <article className="account-card">
          <span className="account-card-icon"><BotIcon /></span>
          <div><small>Агенты</small><h2>{health?.agents?.configured ? `${health.agents.enabled} подключено` : "Не подключены"}</h2><p>{health?.agents?.defaultAgentId || "Основной агент не выбран"}</p></div>
        </article>
      </div>

      <div className="account-block">
        <div className="account-block-title"><h2>Доступ и данные</h2>{health?.ok ? <span><CheckCircle2Icon /> Проверено</span> : null}</div>
        <StatusRow icon={<ShieldCheckIcon />} label="Super-admin" value={identity?.superAdminConfigured ? "Токен настроен на сервере" : "Не настроен"} />
        <StatusRow icon={<DatabaseIcon />} label="Локальная смета" value={localEstimate ? "Сохранена в этом браузере" : "Нет локальных данных"} />
        <StatusRow icon={<ServerIcon />} label="Runtime" value={health?.runtime || "—"} />
      </div>
    </section>
  );
}

function StatusRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="status-row account-status-live"><span>{icon}{label}</span><b>{value}</b></div>;
}
