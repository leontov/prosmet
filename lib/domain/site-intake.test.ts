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

  it("uses the address as the object name when a separate name is absent", () => {
    expect(
      extractSiteIntake("Адрес: Казань, ул. Баумана, 10\nКлиент: ООО Пример")
    ).toEqual({
      objectName: "Казань, ул. Баумана, 10",
      customer: "ООО Пример",
      address: "Казань, ул. Баумана, 10"
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
