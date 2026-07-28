import "server-only";

import type { EstimateDraft } from "@/lib/domain/estimate";

export type RulesToolCall = {
  name: string;
  args: Record<string, unknown>;
};

export type RulesRun = {
  text: string;
  tools: RulesToolCall[];
  state: Record<string, unknown>;
};

function uuid(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function extractArea(input: string, fallback = 100) {
  const match = input.match(/(\d+(?:[.,]\d+)?)\s*(?:м2|м²|кв\.?\s*м)/i);
  return match ? Number(match[1].replace(",", ".")) : fallback;
}

function extractLayerCm(input: string, fallback = 1.5) {
  const match = input.match(/(?:слой|толщин\w*)\s*(\d+(?:[.,]\d+)?)\s*мм/i);
  return match ? Number(match[1].replace(",", ".")) / 10 : fallback;
}

function extractRegion(input: string) {
  const known = [
    "Лениногорск",
    "Альметьевск",
    "Казань",
    "Набережные Челны",
    "Нижнекамск",
    "Москва",
    "Санкт-Петербург"
  ];
  return known.find((name) => input.toLocaleLowerCase("ru-RU").includes(name.toLocaleLowerCase("ru-RU"))) ?? "Регион не указан";
}

function priceSource(label: string, kind: "personal" | "indicative", region: string, confidence: number) {
  return {
    label,
    kind,
    region,
    date: new Date().toISOString().slice(0, 10),
    currency: "RUB",
    vatIncluded: false,
    deliveryIncluded: false,
    confidence,
    confirmed: kind === "personal"
  };
}

function plasterRun(input: string): RulesRun {
  const area = extractArea(input, 358);
  const layer = extractLayerCm(input, 1.5);
  const region = extractRegion(input);
  const materialKg = Math.ceil(area * 10 * layer * 1.1);
  const beacons = Math.ceil(area / 3);
  const corners = Math.max(24, Math.round(Math.sqrt(area) * 2));
  const today = new Date().toISOString().slice(0, 10);
  const estimate: EstimateDraft = {
    id: uuid("estimate"),
    title: `Механизированная гипсовая штукатурка — ${area} м²`,
    objectName: "Строительный объект",
    customer: "",
    contractor: "",
    region,
    date: today,
    method: "commercial",
    currency: "RUB",
    status: "draft",
    revision: 1,
    technology: [
      {
        id: "step-survey",
        title: "Обследование и проверка основания",
        description: "Проверить прочность, влажность, геометрию и совместимость основания.",
        control: "Непрочные участки удалены, дефекты и отклонения зафиксированы.",
        resources: ["мастер", "правило", "уровень"]
      },
      {
        id: "step-protect",
        title: "Защита окон, пола и смежных поверхностей",
        description: "Укрыть плёнкой и лентой все поверхности, не подлежащие оштукатуриванию.",
        control: "Защита герметична и не мешает выполнению работ.",
        resources: ["плёнка", "малярная лента"]
      },
      {
        id: "step-prepare",
        title: "Очистка, обеспыливание и грунтование",
        description: "Удалить загрязнения, обеспылить и нанести подходящий грунт.",
        control: "Грунт нанесён равномерно и выдержан по инструкции производителя.",
        resources: ["грунтовка", "валик", "щётка"]
      },
      {
        id: "step-beacons",
        title: "Монтаж маяков и защитных углов",
        description: "Выставить маяки по проектной плоскости, установить угловые профили.",
        control: "Плоскость, вертикальность и геометрия проверены.",
        resources: ["маячковый профиль", "угловой профиль", "лазерный уровень"]
      },
      {
        id: "step-apply",
        title: "Приготовление и механизированное нанесение смеси",
        description: `Нанести гипсовую смесь средним слоем ${Math.round(layer * 10)} мм с соблюдением времени переработки.`,
        control: "Смесь однородна, толщина и заполнение соответствуют технологии.",
        resources: ["штукатурная станция", "гипсовая смесь", "вода"]
      },
      {
        id: "step-level",
        title: "Разравнивание, подрезка и заглаживание",
        description: "Сформировать плоскость, подрезать излишки и подготовить поверхность под следующий слой.",
        control: "Отклонения поверхности соответствуют согласованному классу качества.",
        resources: ["правило", "шпатель", "губчатая тёрка"]
      },
      {
        id: "step-finish",
        title: "Контроль качества, уборка и сдача",
        description: "Проверить результат, удалить отходы и передать выполненные работы заказчику.",
        control: "Замечания устранены, рабочая зона очищена.",
        resources: ["контрольный инструмент", "мешки для отходов"]
      }
    ],
    sections: [
      {
        id: "section-preparation",
        title: "Подготовительные работы",
        items: [
          {
            id: "item-protection",
            code: "",
            name: "Укрытие и защита поверхностей",
            unit: "м²",
            quantity: area,
            norm: 1,
            coefficient: 1,
            unitPrice: 40,
            resourceType: "material",
            source: priceSource("Личная базовая цена: защитная плёнка", "personal", region, 95),
            comment: "",
            warning: ""
          },
          {
            id: "item-primer",
            code: "",
            name: "Грунт глубокого проникновения",
            unit: "кг",
            quantity: Math.ceil(area * 0.05 * 10) / 10,
            norm: 1,
            coefficient: 1,
            unitPrice: 385,
            resourceType: "material",
            source: priceSource("Mittelgrund 10 кг — 3 850 ₽", "personal", region, 92),
            comment: "Норма 0,05 кг/м².",
            warning: "Тип грунта необходимо подтвердить после обследования основания."
          },
          {
            id: "item-beacons",
            code: "",
            name: "Маячковый профиль ПВХ",
            unit: "шт",
            quantity: beacons,
            norm: 1,
            coefficient: 1,
            unitPrice: 55,
            resourceType: "material",
            source: priceSource("Личная цена маячкового профиля", "personal", region, 95),
            comment: "Предварительно 1 профиль на 3 м².",
            warning: "Количество уточняется по планировке и высоте помещений."
          },
          {
            id: "item-corners",
            code: "",
            name: "Перфорированный угловой профиль 3 м",
            unit: "шт",
            quantity: Math.ceil(corners / 3),
            norm: 1,
            coefficient: 1,
            unitPrice: 100,
            resourceType: "material",
            source: priceSource("Личная цена углового профиля 3 м", "personal", region, 95),
            comment: `Предварительно ${corners} пог. м углов.`,
            warning: "Длина наружных углов принята по допущению."
          }
        ]
      },
      {
        id: "section-plaster",
        title: "Штукатурные работы и материалы",
        items: [
          {
            id: "item-work",
            code: "",
            name: "Механизированная гипсовая штукатурка",
            unit: "м²",
            quantity: area,
            norm: 1,
            coefficient: 1,
            unitPrice: 500,
            resourceType: "work",
            source: priceSource("Личная утверждённая расценка на работы", "personal", region, 100),
            comment: `Средний слой ${Math.round(layer * 10)} мм.`,
            warning: "Стоимость может измениться при сложной геометрии или высоте более 3 м."
          },
          {
            id: "item-mixture",
            code: "",
            name: "Гипсовая штукатурная смесь Knauf LL Start 30 кг",
            unit: "кг",
            quantity: materialKg,
            norm: 1,
            coefficient: 1,
            unitPrice: Math.round((415 / 30) * 100) / 100,
            resourceType: "material",
            source: priceSource("Knauf LL Start 30 кг — 415 ₽", "personal", region, 96),
            comment: `10 кг/м²/см × ${layer.toFixed(2)} см + 10% запас.`,
            warning: "Фактический расход зависит от перепадов основания."
          },
          {
            id: "item-logistics",
            code: "",
            name: "Доставка, разгрузка, подъём и вывоз отходов",
            unit: "компл.",
            quantity: 1,
            norm: 1,
            coefficient: 1,
            unitPrice: 18000,
            resourceType: "logistics",
            source: priceSource("Ориентировочная логистическая калькуляция", "indicative", region, 65),
            comment: "",
            warning: "Требуется подтвердить расстояние, этаж, лифт и условия подъезда."
          }
        ]
      }
    ],
    overheadPercent: 0,
    profitPercent: 0,
    discountPercent: 0,
    vatPercent: 0,
    assumptions: [
      `Средняя толщина слоя принята ${Math.round(layer * 10)} мм.`,
      "Откосы и декоративные элементы не включены, если не указаны отдельно.",
      "Высота помещений принята до 3 м.",
      "Работы выполняются при готовых воде, электричестве и свободном доступе."
    ],
    warnings: [
      "Перед утверждением необходимо подтвердить фактические перепады основания, длину углов и условия логистики."
    ],
    reviewerNotes: [
      "Технологическая последовательность согласована с составом позиций.",
      "Арифметика рассчитывается детерминированно в браузере.",
      "Ориентировочная логистика требует подтверждения."
    ],
    updatedAt: new Date().toISOString()
  };

  return {
    text:
      `Подготовил технологическую карту и полную редактируемую смету для площади **${area} м²**. ` +
      "Сначала показан порядок работ, затем — позиции, материалы, источники цен и допущения. " +
      "Изменяйте количество, норму, коэффициент или цену прямо в таблице — итог пересчитывается сразу.",
    tools: [
      { name: "technology_card", args: { title: estimate.title, steps: estimate.technology } },
      { name: "estimate_draft", args: estimate }
    ],
    state: {
      project: { objectName: estimate.objectName, region },
      activeEstimate: estimate,
      estimateRevision: estimate.revision,
      workTrace: [
        { stage: "technology", status: "completed" },
        { stage: "prices", status: "completed" },
        { stage: "review", status: "completed" }
      ]
    }
  };
}

function roofRun(input: string): RulesRun {
  const area = extractArea(input, 120);
  const region = extractRegion(input);
  const steps = [
    "Обследование кровли и организация безопасного доступа",
    "Демонтаж старого шифера и сортировка отходов",
    "Локальный ремонт стропил, обрешётки и основания",
    "Монтаж гидроизоляции и контробрешётки",
    "Монтаж профилированного листа",
    "Монтаж конька, карнизов, примыканий и водоотвода",
    "Контроль герметичности, уборка и вывоз отходов"
  ].map((title, index) => ({
    id: `roof-step-${index + 1}`,
    title,
    description: "",
    control: "Работа принята по фактическому объёму и качеству монтажа.",
    resources: [] as string[]
  }));
  const estimate: EstimateDraft = {
    id: uuid("estimate"),
    title: `Замена кровли — ${area} м²`,
    objectName: "Кровля здания",
    customer: "",
    contractor: "",
    region,
    date: new Date().toISOString().slice(0, 10),
    method: "commercial",
    currency: "RUB",
    status: "draft",
    revision: 1,
    technology: steps,
    sections: [
      {
        id: "roof-demo",
        title: "Демонтаж и подготовка",
        items: [
          {
            id: "roof-demo-item",
            code: "",
            name: "Демонтаж шиферной кровли",
            unit: "м²",
            quantity: area,
            norm: 1,
            coefficient: 1,
            unitPrice: 250,
            resourceType: "work",
            source: priceSource("Ориентировочная коммерческая цена", "indicative", region, 60),
            comment: "",
            warning: "Цена зависит от высоты, уклона и возможности механизированного спуска."
          },
          {
            id: "roof-repair",
            code: "",
            name: "Локальный ремонт основания кровли",
            unit: "м²",
            quantity: Math.round(area * 0.15 * 100) / 100,
            norm: 1,
            coefficient: 1,
            unitPrice: 900,
            resourceType: "work",
            source: priceSource("Предварительная калькуляция 15% площади", "indicative", region, 45),
            comment: "",
            warning: "Фактический объём определяется после демонтажа."
          }
        ]
      },
      {
        id: "roof-install",
        title: "Новая кровля",
        items: [
          {
            id: "roof-sheet",
            code: "",
            name: "Профилированный лист с запасом 10%",
            unit: "м²",
            quantity: Math.ceil(area * 1.1),
            norm: 1,
            coefficient: 1,
            unitPrice: 0,
            resourceType: "material",
            source: priceSource("Цена поставщика не указана", "indicative", region, 0),
            comment: "",
            warning: "Выберите марку, толщину, покрытие и поставщика."
          },
          {
            id: "roof-work",
            code: "",
            name: "Монтаж профилированного листа",
            unit: "м²",
            quantity: area,
            norm: 1,
            coefficient: 1,
            unitPrice: 650,
            resourceType: "work",
            source: priceSource("Ориентировочная коммерческая цена", "indicative", region, 60),
            comment: "",
            warning: "Требуется подтвердить уклон и сложность примыканий."
          }
        ]
      }
    ],
    overheadPercent: 0,
    profitPercent: 0,
    discountPercent: 0,
    vatPercent: 0,
    assumptions: ["Площадь кровли принята по запросу.", "Локальный ремонт основания предварительно принят 15% площади."],
    warnings: ["Материал профлиста оставлен без цены до выбора характеристик и поставщика."],
    reviewerNotes: ["Утверждение заблокировано до заполнения цены профлиста."],
    updatedAt: new Date().toISOString()
  };
  return {
    text:
      "Сформировал технологическую карту замены кровли и предварительную смету. " +
      "Цена профлиста намеренно не выдумана: выберите толщину, покрытие и поставщика прямо в смете.",
    tools: [
      { name: "technology_card", args: { title: estimate.title, steps } },
      { name: "estimate_draft", args: estimate }
    ],
    state: { project: { region }, activeEstimate: estimate, estimateRevision: 1 }
  };
}

function documentRun(input: string): RulesRun {
  const lower = input.toLocaleLowerCase("ru-RU");
  const isContract = lower.includes("договор");
  const tool = isContract ? "contract_draft" : "commercial_proposal";
  const title = isContract
    ? "Договор подряда на выполнение строительных работ"
    : "Коммерческое предложение на выполнение строительных работ";
  const content = isContract
    ? `
      <h2>1. Предмет договора</h2>
      <p>Подрядчик обязуется выполнить строительные работы на объекте Заказчика в соответствии с утверждённой сметой и технологической картой, а Заказчик обязуется принять и оплатить результат.</p>
      <h2>2. Стоимость и порядок оплаты</h2>
      <p>Стоимость работ определяется приложением № 1 — утверждённой сметой. Порядок оплаты подлежит заполнению сторонами.</p>
      <h2>3. Сроки выполнения</h2>
      <p>Дата начала и срок выполнения подлежат согласованию.</p>
      <h2>4. Приёмка, гарантии и ответственность</h2>
      <p>Результат принимается по акту. Гарантийный срок и ответственность сторон должны быть согласованы до подписания.</p>
      <h2>5. Реквизиты и подписи сторон</h2>
      <p>Заказчик: ____________________</p><p>Подрядчик: ____________________</p>
    `
    : `
      <h2>Предлагаемый состав работ</h2>
      <p>Просметчик подготовил технологическую карту, ресурсный состав и редактируемую смету. Окончательная стоимость фиксируется после подтверждения объёмов и цен.</p>
      <h2>Стоимость</h2>
      <p>Согласно приложенной утверждённой смете.</p>
      <h2>Условия</h2>
      <p>Сроки, порядок оплаты, гарантийные обязательства и границы ответственности подлежат согласованию.</p>
      <h2>Приложения</h2>
      <p>1. Смета. 2. Технологическая карта.</p>
    `;
  return {
    text: `Подготовил редактируемый документ «${title}». Заполните критичные реквизиты в правой панели перед утверждением и печатью.`,
    tools: [
      {
        name: tool,
        args: {
          id: uuid("document"),
          type: isContract ? "contract" : "commercial_proposal",
          title,
          content,
          missingFields: [
            "реквизиты заказчика",
            "реквизиты подрядчика",
            "срок выполнения",
            "порядок оплаты"
          ],
          status: "draft",
          revision: 1
        }
      }
    ],
    state: { documents: [{ type: tool, title }] }
  };
}

export function runRulesAgent(input: string): RulesRun {
  const lower = input.toLocaleLowerCase("ru-RU");
  if (/штукатур|гипсов|маяк/.test(lower)) return plasterRun(input);
  if (/кровл|шифер|профлист|металлочереп/.test(lower)) return roofRun(input);
  if (/договор|коммерческ.*предлож|\bкп\b/.test(lower)) return documentRun(input);
  return {
    text:
      "Опишите вид работ, объект, регион и известные объёмы. Я сначала сформирую технологическую карту, затем полный состав работ и ресурсов, после чего покажу редактируемую смету в этом чате. Можно также приложить PDF, XLSX, CSV, фотографию или чертёж.",
    tools: [],
    state: { project: {}, activeEstimate: null, validation: { status: "input_required" } }
  };
}
