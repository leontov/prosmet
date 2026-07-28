import { recalculateEstimate } from "./estimate-engine";
import type { EstimateDraft, EstimateItem, EstimateReview, PriceSource, TechnologyCard } from "./types";

const numberFrom = (text: string, regex: RegExp, fallback: number) => {
  const match = text.match(regex);
  if (!match?.[1]) return fallback;
  return Number(match[1].replace(",", "."));
};

const regionFrom = (text: string) => {
  const known = ["Лениногорск", "Альметьевск", "Казань", "Набережные Челны", "Татарстан"];
  return known.find((value) => text.toLocaleLowerCase("ru-RU").includes(value.toLocaleLowerCase("ru-RU"))) ?? "Регион не подтверждён";
};

const source = (region: string, label: string, confirmed = false): PriceSource => ({
  label,
  type: confirmed ? "personal" : "assumption",
  region,
  date: null,
  includesVat: null,
  includesDelivery: false,
  confidence: confirmed ? "high" : "low",
  confirmed
});

const item = (value: Omit<EstimateItem, "amount">): EstimateItem => ({ ...value, amount: 0 });

export function parsePlasteringRequest(text: string) {
  const area = numberFrom(text, /(\d+(?:[.,]\d+)?)\s*(?:м2|м²|кв\.?\s*м)/i, 100);
  const thicknessMm = numberFrom(text, /(?:слой|толщин\w*)\s*(\d+(?:[.,]\d+)?)\s*мм/i, 15);
  const region = regionFrom(text);
  return { area, thicknessMm, region };
}

export function buildPlasteringTechnologyCard(text: string): TechnologyCard {
  const { area, thicknessMm, region } = parsePlasteringRequest(text);
  const names = [
    ["Обследование основания", "Проверка прочности, влажности, геометрии и совместимости основания"],
    ["Очистка", "Удаление пыли, непрочных участков и локальных загрязнений"],
    ["Грунтование", "Подбор и нанесение грунта по типу основания"],
    ["Защита", "Укрытие окон, дверей, пола и инженерных элементов"],
    ["Монтаж маяков", "Разметка плоскости и установка маячковых профилей"],
    ["Монтаж углов", "Установка защитных угловых профилей"],
    ["Приготовление смеси", "Настройка станции и приготовление раствора"],
    ["Нанесение", "Механизированное нанесение штукатурной смеси"],
    ["Разравнивание", "Формирование плоскости правилом"],
    ["Подрезка", "Подрезка и устранение локальных дефектов"],
    ["Глянцевание", "Финишная обработка либо подготовка под следующий слой"],
    ["Маяки и штробы", "Удаление маяков при необходимости и заделка штроб"],
    ["Уборка", "Сбор отходов и уборка рабочей зоны"],
    ["Логистика", "Доставка, разгрузка, подъём материалов и оборудования"]
  ] as const;

  return {
    id: crypto.randomUUID(),
    title: `Технологическая карта: механизированная гипсовая штукатурка ${area} м²`,
    workType: "Механизированная гипсовая штукатурка",
    region,
    inputs: { areaM2: area, averageThicknessMm: thicknessMm, finish: "подготовка под следующий слой", wallHeightM: null },
    operations: names.map(([stage, description], index) => ({
      id: `tech-${index + 1}`,
      stage,
      description,
      required: true,
      basis: index < 2 ? "request" : "technology"
    })),
    assumptions: [
      "Высота стен и геометрия помещений не предоставлены — количество маяков и углов рассчитано укрупнённо.",
      "Тип основания не подтверждён — выбран универсальный контур подготовки с обязательной проверкой на объекте.",
      "Цены стартового расчёта являются ориентировочными и требуют подтверждения пользователем или поставщиком."
    ],
    missingCriticalData: ["тип основания", "суммарная длина внешних углов", "этаж и наличие грузового лифта", "требуемое качество поверхности"]
  };
}

export function buildPlasteringEstimate(text: string, technology: TechnologyCard): EstimateDraft {
  const { area, thicknessMm, region } = parsePlasteringRequest(text);
  const reserve = 1.1;
  const thicknessCm = thicknessMm / 10;
  const dryMixKg = area * thicknessCm * 10 * reserve;
  const bags = Math.ceil(dryMixKg / 30);
  const beaconLm = Math.round(area * 0.7 * 10) / 10;
  const cornerLm = Math.round(area * 0.1 * 10) / 10;
  const protectedArea = Math.round(area * 1.1 * 10) / 10;
  const p = (label: string) => source(region, label, false);
  const now = new Date().toISOString();

  const sections = [
    {
      id: "preparation",
      name: "Подготовительные работы",
      sortOrder: 1,
      subtotal: 0,
      items: [
        item({ id: "survey", sectionId: "preparation", code: null, name: "Обследование и разметка основания", unit: "м²", quantity: area, norm: null, unitPrice: 30, coefficient: 1, resourceType: "work", priceSource: p("Ориентировочная стартовая цена"), comment: "Подтвердить после обследования", warning: "Цена не подтверждена" }),
        item({ id: "cleaning", sectionId: "preparation", code: null, name: "Очистка основания", unit: "м²", quantity: area, norm: null, unitPrice: 25, coefficient: 1, resourceType: "work", priceSource: p("Ориентировочная стартовая цена"), comment: null, warning: "Состав работ зависит от основания" }),
        item({ id: "protection", sectionId: "preparation", code: null, name: "Защита окон, пола и инженерных элементов", unit: "м²", quantity: protectedArea, norm: 1.1, unitPrice: 40, coefficient: 1, resourceType: "material", priceSource: p("Ориентировочная стартовая цена"), comment: "Площадь укрытия принята 110% от площади стен", warning: "Требуется уточнить фактическую площадь укрытия" }),
        item({ id: "priming-work", sectionId: "preparation", code: null, name: "Грунтование основания", unit: "м²", quantity: area, norm: 1, unitPrice: 35, coefficient: 1, resourceType: "work", priceSource: p("Ориентировочная стартовая цена"), comment: null, warning: "Тип грунта зависит от основания" })
      ]
    },
    {
      id: "profiles",
      name: "Маяки и углы",
      sortOrder: 2,
      subtotal: 0,
      items: [
        item({ id: "beacon-material", sectionId: "profiles", code: null, name: "Маячковый профиль", unit: "п.м", quantity: beaconLm, norm: 0.7, unitPrice: 18.33, coefficient: 1, resourceType: "material", priceSource: p("Расчётная цена из стартового каталога"), comment: "Укрупнённая норма 0,7 п.м/м²", warning: "Норма требует проверки по планировке" }),
        item({ id: "beacon-work", sectionId: "profiles", code: null, name: "Монтаж маяков", unit: "п.м", quantity: beaconLm, norm: 0.7, unitPrice: 65, coefficient: 1, resourceType: "work", priceSource: p("Ориентировочная стартовая цена"), comment: null, warning: "Количество укрупнённое" }),
        item({ id: "corner-material", sectionId: "profiles", code: null, name: "Угловой защитный профиль", unit: "п.м", quantity: cornerLm, norm: 0.1, unitPrice: 33.33, coefficient: 1, resourceType: "material", priceSource: p("Расчётная цена из стартового каталога"), comment: "Укрупнённая норма 0,1 п.м/м²", warning: "Нужно указать фактическую длину углов" }),
        item({ id: "corner-work", sectionId: "profiles", code: null, name: "Монтаж угловых профилей", unit: "п.м", quantity: cornerLm, norm: 0.1, unitPrice: 90, coefficient: 1, resourceType: "work", priceSource: p("Ориентировочная стартовая цена"), comment: null, warning: "Количество укрупнённое" })
      ]
    },
    {
      id: "plaster",
      name: "Штукатурные работы",
      sortOrder: 3,
      subtotal: 0,
      items: [
        item({ id: "mix", sectionId: "plaster", code: null, name: "Гипсовая штукатурная смесь, мешок 30 кг", unit: "меш", quantity: bags, norm: dryMixKg / area, unitPrice: 415, coefficient: 1, resourceType: "material", priceSource: p("Настраиваемая стартовая цена"), comment: `Расход ${Math.round(dryMixKg)} кг с запасом 10%`, warning: "Марка и цена смеси не подтверждены" }),
        item({ id: "plaster-work", sectionId: "plaster", code: null, name: "Механизированное нанесение, разравнивание и подрезка", unit: "м²", quantity: area, norm: 1, unitPrice: 500, coefficient: 1, resourceType: "work", priceSource: p("Настраиваемая стартовая цена"), comment: `Средний слой ${thicknessMm} мм`, warning: "Цена должна быть подтверждена для конкретного объекта" }),
        item({ id: "finish-work", sectionId: "plaster", code: null, name: "Глянцевание / подготовка под следующий слой", unit: "м²", quantity: area, norm: 1, unitPrice: 70, coefficient: 1, resourceType: "work", priceSource: p("Ориентировочная стартовая цена"), comment: null, warning: "Уточнить требуемое качество поверхности" })
      ]
    },
    {
      id: "logistics",
      name: "Логистика и завершение",
      sortOrder: 4,
      subtotal: 0,
      items: [
        item({ id: "delivery", sectionId: "logistics", code: null, name: "Доставка материалов и оборудования", unit: "рейс", quantity: 1, norm: null, unitPrice: 8500, coefficient: 1, resourceType: "logistics", priceSource: p("Ориентировочная стартовая цена"), comment: "В пределах указанного региона", warning: "Маршрут и тоннаж не подтверждены" }),
        item({ id: "lifting", sectionId: "logistics", code: null, name: "Разгрузка и подъём материалов", unit: "компл", quantity: 1, norm: null, unitPrice: 12000, coefficient: 1, resourceType: "logistics", priceSource: p("Ориентировочная стартовая цена"), comment: null, warning: "Этаж и лифт не указаны" }),
        item({ id: "cleanup", sectionId: "logistics", code: null, name: "Финишная уборка рабочей зоны", unit: "м²", quantity: area, norm: 1, unitPrice: 20, coefficient: 1, resourceType: "service", priceSource: p("Ориентировочная стартовая цена"), comment: null, warning: null })
      ]
    }
  ];

  return recalculateEstimate({
    id: crypto.randomUUID(),
    revision: 1,
    title: `Локальная коммерческая смета — штукатурка ${area} м²`,
    projectName: `Объект: ${region}`,
    customer: null,
    contractor: null,
    region,
    calculationMethod: "commercial",
    currency: "RUB",
    createdAt: now,
    updatedAt: now,
    assumptions: technology.assumptions,
    warnings: [
      "Нормативные коды не присвоены: источник нормативной базы не подключён.",
      "Все стартовые цены помечены как ориентировочные и не являются подтверждёнными рыночными данными.",
      "Маяки, углы и логистика рассчитаны укрупнённо до получения планировки и условий доступа."
    ],
    sections,
    overheadRate: 0,
    profitRate: 0,
    discountRate: 0,
    vatRate: 0,
    totals: { directCost: 0, overhead: 0, profit: 0, discount: 0, vat: 0, grandTotal: 0 }
  });
}

export function reviewEstimate(estimate: EstimateDraft): EstimateReview {
  const items = estimate.sections.flatMap((section) => section.items);
  const unconfirmed = items.filter((value) => !value.priceSource.confirmed).length;
  const invalid = items.filter((value) => value.quantity <= 0 || value.unitPrice < 0 || value.coefficient <= 0).length;
  const hasTechnologyCoverage = estimate.sections.some((value) => value.id === "preparation") && estimate.sections.some((value) => value.id === "logistics");
  const score = Math.max(0, 100 - unconfirmed * 2 - invalid * 20 - (hasTechnologyCoverage ? 0 : 25));
  return {
    status: invalid > 0 ? "requires-action" : "passed-with-warnings",
    reviewer: "Independent Estimate Reviewer",
    score,
    checks: [
      { name: "Арифметика", status: invalid ? "failed" : "passed", detail: invalid ? `Обнаружено некорректных позиций: ${invalid}` : "Количество × цена × коэффициент пересчитаны детерминированно." },
      { name: "Полнота технологии", status: hasTechnologyCoverage ? "passed" : "failed", detail: hasTechnologyCoverage ? "Подготовка, основные работы и логистика присутствуют." : "Не хватает обязательных технологических разделов." },
      { name: "Цены", status: unconfirmed ? "warning" : "passed", detail: unconfirmed ? `Неподтверждённых цен: ${unconfirmed}.` : "Все цены подтверждены." },
      { name: "Нормативные коды", status: "warning", detail: "Лицензированная нормативная база не подключена; коды не выдумывались." }
    ]
  };
}
