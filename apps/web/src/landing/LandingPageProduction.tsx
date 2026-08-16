import { useState, type FormEvent } from "react";
import {
  ArrowRightIcon,
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  FileCheck2Icon,
  FileSpreadsheetIcon,
  FileTextIcon,
  MenuIcon,
  PackageCheckIcon,
  PlugIcon,
  SendIcon,
  SparklesIcon,
  WorkflowIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import "./landing-samreshu.css";

type LeadState = { status: "idle" | "sending" | "sent" | "error"; message?: string };
type ResultItem = readonly [LucideIcon, string, string, string];
type Plan = {
  name: string;
  price: string;
  note: string;
  featured?: boolean;
  items: readonly string[];
};

const messages = [
  { role: "user", text: "Составь смету на штукатурку стен 180 м² в Лениногорске", meta: "" },
  { role: "agent", text: "Готово. Собрал состав работ, материалы и цены по региону.", meta: "180 м² · Лениногорск · 17 позиций" },
  { role: "user", text: "Подготовь коммерческое предложение и договор", meta: "" },
  { role: "agent", text: "Сделано: документы собраны из утверждённой версии сметы.", meta: "КП · DOCX · договор" },
] as const;

const scenarios = [
  { title: "Сметы", text: "Собирайте объёмы, материалы, цены и итог из одного запроса.", example: "Сделай смету на механизированную штукатурку 180 м²", icon: FileSpreadsheetIcon },
  { title: "Документы", text: "КП, договор, счёт, акт и КС-2/КС-3 строятся из утверждённой сметы.", example: "Подготовь КП и договор по этой версии", icon: FileTextIcon },
  { title: "Исполнение", text: "Сохраняйте версии, контролируйте фактические объёмы и движение проекта.", example: "Покажи, что уже выполнено по объекту", icon: WorkflowIcon },
] as const;

const integrations = [
  ["1С", "финансы и документы"],
  ["CRM", "клиенты и сделки"],
  ["МойСклад", "материалы и остатки"],
  ["Telegram", "уведомления команде"],
  ["XLSX / PDF", "готовые документы"],
  ["API", "свои системы"],
] as const;

const resultItems: readonly ResultItem[] = [
  [FileSpreadsheetIcon, "Смета на штукатурку", "180 м² · Лениногорск", "17 позиций"],
  [FileTextIcon, "Коммерческое предложение", "из утверждённой сметы", "DOCX"],
  [FileCheck2Icon, "Договор", "суммы связаны", "DOCX"],
];

const plans: readonly Plan[] = [
  { name: "Бесплатный", price: "0 ₽", note: "для знакомства", items: ["Чат с ProSmet", "Базовые сметы", "Документы из расчёта", "PDF / XLSX"] },
  { name: "Pro", price: "2 490 ₽", note: "для регулярной работы", featured: true, items: ["Рабочая история", "Проекты и ревизии", "Расширенные документы", "Региональные источники цен"] },
  { name: "Команда", price: "7 499 ₽", note: "единое пространство", items: ["Командный доступ", "Общие проекты", "Интеграции", "Согласование"] },
];

export function LandingPageProduction() {
  const [navOpen, setNavOpen] = useState(false);
  const [demoStep, setDemoStep] = useState(2);
  const [query, setQuery] = useState("");
  const [faq, setFaq] = useState<number | null>(null);
  const [lead, setLead] = useState<LeadState>({ status: "idle" });

  const submitLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setLead({ status: "sending" });
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name: data.get("name"), contact: data.get("contact"), company: data.get("company"), website: data.get("website"), source: "landing" }),
      });
      const result = (await response.json().catch(() => ({}))) as { lead?: { id?: string }; error?: { message?: string } };
      if (!response.ok || !result.lead?.id) throw new Error(result.error?.message || "Не удалось отправить заявку.");
      form.reset();
      setLead({ status: "sent", message: "Заявка принята. Мы свяжемся с вами." });
    } catch (error) {
      setLead({ status: "error", message: error instanceof Error ? error.message : "Не удалось отправить заявку." });
    }
  };

  return (
    <div className="sam-home">
      <header className="sam-header">
        <a className="sam-logo" href="/landing" aria-label="ProSmet"><span><SparklesIcon /></span><strong>ProSmet</strong></a>
        <nav className={navOpen ? "sam-nav is-open" : "sam-nav"}>
          <a href="#work" onClick={() => setNavOpen(false)}>Работа</a>
          <a href="#documents" onClick={() => setNavOpen(false)}>Документы</a>
          <a href="#integrations" onClick={() => setNavOpen(false)}>Интеграции</a>
          <a href="#pricing" onClick={() => setNavOpen(false)}>Тарифы</a>
          <a href="#security" onClick={() => setNavOpen(false)}>Безопасность</a>
        </nav>
        <div className="sam-header-actions"><a className="sam-login" href="/app">Войти</a><a className="sam-cta" href="/app">Попробовать бесплатно <ArrowRightIcon /></a><button className="sam-menu" type="button" onClick={() => setNavOpen((v) => !v)} aria-expanded={navOpen} aria-label="Меню">{navOpen ? <XIcon /> : <MenuIcon />}</button></div>
      </header>

      <main>
        <section className="sam-hero">
          <div className="sam-hero-copy">
            <span className="sam-kicker"><SparklesIcon /> AI для строительной работы</span>
            <h1>Один агент — для смет, документов и всего между ними.</h1>
            <p>Вы пишете задачу обычным языком. ProSmet собирает исходные данные, считает, сохраняет результат и доводит его до готового документа.</p>
            <div className="sam-hero-actions"><a className="sam-primary" href="/app">Попробовать бесплатно <ArrowRightIcon /></a><a className="sam-secondary" href="#demo">Посмотреть демо</a></div>
          </div>

          <div className="sam-command-card" id="demo">
            <div className="sam-command-head"><div className="sam-agent-title"><span className="sam-status-dot" /><strong>ProSmet</strong><small>строительный агент</small></div><span className="sam-head-meta">рабочий режим</span></div>
            <div className="sam-command-body">
              <div className="sam-chat-column">
                <div className="sam-thread">
                  {messages.slice(0, demoStep).map((message, index) => <div className={message.role === "user" ? "sam-message user" : "sam-message agent"} key={`${message.role}-${index}`}>{message.role === "agent" ? <div className="sam-message-icon"><BotIcon /></div> : null}<div className="sam-message-copy"><span>{message.text}</span>{message.meta ? <small>{message.meta}</small> : null}</div></div>)}
                </div>
                <div className="sam-task-suggestions"><button type="button" onClick={() => setDemoStep(2)}>Создать смету</button><button type="button" onClick={() => setDemoStep(4)}>Подготовить документы</button><button type="button" onClick={() => setDemoStep(2)}>Открыть проект</button></div>
                <div className="sam-composer"><input aria-label="Задача для ProSmet" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Что сделать? Например: составь смету на 180 м²" /><button type="button" onClick={() => setDemoStep((v) => v === 2 ? 4 : 2)} aria-label="Отправить"><SendIcon /></button></div>
              </div>
              <aside className="sam-result-column">
                <div className="sam-result-top"><span>Результат</span><span className="sam-result-tag">ГОТОВО</span></div>
                {resultItems.map(([Icon, title, text, tag]) => <div className="sam-result-card" key={title}><div className="sam-result-icon"><Icon /></div><div><strong>{title}</strong><small>{text}</small></div><span>{tag}</span></div>)}
                <div className="sam-result-summary"><span>Предварительный итог</span><strong>289 640 ₽</strong><small>работы + материалы + расчётный запас</small></div>
              </aside>
            </div>
          </div>
        </section>

        <section className="sam-problem-band"><div><span>Работа</span><strong>От задачи до результата.</strong><p>ProSmet считает, сохраняет и связывает результат с проектом.</p></div><div><span>Рутина</span><strong>Один раз объяснили.</strong><p>Повторяющиеся действия превращаются в готовые сценарии.</p></div><div><span>Разработка</span><strong>Инструменты вокруг сметы.</strong><p>Интеграции и автоматизация строятся вокруг вашего процесса.</p></div></section>

        <section className="sam-section" id="work"><div className="sam-section-heading"><span>Работа</span><h2>Один агент для строительных задач.</h2><p>Не чат ради чата. Каждая задача заканчивается структурированным результатом.</p></div><div className="sam-scenario-grid">{scenarios.map((item) => <article className="sam-scenario" key={item.title}><div className="sam-scenario-icon"><item.icon /></div><h3>{item.title}</h3><p>{item.text}</p><div className="sam-scenario-example">{item.example}</div><a href="/app">Открыть ProSmet <ArrowRightIcon /></a></article>)}</div></section>

        <section className="sam-section sam-section-tight" id="documents"><div className="sam-showcase"><div className="sam-showcase-copy"><span>Документы</span><h2>Счета, КП и акты — из одной версии сметы.</h2><p>Меняете исходные данные один раз. Производные документы остаются связанными с актуальной версией.</p><a className="sam-secondary" href="/app">Открыть рабочую область <ArrowRightIcon /></a></div><div className="sam-doc-stack"><div><span><FileTextIcon /> КП</span><strong>Штукатурка стен — Лениногорск</strong><small>итог 289 640 ₽</small></div><div><span><FileCheck2Icon /> Договор</span><strong>Подряд на отделочные работы</strong><small>смета v3</small></div><div><span><PackageCheckIcon /> Акт</span><strong>Фактическое выполнение</strong><small>объёмы из проекта</small></div></div></div></section>

        <section className="sam-section" id="integrations"><div className="sam-section-heading"><span>Интеграции</span><h2>Оставьте ProSmet внутри вашего рабочего процесса.</h2><p>Результат можно передавать в документы, таблицы, уведомления и ваши системы.</p></div><div className="sam-integration-grid">{integrations.map(([name, text]) => <div key={name}><div><PlugIcon /></div><strong>{name}</strong><span>{text}</span></div>)}</div></section>

        <section className="sam-security" id="security"><div><span>Безопасность</span><h2>Данные проекта остаются под контролем.</h2><p>История чатов разделена по пользователям, server persistence использует SQLite, а production проверяет health и acceptance после релиза.</p></div><div className="sam-security-checks"><span><CheckIcon /> user-scoped history</span><span><CheckIcon /> server persistence</span><span><CheckIcon /> release verification</span><span><CheckIcon /> PDF / XLSX</span></div></section>

        <section className="sam-section" id="pricing"><div className="sam-section-heading"><span>Тарифы</span><h2>Начните с реальной задачи.</h2><p>Откройте чат, дайте исходные данные и получите первый результат.</p></div><div className="sam-pricing-grid">{plans.map((plan) => <article className={plan.featured ? "sam-price featured" : "sam-price"} key={plan.name}><span className="sam-price-name">{plan.name}</span><strong>{plan.price}</strong><small>{plan.note}</small><a href="/app">Попробовать <ArrowRightIcon /></a><ul>{plan.items.map((item) => <li key={item}><CheckIcon />{item}</li>)}</ul></article>)}</div></section>

        <section className="sam-faq-section"><div className="sam-section-heading"><span>FAQ</span><h2>Частые вопросы.</h2></div><div className="sam-faq">{[["Можно ли просто написать задачу текстом","Да. ProSmet рассчитан на обычный язык."],["Что будет после расчёта","Смета становится рабочей версией проекта."],["Можно ли работать с телефона","Да. Для mobile есть отдельная композиция."],["Сохраняется ли история","Для авторизованного пользователя история хранится на сервере."]].map(([question, answer], index) => <div className={faq === index ? "sam-faq-item open" : "sam-faq-item"} key={question}><button type="button" onClick={() => setFaq((value) => value === index ? null : index)}><span>{question}</span><ChevronDownIcon /></button>{faq === index ? <p>{answer}</p> : null}</div>)}</div></section>

        <section className="sam-final-cta"><div><span>ProSmet</span><h2>Дайте агенту одну настоящую задачу.</h2><p>Пусть он соберёт смету, документ или рабочий сценарий прямо сейчас.</p><a className="sam-primary" href="/app">Открыть ProSmet <ArrowRightIcon /></a></div><form onSubmit={submitLead} className="sam-lead-form"><input name="name" placeholder="Имя" required /><input name="contact" placeholder="Телефон или Telegram" required /><input name="company" placeholder="Компания" /><input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="sam-honeypot" /><button type="submit" disabled={lead.status === "sending"}>{lead.status === "sending" ? "Отправляем…" : "Записаться на демо"}</button>{lead.message ? <p className={lead.status === "error" ? "error" : "success"}>{lead.message}</p> : null}</form></section>
      </main>

      <footer className="sam-footer"><a href="/landing" className="sam-logo"><span><SparklesIcon /></span><strong>ProSmet</strong></a><div><a href="/app">Приложение</a><a href="#pricing">Тарифы</a><a href="#security">Безопасность</a></div><small>AI workspace для строительных смет и документов</small></footer>
    </div>
  );
}
