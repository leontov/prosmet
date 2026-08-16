import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRightIcon, BotIcon, CheckIcon, ChevronDownIcon, FileCheck2Icon, FileSpreadsheetIcon, FileTextIcon, HammerIcon, MenuIcon, PackageIcon, SearchIcon, SendIcon, Settings2Icon, SparklesIcon, XIcon } from "lucide-react";
import "./landing-samreshu.css";

type LeadState = { status: "idle" | "sending" | "sent" | "error"; message?: string };
type HeroMode = "Смета" | "Расчёт" | "Отчёт";

const heroCopy: Record<HeroMode, { description: string; user: string; agent: string; result: string }> = {
  Смета: { description: "Агент понимает строительную задачу, раскладывает её на работы и материалы и собирает локальную смету с региональными ценами.", user: "Составь смету на механизированную штукатурку стен 180 м² в Лениногорске", agent: "Составил состав работ, добавил материалы и проверил региональные цены.", result: "17 позиций · 289 640 ₽" },
  Расчёт: { description: "Работы, коэффициенты и материалы связываются в один расчёт, который можно проверить и изменить.", user: "Посчитай стоимость отделки дома 150 м² по моим объёмам", agent: "Сопоставил объёмы с работами, рассчитал материалы и сформировал итог.", result: "42 позиции · 1 846 200 ₽" },
  Отчёт: { description: "КП, договор, КС-2/КС-3 и PDF/XLSX остаются связанными с актуальной версией проекта.", user: "Подготовь КП и договор по утверждённой смете", agent: "Собрал документы из текущей версии сметы и подготовил файлы к отправке.", result: "КП · Договор · КС-2/КС-3" },
};

const categories = [
  ["Материалы", "Цемент · кирпич · арматура · бетон", PackageIcon],
  ["Работы", "Монтаж · отделка · земляные", HammerIcon],
  ["Оборудование", "Краны · бетононасосы · техника", Settings2Icon],
  ["Услуги", "Проект · изыскания · надзор", SearchIcon],
  ["Документы", "КП · договор · КС-2 · КС-3", FileTextIcon],
] as const;

const features = [
  ["Локальные сметы", "Собирайте состав работ и материалов из обычного запроса."],
  ["ФЕР / ТЕР / ГЭСН", "Подключайте нормативную базу и региональные коэффициенты."],
  ["Excel / PDF", "Экспортируйте результат в рабочий документ, а не в текстовый ответ."],
  ["Контрагенты", "Данные заказчиков, подрядчиков и поставщиков рядом с проектом."],
  ["Шаблоны договоров", "Документы формируются из утверждённой версии сметы."],
  ["Сверка с фактом", "Сопоставляйте расчёт и выполненные объёмы по проекту."],
];

const faqItems = [
  ["Чем KolibriAI отличается от обычного чат-бота?", "Он ориентирован не на разговор, а на завершение строительной задачи: собрать исходные данные, рассчитать, сохранить результат и подготовить документы."],
  ["Можно работать без регистрации?", "Да. Демо-режим позволяет попробовать основные сценарии; серверная история и сохранение проектов подключаются после входа."],
  ["Можно получить Excel и PDF?", "Да. Рабочие результаты сметы предназначены для дальнейшего редактирования и экспорта."],
  ["Подходит ли это небольшим подрядчикам?", "Да. Первый сценарий можно начать с одного объекта и одной текстовой задачи без настройки сложной системы."],
  ["Какие тарифы предусмотрены?", "В продукте предусмотрены Free, Pro и Max-сценарии. Финальные лимиты зависят от production-конфигурации."],
];

const pricing = [
  { name: "Бесплатный", month: 0, note: "3 сметы / месяц", items: ["Демо-чат", "Базовые сметы", "Экспорт Excel", "Без команды"] },
  { name: "Pro", month: 2000, note: "для регулярной работы", featured: true, items: ["Безлимитные сметы", "Расширенные справочники", "PDF / DOCX / XLSX", "100 запусков ИИ / день"] },
  { name: "Max", month: 20000, note: "для команды", items: ["До 10 мест", "Приоритетная очередь", "Безлимитный ИИ", "Журнал аудита"] },
] as const;

export function LandingPageProduction() {
  const [navOpen, setNavOpen] = useState(false);
  const [mode, setMode] = useState<HeroMode>("Смета");
  const [demoStep, setDemoStep] = useState(2);
  const [query, setQuery] = useState("");
  const [annual, setAnnual] = useState(false);
  const [faq, setFaq] = useState<number | null>(null);
  const [cookieVisible, setCookieVisible] = useState(false);
  const [lead, setLead] = useState<LeadState>({ status: "idle" });
  const current = heroCopy[mode];

  useEffect(() => {
    setCookieVisible(window.localStorage.getItem("kolibri-cookie-choice") == null);
  }, []);

  const saveCookie = (choice: "accepted" | "rejected") => {
    window.localStorage.setItem("kolibri-cookie-choice", choice);
    setCookieVisible(false);
  };

  const priceLabel = (monthly: number) => monthly === 0 ? "0 ₽" : `${Math.round(monthly * (annual ? 0.83 : 1)).toLocaleString("ru-RU")} ₽`;

  const demoMessages = useMemo(() => [
    { role: "user", text: current.user },
    { role: "agent", text: current.agent, meta: current.result },
    { role: "user", text: mode === "Отчёт" ? "Собери ещё PDF" : "Покажи, что именно вошло в расчёт" },
    { role: "agent", text: mode === "Отчёт" ? "PDF подготовлен и связан с текущей версией проекта." : "Показываю позиции, количества, цены и формулы расчёта.", meta: "готово · версия v3" },
  ], [current, mode]);

  const submitLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setLead({ status: "sending" });
    try {
      const response = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ name: data.get("name"), contact: data.get("contact"), company: data.get("company"), source: "kolibri-landing" }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.lead?.id) throw new Error(result.error?.message || "Не удалось отправить заявку.");
      event.currentTarget.reset();
      setLead({ status: "sent", message: "Заявка принята. Мы свяжемся с вами." });
    } catch (error) {
      setLead({ status: "error", message: error instanceof Error ? error.message : "Не удалось отправить заявку." });
    }
  };

  return (
    <div className="kolibri-landing">
      <header className="kolibri-header">
        <a className="kolibri-logo" href="/" aria-label="KolibriAI"><span><SparklesIcon /></span><strong>KolibriAI</strong></a>
        <nav className={navOpen ? "kolibri-nav is-open" : "kolibri-nav"} aria-label="Основная навигация">
          <a href="#product" onClick={() => setNavOpen(false)}>Продукт</a><a href="#capabilities" onClick={() => setNavOpen(false)}>Возможности</a><a href="#pricing" onClick={() => setNavOpen(false)}>Тарифы</a><a href="#faq" onClick={() => setNavOpen(false)}>FAQ</a>
        </nav>
        <div className="kolibri-header-actions"><a className="kolibri-login" href="/app">Войти</a><a className="kolibri-primary small" href="/app">Попробовать бесплатно <ArrowRightIcon /></a><button className="kolibri-menu" type="button" onClick={() => setNavOpen((value) => !value)} aria-label="Открыть меню" aria-expanded={navOpen}>{navOpen ? <XIcon /> : <MenuIcon />}</button></div>
      </header>

      <main>
        <section className="kolibri-hero" id="product">
          <div className="kolibri-hero-copy"><div className="kolibri-brand-line"><span className="kolibri-live-dot" /> AI-агент для строительных смет</div><h1>Работа со сметой начинается с одного сообщения.</h1><p>{current.description}</p><div className="kolibri-mode-tabs" role="tablist" aria-label="Режимы KolibriAI">{(Object.keys(heroCopy) as HeroMode[]).map((item) => <button key={item} type="button" role="tab" aria-selected={mode === item} className={mode === item ? "active" : ""} onClick={() => { setMode(item); setDemoStep(2); }}>{item}</button>)}</div></div>

          <div className="kolibri-agent-stage">
            <div className="kolibri-agent-bar"><div className="kolibri-agent-name"><span className="kolibri-agent-avatar"><BotIcon /></span><div><strong>Kolibri</strong><small>строительный агент</small></div></div><span className="kolibri-bar-status">готов к задаче</span></div>
            <div className="kolibri-agent-grid">
              <div className="kolibri-chat-demo"><div className="kolibri-demo-messages">{demoMessages.slice(0, demoStep).map((message, index) => <div key={`${message.role}-${index}`} className={message.role === "user" ? "kolibri-demo-message user" : "kolibri-demo-message agent"}>{message.role === "agent" ? <span className="kolibri-agent-mini"><BotIcon /></span> : null}<div><p>{message.text}</p>{"meta" in message && message.meta ? <small>{message.meta}</small> : null}</div></div>)}</div><div className="kolibri-demo-prompts"><button type="button" onClick={() => setDemoStep(2)}>Новая смета</button><button type="button" onClick={() => setDemoStep(4)}>Подготовить документ</button><button type="button" onClick={() => setDemoStep(2)}>Проверить расчёт</button></div><div className="kolibri-demo-composer"><input aria-label="Сообщение KolibriAI" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Напишите строительную задачу…" /><button type="button" aria-label="Отправить" onClick={() => setDemoStep((value) => value === 2 ? 4 : 2)}><SendIcon /></button></div></div>
              <aside className="kolibri-result-panel"><div className="kolibri-result-head"><span>Результат агента</span><b>ГОТОВО</b></div><div className="kolibri-result-main"><strong>{current.result}</strong><span>связанный рабочий результат</span></div><div className="kolibri-result-file"><FileSpreadsheetIcon /><div><strong>Смета проекта</strong><small>позиции · количества · цены · итог</small></div><span>v3</span></div><div className="kolibri-result-file"><FileTextIcon /><div><strong>Документы</strong><small>КП · договор · PDF / DOCX</small></div><span>3</span></div><a className="kolibri-primary result" href="/app">Открыть рабочую область <ArrowRightIcon /></a></aside>
            </div>
          </div>

          <div className="kolibri-hero-actions"><a className="kolibri-primary" href="/app">Попробовать бесплатно <ArrowRightIcon /></a><a className="kolibri-secondary" href="#categories">Открыть демо</a></div>
        </section>

        <section className="kolibri-category-band" id="categories"><div className="kolibri-section-width"><div className="kolibri-band-heading"><span>Один агент</span><strong>Для смет, расчётов и сдачи.</strong></div><div className="kolibri-category-rail">{categories.map(([name, description, Icon]) => <article key={name}><span className="kolibri-category-icon"><Icon /></span><div><strong>{name}</strong><small>{description}</small></div><ArrowRightIcon /></article>)}</div></div></section>

        <section className="kolibri-section" id="capabilities"><div className="kolibri-section-title"><span>Возможности</span><h2>Не просто отвечает. Доводит задачу до результата.</h2><p>Landing показывает реальный продуктовый контур: assistant-ui чат, server-backed history, смету и связанные документы.</p></div><div className="kolibri-feature-grid">{features.map(([title, text], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>

        <section className="kolibri-section" id="documents"><div className="kolibri-two-col"><div><span className="kolibri-kicker">Документы</span><h2>Одна версия сметы — все связанные документы.</h2><p>Результат расчёта остаётся рабочим объектом проекта: можно открыть редактор, проверить позиции и продолжить работу в чате.</p><a className="kolibri-secondary" href="/app">Открыть рабочую область <ArrowRightIcon /></a></div><div className="kolibri-document-stack"><div><FileSpreadsheetIcon /><strong>Локальная смета</strong><small>180 м² · 17 позиций · 289 640 ₽</small></div><div><FileTextIcon /><strong>Коммерческое предложение</strong><small>собрано из утверждённой версии</small></div><div><FileCheck2Icon /><strong>КС-2 / договор</strong><small>связано с проектом</small></div></div></div></section>

        <section className="kolibri-dark-band"><div className="kolibri-section-width kolibri-two-col"><div><span className="kolibri-kicker">Контур агента</span><h2>Задача → данные → расчёт → документ.</h2><p>Это продуктовая последовательность, которую landing должен показывать пользователю с первого экрана.</p></div><div className="kolibri-check-list"><span><CheckIcon /> server-backed history</span><span><CheckIcon /> estimate workflow</span><span><CheckIcon /> PDF / XLSX artifacts</span><span><CheckIcon /> production verification</span></div></div></section>

        <section className="kolibri-section" id="pricing"><div className="kolibri-section-title pricing-title"><div><span>Тарифы</span><h2>Начните с одной реальной сметы.</h2></div><div className="kolibri-billing"><button type="button" className={!annual ? "active" : ""} onClick={() => setAnnual(false)}>Ежемесячно</button><button type="button" className={annual ? "active" : ""} onClick={() => setAnnual(true)}>Ежегодно −17%</button></div></div><div className="kolibri-pricing-grid">{pricing.map((plan) => <article key={plan.name} className={plan.featured ? "featured" : ""}><span className="kolibri-price-name">{plan.name}</span><strong>{priceLabel(plan.month)}</strong><small>{plan.note}</small><a href="/app" className="kolibri-primary pricing">{plan.month === 0 ? "Начать бесплатно" : plan.name === "Pro" ? "Оформить Pro" : "Оформить Max"}<ArrowRightIcon /></a><ul>{plan.items.map((item) => <li key={item}><CheckIcon />{item}</li>)}</ul></article>)}</div></section>

        <section className="kolibri-section kolibri-faq" id="faq"><div className="kolibri-section-title"><span>FAQ</span><h2>Частые вопросы.</h2></div><div>{faqItems.map(([question, answer], index) => <div key={question} className={faq === index ? "open" : ""}><button type="button" onClick={() => setFaq(faq === index ? null : index)} aria-expanded={faq === index}><span>{question}</span><ChevronDownIcon /></button>{faq === index ? <p>{answer}</p> : null}</div>)}</div></section>

        <section className="kolibri-final"><div><span className="kolibri-kicker">KolibriAI</span><h2>Дайте агенту задачу, а не инструкцию.</h2><p>Попробуйте на реальной строительной задаче и продолжите в рабочем пространстве.</p><a href="/app" className="kolibri-primary">Открыть ProSmet <ArrowRightIcon /></a></div><form onSubmit={submitLead} className="kolibri-lead-form"><input name="name" required placeholder="Ваше имя" aria-label="Ваше имя" /><input name="contact" required placeholder="Телефон или Telegram" aria-label="Телефон или Telegram" /><input name="company" placeholder="Компания" aria-label="Компания" /><button type="submit" disabled={lead.status === "sending"}>{lead.status === "sending" ? "Отправляем…" : "Оставить заявку"}</button>{lead.message ? <p className={lead.status}>{lead.message}</p> : null}</form></section>
      </main>

      <footer className="kolibri-footer"><div><a className="kolibri-logo" href="/"><span><SparklesIcon /></span><strong>KolibriAI</strong></a><p>ИИ для строительных смет.</p></div><div><strong>Продукт</strong><a href="#product">Агент</a><a href="#capabilities">Возможности</a><a href="#pricing">Тарифы</a></div><div><strong>Справка</strong><a href="#faq">FAQ</a><a href="/app">Рабочее пространство</a></div><div><strong>Компания</strong><a href="https://t.me/" target="_blank" rel="noreferrer">Telegram</a><button type="button" onClick={() => window.alert("RU / EN")}>RU / EN</button></div></footer>
      {cookieVisible ? <div className="kolibri-cookie" role="dialog" aria-label="Cookie"><div><strong>Мы используем cookies</strong><span>Это помогает сохранять настройки и демо-состояние интерфейса.</span></div><div><button type="button" onClick={() => saveCookie("rejected")}>Отклонить</button><button type="button" onClick={() => saveCookie("accepted")}>Принять</button></div></div> : null}
    </div>
  );
}
