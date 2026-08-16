import { useState, type FormEvent } from "react";
import {
  ArrowRightIcon,
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  FileCheck2Icon,
  FileSpreadsheetIcon,
  FileTextIcon,
  HammerIcon,
  MenuIcon,
  PackageIcon,
  SearchIcon,
  SendIcon,
  Settings2Icon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import "./landing-samreshu-v2.css";

type LeadState = { status: "idle" | "sending" | "sent" | "error"; message?: string };
type Mode = "Смета" | "Расчёт" | "Отчёт";

const heroModes: Record<Mode, { prompt: string; answer: string; result: string }> = {
  Смета: { prompt: "Составь смету на механизированную штукатурку 180 м² в Лениногорске", answer: "Собрал работы, материалы и региональные цены. Показываю позиции, количества и итог.", result: "17 позиций · 289 640 ₽" },
  Расчёт: { prompt: "Посчитай стоимость отделки дома 150 м² по моим объёмам", answer: "Сопоставил объёмы, нормы и материалы. Коэффициенты сохранены в расчёте.", result: "42 позиции · 1 846 200 ₽" },
  Отчёт: { prompt: "Подготовь КП, договор и КС-2 по утверждённой смете", answer: "Документы собраны из текущей версии проекта и связаны с исходными суммами.", result: "КП · договор · КС-2 / КС-3" },
};

const categories = [
  ["Материалы", "Цемент, бетон, кирпич, арматура", PackageIcon],
  ["Работы", "Отделка, монтаж, земляные работы", HammerIcon],
  ["Оборудование", "Краны, техника, механизмы", Settings2Icon],
  ["Справочники", "ФЕР, ТЕР, ГЭСН и ваши позиции", SearchIcon],
  ["Документы", "КП, договоры, КС-2, КС-3", FileTextIcon],
] as const;

const features = [
  ["Локальная смета", "Опишите объект словами — агент собирает состав работ и материалов."],
  ["Региональные цены", "Проверяйте цены и источники по региону, а не только текстовый ответ модели."],
  ["Расчёт и проверка", "Объёмы, коэффициенты и итог остаются прозрачными и редактируемыми."],
  ["Документы", "КП, договор, акт и экспорт строятся из одной утверждённой версии сметы."],
  ["Проекты", "История чатов, сметы, документы и факт объединены в рабочее пространство."],
  ["Автоматизация", "Повторяющиеся действия превращаются в готовые сценарии и задачи."],
];

const pricing = [
  { name: "Бесплатный", price: "0 ₽", note: "3 сметы / месяц", items: ["Демо-чат", "Базовый расчёт", "PDF / XLSX", "Без команды"] },
  { name: "Pro", price: "2 000 ₽", note: "для регулярной работы", featured: true, items: ["Безлимитные сметы", "Расширенные справочники", "PDF / DOCX / XLSX", "100 запусков ИИ / день"] },
  { name: "Max", price: "20 000 ₽", note: "для команды", items: ["До 10 мест", "Приоритетная очередь", "Безлимитный ИИ", "Журнал аудита"] },
] as const;

const faq = [
  ["Можно ли просто написать строительную задачу?", "Да. KolibriAI рассчитан на обычный язык: вы описываете объект и требуемый результат, агент задаёт необходимые уточнения и собирает расчёт."],
  ["Что происходит после расчёта?", "Результат становится рабочей версией проекта: его можно открыть, изменить, экспортировать и продолжить в чате."],
  ["Можно ли работать без регистрации?", "Да. Демо позволяет попробовать основные сценарии; серверное сохранение истории и проектов подключается после входа."],
  ["Есть ли Excel, PDF и DOCX?", "Да. Форматы используются как производные документы из утверждённой версии сметы."],
  ["Можно ли использовать свои позиции?", "Да. Справочник цен и пользовательские позиции — часть рабочего контура."],
];

function DemoMessage({ role, children, meta }: { role: "user" | "agent"; children: string; meta?: string }) {
  return <div className={role === "user" ? "k-demo-message user" : "k-demo-message agent"}>{role === "agent" ? <span className="k-demo-avatar"><BotIcon /></span> : null}<div><p>{children}</p>{meta ? <small>{meta}</small> : null}</div></div>;
}

export function LandingPageProduction() {
  const [mode, setMode] = useState<Mode>("Смета");
  const [menu, setMenu] = useState(false);
  const [demoComplete, setDemoComplete] = useState(false);
  const [annual, setAnnual] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [cookie, setCookie] = useState(true);
  const [lead, setLead] = useState<LeadState>({ status: "idle" });
  const active = heroModes[mode];

  const submitLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setLead({ status: "sending" });
    try {
      const response = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ name: data.get("name"), contact: data.get("contact"), company: data.get("company"), source: "landing-samreshu-v2" }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.lead?.id) throw new Error(body.error?.message || "Не удалось отправить заявку.");
      form.reset();
      setLead({ status: "sent", message: "Заявка принята." });
    } catch (error) {
      setLead({ status: "error", message: error instanceof Error ? error.message : "Не удалось отправить заявку." });
    }
  };

  return (
    <div className="kolibri-landing">
      <header className="kolibri-header">
        <a className="kolibri-logo" href="/" aria-label="KolibriAI"><span><SparklesIcon /></span><strong>KolibriAI</strong></a>
        <nav className={menu ? "kolibri-nav is-open" : "kolibri-nav"}><a href="#work" onClick={() => setMenu(false)}>Продукт</a><a href="#solutions" onClick={() => setMenu(false)}>Решения</a><a href="#pricing" onClick={() => setMenu(false)}>Тарифы</a><a href="#resources" onClick={() => setMenu(false)}>Ресурсы</a></nav>
        <div className="kolibri-header-actions"><a className="kolibri-login" href="/app">Войти</a><a className="kolibri-primary small" href="/app">Попробовать бесплатно <ArrowRightIcon /></a><button className="kolibri-menu" type="button" aria-label="Меню" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>{menu ? <XIcon /> : <MenuIcon />}</button></div>
      </header>

      <main>
        <section className="k-hero" id="work">
          <div className="k-hero-heading"><h1>Один агент на<br />сметы, рутину<br />и разработку</h1><div className="k-hero-copy"><p>KolibriAI понимает строительную задачу обычным языком, сам разбивает её на шаги и доводит до результата — сметы, расчёта, документа или автоматизации.</p><div className="k-hero-actions"><a className="kolibri-primary" href="/app">Попробовать бесплатно <ArrowRightIcon /></a><a className="kolibri-secondary" href="#agent-demo">Посмотреть демо</a></div></div></div>
          <div className="k-hero-stage" id="agent-demo">
            <div className="k-stage-head"><div><span className="k-status" /><strong>Kolibri</strong><small>строительный агент</small></div><span>готов к задаче</span></div>
            <div className="k-stage-body">
              <div className="k-stage-chat"><div className="k-mode-row" role="tablist" aria-label="Сценарии агента">{(Object.keys(heroModes) as Mode[]).map((item) => <button key={item} type="button" role="tab" aria-selected={mode === item} className={mode === item ? "active" : ""} onClick={() => { setMode(item); setDemoComplete(false); }}>{item}</button>)}</div><div className="k-message-stack"><DemoMessage role="user">{active.prompt}</DemoMessage><DemoMessage role="agent" meta={active.result}>{active.answer}</DemoMessage>{demoComplete ? <><DemoMessage role="user">Покажи, что вошло в расчёт</DemoMessage><DemoMessage role="agent" meta="готово · версия v3">Открыл состав работ, материалы, цены, источники и формулы.</DemoMessage></> : null}</div><button type="button" className="k-demo-next" onClick={() => setDemoComplete((v) => !v)}>{demoComplete ? "Свернуть результат" : "Показать следующий шаг"} <ArrowRightIcon /></button><div className="k-demo-input"><span>Напишите строительную задачу…</span><button type="button" aria-label="Отправить" onClick={() => setDemoComplete(true)}><SendIcon /></button></div></div>
              <aside className="k-stage-result"><span className="k-result-label">Результат</span><strong>{active.result}</strong><small>рабочий результат агента</small><div className="k-result-list"><div><FileSpreadsheetIcon /><span><b>Смета проекта</b><small>позиции · объёмы · цены</small></span><em>v3</em></div><div><FileTextIcon /><span><b>Документы</b><small>КП · договор · КС-2</small></span><em>3</em></div><div><FileCheck2Icon /><span><b>Проверка</b><small>источники · формулы · итог</small></span><em>OK</em></div></div><a className="kolibri-secondary result" href="/app">Открыть рабочую область <ArrowRightIcon /></a></aside>
            </div>
          </div>
        </section>

        <section className="k-three-story" id="solutions"><article><span>Работа</span><h2>От задачи до результата.</h2><p>Сметы, документы, сверки и расчёты — прямо в рабочем процессе проекта.</p><div className="k-story-card"><DemoMessage role="user">Составь смету на штукатурку 180 м²</DemoMessage><DemoMessage role="agent" meta="17 позиций · 289 640 ₽">Готово. Работы и материалы собраны.</DemoMessage></div></article><article><span>Рутина</span><h2>Один раз объяснили.</h2><p>Повторяющиеся действия можно превратить в сценарий: цены, отчёты, документы и контроль факта.</p><div className="k-task-list"><div><b>Утренняя сводка по объектам</b><small>Каждый день · 09:00</small></div><div><b>Новые цены материалов</b><small>Каждый день · 03:00</small></div><div><b>Проверка просроченных актов</b><small>Будни · 18:00</small></div></div></article><article><span>Разработка</span><h2>Инструменты, которых не хватает.</h2><p>Боты, интеграции и внутренние сервисы можно описать словами — агент превращает задачу в рабочий инструмент.</p><div className="k-code-card"><div>main ← estimate-flow</div><pre>{`1  POST /api/estimate\n2  calculate(items)\n3  export("xlsx")\n4  notify("telegram")`}</pre><small>правки видны построчно · rollback доступен</small></div></article></section>

        <section className="kolibri-section" id="categories"><div className="kolibri-section-title"><span>Один агент</span><h2>Для смет, расчётов и сдачи.</h2><p>Каждый сценарий заканчивается рабочим объектом, а не сообщением в чате.</p></div><div className="k-category-feed">{categories.map(([name, text, Icon]) => <article key={name}><span className="k-category-icon"><Icon /></span><div><h3>{name}</h3><p>{text}</p></div><ArrowRightIcon /></article>)}</div></section>

        <section className="kolibri-section k-capability-section" id="resources"><div className="kolibri-section-title"><span>Возможности</span><h2>Один рабочий контур вместо десяти разрозненных инструментов.</h2></div><div className="kolibri-feature-grid">{features.map(([title, text], index) => <article key={title}><small>0{index + 1}</small><h3>{title}</h3><p>{text}</p></article>)}</div></section>

        <section className="k-product-section"><div className="k-product-copy"><span>Документы</span><h2>Результат превращается в файлы, которые можно отправить.</h2><p>Утверждённая версия сметы становится источником для КП, договоров, актов и экспортов.</p><a className="kolibri-secondary" href="/app">Открыть документы <ArrowRightIcon /></a></div><div className="k-doc-flow"><div><FileSpreadsheetIcon /><b>Локальная смета</b><small>180 м² · 17 позиций</small></div><div><FileTextIcon /><b>Коммерческое предложение</b><small>из сметы v3</small></div><div><FileCheck2Icon /><b>Договор и акт</b><small>связанные суммы</small></div></div></section>

        <section className="k-product-section k-product-dark"><div className="k-product-copy"><span>Интеграции</span><h2>Подключается к рабочему процессу, а не заменяет его.</h2><p>Таблицы, документы, Telegram, API и будущие коннекторы можно строить вокруг единой версии проекта.</p></div><div className="k-integration-list"><div>1С <small>финансы и первичка</small></div><div>МойСклад <small>материалы и остатки</small></div><div>Telegram <small>уведомления и задачи</small></div><div>API <small>свои системы</small></div></div></section>

        <section className="kolibri-section" id="pricing"><div className="kolibri-section-title pricing-title"><div><span>Тарифы</span><h2>Начните с первой задачи.</h2></div><div className="kolibri-billing"><button type="button" className={!annual ? "active" : ""} onClick={() => setAnnual(false)}>Ежемесячно</button><button type="button" className={annual ? "active" : ""} onClick={() => setAnnual(true)}>Ежегодно −17%</button></div></div><div className="kolibri-pricing-grid">{pricing.map((plan) => { const numeric = Number(plan.price.replace(/\D/g, "")); const display = numeric === 0 ? "0 ₽" : `${annual ? Math.round(numeric * .83).toLocaleString("ru-RU") : numeric.toLocaleString("ru-RU")} ₽`; return <article className={plan.featured ? "featured" : ""} key={plan.name}><span className="kolibri-price-name">{plan.name}</span><strong>{display}</strong><small>{plan.note}</small><a className="kolibri-primary pricing" href="/app">Начать <ArrowRightIcon /></a><ul>{plan.items.map((item) => <li key={item}><CheckIcon />{item}</li>)}</ul></article>; })}</div></section>

        <section className="kolibri-section k-faq-section" id="faq"><div className="kolibri-section-title"><span>FAQ</span><h2>Частые вопросы.</h2></div><div className="k-faq-list">{faq.map(([question, answer], index) => <div key={question} className={faqOpen === index ? "open" : ""}><button type="button" onClick={() => setFaqOpen((v) => v === index ? null : index)}><span>{question}</span><ChevronDownIcon /></button>{faqOpen === index ? <p>{answer}</p> : null}</div>)}</div></section>

        <section className="k-final"><div><span>KolibriAI</span><h2>Дайте агенту реальную строительную задачу.</h2><p>Первый результат можно получить без сложной настройки.</p><a className="kolibri-primary" href="/app">Открыть ProSmet <ArrowRightIcon /></a></div><form className="k-lead-form" onSubmit={submitLead}><input name="name" aria-label="Имя" placeholder="Ваше имя" required /><input name="contact" aria-label="Телефон или Telegram" placeholder="Телефон или Telegram" required /><input name="company" aria-label="Компания" placeholder="Компания" /><button type="submit" disabled={lead.status === "sending"}>{lead.status === "sending" ? "Отправляем…" : "Записаться на демо"}</button>{lead.message ? <p className={lead.status === "sent" ? "sent" : "error"}>{lead.message}</p> : null}</form></section>
      </main>

      <footer className="kolibri-footer"><a className="kolibri-logo" href="/" aria-label="KolibriAI"><span><SparklesIcon /></span><strong>KolibriAI</strong></a><div><a href="#work">Продукт</a><a href="#pricing">Тарифы</a><a href="#faq">FAQ</a></div><small>© 2026 KolibriAI</small></footer>
      {cookie ? <div className="k-cookie"><div><strong>Cookies</strong><span>Используем cookies для работы и аналитики сайта.</span></div><div><button type="button" onClick={() => setCookie(false)}>Отклонить</button><button type="button" onClick={() => setCookie(false)}>Принять</button></div></div> : null}
    </div>
  );
}