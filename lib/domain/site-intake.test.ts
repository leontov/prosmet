import { describe, expect, it } from "vitest";
import { extractSiteIntake } from "@/lib/domain/site-intake";

describe("extractSiteIntake", () => {
  it("extracts the object and customer from a multiline measurement note", () => {
    expect(
      extractSiteIntake(
        [
          "Замер на объекте",
          "Объект: квартира Ивановых, Казань.",
          "Заказчик: Иванов Алексей.",
          "Штукатурка стен 96 м²"
        ].join("\n")
      )
    ).toEqual({
      objectName: "Квартира Ивановых, Казань",
      customer: "Иванов Алексей",
      address: undefined
    });
  });

  it("extracts inline object and customer fields from a normal chat message", () => {
    expect(
      extractSiteIntake(
        "Составь смету штукатурки 96 м². Объект: квартира Ивановых. Заказчик: Иванов Алексей."
      )
    ).toEqual({
      objectName: "Квартира Ивановых",
      customer: "Иванов Алексей",
      address: undefined
    });
  });

  it("uses the address as the object name when a separate name is absent", () => {
    expect(
      extractSiteIntake("Адрес: Казань, ул. Баумана, 10\nКлиент: ООО Пример")
    ).toEqual({
      objectName: "Казань, ул. Баумана, 10",
      customer: "ООО Пример",
      address: "Казань, ул. Баумана, 10"
    });
  });

  it("preserves abbreviated inline addresses until the next labelled field", () => {
    expect(
      extractSiteIntake(
        "Смета. Адрес: Казань, ул. Ленина, д. 1. Клиент: ООО Ромашка."
      )
    ).toEqual({
      objectName: "Казань, ул. Ленина, д. 1",
      customer: "ООО Ромашка",
      address: "Казань, ул. Ленина, д. 1"
    });
  });

  it("does not invent metadata from an unrelated request", () => {
    expect(extractSiteIntake("Составь смету штукатурки 50 м²")).toEqual({
      objectName: undefined,
      customer: undefined,
      address: undefined
    });
  });
});
