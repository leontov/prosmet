import { useEffect, useState } from "react";
import { DatabaseIcon, DownloadIcon, LockKeyholeIcon, RefreshCwIcon, ServerIcon } from "lucide-react";
import { AgentSettingsPanel } from "../../agents/AgentSettingsPanel";

type Health = {
  ok: boolean;
  releaseSha: string;
  runtime: string;
  agents?: { configured: boolean; enabled: number; defaultAgentId: string; error?: string };
};

type Identity = {
  authenticated: boolean;
  role: string;
  superAdminConfigured: boolean;
  agentConfiguration: string;
};

export function SettingsView({ mobile }: { mobile: boolean }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      const [healthResponse, identityResponse] = await Promise.all([
        fetch("/api/health", { cache: "no-store" }),
        fetch("/api/identity", { cache: "no-store" })
      ]);
      if (!healthResponse.ok || !identityResponse.ok) throw new Error("Сервер не вернул состояние приложения");
      setHealth(await healthResponse.json() as Health);
      setIdentity(await identityResponse.json() as Identity);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось получить состояние сервера");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const exportData = () => {
    const data: Record<string, unknown> = {};
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith("prosmet-")) continue;
      const raw = window.localStorage.getItem(key);
      try { data[key] = raw ? JSON.parse(raw) : null; } catch { data[key] = raw; }
    }
    const blob = new Blob([`${JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `prosmet-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className={mobile ? "settings mobile-settings" : "settings desktop-settings"}>
      <header className="section-title">
        <h1>Настройки</h1>
        <p>Реальное состояние сервера, данные и подключённые агентные системы.</p>
      </header>

      <div className="settings-layout settings-runtime-layout">
        <div className="settings-main">
          <SettingsSection icon={<ServerIcon />} title="Production runtime">
            <StatusRow label="Приложение" value={health?.ok ? "Доступно" : "Нет подтверждения"} tone={health?.ok ? "success" : "muted"} />
            <StatusRow label="Release SHA" value={health?.releaseSha || "—"} />
            <StatusRow label="Runtime" value={health?.runtime || "—"} />
            <StatusRow label="Агенты" value={health?.agents?.configured ? `${health.agents.enabled} подключено` : "Не подключены"} tone={health?.agents?.configured ? "success" : "warning"} />
            <button type="button" className="settings-action" disabled={refreshing} onClick={() => void refresh()}>
              <span><strong>Обновить состояние</strong><small>{error || "Проверить публичный API и активный агентный маршрут"}</small></span><b><RefreshCwIcon /> Проверить</b>
            </button>
          </SettingsSection>

          <SettingsSection icon={<DatabaseIcon />} title="Локальные данные">
            <button type="button" className="settings-action" onClick={exportData}>
              <span><strong>Экспорт данных браузера</strong><small>Скачать сохранённые сметы и выбранные настройки в JSON</small></span><b><DownloadIcon /> Скачать</b>
            </button>
          </SettingsSection>

          <SettingsSection icon={<LockKeyholeIcon />} title="Административный доступ">
            <StatusRow label="Текущая роль" value={identity?.role || "—"} />
            <StatusRow label="Super-admin token" value={identity?.superAdminConfigured ? "Настроен на сервере" : "Не настроен"} tone={identity?.superAdminConfigured ? "success" : "warning"} />
            <StatusRow label="Конфигурация агентов" value={identity?.agentConfiguration || "—"} />
          </SettingsSection>
        </div>
      </div>

      <AgentSettingsPanel />
    </section>
  );
}

function SettingsSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <header><span>{icon}</span><h2>{title}</h2></header>
      <div>{children}</div>
    </section>
  );
}

function StatusRow({ label, value, tone = "muted" }: { label: string; value: string; tone?: "success" | "warning" | "muted" }) {
  return <div className="settings-status-row"><span>{label}</span><strong className={tone}>{value}</strong></div>;
}
