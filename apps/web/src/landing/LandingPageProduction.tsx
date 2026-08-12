import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowRightIcon,
  BarChart3Icon,
  BotIcon,
  CalculatorIcon,
  CheckIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  FileCheck2Icon,
  FileSpreadsheetIcon,
  FileTextIcon,
  HistoryIcon,
  MenuIcon,
  MapPinIcon,
  MessageSquareTextIcon,
  PackageCheckIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import "./landing-v3.css";

type DemoStage = "idle" | "thinking" | "ready";
type LeadState = { status: "idle" | "sending" | "sent" | "error"; message?: string };
type Icon = LucideIcon;

type EstimateLine = {
  name: string;
  kind: string;
  quantity: number;
  unit: string;
  price: number;
  source: string;
};

const estimateLines: readonly EstimateLine[] = [
  { name: "Подготовка поверхности", kind: "работа", quantity: 180, unit: "м²", price: 280, source: "пример" },
  { name: "Механизированная штукатурка Knauf MP-Start", kind: "работа", quantity: 180, unit: "м²", price: 500, source: "пример" },
  { name: "Грунтование", kind: "работа", quantity: 180, unit: "м²", price: 95, source: "пример" },
  { name: "Откосы", kind: "работа", quantity: 24, unit: "м.п.", price: 800, source: "пример" },
  { name: "Knauf MP-Start", kind: "материал", quantity: 66, unit: "меш.", price: 415, source: "пример" },
];

const quickTasks = [
  { title: "Составить смету", description: "180 м² · Лениногорск", icon: ClipboardListIcon },
  { title: "Рассчитать материалы", description: "расход + 10% запаса", icon: PackageCheckIcon },
  { title: "Проверить цены", description: "регион + источник", icon: BarChart3Icon },
  { title: "Подготовить документы", description: "КП · договор · акт", icon: FileTextIcon },
] as const;

const workflow = [
  ["01", "Опишите задачу", "Объект, площадь, город и желаемый результат — обычным языком."],
  ["02", "Агент собирает контекст", "Определяет недостающие данные, состав работ и порядок расчёта."],
  ["03", "Расчёт становится структурой", "Единицы, объёмы, расход, цены, НДС и округление проверяются детерминированно."],
  ["04", "Вы утверждаете версию", "Изменения сохраняются как ревизии, а цифры остаются связанными."],
  ["05", "Документы строятся из сметы", "КП, договор, счёт, акт, PDF, XLSX, КС-2 и КС-3 используют одну утверждённую версию."],
] as const;

const faq = [
  ["Можно ли просто написать задачу текстом?", "Да. ProSmet рассчитан на обычный язык. Агент определяет необходимые данные и задаёт уточняющие вопросы только там, где без них нельзя корректно посчитать."],
  ["Как проверять цену?", "Цена показывается вместе с единицей, регионом, датой наблюдения и источником. В демо ниже используются данные примера и это явно обозначено."],
  ["Что будет, если поменять площадь?", "Связанные количества и итог пересчитываются. Утверждённые версии можно сохранять и сравнивать по ревизиям."],
  ["Какие документы получаются из одной сметы?", "Коммерческое предложение, договор, счёт, акт, PDF, XLSX, КС-2 и КС-3 — как производные от утверждённой версии расчёта."],
  ["Можно ли работать с телефона?", "Да. Mobile-композиция построена вокруг composer и ключевых действий; desktop даёт больше пространства для таблиц и документов."],
] as const;

function money(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

export function LandingPageProduction() {
  const [navOpen, setNavOpen] = useState(false);
  const [prompt, setPrompt] = useState("Составь смету на штукатурку стен 180 м² в Лениногорске");
  const [demoStage, setDemoStage] = useState<DemoStage>("ready");
  const [faqOpen, setFaqOpen] = useState(-1);
  const [lead, setLead] = useState<LeadState>({ status: "idle" });

  const total = useMemo(
    () => estimateLines.reduce((sum, line) => sum + line.quantity * line.price, 0),
    [],
  );

  const startDemo = () => {
    setDemoStage("thinking");
    window.setTimeout(() => setDemoStage("ready"), 1100);
  };

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
        body: JSON.stringify({
          name: data.get("name"),
          contact: data.get("contact"),
          company: data.get("company"),
          website: data.get("website"),
          source: "landing",
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        lead?: { id?: string };
        error?: { message?: string };
      };
      if (!response.ok || !result.lead?.id) {
        throw new Error(result.error?.message || "Не удалось отправить заявку.");
      }
      form.reset();
      setLead({ status: "sent", message: "Заявка принята. Мы свяжемся с вами для демонстрации." });
    } catch (error) {
      setLead({
        status: "error",
        message: error instanceof Error ? error.message : "Не удалось отправить заявку.",
      });
    }
  };

  const closeNav = () => setNavOpen(false);

  return (
    <div className="lp3">
      <header className="lp3-nav">
        <a className="lp3-brand" href="/landing" aria-label="ProSmet — главная">
          <span><SparklesIcon aria-hidden="true" /></span>
          <strong>ProSmet</strong>
        </a>
        <nav className={navOpen ? "is-open" : ""} aria-label="Основная навигация">
          <a href="#product" onClick={closeNav}>Продукт</a>
          <a href="#demo" onClick={closeNav}>Демо</a>
          <a href="#workflow" onClick={closeNav}>Как работает</a>
          <a href="#documents" onClick={closeNav}>Документы</a>
          <a href="#faq" onClick={closeNav}>FAQ</a>
        </nav>
        <div className="lp3-nav-actions">
          <a className="lp3-login" href="/app">Войти</a>
          <a className="lp3-nav-cta" href="/app">Открыть ProSmet <ArrowRightIcon aria-hidden="true" /></a>
          <button
            className="lp3-menu"
            type="button"
            aria-label={navOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((value) => !value)}
          >
            {navOpen ? <XIcon aria-hidden="true" /> : <MenuIcon aria-hidden="true" />}
          </button>
        </div>
      </header>

      <main>
        <section className="lp3-hero" aria-labelledby="hero-title">
          <div className="lp3-hero-copy">
            <div className="lp3-eyebrow"><SparklesIcon aria-hidden="true" /> AI-сметчик для строительства</div>
            <h1 id="hero-title">От запроса до <span>готового документа.</span></h1>
            <p>ProSmet понимает задачу обычным языком, считает объёмы, связывает материалы с ценами и превращает результат в проверяемую смету — без ручного переноса цифр.</p>
            <div className="lp3-hero-actions"><a className="lp3-btn lp3-btn-dark" href="/app">Составить первую смету <ArrowRightIcon aria-hidden="true" /></a><a className="lp3-btn lp3-btn-quiet" href="#demo">Посмотреть, как это работает</a></div>
            <div className="lp3-proof-row"><span><CheckIcon aria-hidden="true" /> обычный язык</span><span><CheckIcon aria-hidden="true" /> региональные цены</span><span><CheckIcon aria-hidden="true" /> PDF / XLSX</span></div>
          </div>

          <div className="lp3-product-stage" id="demo">
            <div className="lp3-stage-topline"><div><span className="lp3-stage-dot" /><b>Живой сценарий</b><small>пример интерфейса ProSmet</small></div><span className="lp3-demo-badge">ДЕМО-ДАННЫЕ</span></div>
            <div className="lp3-stage-grid">
              <section className="lp3-agent-pane" aria-label="Диалог с агентом">
                <div className="lp3-pane-head"><div className="lp3-agent-avatar"><BotIcon aria-hidden="true" /></div><div><strong>ProSmet AI</strong><small>строительный агент</small></div><span className="lp3-live" style={{ color: "#137a53" }}>готов</span></div>
                <div className="lp3-chat-body">
                  <div className="lp3-user-bubble">{prompt}</div>
                  {demoStage === "thinking" ? <div className="lp3-thinking" role="status" aria-live="polite"><span className="lp3-thinking-dots"><i /><i /><i /></span><span>Разбираю состав работ, объёмы и цены…</span></div> : <div className="lp3-agent-answer"><div className="lp3-answer-label"><SparklesIcon aria-hidden="true" /> Результат агента</div><h2>Смета на штукатурные работы готова</h2><p>180 м² · Лениногорск · материалы рассчитаны · источники цены отмечены.</p><div className="lp3-answer-checks"><span><CheckIcon aria-hidden="true" /> объёмы</span><span><CheckIcon aria-hidden="true" /> материалы</span><span><CheckIcon aria-hidden="true" /> цены</span></div><div className="lp3-answer-actions"><a href="/app">Открыть смету</a><button type="button" onClick={() => setPrompt("Покажи источники цен и дату наблюдения")}>Показать источники</button></div></div>}
                </div>
                <form className="lp3-composer" onSubmit={(event) => { event.preventDefault(); startDemo(); }}><label htmlFor="landing-demo-prompt">Запрос для агента</label><textarea id="landing-demo-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} /><button type="submit" aria-label="Запустить запрос" disabled={demoStage === "thinking"}>{demoStage === "thinking" ? <RefreshCwIcon aria-hidden="true" /> : <ArrowRightIcon aria-hidden="true" />}</button></form>
              </section>

              <section className="lp3-estimate-pane" aria-label="Предварительная смета">
                <div className="lp3-estimate-head"><div><span>СМЕТА · ПРИМЕР</span><h2>Штукатурка стен</h2><p><MapPinIcon aria-hidden="true" /> Лениногорск · 180 м²</p></div><span className="lp3-draft">Черновик</span></div>
                <div className="lp3-estimate-meta"><span><b>Регион</b> Лениногорск</span><span><b>Материалы</b> Knauf MP-Start</span><span><b>Единица</b> м² / м.п.</span></div>
                <div className="lp3-table" role="table" aria-label="Позиции демонстрационной сметы">
                  <div className="lp3-row lp3-row-head" role="row">
                    <span role="columnheader">Позиция</span>
                    <span role="columnheader">Кол.</span>
                    <span role="columnheader">Цена</span>
                    <span role="columnheader">Сумма</span>
                  </div>
                  {estimateLines.map((line) => (
                    <div className="lp3-row" role="row" key={line.name}>
                      <span role="cell"><b>{line.name}</b><small>{line.kind} · {line.source}</small></span>
                      <em role="cell">{line.quantity} {line.unit}</em>
                      <em role="cell">{money(line.price)}</em>
                      <strong role="cell">{money(line.quantity * line.price)}</strong>
                    </div>
                  ))}
                </div>
                <div className="lp3-estimate-source"><ShieldCheckIcon aria-hidden="true" /><span><b>Проверяемость:</b> в реальном расчёте цена хранится вместе с источником и датой наблюдения.</span></div><footer><span>Предварительный итог</span><strong>{money(total)}</strong></footer>
              </section>
            </div>
          </div>
        </section>

        <section className="lp3-metrics" aria-label="Ценность продукта"><div><strong>1</strong><span>утверждённая версия<br />сметы как источник истины</span></div><div><strong>7+</strong><span>производных документов<br />из одного расчёта</span></div><div><strong>0</strong><span>ручных переносов<br />между связанными позициями</span></div><div><strong>∞</strong><span>ревизий и вариантов<br />без потери истории</span></div></section>

        <section className="lp3-section" id="product"><div className="lp3-section-intro"><div><span>01 · PRODUCT</span><h2>Смета — это не таблица.<br /><em>Это рабочая система.</em></h2></div><p>ProSmet собирает расчёт, контекст, материалы, цены и документы вокруг одной версии результата. Поэтому изменение не превращается в новый ручной проект.</p></div><div className="lp3-feature-grid">{[[CalculatorIcon,"Сметы и расчёты","Работы, материалы, объёмы, оборудование, доставка и итог в одной структуре."],[PackageCheckIcon,"Материалы и расход","Автоматически считает потребность, единицы и запас, а связи сохраняются."],[RefreshCwIcon,"Автопересчёт","Изменили площадь, количество или цену — связанные значения обновляются."],[HistoryIcon,"Ревизии","Каждая утверждённая версия остаётся частью истории объекта."],[FileCheck2Icon,"Документы","КП, договор, счёт, акт, PDF, XLSX, КС-2 и КС-3 из одной версии."],[ShieldCheckIcon,"Проверяемость","Регион, единица, дата и источник цены видны рядом с расчётом."]].map(([FeatureIcon,title,description]) => { const Component=FeatureIcon as Icon; return <article className="lp3-feature" key={String(title)}><span><Component aria-hidden="true" /></span><h3>{title as string}</h3><p>{description as string}</p><a href="/app">Открыть в ProSmet <ArrowRightIcon aria-hidden="true" /></a></article>; })}</div></section>

        <section className="lp3-section lp3-agent-section"><div className="lp3-agent-copy"><span>02 · AI-АГЕНТ</span><h2>Не изучайте интерфейс.<br />Ставьте задачу.</h2><p>Вместо длинного меню пользователь пишет, что ему нужно получить. Агент выбирает следующий шаг, собирает контекст и возвращает структуру результата.</p><a className="lp3-inline-link" href="/app">Поставить задачу <ArrowRightIcon aria-hidden="true" /></a></div><div className="lp3-task-list" aria-label="Примеры задач">{quickTasks.map(({title,description,icon:TaskIcon}) => <a key={title} href="/app"><span><TaskIcon aria-hidden="true" /></span><div><strong>{title}</strong><small>{description}</small></div><ArrowRightIcon aria-hidden="true" /></a>)}</div></section>

        <section className="lp3-section lp3-source-section"><div className="lp3-section-intro"><div><span>03 · ЦЕНЫ</span><h2>Цена без источника<br /><em>не считается доказанной.</em></h2></div><p>В продакшн-расчёте источник должен быть частью данных, а не сноской в конце документа. Демо ниже показывает сам принцип.</p></div><div className="lp3-source-card"><div className="lp3-source-map"><div className="lp3-map-grid" /><span><MapPinIcon aria-hidden="true" /></span><strong>Лениногорск</strong><small>Республика Татарстан</small></div><div className="lp3-source-list">{[["Knauf MP-Start","мешок 30 кг","415 ₽"],["Механизированная штукатурка","м² · работа","500 ₽"],["Откосы","м.п. · работа","800 ₽"]].map(([name,unit,value]) => <div key={name}><span><strong>{name}</strong><small>{unit}</small></span><b>{value}</b><i>пример</i></div>)}<div className="lp3-source-foot"><ShieldCheckIcon aria-hidden="true" /><span>В реальном источнике: <b>регион</b> · <b>единица</b> · <b>дата наблюдения</b> · <b>URL / идентификатор</b>.</span></div></div></div></section>

        <section className="lp3-section" id="workflow"><div className="lp3-section-intro"><div><span>04 · WORKFLOW</span><h2>От сообщения<br />до результата.</h2></div><p>Каждый шаг делает понятным, что именно произошло и что можно изменить до утверждения итоговой версии.</p></div><div className="lp3-workflow">{workflow.map(([number,title,description]) => <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div><CheckIcon aria-hidden="true" /></article>)}</div></section>

        <section className="lp3-section lp3-doc-section" id="documents"><div className="lp3-doc-copy"><span style={{ color: "var(--p3-blue)" }}>05 · ДОКУМЕНТЫ</span><h2>Одна смета.<br />Весь пакет.</h2><p>Утверждённая версия становится источником для коммерческих и исполнительных документов. Не копируйте цифры вручную в соседнюю программу.</p><a className="lp3-btn lp3-btn-dark" href="/app">Создать документ <ArrowRightIcon aria-hidden="true" /></a></div><div className="lp3-doc-pipeline">{[["Смета","утверждённая версия",ClipboardListIcon],["КП","коммерческое предложение",FileTextIcon],["Договор","условия и реквизиты",FileCheck2Icon],["Счёт","суммы и позиции",FileSpreadsheetIcon],["Акт","исполнительный документ",FileTextIcon],["PDF / XLSX","экспорт результата",FileSpreadsheetIcon],["КС-2 / КС-3","из той же версии",FileCheck2Icon]].map(([title,subtitle,DocIcon]) => { const Component=DocIcon as Icon; return <div key={String(title)}><span><Component aria-hidden="true" /></span><div><strong>{title as string}</strong><small>{subtitle as string}</small></div><ArrowRightIcon aria-hidden="true" /></div>; })}</div></section>

        <section className="lp3-section lp3-mobile-section"><div><span style={{ color: "var(--p3-blue)" }}>06 · MOBILE + DESKTOP</span><h2>Один продукт.<br /><em>Две сильные композиции.</em></h2><p>На телефоне главный объект — задача и composer. На desktop — расчёт, таблица и документы. Мы не уменьшаем desktop до ширины телефона.</p><ul><li><CheckIcon aria-hidden="true" /> touch-friendly действия</li><li><CheckIcon aria-hidden="true" /> быстрый composer</li><li><CheckIcon aria-hidden="true" /> отдельный desktop canvas</li></ul></div><div className="lp3-device"><div className="lp3-phone"><header><strong>ProSmet</strong><span>•••</span></header><div><small>AI-СМЕТЧИК</small><h3>Что нужно<br />рассчитать?</h3><button type="button">Составить смету <ArrowRightIcon aria-hidden="true" /></button><button type="button">Проверить цены <ArrowRightIcon aria-hidden="true" /></button><button type="button">Подготовить документы <ArrowRightIcon aria-hidden="true" /></button></div><footer><MessageSquareTextIcon aria-hidden="true" /> Что нужно сделать?</footer></div></div></section>

        <section className="lp3-section lp3-cta-section" id="pricing"><div className="lp3-cta-card"><div><span>07 · START</span><h2>Первый результат<br />важнее длинного демо.</h2><p>Откройте ProSmet и попробуйте на своей задаче. Начать можно с обычного сообщения.</p></div><div className="lp3-cta-actions"><a className="lp3-btn lp3-btn-light" href="/app">Открыть ProSmet <ArrowRightIcon aria-hidden="true" /></a><a className="lp3-text-link" href="#lead">Запросить демонстрацию</a></div></div></section>

        <section className="lp3-section lp3-lead-section" id="lead"><div className="lp3-lead-copy"><span style={{ color: "var(--p3-blue)" }}>DEMO</span><h2>Покажем ProSmet<br />на вашей задаче.</h2><p>Оставьте контакт — демонстрацию можно построить вокруг реального объекта, а не абстрактного слайда.</p><div className="lp3-lead-note"><ShieldCheckIcon aria-hidden="true" /><span>Форма использует существующий endpoint заявки. Новых backend/API изменений для landing не требуется.</span></div></div><form className="lp3-lead-form" onSubmit={submitLead} noValidate><label>Имя<input name="name" autoComplete="name" required placeholder="Ваше имя" /></label><label>Телефон или email<input name="contact" autoComplete="email" required placeholder="+7 ... / name@company.ru" /></label><label>Компания <span>необязательно</span><input name="company" autoComplete="organization" placeholder="Компания" /></label><input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="lp3-honeypot" /><button className="lp3-btn lp3-btn-dark" type="submit" disabled={lead.status === "sending"}>{lead.status === "sending" ? "Отправляем…" : "Запросить демонстрацию"}<ArrowRightIcon aria-hidden="true" /></button><div className={lead.status === "error" ? "lp3-form-message error" : "lp3-form-message"} role="status" aria-live="polite">{lead.message}</div></form></section>

        <section className="lp3-section lp3-faq" id="faq"><div className="lp3-section-intro"><div><span>08 · FAQ</span><h2>Частые вопросы.</h2></div><p>Коротко о том, как устроен сценарий продукта и где заканчивается демо-данные.</p></div><div>{faq.map(([question,answer],index) => <article key={question} className={faqOpen === index ? "is-open" : ""}><button type="button" aria-expanded={faqOpen === index} onClick={() => setFaqOpen(faqOpen === index ? -1 : index)}><span>{question}</span><ChevronDownIcon aria-hidden="true" /></button>{faqOpen === index ? <p>{answer}</p> : null}</article>)}</div></section>
      </main>

      <footer className="lp3-footer"><div><a className="lp3-brand" href="/landing"><span><SparklesIcon aria-hidden="true" /></span><strong>ProSmet</strong></a><p>AI-сметчик для строительства.</p></div><div className="lp3-footer-links"><a href="#product">Продукт</a><a href="#demo">Демо</a><a href="#documents">Документы</a><a href="#faq">FAQ</a><a href="/app">Открыть приложение</a></div><small>© {new Date().getFullYear()} ProSmet · демонстрационные данные на этой странице помечены.</small></footer>
    </div>
  );
}
