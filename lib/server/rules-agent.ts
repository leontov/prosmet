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
      workTypes: ["кровельные работы", "демонтаж", "ремонт"],
      defaultArea: 180,
      technology: [
        { title: "Обследование кровли и схемы стропильной системы" },
        { title: "Ограждение зоны и организация безопасного подъёма" },
        { title: "Демонтаж существующего покрытия и сортировка отходов" },
        { title: "Проверка и локальный ремонт основания" },
        { title: "Монтаж гидроизоляции, обрешётки и контробрешётки" },
        { title: "Монтаж нового покрытия и доборных элементов" },
        { title: "Устройство примыканий, конька, карнизов и водоотвода" },
        { title: "Контроль крепежа, герметичности и уборка" }
      ],
      assumptions: ["Уклон кровли принят от 20° до 35°.", "Несущая способность стропил не требует полной замены."],
      missing: ["геометрия скатов", "высота здания", "состав существующего пирога"],
      sections: (area, region) => [
        {
          id: "roof-demolition",
          title: "Демонтаж",
          items: [
            item("roof-remove", "Демонтаж старого кровельного покрытия", "м²", area, "work", region, {
              unitPrice: 220,
              confidence: 55
            }),
            item("roof-waste", "Спуск, погрузка и вывоз строительных отходов", "т", Math.max(1, Math.round(area * 0.018 * 10) / 10), "logistics", region, {
              unitPrice: 4800,
              confidence: 45
            })
          ]
        },
        {
          id: "roof-installation",
          title: "Новая кровля",
          items: [
            item("roof-membrane", "Гидроветрозащитная мембрана", "м²", Math.ceil(area * 1.1), "material", region, {
              unitPrice: 85,
              confidence: 45
            }),
            item("roof-batten", "Обрешётка и контробрешётка", "м²", area, "work", region, {
              unitPrice: 420,
              confidence: 45
            }),
            item("roof-cover", "Металлочерепица 0,5 мм с доборными элементами", "м²", Math.ceil(area * 1.1), "material", region, {
              unitPrice: 780,
              confidence: 45
            }),
            item("roof-install", "Монтаж кровельного покрытия", "м²", area, "work", region, {
              unitPrice: 650,
              confidence: 45
            })
          ]
        }
      ]
    },
    heating: {
      kind: "heating",
      title: "Монтаж системы отопления",
      objectName: "Жилой дом",
      workTypes: ["отопление", "ОВиК", "сантехнические работы"],
      defaultArea: 150,
      technology: [
        { title: "Сбор исходных данных и теплотехнических параметров" },
        { title: "Определение схемы отопления и трасс" },
        { title: "Разметка, проходки и подготовка креплений" },
        { title: "Монтаж котельного оборудования и группы безопасности" },
        { title: "Монтаж трубопроводов, коллекторов и арматуры" },
        { title: "Монтаж радиаторов и узлов подключения" },
        { title: "Опрессовка, промывка и заполнение" },
        { title: "Пусконаладка и балансировка" }
      ],
      assumptions: ["Принята двухтрубная система.", "Источник энергии и мощность котла требуют подтверждения."],
      missing: ["теплопотери", "число помещений", "тип топлива", "точная длина трасс"],
      sections: (area, region) => {
        const radiators = Math.max(6, Math.ceil(area / 15));
        return [
          {
            id: "heating-equipment",
            title: "Оборудование и материалы",
            items: [
              item("heating-boiler", "Котёл отопительный", "шт", 1, "equipment", region, { unitPrice: 72000, confidence: 35 }),
              item("heating-radiator", "Радиатор с комплектом подключения", "шт", radiators, "equipment", region, { unitPrice: 9500, confidence: 40 }),
              item("heating-pipe", "Трубопровод с крепежом и изоляцией", "м", Math.ceil(area * 1.8), "material", region, { unitPrice: 420, confidence: 35 }),
              item("heating-valves", "Арматура, коллекторы и фитинги", "компл.", 1, "material", region, { unitPrice: Math.round(area * 450), confidence: 30 })
            ]
          },
          {
            id: "heating-work",
            title: "Монтаж и пусконаладка",
            items: [
              item("heating-install", "Монтаж системы отопления", "м²", area, "work", region, { unitPrice: 1250, confidence: 40 }),
              item("heating-test", "Опрессовка и пусконаладка", "компл.", 1, "service", region, { unitPrice: 18000, confidence: 40 })
            ]
          }
        ];
      }
    },
    electrical: {
      kind: "electrical",
      title: "Электромонтаж квартиры",
      objectName: "Квартира",
      workTypes: ["электромонтаж", "электрика"],
      defaultArea: 80,
      technology: [
        { title: "Сбор нагрузок и зонирование помещений" },
        { title: "Разработка однолинейной схемы и групп" },
        { title: "Разметка трасс, точек и оборудования" },
        { title: "Штробление и подготовка подрозетников" },
        { title: "Прокладка кабеля и слаботочных линий" },
        { title: "Сборка и монтаж щита" },
        { title: "Установка механизмов и светильников" },
        { title: "Измерения, маркировка и проверка" }
      ],
      assumptions: ["Принята скрытая проводка в негорючем кабеле.", "Количество точек оценено по площади."],
      missing: ["план мебели", "состав щита", "число силовых групп"],
      sections: (area, region) => {
        const points = Math.ceil(area * 0.9);
        const cable = Math.ceil(area * 7);
        return [
          {
            id: "electrical-materials",
            title: "Материалы",
            items: [
              item("electrical-cable", "Кабель силовой и осветительный", "м", cable, "material", region, { unitPrice: 115, confidence: 40 }),
              item("electrical-point", "Подрозетник, механизм и рамка", "точка", points, "material", region, { unitPrice: 680, confidence: 35 }),
              item("electrical-panel", "Щит, автоматы, УЗО и комплектующие", "компл.", 1, "equipment", region, { unitPrice: Math.round(area * 850), confidence: 30 })
            ]
          },
          {
            id: "electrical-work",
            title: "Электромонтажные работы",
            items: [
              item("electrical-groove", "Штробление и подготовка посадочных мест", "точка", points, "work", region, { unitPrice: 420, confidence: 40 }),
              item("electrical-install", "Монтаж кабеля, механизмов и щита", "точка", points, "work", region, { unitPrice: 900, confidence: 40 }),
              item("electrical-test", "Измерения и проверка электроустановки", "компл.", 1, "service", region, { unitPrice: 12000, confidence: 35 })
            ]
          }
        ];
      }
    },
    facade: {
      kind: "facade",
      title: "Устройство фасада",
      objectName: "Фасад здания",
      workTypes: ["фасад", "утепление"],
      defaultArea: 240,
      technology: [
        { title: "Обследование фасада и подготовка основания" },
        { title: "Монтаж лесов и защитной сетки" },
        { title: "Грунтование и установка стартового профиля" },
        { title: "Монтаж теплоизоляции и тарельчатых дюбелей" },
        { title: "Армирующий слой с сеткой" },
        { title: "Грунтование под декоративный слой" },
        { title: "Нанесение декоративной штукатурки" },
        { title: "Окраска, демонтаж лесов и уборка" }
      ],
      assumptions: ["Толщина утеплителя принята 100 мм.", "Основание не требует капитального ремонта."],
      missing: ["высота здания", "тип основания", "схема примыканий"],
      sections: (area, region) => [
        {
          id: "facade-materials",
          title: "Материалы",
          items: [
            item("facade-insulation", "Теплоизоляция 100 мм", "м²", Math.ceil(area * 1.05), "material", region, { unitPrice: 1150, confidence: 35 }),
            item("facade-mesh", "Клей, сетка и крепёж", "м²", area, "material", region, { unitPrice: 480, confidence: 35 }),
            item("facade-finish", "Декоративная штукатурка и фасадная краска", "м²", area, "material", region, { unitPrice: 720, confidence: 30 })
          ]
        },
        {
          id: "facade-work",
          title: "Фасадные работы",
          items: [
            item("facade-scaffold", "Монтаж, аренда и демонтаж лесов", "м²", area, "service", region, { unitPrice: 280, confidence: 30 }),
            item("facade-install", "Утепление и устройство армирующего слоя", "м²", area, "work", region, { unitPrice: 1300, confidence: 35 }),
            item("facade-finish-work", "Декоративная отделка и окраска", "м²", area, "work", region, { unitPrice: 900, confidence: 35 })
          ]
        }
      ]
    },
    landscaping: {
      kind: "landscaping",
      title: "Благоустройство территории",
      objectName: "Территория объекта",
      workTypes: ["благоустройство", "дорожные работы"],
      defaultArea: 500,
      technology: [
        { title: "Геодезическая разбивка и организация площадки" },
        { title: "Снятие растительного слоя и планировка" },
        { title: "Устройство разделительного геотекстиля" },
        { title: "Устройство песчаного основания" },
        { title: "Устройство щебёночного основания" },
        { title: "Установка бортового камня" },
        { title: "Устройство покрытия" },
        { title: "Восстановление газона и уборка" }
      ],
      assumptions: ["Толщина песчаного и щебёночного основания принята по 100 мм."],
      missing: ["вертикальная планировка", "категория нагрузки", "протяжённость бортов"],
      sections: (area, region) => [
        {
          id: "land-earth",
          title: "Земляные работы и основание",
          items: [
            item("land-excavation", "Снятие растительного слоя и планировка", "м²", area, "work", region, { unitPrice: 160, confidence: 35 }),
            item("land-geotextile", "Геотекстиль", "м²", Math.ceil(area * 1.1), "material", region, { unitPrice: 75, confidence: 35 }),
            item("land-sand", "Песчаное основание 100 мм", "м³", Math.ceil(area * 0.1 * 1.1), "material", region, { unitPrice: 1800, confidence: 30 }),
            item("land-gravel", "Щебёночное основание 100 мм", "м³", Math.ceil(area * 0.1 * 1.1), "material", region, { unitPrice: 2600, confidence: 30 })
          ]
        },
        {
          id: "land-cover",
          title: "Покрытие",
          items: [
            item("land-paving", "Устройство покрытия из тротуарной плитки", "м²", area, "work", region, { unitPrice: 1250, confidence: 35 }),
            item("land-paving-material", "Тротуарная плитка и сухая смесь", "м²", Math.ceil(area * 1.05), "material", region, { unitPrice: 1450, confidence: 30 })
          ]
        }
      ]
    },
    demolition: {
      kind: "demolition",
      title: "Демонтажные работы",
      objectName: "Объект демонтажа",
      workTypes: ["демонтаж"],
      defaultArea: 100,
      technology: [
        { title: "Обследование конструкций и отключение инженерных сетей" },
        { title: "Ограждение зоны и пылезащита" },
        { title: "Разборка отделки и инженерных элементов" },
        { title: "Последовательный демонтаж конструкций" },
        { title: "Сортировка и временное складирование" },
        { title: "Погрузка и вывоз отходов" },
        { title: "Контроль сохранности смежных конструкций" },
        { title: "Финальная уборка" }
      ],
      assumptions: ["Опасные отходы и асбест не выявлены."],
      missing: ["материал конструкций", "толщина", "доступ техники"],
      sections: (area, region) => [
        {
          id: "demo-work",
          title: "Демонтаж и обращение с отходами",
          items: [
            item("demo-protection", "Пылезащита и ограждение рабочей зоны", "компл.", 1, "service", region, { unitPrice: 12000, confidence: 35 }),
            item("demo-main", "Демонтаж конструкций и отделки", "м²", area, "work", region, { unitPrice: 850, confidence: 35 }),
            item("demo-load", "Погрузка и вывоз отходов", "т", Math.max(1, Math.round(area * 0.08 * 10) / 10), "logistics", region, { unitPrice: 5200, confidence: 35 })
          ]
        }
      ]
    },
    renovation: {
      kind: "renovation",
      title: "Капитальный ремонт помещения",
      objectName: "Ремонтируемое помещение",
      workTypes: ["капитальный ремонт", "ремонт", "отделка"],
      defaultArea: 100,
      technology: [
        { title: "Обследование и дефектная ведомость" },
        { title: "Организация площадки и защита сохраняемых элементов" },
        { title: "Демонтаж отделки и инженерных элементов" },
        { title: "Ремонт оснований и скрытых конструкций" },
        { title: "Монтаж инженерных систем" },
        { title: "Черновая отделка" },
        { title: "Чистовая отделка и монтаж оборудования" },
        { title: "Испытания, уборка и сдача" }
      ],
      assumptions: ["Состав ремонта принят комплексным по площади."],
      missing: ["ведомость помещений", "состав инженерных систем", "класс отделки"],
      sections: (area, region) => [
        {
          id: "renovation-main",
          title: "Комплекс работ",
          items: [
            item("renovation-demo", "Демонтаж и вывоз отходов", "м²", area, "work", region, { unitPrice: 750, confidence: 30 }),
            item("renovation-rough", "Черновые ремонтно-отделочные работы", "м²", area, "work", region, { unitPrice: 4500, confidence: 30 }),
            item("renovation-finish", "Чистовые отделочные работы", "м²", area, "work", region, { unitPrice: 6500, confidence: 30 }),
            item("renovation-materials", "Комплект материалов", "м²", area, "material", region, { unitPrice: 7500, confidence: 25 })
          ]
        }
      ]
    },
    plumbing: {
      kind: "plumbing",
      title: "Монтаж водоснабжения и канализации",
      objectName: "Система водоснабжения",
      workTypes: ["водоснабжение", "канализация", "сантехнические работы"],
      defaultArea: 100,
      technology: [
        { title: "Сбор исходных данных и определение точек подключения" },
        { title: "Разработка схемы трасс и узлов" },
        { title: "Разметка и устройство проходок" },
        { title: "Монтаж трубопроводов водоснабжения" },
        { title: "Монтаж канализационных трубопроводов" },
        { title: "Монтаж арматуры, коллекторов и оборудования" },
        { title: "Испытание герметичности и промывка" },
        { title: "Подключение приборов и сдача" }
      ],
      assumptions: ["Принята коллекторная схема водоснабжения."],
      missing: ["число санитарных приборов", "точки стояков", "длины трасс"],
      sections: (area, region) => [
        {
          id: "plumbing-materials",
          title: "Материалы и оборудование",
          items: [
            item("plumbing-water", "Трубы и фитинги водоснабжения", "м", Math.ceil(area * 1.4), "material", region, { unitPrice: 360, confidence: 35 }),
            item("plumbing-sewer", "Трубы и фитинги канализации", "м", Math.ceil(area * 0.7), "material", region, { unitPrice: 520, confidence: 35 }),
            item("plumbing-collector", "Коллекторы, арматура и фильтрация", "компл.", 1, "equipment", region, { unitPrice: Math.round(area * 450), confidence: 30 })
          ]
        },
        {
          id: "plumbing-work",
          title: "Монтаж и испытания",
          items: [
            item("plumbing-install", "Монтаж водоснабжения и канализации", "м²", area, "work", region, { unitPrice: 1200, confidence: 35 }),
            item("plumbing-test", "Испытания и промывка", "компл.", 1, "service", region, { unitPrice: 9000, confidence: 35 })
          ]
        }
      ]
    },
    foundation: {
      kind: "foundation",
      title: "Устройство монолитного фундамента",
      objectName: "Фундамент здания",
      workTypes: ["фундамент", "монолит", "бетонные работы"],
      defaultArea: 100,
      technology: [
        { title: "Геодезическая разбивка" },
        { title: "Разработка котлована и подготовка основания" },
        { title: "Устройство песчано-щебёночной подготовки" },
        { title: "Монтаж опалубки" },
        { title: "Армирование" },
        { title: "Бетонирование и вибрирование" },
        { title: "Уход за бетоном и распалубка" },
        { title: "Гидроизоляция и обратная засыпка" }
      ],
      assumptions: ["Фундамент принят ленточным монолитным."],
      missing: ["геология", "размеры ленты", "класс бетона", "схема армирования"],
      sections: (area, region) => {
        const concrete = Math.max(10, Math.round(area * 0.4 * 10) / 10);
        return [
          {
            id: "foundation-earth",
            title: "Земляные и подготовительные работы",
            items: [
              item("foundation-excavation", "Разработка грунта", "м³", Math.round(concrete * 1.8 * 10) / 10, "work", region, { unitPrice: 950, confidence: 30 }),
              item("foundation-base", "Песчано-щебёночная подготовка", "м³", Math.round(concrete * 0.35 * 10) / 10, "material", region, { unitPrice: 2600, confidence: 30 })
            ]
          },
          {
            id: "foundation-concrete",
            title: "Монолитные работы",
            items: [
              item("foundation-formwork", "Опалубка", "м²", Math.round(area * 1.4), "work", region, { unitPrice: 1200, confidence: 30 }),
              item("foundation-rebar", "Арматура", "кг", Math.round(concrete * 110), "material", region, { unitPrice: 82, confidence: 30 }),
              item("foundation-concrete-material", "Бетон", "м³", concrete, "material", region, { unitPrice: 6800, confidence: 30 }),
              item("foundation-placement", "Бетонирование и вибрирование", "м³", concrete, "work", region, { unitPrice: 2200, confidence: 30 })
            ]
          }
        ];
      }
    }
  };
}

function detectScenario(input: string) {
  const value = normal(input);
  const map: Array<[ScenarioKind, RegExp]> = [
    ["roof", /кровл|крыша|шифер|металлочереп/],
    ["heating", /отоплен|котел|котёл|радиатор|овик/],
    ["electrical", /электр|провод|розет|щит/],
    ["facade", /фасад|утеплен/],
    ["landscaping", /благоустр|плитк|асфальт|дорож/],
    ["demolition", /демонтаж|снос|разбор/],
    ["renovation", /капремонт|капитальн|ремонт помещ|ремонт квартир/],
    ["plumbing", /водоснаб|канализац|сантех/],
    ["foundation", /фундамент|монолит|бетон/],
    ["plaster", /штукатур/]
  ];
  return map.find(([, expression]) => expression.test(value))?.[0] ?? "renovation";
}

function titleForScenario(scenario: Scenario, area: number) {
  return `${scenario.title} — ${area} м²`;
}

function projectCase(scenario: Scenario, estimate: EstimateDraft, input: string) {
  const intake = extractSiteIntake(input);
  return {
    id: `project_${estimate.id}`,
    name: estimate.objectName,
    customer: estimate.customer,
    kind: scenario.kind,
    stage: "estimate",
    region: estimate.region,
    sourceMessage: input,
    assumptions: estimate.assumptions,
    missingCriticalFields: scenario.missing,
    extracted: {
      objectName: intake.objectName,
      customer: intake.customer,
      area: extractArea(input, scenario.defaultArea),
      layerCm: scenario.kind === "plaster" ? extractLayerCm(input) : undefined
    }
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
      `Подготовил технологическую карту, ресурсную ведомость, проверку цен и редактируемую смету «${estimate.title}». ` +
      "Откройте карточку сметы: объёмы, цены и позиции редактируются в печатном документе, а новая версия появится в этом же чате.",
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
  for (const key of ["activeEstimate", "estimate", "args", "state", "snapshot", "draft", "content", "message", "messages"]) {
    if (key in object) {
      const found = findEstimate(object[key], depth + 1);
      if (found) return found;
    }
  }
  for (const nested of Object.values(object)) {
    const found = findEstimate(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

function latestEstimate(context?: RulesAgentContext) {
  return findEstimate(context?.state) ?? findEstimate(context?.messages);
}

function looksLikeModification(value: string) {
  return /измени|поменяй|замени|добавь|удали|убери|исключи|скидк|ндс|налог|накладн|прибыл|заказчик|объект|регион|цена|стоимост|количеств|объем|объём/i.test(value);
}

function parseNamedNumber(input: string, label: RegExp) {
  const match = input.match(new RegExp(`${label.source}[^\d]{0,24}(\d+(?:[.,]\d+)?)`, "i"));
  return match ? Number(match[1].replace(",", ".")) : null;
}

function updateEstimate(previous: EstimateDraft, input: string): EstimateDraft {
  const next = structuredClone(previous) as EstimateDraft;
  next.revision = previous.revision + 1;
  next.status = "draft";
  next.updatedAt = new Date().toISOString();
  const normalized = normal(input);

  const customerMatch = input.match(/(?:заказчик|клиент)\s*[:—-]\s*([^\n,.]+)/i);
  if (customerMatch?.[1]) next.customer = customerMatch[1].trim();
  const objectMatch = input.match(/(?:объект|адрес)\s*[:—-]\s*([^\n]+)/i);
  if (objectMatch?.[1]) next.objectName = objectMatch[1].trim().replace(/[.]+$/, "");
  const region = extractRegion(input);
  if (region !== "Регион не указан") next.region = region;

  const discount = parseNamedNumber(input, /скидк\w*/);
  if (discount !== null) next.discountPercent = discount;
  const vat = parseNamedNumber(input, /(?:ндс|налог\w*)/);
  if (vat !== null) next.vatPercent = vat;
  const overhead = parseNamedNumber(input, /накладн\w*/);
  if (overhead !== null) next.overheadPercent = overhead;
  const profit = parseNamedNumber(input, /(?:прибыл\w*|рентабельност\w*)/);
  if (profit !== null) next.profitPercent = profit;

  const remove = input.match(/(?:удали|убери|исключи)\s+([^\n,.]+)/i)?.[1]?.trim();
  if (remove) {
    const token = normal(remove).split(" ").find((part) => part.length >= 4);
    if (token) {
      next.sections = next.sections
        .map((section) => ({
          ...section,
          items: section.items.filter((line) => !normal(line.name).includes(token))
        }))
        .filter((section) => section.items.length > 0);
    }
  }

  const priceMatch = input.match(/(?:цена|цену|стоимость)\s+(?:на\s+)?([^\n,.;]+?)\s+(?:на\s+|=\s*)?(\d+(?:[.,]\d+)?)\s*(?:руб|₽)?/i);
  if (priceMatch) {
    const target = normal(priceMatch[1]);
    const price = Number(priceMatch[2].replace(",", "."));
    const targetTokens = target.split(" ").filter((part) => part.length >= 4);
    for (const section of next.sections) {
      const matching = section.items.filter((line) => {
        const name = normal(line.name);
        return targetTokens.some((token) => name.includes(token));
      });
      for (const line of matching.length ? matching : section.items.filter((line) => line.resourceType === "work")) {
        line.unitPrice = price;
        line.source = priceSource("Цена изменена пользователем в чате", "personal", next.region, 100);
      }
      if (matching.length) break;
    }
  }

  const addMatch = input.match(/добавь\s+([^\n,.;]+?)\s+(\d+(?:[.,]\d+)?)\s*(м²|м2|м|п\.?\s*м|шт|компл\.?)[^\d]*(?:по\s+)?(\d+(?:[.,]\d+)?)\s*(?:руб|₽)?/i);
  if (addMatch) {
    const [, name, quantityText, unitText, priceText] = addMatch;
    const section = next.sections.at(-1) ?? { id: uuid("section"), title: "Дополнительные работы", items: [] };
    if (!next.sections.length) next.sections.push(section);
    section.items.push(
      item(uuid("item"), name.trim(), unitText.replace(/м2/i, "м²"), Number(quantityText.replace(",", ".")), "work", next.region, {
        unitPrice: Number(priceText.replace(",", ".")),
        sourceKind: "personal",
        sourceLabel: "Пользовательская цена из сообщения",
        confidence: 100
      })
    );
  }

  if (normalized.includes("замени") && /металлочереп/.test(normalized)) {
    for (const section of next.sections) {
      for (const line of section.items) {
        if (/профлист|профнастил|шифер/i.test(line.name)) {
          line.name = "Металлочерепица 0,5 мм с доборными элементами";
          line.unitPrice = Math.max(line.unitPrice, 780);
          line.source = priceSource("Ориентировочная замена материала", "indicative", next.region, 45);
        }
      }
    }
  }

  next.warnings = [
    ...previous.warnings,
    "Версия изменена по последнему сообщению пользователя; перед отправкой проверьте состав и цены."
  ];
  return EstimateDraftSchema.parse(next);
}

function documentTool(name: string, title: string, estimate: EstimateDraft) {
  const calculation = calculateEstimate(estimate);
  const missingFields = [
    ...(estimate.contractor.trim() ? [] : ["Реквизиты подрядчика"]),
    ...(estimate.customer.trim() ? [] : ["Реквизиты заказчика"]),
    ...(estimate.objectName.trim() ? [] : ["Адрес или описание объекта"])
  ];
  const content = [
    `# ${title}`,
    "",
    `**Объект:** ${estimate.objectName || "не указан"}`,
    `**Заказчик:** ${estimate.customer || "не указан"}`,
    `**Подрядчик:** ${estimate.contractor || "не указан"}`,
    `**Регион:** ${estimate.region || "не указан"}`,
    `**Основание:** смета «${estimate.title}», версия ${estimate.revision}`,
    `**Стоимость:** ${calculation.total.toLocaleString("ru-RU")} ${estimate.currency}`,
    "",
    "## Состав работ",
    ...estimate.sections.flatMap((section) => [
      `### ${section.title}`,
      ...section.items.map(
        (line) =>
          `- ${line.name}: ${line.quantity} ${line.unit} × ${line.unitPrice.toLocaleString("ru-RU")} ${estimate.currency}`
      )
    ]),
    "",
    "## Условия, требующие заполнения",
    ...(missingFields.length ? missingFields.map((field) => `- ${field}`) : ["- Критичные поля заполнены."]),
    "",
    "Документ сформирован автоматически и требует проверки существенных условий сторонами."
  ].join("\n");
  return {
    name,
    args: {
      id: uuid("document"),
      type: name,
      title,
      status: "draft",
      revision: 1,
      estimateId: estimate.id,
      estimateRevision: estimate.revision,
      objectName: estimate.objectName,
      customer: estimate.customer,
      contractor: estimate.contractor,
      region: estimate.region,
      total: calculation.total,
      currency: estimate.currency,
      missingFields,
      content
    }
  };
}

function documentRequest(input: string, estimate: EstimateDraft): RulesRun | null {
  const value = normal(input);
  let tool: RulesToolCall | null = null;
  if (/коммерческ.*предлож|\bкп\b/.test(value)) {
    tool = documentTool("commercial_proposal", "Коммерческое предложение", estimate);
  } else if (/договор/.test(value)) {
    tool = documentTool("contract_draft", "Договор подряда", estimate);
  } else if (/кс\s*2|кс-2/.test(value)) {
    tool = documentTool("ks2_draft", "Акт о приёмке выполненных работ КС-2", estimate);
  } else if (/кс\s*3|кс-3/.test(value)) {
    tool = documentTool("ks3_draft", "Справка о стоимости выполненных работ КС-3", estimate);
  } else if (/м\s*29|м-29/.test(value)) {
    tool = documentTool("m29_draft", "Отчёт о расходе материалов М-29", estimate);
  } else if (/акт/.test(value)) {
    tool = documentTool("act_draft", "Акт выполненных работ", estimate);
  } else if (/счет|счёт|инвойс/.test(value)) {
    tool = documentTool("invoice_draft", "Счёт на оплату", estimate);
  } else if (/ведомост.*материал|материал.*ведомост/.test(value)) {
    tool = documentTool("material_statement", "Ведомость материалов", estimate);
  }
  if (!tool) return null;
  return {
    text: "Подготовил редактируемый документ на основании последней версии сметы. Заполните критичные реквизиты и проверьте существенные условия перед подписанием.",
    tools: [tool],
    state: fullState(estimate, {
      documents: [tool.args],
      workTrace: [
        { stage: "estimate", status: "completed" },
        { stage: "document", status: "completed" }
      ]
    }),
    steps: ["estimate", "document"]
  };
}

export function runRulesAgent(input: string, context: RulesAgentContext = {}): RulesRun {
  const prompt = input.trim();
  const previous = latestEstimate(context);
  if (previous) {
    const document = documentRequest(prompt, previous);
    if (document) return document;
    if (looksLikeModification(prompt)) {
      const estimate = updateEstimate(previous, prompt);
      const review = reviewArgs(estimate);
      return {
        text: `Обновил смету «${estimate.title}» и создал версию ${estimate.revision}. Изменения можно проверить и продолжить в этом же чате.`,
        tools: [
          { name: "estimate_draft", args: estimate },
          { name: "estimate_review", args: review }
        ],
        state: fullState(estimate, { validation: review }),
        stateDelta: [
          { op: "replace", path: "/activeEstimate", value: estimate },
          { op: "replace", path: "/estimateRevision", value: estimate.revision },
          { op: "replace", path: "/validation", value: review }
        ],
        steps: ["estimate-update", "review"]
      };
    }
  }
  const scenario = scenarioDefinitions()[detectScenario(prompt)];
  return estimateRun(scenario, prompt);
}
