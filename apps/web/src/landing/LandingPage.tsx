import { useMemo, useState } from "react";
import {
  ArrowRightIcon,
  BadgeCheckIcon,
  BarChart3Icon,
  BotIcon,
  Building2Icon,
  CheckIcon,
  FileCheck2Icon,
  FileSpreadsheetIcon,
  MenuIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  SparklesIcon,
  XIcon
} from "lucide-react";
import "./landing.css";

type DemoLine = { name: string; unit: string; quantity: number; price: number };

type Plan = {
  name: string;
  price: string;
  note: string;
  featured?: boolean;
  features: readonly string[];
};

const demoLines: DemoLine[] = [
  { name: "Демонтаж покрытий и вывоз", unit: "компл.", quantity: 1, price: 28_000 },
  { name: "Подготовка и гидроизоляция", unit: "м²", quantity: 24, price: 1_450 },
  { name: "Монтаж водоснабжения и канализации", unit: "компл.", quantity: 1, price: 62_000 },
  { name: "Укладка керамогранита", unit: "м²", quantity: 31, price: 2_900 },
  { name: "Чистовые материалы и сантехника", unit: "компл.", quantity: 1, price: 198_000 }
];

const workflow = [
  ["01", "Запрос", "Пользователь описывает объект обычным языком."],
  ["02", "Исследование", "AI уточняет данные, сверяет региональные цены и технологию."],
  ["03", "Смета", "Расчёт сохраняется в базе и открывается в редакторе."],
  ["04", "Документы", "КП, счёт и договор создаются из утверждённой версии."],
  ["05", "Исполнение", "Факт, отклонения, акт, КС-2 и КС-3 связаны с проектом."]
] as const;

const plans = [
  {
    name: "Starter",
    price: "Бесплатно",
    note: "Для первой сметы",
    features: ["AI-чат", "Интерактивный редактор", "Экспорт сметы"]
  },
  {
    name: "Pro",
    price: "4 990 ₽",
    note: "в месяц за специалиста",
    featured: true,
    features: ["Безлимитные проекты", "КП, договоры и акты", "Каталог региональных цен", "Версии и согласование"]
  },
  {
    name: "Business",
    price: "от 29 900 ₽",
    note: "в месяц за команду",
    features: ["Организация и роли", "Корпоративные шаблоны", "API и интеграции", "Приоритетное внедрение"]
  },
  {
    name: "Enterprise",
    price: "По запросу",
    note: "частный контур и white-label",
    features: ["Выделенная инфраструктура", "SSO и аудит", "Миграция данных", "SLA и сопровождение"]
  }
] satisfies readonly Plan[];

function money(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

export function LandingPage() {
  const [mobileNav, setMobileNav] = useState(false);
  const [demoPrompt, setDemoPrompt] = useState("Ремонт ванной под ключ, 5,8 м², Казань. Работы и материалы.");
  const [demoReady, setDemoReady] = useState(true);
  const [leadSent, setLeadSent] = useState(false);
  const total = useMemo(() => demoLines.reduce((sum, line) => sum + line.quantity * line.price, 0), []);

  const runDemo = () => {
    setDemoReady(false);
    window.setTimeout(() => setDemoReady(true), 850);
  };

  return (
    <div className="growth-landing">
      <header className="growth-nav">
        <a className="growth-brand" href="/landing" aria-label="ProSmet">
          <span><SparklesIcon /></span>
          <strong>ProSmet</strong>
        </a>
        <nav className={mobileNav ? "open" : ""} aria-label="Основная навигация">
          <a href="#product" onClick={() => setMobileNav(false)}>Продукт</a>
          <a href="#workflow" onClick={() => setMobileNav(false)}>Как работает</a>
          <a href="#pricing" onClick={() => setMobileNav(false)}>Тарифы</a>
          <a href="#enterprise" onClick={() => setMobileNav(false)}>Для компаний</a>
        </nav>
        <div className="growth-nav-actions">
          <a className="growth-login" href="/app">Войти</a>
          <a className="growth-cta growth-cta-small" href="/app">Открыть ProSmet</a>
          <button className="growth-menu" type="button" aria-label="Открыть меню" onClick={() => setMobileNav((value) => !value)}>
            {mobileNav ? <XIcon /> : <MenuIcon />}
          </button>
        </div>
      </header>

      <main>
        <section className="growth-hero">
          <div className="growth-kicker"><BadgeCheckIcon /> AI operating system для строительства</div>
          <h1>От запроса до КС-3.<br /><span>Один строительный AI.</span></h1>
          <p className="growth-hero-copy">
            ProSmet исследует цены, составляет профессиональную смету, открывает её в живом редакторе и ведёт объект до закрывающих документов.
          </p>
          <div className="growth-hero-actions">
            <a className="growth-cta" href="/app">Составить первую смету <ArrowRightIcon /></a>
            <a className="growth-secondary" href="#demo">Посмотреть живую демонстрацию</a>
          </div>
          <p className="growth-proof">Без пустых шаблонов · Данные сохраняются · Российский строительный workflow</p>

          <div className="growth-stage" id="demo">
            <div className="growth-demo-chat">
              <header><span><BotIcon /></span><div><strong>ProSmet AI</strong><small>Строительный агент</small></div><i /></header>
              <div className="growth-demo-thread">
                <div className="growth-user-message">{demoPrompt}</div>
                <div className="growth-ai-message">
                  {demoReady ? (
                    <>
                      <span className="growth-ai-label"><SparklesIcon /> Расчёт готов</span>
                      <strong>Сформирована смета на ремонт ванной комнаты</strong>
                      <p>Учтены демонтаж, инженерные работы, гидроизоляция, отделка, сантехника и сопутствующие расходы.</p>
                      <div className="growth-ai-actions"><button type="button">Открыть редактор</button><button type="button">Показать допущения</button></div>
                    </>
                  ) : (
                    <div className="growth-thinking"><i /><i /><i /><span>Проверяю состав работ и региональные цены…</span></div>
                  )}
                </div>
              </div>
              <form onSubmit={(event) => { event.preventDefault(); runDemo(); }}>
                <textarea aria-label="Запрос для демонстрации" value={demoPrompt} onChange={(event) => setDemoPrompt(event.target.value)} />
                <button type="submit" aria-label="Запустить демонстрацию"><ArrowRightIcon /></button>
              </form>
            </div>

            <div className="growth-demo-estimate">
              <header>
                <div><small>Смета № PS-2026-001</small><strong>Ремонт ванной комнаты</strong></div>
                <span>Черновик</span>
              </header>
              <div className="growth-estimate-head"><span>Позиция</span><span>Кол-во</span><span>Цена</span><span>Стоимость</span></div>
              <div className="growth-estimate-lines">
                {demoLines.map((line) => (
                  <div key={line.name}>
                    <span><strong>{line.name}</strong><small>{line.unit}</small></span>
                    <span>{line.quantity}</span>
                    <span>{money(line.price)}</span>
                    <b>{money(line.quantity * line.price)}</b>
                  </div>
                ))}
              </div>
              <footer><span>Предварительная стоимость</span><strong>{money(total)}</strong></footer>
            </div>
          </div>
        </section>

        <section className="growth-section growth-value" id="product">
          <div className="growth-section-heading"><span>Не очередная CRM</span><h2>Проект создаётся вокруг результата, а не вокруг форм.</h2></div>
          <div className="growth-value-grid">
            <article><FileSpreadsheetIcon /><h3>Живая смета</h3><p>AI создаёт структурированный расчёт, который сразу доступен для редактирования, версий и утверждения.</p></article>
            <article><BarChart3Icon /><h3>Региональные цены</h3><p>Система использует накопленные наблюдения и сверяет их со свежими коммерческими ориентирами.</p></article>
            <article><FileCheck2Icon /><h3>Документы из данных</h3><p>КП, счёт, договор, акт, КС-2 и КС-3 формируются из зафиксированной версии проекта.</p></article>
            <article><SmartphoneIcon /><h3>Работа на объекте</h3><p>Мобильный интерфейс позволяет фиксировать фактические объёмы, изменения и готовность работ.</p></article>
          </div>
        </section>

        <section className="growth-section growth-workflow" id="workflow">
          <div className="growth-section-heading"><span>Единый процесс</span><h2>Вся экономика объекта остаётся связанной.</h2></div>
          <div className="growth-workflow-list">
            {workflow.map(([number, title, copy]) => <article key={number}><b>{number}</b><div><h3>{title}</h3><p>{copy}</p></div></article>)}
          </div>
        </section>

        <section className="growth-section growth-enterprise" id="enterprise">
          <div>
            <span className="growth-eyebrow">Для строительных компаний</span>
            <h2>Ваши стандарты, цены и документы становятся корпоративным AI-контуром.</h2>
            <p>Команды, роли, собственные шаблоны, интеграции, закрытая инфраструктура и единый аудит изменений.</p>
            <ul><li><ShieldCheckIcon /> Изоляция данных и управляемые права</li><li><Building2Icon /> Настройка под структуру компании</li><li><BotIcon /> Выбор AI-провайдеров и частных моделей</li></ul>
          </div>
          <form className="growth-lead-form" onSubmit={(event) => { event.preventDefault(); setLeadSent(true); }}>
            {leadSent ? (
              <div className="growth-lead-success"><CheckIcon /><strong>Заявка принята</strong><p>Команда подготовит сценарий внедрения под вашу компанию.</p></div>
            ) : (
              <>
                <strong>Запросить корпоративную демонстрацию</strong>
                <label><span>Имя</span><input required name="name" autoComplete="name" /></label>
                <label><span>Рабочий телефон или email</span><input required name="contact" /></label>
                <label><span>Компания и число сотрудников</span><input required name="company" /></label>
                <button type="submit">Получить план внедрения <ArrowRightIcon /></button>
                <small>Отправляя форму, вы соглашаетесь на обработку контактных данных.</small>
              </>
            )}
          </form>
        </section>

        <section className="growth-section growth-pricing" id="pricing">
          <div className="growth-section-heading"><span>Прозрачная модель</span><h2>Начните с результата. Масштабируйте после доказанной ценности.</h2></div>
          <div className="growth-pricing-grid">
            {plans.map((plan) => (
              <article className={plan.featured ? "featured" : ""} key={plan.name}>
                {plan.featured ? <em>Основной тариф</em> : null}
                <h3>{plan.name}</h3><strong>{plan.price}</strong><small>{plan.note}</small>
                <ul>{plan.features.map((feature) => <li key={feature}><CheckIcon /> {feature}</li>)}</ul>
                <a href="/app">{plan.name === "Enterprise" ? "Обсудить внедрение" : "Начать работу"}<ArrowRightIcon /></a>
              </article>
            ))}
          </div>
        </section>

        <section className="growth-final-cta">
          <span><SparklesIcon /></span>
          <h2>Первую полноценную смету можно создать сегодня.</h2>
          <p>Опишите объект. ProSmet задаст необходимые вопросы и откроет результат в интерактивном редакторе.</p>
          <a className="growth-cta" href="/app">Открыть ProSmet <ArrowRightIcon /></a>
        </section>
      </main>

      <footer className="growth-footer">
        <div><a className="growth-brand" href="/landing"><span><SparklesIcon /></span><strong>ProSmet</strong></a><p>AI operating system для строительного проекта.</p></div>
        <nav><a href="#product">Продукт</a><a href="#pricing">Тарифы</a><a href="/app">Приложение</a></nav>
        <small>© 2026 ProSmet. Все расчёты требуют проверки ответственным специалистом.</small>
      </footer>
    </div>
  );
}
