import "server-only";

import {
  EstimateDraftSchema,
  calculateEstimate,
  validateForApproval,
  type EstimateDraft,
  type EstimateItem,
  type EstimateSection,
  type ResourceType,
  type TechnologyStep
} from "@/lib/domain/estimate";
import { extractSiteIntake } from "@/lib/domain/site-intake";

export type RulesToolCall = {
  name: string;
  args: Record<string, unknown>;
};

export type JsonPatchOperation = {
  op: "add" | "replace" | "remove";
  path: string;
  value?: unknown;
};

export type RulesRun = {
  text: string;
  tools: RulesToolCall[];
  state: Record<string, unknown>;
  stateDelta?: JsonPatchOperation[];
  steps?: string[];
};

export type RulesAgentContext = {
  state?: unknown;
  messages?: unknown;
};

type ScenarioKind =
  | "plaster"
  | "roof"
  | "heating"
  | "electrical"
  | "facade"
  | "landscaping"
  | "demolition"
  | "renovation"
  | "plumbing"
  | "foundation";

type Scenario = {
  kind: ScenarioKind;
  title: string;
  objectName: string;
  workTypes: string[];
  defaultArea: number;
  technology: Array<{
    title: string;
    description?: string;
    control?: string;
    resources?: string[];
  }>;
  assumptions: string[];
  missing: string[];
  sections: (area: number, region: string, input: string) => EstimateSection[];
};

const today = () => new Date().toISOString().slice(0, 10);

function uuid(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function normal(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9%]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractArea(input: string, fallback = 100) {
  const match = input.match(/(\d+(?:[.,]\d+)?)\s*(?:м2|м²|кв\.?\s*м)/i);
  return match ? Number(match[1].replace(",", ".")) : fallback;
}

function extractLayerCm(input: string, fallback = 1.5) {
  const match = input.match(/(?:слой|толщин\w*)\s*(\d+(?:[.,]\d+)?)\s*мм/i);
  return match ? Number(match[1].replace(",", ".")) / 10 : fallback;
}

function extractPercent(input: string, fallback = 0) {
  const match = input.match(/(\d+(?:[.,]\d+)?)\s*%/);
  return match ? Number(match[1].replace(",", ".")) : fallback;
}

function extractRegion(input: string) {
  const known = [
    "Лениногорск",
    "Альметьевск",
    "Казань",
    "Набережные Челны",
    "Нижнекамск",
    "Москва",
    "Санкт-Петербург",
    "Самара",
    "Уфа",
    "Екатеринбург"
  ];
  return (
    known.find((name) =>
      input.toLocaleLowerCase("ru-RU").includes(name.toLocaleLowerCase("ru-RU"))
    ) ?? "Регион не указан"
  );
}

function priceSource(
  label: string,
  kind: "personal" | "organization" | "previous-estimate" | "indicative" | "unknown",
  region: string,
  confidence: number
) {
  return {
    label,
    kind,
    region,
    date: today(),
    currency: "RUB",
    vatIncluded: false,
    deliveryIncluded: false,
    confidence,
    confirmed: kind === "personal" || kind === "organization" || kind === "previous-estimate"
  };
}

function item(
  id: string,
  name: string,
  unit: string,
  quantity: number,
  resourceType: ResourceType,
  region: string,
  options: {
    code?: string;
    unitPrice?: number;
    sourceLabel?: string;
    sourceKind?: "personal" | "organization" | "previous-estimate" | "indicative" | "unknown";
    confidence?: number;
    norm?: number;
    coefficient?: number;
    comment?: string;
    warning?: string;
  } = {}
): EstimateItem {
  const unitPrice = Math.max(0, options.unitPrice ?? 0);
  const sourceKind = options.sourceKind ?? (unitPrice > 0 ? "indicative" : "unknown");
  return {
    id,
    code: options.code ?? "",
    name,
    unit,
    quantity: Math.max(0, quantity),
    norm: Math.max(0.000001, options.norm ?? 1),
    coefficient: Math.max(0.000001, options.coefficient ?? 1),
    unitPrice,
    resourceType,
    source: priceSource(
      options.sourceLabel ??
        (unitPrice > 0
          ? "Предварительная коммерческая калькуляция — подтвердить перед утверждением"
          : "Цена не определена — требуется личный прайс, поставщик или проверенный источник"),
      sourceKind,
      region,
      options.confidence ?? (sourceKind === "unknown" ? 0 : 45)
    ),
    comment: options.comment ?? "",
    warning:
      options.warning ??
      (unitPrice > 0 && sourceKind === "indicative"
        ? "Ориентировочная цена. Перед утверждением укажите фактический источник."
        : unitPrice === 0
          ? "Цена не заполнена. Итог сметы неполный."
          : "")
  };
}

function technologySteps(kind: ScenarioKind, entries: Scenario["technology"]): TechnologyStep[] {
  return entries.map((entry, index) => ({
    id: `${kind}-step-${index + 1}`,
    title: entry.title,
    description: entry.description ?? "",
    control: entry.control ?? "Результат проверен до перехода к следующей операции.",
    resources: entry.resources ?? []
  }));
}

function scenarioDefinitions(): Record<ScenarioKind, Scenario> {
  return {
    plaster: {
      kind: "plaster",
      title: "Механизированная гипсовая штукатурка",
      objectName: "Строительный объект",
      workTypes: ["отделочные работы", "механизированная штукатурка"],
      defaultArea: 358,
      technology: [
        { title: "Обследование и проверка основания", resources: ["мастер", "правило", "уровень"] },
        { title: "Защита окон, пола и смежных поверхностей", resources: ["плёнка", "малярная лента"] },
        { title: "Очистка, обеспыливание и грунтование", resources: ["грунтовка", "валик", "щётка"] },
        { title: "Монтаж маяков и защитных углов", resources: ["маячковый профиль", "угловой профиль", "лазерный уровень"] },
        { title: "Приготовление и механизированное нанесение смеси", resources: ["штукатурная станция", "смесь", "вода"] },
        { title: "Разравнивание, подрезка и заглаживание", resources: ["правило", "шпатель", "тёрка"] },
        { title: "Демонтаж маяков и заделка мест установки при необходимости" },
        { title: "Контроль качества, уборка, погрузка и сдача", resources: ["контрольный инструмент", "мешки"] }
      ],
      assumptions: [
        "Высота помещений принята до 3 м.",
        "Вода, электричество и свободный доступ доступны на объекте.",
        "Откосы и декоративные элементы считаются отдельно, если не указаны в исходных данных."
      ],
      missing: ["фактические перепады основания", "длина наружных углов", "этаж и условия подъёма"],
      sections: (area, region, input) => {
        const layer = extractLayerCm(input, 1.5);
        const materialKg = Math.ceil(area * 10 * layer * 1.1);
        const beacons = Math.ceil(area / 3);
        const corners = Math.max(24, Math.round(Math.sqrt(area) * 2));
        return [
          {
            id: "plaster-preparation",
            title: "Подготовительные работы",
            items: [
              item("plaster-protection", "Укрытие и защита поверхностей", "м²", area, "material", region, {
                unitPrice: 40,
                sourceKind: "personal",
                sourceLabel: "Личная базовая цена: защитная плёнка",
                confidence: 95
              }),
              item("plaster-primer", "Грунт глубокого проникновения", "кг", Math.ceil(area * 0.05 * 10) / 10, "material", region, {
                unitPrice: 385,
                sourceKind: "personal",
                sourceLabel: "Mittelgrund 10 кг — 3 850 ₽",
                confidence: 92,
                comment: "Норма 0,05 кг/м².",
                warning: "Тип грунта подтвердить после обследования основания."
              }),
              item("plaster-beacons", "Маячковый профиль ПВХ", "шт", beacons, "material", region, {
                unitPrice: 55,
                sourceKind: "personal",
                sourceLabel: "Личная цена маячкового профиля",
                confidence: 95,
                comment: "Предварительно 1 профиль на 3 м²."
              }),
              item("plaster-corners", "Перфорированный угловой профиль 3 м", "шт", Math.ceil(corners / 3), "material", region, {
                unitPrice: 100,
                sourceKind: "personal",
                sourceLabel: "Личная цена углового профиля 3 м",
                confidence: 95,
                comment: `Предварительно ${corners} пог. м углов.`
              })
            ]
          },
          {
            id: "plaster-main",
            title: "Штукатурные работы и материалы",
            items: [
              item("plaster-work", "Механизированная гипсовая штукатурка", "м²", area, "work", region, {
                unitPrice: 500,
                sourceKind: "personal",
                sourceLabel: "Личная утверждённая расценка на работы",
                confidence: 100,
                comment: `Средний слой ${Math.round(layer * 10)} мм.`
              }),
              item("plaster-mixture", "Гипсовая штукатурная смесь Knauf LL Start 30 кг", "кг", materialKg, "material", region, {
                unitPrice: Math.round((415 / 30) * 100) / 100,
                sourceKind: "personal",
                sourceLabel: "Knauf LL Start 30 кг — 415 ₽",
                confidence: 96,
                comment: `10 кг/м²/см × ${layer.toFixed(2)} см + 10% запас.`
              }),
              item("plaster-logistics", "Доставка, разгрузка, подъём и вывоз отходов", "компл.", 1, "logistics", region, {
                unitPrice: 18000,
                sourceKind: "indicative",
                sourceLabel: "Ориентировочная логистическая калькуляция",
                confidence: 65,
                warning: "Подтвердите расстояние, этаж, лифт и условия подъезда."
              })
            ]
          }
        ];
      }
    },
    roof: {
      kind: "roof",
      title: "Замена кровельного покрытия",
      objectName: "Кровля здания",
      workTypes: ["кровельные работы", "демонтаж", "ремонт основания"],
      defaultArea: 120,
      technology: [
        { title: "Обследование кровли и организация безопасного доступа" },
        { title: "Защита территории и устройство временных ограждений" },
        { title: "Демонтаж старого покрытия и сортировка отходов" },
        { title: "Дефектовка стропил, обрешётки и основания" },
        { title: "Локальный ремонт основания" },
        { title: "Монтаж гидроизоляции, контробрешётки и обрешётки" },
        { title: "Монтаж кровельного покрытия и крепежа" },
        { title: "Монтаж конька, карнизов, примыканий и водоотвода" },
        { title: "Контроль герметичности, уборка и вывоз отходов" }
      ],
      assumptions: ["Локальный ремонт основания предварительно принят 15% площади."],
      missing: ["уклон кровли", "высота здания", "марка и толщина покрытия", "состояние стропильной системы"],
      sections: (area, region) => [
        {
          id: "roof-demolition",
          title: "Демонтаж и подготовка",
          items: [
            item("roof-old-cover", "Демонтаж существующего кровельного покрытия", "м²", area, "work", region),
            item("roof-base-repair", "Локальный ремонт основания кровли", "м²", Math.round(area * 0.15 * 100) / 100, "work", region, {
              comment: "Предварительно 15% площади; уточняется после вскрытия."
            }),
            item("roof-waste", "Погрузка и вывоз демонтированных материалов", "т", Math.max(1, Math.round(area * 0.018 * 100) / 100), "logistics", region)
          ]
        },
        {
          id: "roof-covering",
          title: "Новая кровля",
          items: [
            item("roof-membrane", "Гидроизоляционная мембрана с нахлёстом", "м²", Math.ceil(area * 1.12), "material", region),
            item("roof-batten", "Контробрешётка и обрешётка", "м²", area, "material", region),
            item("roof-sheet", "Кровельное покрытие с запасом 10%", "м²", Math.ceil(area * 1.1), "material", region),
            item("roof-fasteners", "Кровельный крепёж и уплотнители", "компл.", 1, "material", region),
            item("roof-install", "Монтаж кровельного покрытия", "м²", area, "work", region),
            item("roof-trims", "Конёк, карнизные планки, примыкания и доборные элементы", "пог. м", Math.ceil(Math.sqrt(area) * 6), "material", region)
          ]
        }
      ]
    },
    heating: {
      kind: "heating",
      title: "Монтаж системы отопления",
      objectName: "Система отопления здания",
      workTypes: ["ОВиК", "отопление", "пусконаладка"],
      defaultArea: 140,
      technology: [
        { title: "Сбор исходных данных и расчёт тепловой нагрузки" },
        { title: "Выбор схемы, оборудования и трасс" },
        { title: "Разметка и подготовка проходок" },
        { title: "Монтаж котельного оборудования и группы безопасности" },
        { title: "Монтаж магистралей, стояков и подводок" },
        { title: "Монтаж отопительных приборов и арматуры" },
        { title: "Промывка, опрессовка и устранение утечек" },
        { title: "Заполнение, балансировка и пусконаладка" }
      ],
      assumptions: ["Тепловая нагрузка предварительно определяется по площади и требует инженерного расчёта."],
      missing: ["теплопотери", "источник тепла", "этажность", "схема разводки", "тип отопительных приборов"],
      sections: (area, region) => {
        const radiators = Math.max(4, Math.ceil(area / 18));
        return [
          {
            id: "heating-equipment",
            title: "Оборудование",
            items: [
              item("heating-boiler", "Котёл или теплогенератор", "шт", 1, "equipment", region),
              item("heating-pump", "Циркуляционный насос", "шт", 1, "equipment", region),
              item("heating-expansion", "Расширительный бак", "шт", 1, "equipment", region),
              item("heating-radiators", "Отопительные приборы", "шт", radiators, "equipment", region)
            ]
          },
          {
            id: "heating-materials",
            title: "Трубопроводы и материалы",
            items: [
              item("heating-pipe", "Трубопроводы системы отопления", "пог. м", Math.ceil(area * 1.25), "material", region),
              item("heating-fittings", "Фитинги, арматура и крепёж", "компл.", 1, "material", region),
              item("heating-insulation", "Теплоизоляция трубопроводов", "пог. м", Math.ceil(area * 0.45), "material", region)
            ]
          },
          {
            id: "heating-works",
            title: "Монтаж и пусконаладка",
            items: [
              item("heating-install-equipment", "Монтаж котельного оборудования", "компл.", 1, "work", region),
              item("heating-install-pipe", "Монтаж трубопроводов", "пог. м", Math.ceil(area * 1.25), "work", region),
              item("heating-install-radiators", "Монтаж отопительных приборов", "шт", radiators, "work", region),
              item("heating-commissioning", "Опрессовка, балансировка и пусконаладка", "система", 1, "service", region)
            ]
          }
        ];
      }
    },
    electrical: {
      kind: "electrical",
      title: "Электромонтажные работы",
      objectName: "Электроснабжение объекта",
      workTypes: ["электромонтаж", "слаботочные системы", "пусконаладка"],
      defaultArea: 70,
      technology: [
        { title: "Обследование и формирование однолинейной схемы" },
        { title: "Расчёт нагрузок и подбор защитной аппаратуры" },
        { title: "Разметка трасс, точек и щитового оборудования" },
        { title: "Штробление, сверление и подготовка проходок" },
        { title: "Прокладка кабелей, труб и лотков" },
        { title: "Сборка и монтаж электрощита" },
        { title: "Монтаж розеток, выключателей и светильников" },
        { title: "Измерения, маркировка и пусконаладка" }
      ],
      assumptions: ["Количество точек предварительно рассчитано по площади."],
      missing: ["выделенная мощность", "план розеток и освещения", "тип прокладки", "состав слаботочных систем"],
      sections: (area, region) => {
        const points = Math.max(20, Math.ceil(area * 1.1));
        const cable = Math.ceil(area * 7.5);
        return [
          {
            id: "electrical-materials",
            title: "Материалы и оборудование",
            items: [
              item("electrical-cable", "Кабельно-проводниковая продукция", "пог. м", cable, "material", region),
              item("electrical-boxes", "Подрозетники и распаечные коробки", "шт", points, "material", region),
              item("electrical-devices", "Розетки, выключатели и механизмы", "шт", points, "equipment", region),
              item("electrical-panel", "Электрощит с защитной аппаратурой", "компл.", 1, "equipment", region)
            ]
          },
          {
            id: "electrical-works",
            title: "Электромонтаж и испытания",
            items: [
              item("electrical-route", "Подготовка трасс и отверстий", "пог. м", Math.ceil(cable * 0.65), "work", region),
              item("electrical-lay", "Прокладка кабеля", "пог. м", cable, "work", region),
              item("electrical-points", "Монтаж установочных точек", "шт", points, "work", region),
              item("electrical-panel-work", "Сборка и подключение электрощита", "компл.", 1, "work", region),
              item("electrical-test", "Электроизмерения и протоколирование", "компл.", 1, "service", region)
            ]
          }
        ];
      }
    },
    facade: {
      kind: "facade",
      title: "Фасадные работы",
      objectName: "Фасад здания",
      workTypes: ["фасад", "теплоизоляция", "отделка"],
      defaultArea: 240,
      technology: [
        { title: "Обследование фасада и организация доступа" },
        { title: "Устройство лесов и защитной сетки" },
        { title: "Очистка, ремонт и грунтование основания" },
        { title: "Монтаж теплоизоляции и дюбелирование" },
        { title: "Армирующий слой с сеткой и угловыми профилями" },
        { title: "Грунтование под финишное покрытие" },
        { title: "Нанесение декоративного покрытия или окраска" },
        { title: "Устройство примыканий, отливов и герметизация" },
        { title: "Контроль, демонтаж лесов и уборка" }
      ],
      assumptions: ["Фасадная система предварительно рассматривается как комплектная."],
      missing: ["высота здания", "тип основания", "толщина утеплителя", "финишное покрытие", "площадь проёмов"],
      sections: (area, region) => [
        {
          id: "facade-access",
          title: "Доступ и подготовка",
          items: [
            item("facade-scaffold", "Монтаж, аренда и демонтаж фасадных лесов", "м²", area, "service", region),
            item("facade-clean", "Очистка и локальный ремонт основания", "м²", area, "work", region),
            item("facade-primer", "Грунтование основания", "м²", area, "work", region)
          ]
        },
        {
          id: "facade-system",
          title: "Фасадная система",
          items: [
            item("facade-insulation", "Теплоизоляционные плиты", "м²", Math.ceil(area * 1.05), "material", region),
            item("facade-dowels", "Фасадные дюбели", "шт", Math.ceil(area * 6), "material", region),
            item("facade-mesh", "Армирующая сетка", "м²", Math.ceil(area * 1.1), "material", region),
            item("facade-basecoat", "Клеевой и армирующий состав", "кг", Math.ceil(area * 10), "material", region),
            item("facade-finish", "Финишное декоративное покрытие", "м²", area, "material", region),
            item("facade-install", "Монтаж фасадной системы", "м²", area, "work", region)
          ]
        }
      ]
    },
    landscaping: {
      kind: "landscaping",
      title: "Благоустройство территории",
      objectName: "Территория объекта",
      workTypes: ["благоустройство", "земляные работы", "дорожные покрытия"],
      defaultArea: 300,
      technology: [
        { title: "Геодезическая разбивка и организация территории" },
        { title: "Снятие растительного слоя и планировка" },
        { title: "Разработка корыта и вывоз грунта" },
        { title: "Устройство геотекстиля и песчаного основания" },
        { title: "Устройство щебёночного основания и уплотнение" },
        { title: "Монтаж бортовых камней и водоотвода" },
        { title: "Устройство финишного покрытия" },
        { title: "Озеленение, уборка и сдача" }
      ],
      assumptions: ["Толщина слоёв основания предварительная и уточняется проектом."],
      missing: ["геология", "отметки", "тип покрытия", "нагрузка на покрытие", "схема водоотвода"],
      sections: (area, region) => [
        {
          id: "land-earth",
          title: "Земляные работы и основание",
          items: [
            item("land-excavation", "Разработка корыта", "м³", Math.ceil(area * 0.25), "work", region),
            item("land-disposal", "Погрузка и вывоз грунта", "м³", Math.ceil(area * 0.25), "logistics", region),
            item("land-geotextile", "Геотекстиль", "м²", Math.ceil(area * 1.1), "material", region),
            item("land-sand", "Песчаное основание", "м³", Math.ceil(area * 0.1), "material", region),
            item("land-crushed", "Щебёночное основание", "м³", Math.ceil(area * 0.15), "material", region),
            item("land-compaction", "Послойное уплотнение", "м²", area, "machine", region)
          ]
        },
        {
          id: "land-finish",
          title: "Финишное покрытие и элементы",
          items: [
            item("land-curb", "Бортовой камень", "пог. м", Math.ceil(Math.sqrt(area) * 5), "material", region),
            item("land-cover", "Финишное покрытие", "м²", Math.ceil(area * 1.05), "material", region),
            item("land-install", "Устройство финишного покрытия", "м²", area, "work", region)
          ]
        }
      ]
    },
    demolition: {
      kind: "demolition",
      title: "Демонтажные работы",
      objectName: "Зона демонтажа",
      workTypes: ["демонтаж", "утилизация", "временные работы"],
      defaultArea: 100,
      technology: [
        { title: "Обследование, фотофиксация и границы демонтажа" },
        { title: "Отключение инженерных коммуникаций" },
        { title: "Ограждение и защита сохраняемых конструкций" },
        { title: "Поэлементный демонтаж сверху вниз" },
        { title: "Сортировка материалов и отходов" },
        { title: "Погрузка, спуск и вывоз" },
        { title: "Зачистка основания и передача фронта работ" }
      ],
      assumptions: ["Категория отходов и расстояние до полигона не определены."],
      missing: ["состав конструкций", "толщина", "этаж", "наличие лифта", "класс отходов", "расстояние вывоза"],
      sections: (area, region) => [
        {
          id: "demo-main",
          title: "Демонтаж",
          items: [
            item("demo-protection", "Защита сохраняемых поверхностей", "м²", area, "material", region),
            item("demo-work", "Демонтаж конструкций и покрытий", "м²", area, "work", region),
            item("demo-sort", "Сортировка и пакетирование отходов", "т", Math.max(1, Math.ceil(area * 0.05)), "work", region),
            item("demo-lower", "Спуск и погрузка отходов", "т", Math.max(1, Math.ceil(area * 0.05)), "logistics", region),
            item("demo-disposal", "Транспортирование и утилизация", "т", Math.max(1, Math.ceil(area * 0.05)), "logistics", region)
          ]
        }
      ]
    },
    renovation: {
      kind: "renovation",
      title: "Комплексный ремонт помещения",
      objectName: "Ремонтируемое помещение",
      workTypes: ["ремонт", "отделка", "инженерные работы"],
      defaultArea: 80,
      technology: [
        { title: "Обследование, обмеры и дефектная ведомость" },
        { title: "Организация площадки и защита сохраняемых элементов" },
        { title: "Демонтаж существующей отделки и оборудования" },
        { title: "Черновые инженерные работы" },
        { title: "Подготовка стен, потолков и полов" },
        { title: "Чистовая отделка" },
        { title: "Монтаж оборудования, электрики и сантехники" },
        { title: "Пусконаладка, уборка и сдача" }
      ],
      assumptions: ["Состав помещений и класс отделки приняты предварительно."],
      missing: ["планы и экспликация", "состав демонтажа", "класс материалов", "инженерные решения"],
      sections: (area, region) => [
        {
          id: "renovation-prep",
          title: "Подготовка и демонтаж",
          items: [
            item("renovation-protection", "Защита и временные мероприятия", "м²", area, "material", region),
            item("renovation-demolition", "Демонтаж существующей отделки", "м²", area * 3, "work", region),
            item("renovation-waste", "Погрузка и вывоз отходов", "компл.", 1, "logistics", region)
          ]
        },
        {
          id: "renovation-finishing",
          title: "Отделочные работы",
          items: [
            item("renovation-walls", "Подготовка и отделка стен", "м²", area * 2.6, "work", region),
            item("renovation-ceiling", "Подготовка и отделка потолка", "м²", area, "work", region),
            item("renovation-floor", "Устройство напольного покрытия", "м²", area, "work", region),
            item("renovation-materials", "Комплект отделочных материалов", "компл.", 1, "material", region)
          ]
        },
        {
          id: "renovation-engineering",
          title: "Инженерные работы",
          items: [
            item("renovation-electrical", "Электромонтажные работы", "компл.", 1, "work", region),
            item("renovation-plumbing", "Сантехнические работы", "компл.", 1, "work", region)
          ]
        }
      ]
    },
    plumbing: {
      kind: "plumbing",
      title: "Водоснабжение и канализация",
      objectName: "Система ВК объекта",
      workTypes: ["водоснабжение", "канализация", "сантехника"],
      defaultArea: 100,
      technology: [
        { title: "Обследование вводов, выпусков и точек подключения" },
        { title: "Разработка схемы и подбор диаметров" },
        { title: "Разметка трасс и подготовка проходок" },
        { title: "Монтаж водопроводных труб и арматуры" },
        { title: "Монтаж канализационных труб с уклонами" },
        { title: "Монтаж коллекторов, фильтров и приборов" },
        { title: "Гидравлические испытания и промывка" },
        { title: "Проверка сливов, герметичности и сдача" }
      ],
      assumptions: ["Количество сантехнических точек предварительно рассчитано по площади."],
      missing: ["число санузлов", "точки подключения", "материал труб", "необходимость скрытого монтажа"],
      sections: (area, region) => {
        const points = Math.max(6, Math.ceil(area / 12));
        return [
          {
            id: "plumbing-materials",
            title: "Материалы и оборудование",
            items: [
              item("plumbing-water-pipe", "Трубы водоснабжения", "пог. м", Math.ceil(area * 0.8), "material", region),
              item("plumbing-sewer-pipe", "Трубы канализации", "пог. м", Math.ceil(area * 0.45), "material", region),
              item("plumbing-fittings", "Фитинги, арматура и крепёж", "компл.", 1, "material", region),
              item("plumbing-points", "Сантехнические приборы и точки", "шт", points, "equipment", region)
            ]
          },
          {
            id: "plumbing-works",
            title: "Монтаж и испытания",
            items: [
              item("plumbing-install-water", "Монтаж водоснабжения", "пог. м", Math.ceil(area * 0.8), "work", region),
              item("plumbing-install-sewer", "Монтаж канализации", "пог. м", Math.ceil(area * 0.45), "work", region),
              item("plumbing-install-points", "Монтаж сантехнических точек", "шт", points, "work", region),
              item("plumbing-test", "Испытания, промывка и проверка сливов", "система", 1, "service", region)
            ]
          }
        ];
      }
    },
    foundation: {
      kind: "foundation",
      title: "Устройство фундамента",
      objectName: "Фундамент здания",
      workTypes: ["земляные работы", "монолит", "гидроизоляция"],
      defaultArea: 100,
      technology: [
        { title: "Геодезическая разбивка и подготовка площадки" },
        { title: "Разработка котлована или траншей" },
        { title: "Устройство подготовки и дренажа" },
        { title: "Монтаж опалубки" },
        { title: "Изготовление и монтаж арматурных каркасов" },
        { title: "Бетонирование и виброуплотнение" },
        { title: "Уход за бетоном и распалубка" },
        { title: "Гидроизоляция, утепление и обратная засыпка" }
      ],
      assumptions: ["Объём бетона предварительно принят по площади пятна и условной толщине 0,3 м."],
      missing: ["геология", "тип фундамента", "рабочая документация", "класс бетона", "армирование"],
      sections: (area, region) => {
        const concrete = Math.ceil(area * 0.3 * 10) / 10;
        return [
          {
            id: "foundation-earth",
            title: "Земляные работы и подготовка",
            items: [
              item("foundation-excavation", "Разработка грунта", "м³", Math.ceil(area * 0.6), "machine", region),
              item("foundation-base", "Песчано-щебёночная подготовка", "м³", Math.ceil(area * 0.2), "material", region),
              item("foundation-concrete-prep", "Бетонная подготовка", "м³", Math.ceil(area * 0.08), "material", region)
            ]
          },
          {
            id: "foundation-concrete",
            title: "Монолитные конструкции",
            items: [
              item("foundation-formwork", "Опалубка", "м²", Math.ceil(area * 1.4), "material", region),
              item("foundation-rebar", "Арматурная сталь", "т", Math.ceil(concrete * 0.11 * 100) / 100, "material", region),
              item("foundation-concrete", "Бетонная смесь", "м³", concrete, "material", region),
              item("foundation-install", "Комплекс монолитных работ", "м³", concrete, "work", region),
              item("foundation-waterproof", "Гидроизоляция конструкций", "м²", Math.ceil(area * 1.5), "work", region)
            ]
          }
        ];
      }
    }
  };
}

const scenarios = scenarioDefinitions();

function detectScenario(input: string): ScenarioKind | null {
  const value = normal(input);
  if (/штукатур|гипсов|маяк/.test(value)) return "plaster";
  if (/кровл|шифер|профлист|металлочереп|крыша/.test(value)) return "roof";
  if (/отоплен|радиатор|котел|котёл|теплоснаб/.test(value)) return "heating";
  if (/электр|розет|выключател|кабел|электромонтаж/.test(value)) return "electrical";
  if (/фасад|утеплен.*стен|мокрый фасад/.test(value)) return "facade";
  if (/благоустр|тротуар|брусчат|асфальт|бордюр/.test(value)) return "landscaping";
  if (/демонтаж|разборк|снос/.test(value)) return "demolition";
  if (/водоснаб|канализац|сантех|водопровод/.test(value)) return "plumbing";
  if (/фундамент|монолит|бетонирован|армирован/.test(value)) return "foundation";
  if (/ремонт|капремонт|отделк|реконструк/.test(value)) return "renovation";
  return null;
}

function titleForScenario(scenario: Scenario, area: number) {
  return `${scenario.title} — ${area} м²`;
}

function projectCase(scenario: Scenario, estimate: EstimateDraft, input: string) {
  const intake = extractSiteIntake(input);
  return {
    id: uuid("project"),
    objectName: estimate.objectName,
    region: estimate.region,
    stage: "Предварительная смета",
    summary: `Распознана задача «${scenario.title}». Сначала сформирована технология, затем ресурсы и позиции сметы.`,
    workTypes: scenario.workTypes,
    assumptions: estimate.assumptions,
    missing: scenario.missing.filter((item) => !normal(input).includes(normal(item))),
    customer: intake.customer ?? estimate.customer
  };
}

function createEstimate(scenario: Scenario, input: string): EstimateDraft {
  const area = extractArea(input, scenario.defaultArea);
  const region = extractRegion(input);
  const intake = extractSiteIntake(input);
  return EstimateDraftSchema.parse({
    id: uuid("estimate"),
    title: titleForScenario(scenario, area),
    objectName: intake.objectName || scenario.objectName,
    customer: intake.customer || "",
    contractor: "",
    region,
    date: today(),
    method: "commercial",
    currency: "RUB",
    status: "draft",
    revision: 1,
    technology: technologySteps(scenario.kind, scenario.technology),
    sections: scenario.sections(area, region, input),
    overheadPercent: 0,
    profitPercent: 0,
    discountPercent: 0,
    vatPercent: 0,
    assumptions: scenario.assumptions,
    warnings: [
      ...scenario.missing.map((item) => `Требуется уточнить: ${item}.`),
      "Позиции без подтверждённой цены не включены в достоверный итог."
    ],
    reviewerNotes: [],
    updatedAt: new Date().toISOString()
  });
}

function collectResources(draft: EstimateDraft) {
  const map = new Map<string, { id: string; name: string; unit: string; quantity: number; type: string }>();
  for (const section of draft.sections) {
    for (const line of section.items) {
      const key = `${normal(line.name)}:${line.unit}:${line.resourceType}`;
      const previous = map.get(key);
      const quantity = line.quantity * line.norm * line.coefficient;
      map.set(key, {
        id: previous?.id ?? line.id,
        name: line.name,
        unit: line.unit,
        quantity: Math.round(((previous?.quantity ?? 0) + quantity) * 1000) / 1000,
        type: line.resourceType
      });
    }
  }
  return [...map.values()];
}

function priceCandidates(draft: EstimateDraft) {
  return draft.sections.flatMap((section) =>
    section.items.flatMap((line) =>
      line.unitPrice > 0
        ? [
            {
              id: line.id,
              name: line.name,
              price: line.unitPrice,
              source: line.source.label,
              date: line.source.date,
              confidence: line.source.confidence
            }
          ]
        : []
    )
  );
}

function reviewArgs(draft: EstimateDraft) {
  const report = validateForApproval(draft);
  const zeroPrices = draft.sections.flatMap((section) =>
    section.items.filter((line) => !(line.unitPrice > 0)).map((line) => `Заполните цену «${line.name}».`)
  );
  const blockers = [...new Set([...report.blockers, ...zeroPrices])];
  const warnings = [...new Set(report.warnings)].slice(0, 20);
  const totalLines = draft.sections.reduce((sum, section) => sum + section.items.length, 0);
  const confirmed = draft.sections.reduce(
    (sum, section) => sum + section.items.filter((line) => line.source.confirmed).length,
    0
  );
  const score = Math.max(
    15,
    Math.min(100, Math.round(100 - blockers.length * 9 - warnings.length * 2 + confirmed * 1.5))
  );
  return {
    title: blockers.length ? "Смета требует подтверждения исходных данных" : "Смета готова к утверждению",
    score,
    blockers,
    warnings,
    passedChecks: [
      `Технологическая карта: ${draft.technology.length} операций.`,
      `Структура сметы: ${draft.sections.length} разделов и ${totalLines} позиций.`,
      "Арифметика рассчитана детерминированно.",
      `Подтверждённых цен: ${confirmed} из ${totalLines}.`,
      "Старые версии сохраняются отдельно при утверждении и изменениях."
    ]
  };
}

function fullState(
  estimate: EstimateDraft | null,
  options: {
    documents?: unknown[];
    workTrace?: unknown[];
    validation?: Record<string, unknown>;
    project?: Record<string, unknown>;
  } = {}
) {
  return {
    project:
      options.project ??
      (estimate
        ? { objectName: estimate.objectName, customer: estimate.customer, region: estimate.region }
        : {}),
    activeEstimate: estimate,
    estimateRevision: estimate?.revision ?? 0,
    documents: options.documents ?? [],
    priceContext: estimate
      ? {
          confirmed: estimate.sections.reduce(
            (sum, section) => sum + section.items.filter((line) => line.source.confirmed).length,
            0
          ),
          total: estimate.sections.reduce((sum, section) => sum + section.items.length, 0)
        }
      : {},
    workTrace:
      options.workTrace ??
      [
        { stage: "analysis", status: "completed" },
        { stage: "technology", status: estimate ? "completed" : "pending" },
        { stage: "resources", status: estimate ? "completed" : "pending" },
        { stage: "prices", status: estimate ? "completed" : "pending" },
        { stage: "review", status: estimate ? "completed" : "pending" }
      ],
    sync: { status: "server-connected" },
    provider: { id: "rules", status: "available", mode: "deterministic-fallback" },
    validation: options.validation ?? (estimate ? reviewArgs(estimate) : { status: "input_required" })
  };
}

function estimateRun(scenario: Scenario, input: string): RulesRun {
  const estimate = createEstimate(scenario, input);
  const review = reviewArgs(estimate);
  const candidatePrices = priceCandidates(estimate);
  return {
    text:
      `Создал карточку объекта, технологическую карту, ресурсную ведомость и редактируемую смету «${estimate.title}». ` +
      "Все основные действия остаются в этом чате: меняйте объёмы, цены, материалы и коэффициенты обычным сообщением или прямо в таблице.",
    tools: [
      { name: "project_case", args: projectCase(scenario, estimate, input) },
      { name: "technology_card", args: { title: estimate.title, steps: estimate.technology } },
      {
        name: "resource_statement",
        args: { title: `Ресурсы — ${estimate.title}`, resources: collectResources(estimate) }
      },
      ...(candidatePrices.length
        ? [
            {
              name: "price_candidates",
              args: { title: "Использованные цены и источники", currency: estimate.currency, candidates: candidatePrices }
            }
          ]
        : []),
      { name: "estimate_draft", args: estimate },
      { name: "estimate_review", args: review }
    ],
    state: fullState(estimate, { validation: review }),
    steps: ["analysis", "technology", "resources", "prices", "estimate", "review"]
  };
}

function findEstimate(value: unknown, depth = 0): EstimateDraft | null {
  if (depth > 7 || value == null) return null;
  const parsed = EstimateDraftSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length < 2_000_000) {
      try {
        return findEstimate(JSON.parse(trimmed), depth + 1);
      } catch {
        return null;
      }
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const found = findEstimate(value[index], depth + 1);
      if (found) return found;
    }
    return null;
  }
  const object = record(value);
  for (const key of [
    "activeEstimate",
    "estimate",
    "draft",
    "args",
    "result",
    "state",
    "content",
    "toolCallArgs",
    "messages"
  ]) {
    if (!(key in object)) continue;
    const found = findEstimate(object[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function activeEstimate(context?: RulesAgentContext) {
  return findEstimate(context?.state) ?? findEstimate(context?.messages);
}

function cloneDraft(draft: EstimateDraft): EstimateDraft {
  return EstimateDraftSchema.parse(structuredClone(draft));
}

function changedState(draft: EstimateDraft, validation = reviewArgs(draft)) {
  return {
    state: fullState(draft, { validation }),
    stateDelta: [
      { op: "replace" as const, path: "/activeEstimate", value: draft },
      { op: "replace" as const, path: "/estimateRevision", value: draft.revision },
      { op: "replace" as const, path: "/validation", value: validation },
      {
        op: "replace" as const,
        path: "/project",
        value: { objectName: draft.objectName, customer: draft.customer, region: draft.region }
      }
    ]
  };
}

function targetTokens(input: string) {
  const value = normal(input);
  const known = [
    "штукатур",
    "смесь",
    "маяк",
    "угол",
    "достав",
    "подъем",
    "профлист",
    "кровел",
    "радиатор",
    "котел",
    "труб",
    "кабел",
    "розет",
    "фасад",
    "утепл",
    "бетон",
    "арматур",
    "демонтаж",
    "вывоз"
  ];
  return known.filter((token) => value.includes(token));
}

function findTargetItem(draft: EstimateDraft, input: string) {
  const tokens = targetTokens(input);
  const items = draft.sections.flatMap((section) => section.items);
  if (tokens.length) {
    const found = items.find((line) => tokens.some((token) => normal(line.name).includes(token)));
    if (found) return found;
  }
  return items.find((line) => line.resourceType === "work") ?? items[0] ?? null;
}

function mutateEstimate(input: string, current: EstimateDraft): RulesRun | null {
  const lower = normal(input);
  const next = cloneDraft(current);
  let changed = false;
  const notes: string[] = [];

  const priceMatch = input.match(
    /(?:цен\w*|стоимост\w*)[^\d]{0,80}(\d+(?:[.,]\d+)?)\s*(?:₽|руб(?:лей|ля|ль)?\.?)/i
  );
  if (priceMatch) {
    const target = findTargetItem(next, input);
    if (target) {
      const value = Number(priceMatch[1].replace(",", "."));
      target.unitPrice = value;
      target.source = priceSource("Цена подтверждена пользователем в чате", "personal", next.region, 100);
      target.warning = "";
      notes.push(`Цена «${target.name}» изменена на ${value} ₽/${target.unit}.`);
      changed = true;
    }
  }

  const quantityMatch = input.match(
    /(?:объ[её]м|количеств\w*)[^\d]{0,80}(\d+(?:[.,]\d+)?)\s*(м²|м2|м3|м³|пог\.?\s*м|шт|кг|т)?/i
  );
  if (quantityMatch && !priceMatch) {
    const target = findTargetItem(next, input);
    if (target) {
      const value = Number(quantityMatch[1].replace(",", "."));
      target.quantity = value;
      if (quantityMatch[2]) target.unit = quantityMatch[2].replace("м2", "м²").replace("м3", "м³");
      notes.push(`Объём «${target.name}» изменён на ${value} ${target.unit}.`);
      changed = true;
    }
  }

  if (/(запас|коэффициент|коэф)/.test(lower) && /%/.test(input)) {
    const percent = extractPercent(input);
    const coefficient = 1 + percent / 100;
    const tokens = targetTokens(input);
    for (const section of next.sections) {
      for (const line of section.items) {
        const targetMatches = !tokens.length || tokens.some((token) => normal(line.name).includes(token));
        if (targetMatches && (line.resourceType === "material" || tokens.length > 0)) {
          line.coefficient = Math.round(coefficient * 10000) / 10000;
          changed = true;
        }
      }
    }
    if (changed) notes.push(`Применён запас ${percent}% к выбранным ресурсам.`);
  }

  const replaceMatch = input.match(/замени\s+(.{2,80}?)\s+на\s+(.{2,120}?)(?:[.!?]|$)/i);
  if (replaceMatch) {
    const from = normal(replaceMatch[1]);
    const replacement = replaceMatch[2].trim();
    const lines = next.sections.flatMap((section) => section.items);
    const target =
      lines.find((line) => normal(line.name).includes(from)) ??
      lines.find((line) => line.resourceType === "material");
    if (target) {
      const previous = target.name;
      target.name = replacement;
      target.unitPrice = 0;
      target.source = priceSource("Цена нового материала не подтверждена", "unknown", next.region, 0);
      target.warning = "Подберите фактическую цену и проверьте технологическую совместимость замены.";
      notes.push(`Материал «${previous}» заменён на «${replacement}». Цена сброшена до подтверждения.`);
      changed = true;
    }
  }

  const addMatch = input.match(/добавь\s+(?:позици\w*\s+)?(.{3,100}?)(?:\s+(\d+(?:[.,]\d+)?)\s*(м²|м3|м³|пог\.?\s*м|шт|кг|т))?(?:[.!?]|$)/i);
  if (addMatch && !/добавь\s+\d+\s*%/.test(lower)) {
    const name = addMatch[1].trim();
    if (name && !/(цена|стоимость|запас|коэффициент)/.test(normal(name))) {
      const quantity = addMatch[2] ? Number(addMatch[2].replace(",", ".")) : 1;
      const unit = addMatch[3] ?? "шт";
      const section = next.sections.at(-1);
      if (section) {
        section.items.push(
          item(uuid("item"), name, unit, quantity, "service", next.region, {
            sourceKind: "unknown",
            warning: "Новая позиция добавлена из сообщения; укажите тип ресурса и цену."
          })
        );
        notes.push(`Добавлена позиция «${name}».`);
        changed = true;
      }
    }
  }

  const discountMatch = input.match(/скидк\w*[^\d]{0,30}(\d+(?:[.,]\d+)?)\s*%/i);
  if (discountMatch) {
    next.discountPercent = Number(discountMatch[1].replace(",", "."));
    notes.push(`Скидка изменена на ${next.discountPercent}%.`);
    changed = true;
  }

  const vatMatch = input.match(/(?:ндс|налог)[^\d]{0,30}(\d+(?:[.,]\d+)?)\s*%/i);
  if (vatMatch) {
    next.vatPercent = Number(vatMatch[1].replace(",", "."));
    notes.push(`НДС изменён на ${next.vatPercent}%.`);
    changed = true;
  }

  const profitMatch = input.match(/(?:прибыл|марж)[^\d]{0,30}(\d+(?:[.,]\d+)?)\s*%/i);
  if (profitMatch) {
    next.profitPercent = Number(profitMatch[1].replace(",", "."));
    notes.push(`Прибыль изменена на ${next.profitPercent}%.`);
    changed = true;
  }

  if (!changed) return null;
  next.status = "draft";
  next.revision = current.revision + 1;
  next.updatedAt = new Date().toISOString();
  const review = reviewArgs(next);
  const state = changedState(next, review);
  return {
    text: `${notes.join(" ")} Создана версия ${next.revision}; предыдущая версия сохранена в истории.`,
    tools: [
      { name: "estimate_draft", args: next },
      { name: "estimate_review", args: review }
    ],
    ...state,
    steps: ["apply-change", "recalculate", "review"]
  };
}

function compareRun(draft: EstimateDraft): RulesRun {
  const calculation = calculateEstimate(draft);
  const total = calculation.total;
  const options = [
    {
      id: "economy",
      label: "Экономичный",
      total: Math.round(total * 0.9 * 100) / 100,
      description: "Оптимизация закупки и замена только допустимых материалов после проверки технологии.",
      changes: ["−10% ориентир", "нужна проверка замен"]
    },
    {
      id: "base",
      label: "Базовый",
      total,
      description: "Текущий состав работ и ресурсов без скрытых сокращений.",
      changes: ["текущая редакция"],
      recommended: true
    },
    {
      id: "robust",
      label: "С резервом",
      total: Math.round(total * 1.12 * 100) / 100,
      description: "Резерв на колебание цен и уточнение скрытых объёмов.",
      changes: ["+12% резерв", "меньше риск доплат"]
    }
  ];
  return {
    text:
      "Сравнил три сценария в текущем чате. Это управленческие варианты, а не подмена подтверждённых цен: перед выбором проверьте источники и допустимость замен.",
    tools: [
      {
        name: "estimate_comparison",
        args: {
          title: `Сравнение — ${draft.title}`,
          currency: draft.currency,
          options,
          recommendation:
            "Базовый вариант сохраняет технологическую полноту. Экономичный следует применять только после подтверждения конкретных замен."
        }
      }
    ],
    state: fullState(draft),
    steps: ["compare-variants"]
  };
}

function reviewRun(draft: EstimateDraft): RulesRun {
  const review = reviewArgs(draft);
  return {
    text:
      review.blockers.length > 0
        ? "Независимая проверка нашла данные, которые необходимо подтвердить перед утверждением."
        : "Независимая проверка завершена: смету можно утверждать и передавать клиенту.",
    tools: [{ name: "estimate_review", args: review }],
    state: fullState(draft, { validation: review }),
    stateDelta: [{ op: "replace", path: "/validation", value: review }],
    steps: ["independent-review"]
  };
}

function executionRun(input: string, draft: EstimateDraft): RulesRun {
  const percent = Math.max(0, Math.min(100, extractPercent(input, 100)));
  const calculation = calculateEstimate(draft);
  const completed = Math.round((calculation.total * percent) / 100 * 100) / 100;
  const remaining = Math.round((calculation.total - completed) * 100) / 100;
  const tools: RulesToolCall[] = [
    {
      name: "execution_progress",
      args: {
        title: `Исполнение — ${draft.title}`,
        percent,
        currency: draft.currency,
        total: calculation.total,
        completed,
        remaining,
        notes: [
          "Процент принят из сообщения пользователя.",
          "Перед подписанием акта проверьте фактические объёмы каждой позиции."
        ]
      }
    }
  ];
  if (/акт|кс\s*2|кс-2/.test(normal(input))) {
    tools.push(documentToolCall("act_draft", "Акт выполненных работ", draft, percent));
  }
  return {
    text: `Рассчитал выполнение ${percent}% по текущей смете и остаток.`,
    tools,
    state: fullState(draft, {
      documents: tools.filter((tool) => tool.name.endsWith("draft")).map((tool) => tool.args)
    }),
    steps: ["calculate-execution", "prepare-document"]
  };
}

function documentToolCall(tool: string, title: string, draft: EstimateDraft | null, percent?: number) {
  const total = draft ? calculateEstimate(draft).total : 0;
  const amount = percent == null ? total : Math.round((total * percent) / 100 * 100) / 100;
  const object = draft?.objectName || "____________________";
  const customer = draft?.customer || "____________________";
  const contractor = draft?.contractor || "____________________";
  const content = `
    <h2>Объект</h2>
    <p>${object}</p>
    <h2>Стороны</h2>
    <p>Заказчик: ${customer}</p>
    <p>Подрядчик: ${contractor}</p>
    <h2>Основание</h2>
    <p>Документ сформирован на основании сметы «${draft?.title || "смета не выбрана"}», версия ${draft?.revision ?? "—"}.</p>
    <h2>Стоимость</h2>
    <p>${amount.toLocaleString("ru-RU")} ${draft?.currency ?? "RUB"}${percent == null ? "" : ` — ${percent}% выполнения`}.</p>
    <h2>Условия и подтверждение</h2>
    <p>Фактические объёмы, сроки, порядок оплаты, НДС, гарантии и реквизиты должны быть проверены сторонами до подписания.</p>
    <h2>Подписи</h2>
    <p>Заказчик: ____________________</p>
    <p>Подрядчик: ____________________</p>
  `;
  return {
    name: tool,
    args: {
      id: uuid("document"),
      type: tool.replace(/_draft$/, ""),
      title,
      content,
      missingFields: [
        ...(draft?.customer ? [] : ["реквизиты заказчика"]),
        ...(draft?.contractor ? [] : ["реквизиты подрядчика"]),
        "срок выполнения",
        "порядок оплаты",
        "подписи сторон"
      ],
      status: "draft",
      revision: 1
    }
  } satisfies RulesToolCall;
}

function documentRun(input: string, draft: EstimateDraft | null): RulesRun {
  const lower = normal(input);
  const percent = /%/.test(input) ? extractPercent(input, 100) : undefined;
  let tool = "commercial_proposal";
  let title = "Коммерческое предложение";
  if (/договор/.test(lower) && /приложен/.test(lower)) {
    tool = "contract_appendix";
    title = "Приложение к договору — смета и условия работ";
  } else if (/договор/.test(lower)) {
    tool = "contract_draft";
    title = "Договор подряда на выполнение строительных работ";
  } else if (/кс\s*2|кс-2/.test(lower)) {
    tool = "ks2_draft";
    title = "Акт о приёмке выполненных работ (КС-2)";
  } else if (/кс\s*3|кс-3/.test(lower)) {
    tool = "ks3_draft";
    title = "Справка о стоимости выполненных работ (КС-3)";
  } else if (/м\s*29|м-29/.test(lower)) {
    tool = "m29_draft";
    title = "Отчёт о расходе материалов (М-29)";
  } else if (/дефект/.test(lower)) {
    tool = "defect_statement";
    title = "Дефектная ведомость";
  } else if (/ведомост.*материал|материал.*ведомост/.test(lower)) {
    tool = "material_statement";
    title = "Ведомость материалов";
  } else if (/спецификац.*оборуд/.test(lower)) {
    tool = "equipment_specification";
    title = "Спецификация оборудования";
  } else if (/график|календарн/.test(lower)) {
    tool = "work_schedule";
    title = "График производства работ";
  } else if (/сч[её]т|инвойс/.test(lower)) {
    tool = "invoice_draft";
    title = "Счёт на оплату";
  } else if (/акт/.test(lower)) {
    tool = "act_draft";
    title = "Акт выполненных работ";
  }

  const call = documentToolCall(tool, title, draft, percent);
  const tools: RulesToolCall[] = [];
  if (draft && percent != null && /акт|кс\s*2|кс-2|кс\s*3|кс-3/.test(lower)) {
    const calculation = calculateEstimate(draft);
    const completed = Math.round((calculation.total * percent) / 100 * 100) / 100;
    tools.push({
      name: "execution_progress",
      args: {
        title: `Исполнение — ${draft.title}`,
        percent,
        currency: draft.currency,
        total: calculation.total,
        completed,
        remaining: Math.round((calculation.total - completed) * 100) / 100,
        notes: ["Процент выполнения принят из сообщения."]
      }
    });
  }
  tools.push(call);
  return {
    text:
      `Подготовил редактируемый документ «${title}» прямо в текущем чате. ` +
      "Критичные незаполненные условия отмечены отдельно; перед подписанием проверьте реквизиты, сроки и расчёты.",
    tools,
    state: fullState(draft, { documents: [call.args] }),
    steps: ["prepare-document", "validate-required-fields"]
  };
}

function needsDocument(input: string) {
  return /договор|коммерческ.*предлож|\bкп\b|акт|кс\s*[- ]?2|кс\s*[- ]?3|м\s*[- ]?29|дефект|ведомост.*материал|спецификац.*оборуд|график|календарн|сч[её]т|инвойс/i.test(
    input
  );
}

function needsComparison(input: string) {
  return /сравн|вариант|оптимист|эконом|дорог|value engineering|замен.*вариант/i.test(input);
}

function needsReview(input: string) {
  return /проверь|проверка|ревью|ошибк|точност|можно утверждать/i.test(input);
}

function needsExecution(input: string) {
  return /выполнен|закрыт|процент выполнения|остаток|частичн/i.test(input) && /%/.test(input);
}

function askForInput(input: string): RulesRun {
  const intake = extractSiteIntake(input);
  return {
    text:
      "Я сохраню всё в одном чате, но пока не распознал вид работ. Укажите вид работ и хотя бы один измеримый объём; остальные данные можно уточнить позднее.",
    tools: [
      {
        name: "project_case",
        args: {
          id: uuid("project"),
          objectName: intake.objectName || "Новый объект",
          region: extractRegion(input),
          stage: "Сбор исходных данных",
          summary: input.slice(0, 500),
          workTypes: [],
          assumptions: [],
          missing: ["вид работ", "измеримый объём", "регион или адрес объекта"]
        }
      },
      {
        name: "ask_user",
        args: {
          title: "Опишите строительную задачу",
          context: "Достаточно короткой записи замерщика — формальный бриф не нужен.",
          questions: [
            "Что именно нужно построить, отремонтировать или демонтировать?",
            "Какой известен объём: м², м³, пог. м, количество точек или комплектов?",
            "Где находится объект?"
          ],
          assumptions: ["Неизвестные цены будут оставлены пустыми, а не выдуманы."]
        }
      }
    ],
    state: fullState(null, {
      project: { objectName: intake.objectName || "", customer: intake.customer || "", region: extractRegion(input) },
      validation: { status: "input_required" }
    }),
    steps: ["analysis", "request-critical-input"]
  };
}

export function runRulesAgent(input: string, context: RulesAgentContext = {}): RulesRun {
  const current = activeEstimate(context);

  if (current) {
    if (needsComparison(input)) return compareRun(current);
    if (needsExecution(input)) return executionRun(input, current);
    if (needsReview(input)) return reviewRun(current);
    if (needsDocument(input)) return documentRun(input, current);
    const mutation = mutateEstimate(input, current);
    if (mutation) return mutation;
  }

  if (needsDocument(input)) return documentRun(input, current);
  const kind = detectScenario(input);
  if (kind) return estimateRun(scenarios[kind], input);
  return askForInput(input);
}
