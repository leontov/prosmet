import type { Estimate } from "@prosmet/contracts";

export const demoEstimate: Estimate = {
  id: "mobile-demo",
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
      title: "Основные работы",
      items: [
        { id: "i1", name: "Механизированная штукатурка стен", unit: "м²", quantity: 358, unitPrice: 620, category: "work" },
        { id: "i2", name: "Грунтование основания", unit: "м²", quantity: 358, unitPrice: 55, category: "work" },
        { id: "i3", name: "Монтаж маячкового профиля", unit: "п.м.", quantity: 240, unitPrice: 95, category: "work" }
      ]
    }
  ]
};
