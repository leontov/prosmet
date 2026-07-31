import { Building2Icon, CheckCircle2Icon, ChevronRightIcon, ShieldCheckIcon, UserRoundIcon } from "lucide-react";

export function AccountView({ mobile }: { mobile: boolean }) {
  return (
    <section className={mobile ? "account mobile-account" : "account desktop-account"}>
      <header className="section-title">
        <h1>Кабинет</h1>
        <p>Профиль, организация, роли и рабочие устройства.</p>
      </header>

      <div className="profile-panel">
        <div className="profile-avatar"><UserRoundIcon /></div>
        <div><strong>Владислав Кочуров</strong><span>Владелец · супер-администратор</span></div>
        <button type="button">Изменить</button>
      </div>

      <div className="account-grid">
        <article className="account-card">
          <span className="account-card-icon"><Building2Icon /></span>
          <div><small>Организация</small><h2>Просметчик</h2><p>Республика Татарстан</p></div>
          <ChevronRightIcon />
        </article>
        <article className="account-card">
          <span className="account-card-icon"><ShieldCheckIcon /></span>
          <div><small>Тариф</small><h2>Founder</h2><p>Все функции и агентские адаптеры</p></div>
          <ChevronRightIcon />
        </article>
      </div>

      <div className="account-block">
        <div className="account-block-title"><h2>Состояние данных</h2><span><CheckCircle2Icon /> Синхронизировано</span></div>
        <div className="status-row"><span>Локальная база</span><b>Готова</b></div>
        <div className="status-row"><span>Серверная копия</span><b>PostgreSQL</b></div>
        <div className="status-row"><span>Последняя синхронизация</span><b>только что</b></div>
      </div>

      <div className="account-block">
        <div className="account-block-title"><h2>Устройства</h2><button type="button">Управлять</button></div>
        <div className="device-row"><span className="device-dot active" /><span><strong>MacBook Air</strong><small>Текущая сессия · Helsinki</small></span><b>Сейчас</b></div>
        <div className="device-row"><span className="device-dot" /><span><strong>iPhone</strong><small>Мобильное приложение</small></span><b>12 мин</b></div>
      </div>
    </section>
  );
}
