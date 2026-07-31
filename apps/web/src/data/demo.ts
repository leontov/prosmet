import type { Estimate } from "@prosmet/contracts";

export const demoEstimate: Estimate = {
  id: "estimate-demo",
  title: "Механизированная штукатурка квартиры",
  project: "Квартира 56 · ЖК Светлый",
  customer: "Иван Петров",
  region: "Казань, Республика Татарстан",
  revision: 1,
  status: "draft",
  overheadPercent: 5,
  profitPercent: 10,
  vatPercent: 0,
  updatedAt: new Date().toISOString(),
  sections: [
    {
      id: "works",
      title: "Подготовка и основные работы",
      items: [
        { id: "i1", name: "Механизированная штукатурка стен", unit: "м²", quantity: 358, unitPrice: 620, category: "work" },
        { id: "i2", name: "Грунтование основания", unit: "м²", quantity: 358, unitPrice: 55, category: "work" },
        { id: "i3", name: "Монтаж маячкового профиля", unit: "п.м.", quantity: 240, unitPrice: 95, category: "work" },
        { id: "i4", name: "Установка перфоуголка ПВХ", unit: "п.м.", quantity: 84, unitPrice: 120, category: "work" }
      ]
    },
    {
      id: "materials",
      title: "Материалы и защита",
      items: [
        { id: "i5", name: "Штукатурная смесь", unit: "меш.", quantity: 197, unitPrice: 415, category: "material" },
        { id: "i6", name: "Защитная плёнка", unit: "м²", quantity: 118, unitPrice: 40, category: "material" }
      ]
    }
  ]
};

export const projects = [
  { title: "Квартира 56 · ЖК Светлый", meta: "Казань · активный объект", amount: "362 846 ₽" },
  { title: "Дом в Альметьевске", meta: "Фасад и внутренние работы", amount: "1 248 000 ₽" },
  { title: "Офис на Баумана", meta: "Черновая отделка", amount: "784 500 ₽" }
];

export const documents = [
  { title: "Коммерческое предложение", meta: "Версия 3 · отправлено клиенту", amount: "PDF" },
  { title: "Договор подряда", meta: "Черновик · требуется проверка", amount: "DOCX" },
  { title: "Акт выполненных работ", meta: "Квартира 56", amount: "PDF" }
];

export const catalog = [
  { title: "Механизированная штукатурка", meta: "Казань · подтверждено 12 организациями", amount: "620 ₽/м²" },
  { title: "Штукатурная смесь 30 кг", meta: "Поставщик · обновлено сегодня", amount: "415 ₽" },
  { title: "Перфоуголок ПВХ 3 м", meta: "Средняя цена по Татарстану", amount: "100 ₽" }
];
