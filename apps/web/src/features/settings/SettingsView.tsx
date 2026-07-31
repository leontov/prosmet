import { useState } from "react";
import { BotIcon, CheckIcon, DatabaseIcon, LockKeyholeIcon, MonitorCogIcon } from "lucide-react";

export function SettingsView({ mobile }: { mobile: boolean }) {
  const [offline, setOffline] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [compact, setCompact] = useState(false);

  return (
    <section className={mobile ? "settings mobile-settings" : "settings desktop-settings"}>
      <header className="section-title">
        <h1>Настройки</h1>
        <p>Поведение приложения, агенты, данные и безопасность.</p>
      </header>

      <div className="settings-layout">
        <div className="settings-main">
          <SettingsSection icon={<MonitorCogIcon />} title="Интерфейс">
            <ToggleRow title="Автосохранение" description="Сохранять изменения сметы без отдельного действия" checked={autoSave} onChange={setAutoSave} />
            <ToggleRow title="Компактная плотность" description="Уменьшить отступы только на больших экранах" checked={compact} onChange={setCompact} />
          </SettingsSection>

          <SettingsSection icon={<DatabaseIcon />} title="Данные">
            <ToggleRow title="Локальный режим" description="Продолжать работу без сети и синхронизировать позже" checked={offline} onChange={setOffline} />
            <button type="button" className="settings-action"><span><strong>Экспорт данных</strong><small>Скачать проекты, сметы и документы</small></span><b>Экспортировать</b></button>
          </SettingsSection>

          <SettingsSection icon={<LockKeyholeIcon />} title="Безопасность">
            <button type="button" className="settings-action"><span><strong>Активные сессии</strong><small>2 устройства имеют доступ к аккаунту</small></span><b>Открыть</b></button>
          </SettingsSection>
        </div>

        <aside className="agent-settings">
          <div className="agent-settings-title"><BotIcon /><span><strong>Агенты</strong><small>Единый adapter layer</small></span></div>
          <Provider name="Codex" detail="App Server" active />
          <Provider name="MiMo" detail="Control plane" />
          <Provider name="Local" detail="Ollama / OpenAI-compatible" />
          <button type="button" className="provider-add">Подключить агента</button>
        </aside>
      </div>
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

function ToggleRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" className="toggle-row" onClick={() => onChange(!checked)} aria-pressed={checked}>
      <span><strong>{title}</strong><small>{description}</small></span>
      <i className={checked ? "toggle active" : "toggle"}><b /></i>
    </button>
  );
}

function Provider({ name, detail, active = false }: { name: string; detail: string; active?: boolean }) {
  return (
    <button type="button" className={active ? "provider active" : "provider"}>
      <span><strong>{name}</strong><small>{detail}</small></span>
      {active ? <CheckIcon /> : null}
    </button>
  );
}
