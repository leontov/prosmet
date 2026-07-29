import { readFile, writeFile } from "node:fs/promises";

const componentPath = "components/tools/estimate-document-experience.tsx";
const testPath = "e2e/chat.spec.ts";

let component = await readFile(componentPath, "utf8");

const invocationBefore = `        <EstimateRowDetailsSheet
          draft={draft}
          row={activeRow}
          onClose={() => setActiveRow(null)}
          onChange={updateItem}
          onDelete={deleteItem}
          onOpenPrice={() => {
            setPriceRow(activeRow);
            setActiveRow(null);
          }}
        />`;
const invocationAfter = `        <EstimateRowDetailsSheet
          draft={draft}
          row={activeRow}
          onClose={() => setActiveRow(null)}
          onChange={updateItem}
          onDelete={deleteItem}
          onPriceFocus={beginPriceEdit}
          onPriceBlur={(item) => void finishPriceEdit(item)}
          onOpenPrice={() => {
            setPriceRow(activeRow);
            setActiveRow(null);
          }}
        />`;

if (!component.includes(invocationBefore)) {
  throw new Error("EstimateRowDetailsSheet invocation marker was not found");
}
component = component.replace(invocationBefore, invocationAfter);

const signatureBefore = `  onChange,
  onDelete,
  onOpenPrice
}: {
  draft: EstimateDraft;
  row: NonNullable<ActiveRow>;
  onClose: () => void;
  onChange: <K extends keyof EstimateItem>(sectionId: string, itemId: string, key: K, value: EstimateItem[K], remember?: boolean) => void;
  onDelete: (sectionId: string, itemId: string) => void;
  onOpenPrice: () => void;
}) {`;
const signatureAfter = `  onChange,
  onDelete,
  onPriceFocus,
  onPriceBlur,
  onOpenPrice
}: {
  draft: EstimateDraft;
  row: NonNullable<ActiveRow>;
  onClose: () => void;
  onChange: <K extends keyof EstimateItem>(sectionId: string, itemId: string, key: K, value: EstimateItem[K], remember?: boolean) => void;
  onDelete: (sectionId: string, itemId: string) => void;
  onPriceFocus: (item: EstimateItem) => void;
  onPriceBlur: (item: EstimateItem) => void;
  onOpenPrice: () => void;
}) {`;

if (!component.includes(signatureBefore)) {
  throw new Error("EstimateRowDetailsSheet signature marker was not found");
}
component = component.replace(signatureBefore, signatureAfter);

const priceFieldBefore = `          <Field label="Цена"><button type="button" onClick={onOpenPrice} className="prosmet-input flex items-center justify-between text-left"><span>{item.unitPrice}</span><span className="text-xs text-indigo-600">Открыть аналитику</span></button></Field>`;
const priceFieldAfter = `          <Field label="Цена">
            <div className="grid gap-2">
              <input
                className="prosmet-input"
                type="number"
                min="0"
                step="any"
                value={item.unitPrice}
                onFocus={() => onPriceFocus(item)}
                onChange={(event) =>
                  onChange(
                    row.sectionId,
                    row.itemId,
                    "unitPrice",
                    Math.max(0, Number(event.target.value) || 0),
                    false
                  )
                }
                onBlur={(event) =>
                  onPriceBlur({
                    ...item,
                    unitPrice: Math.max(0, Number(event.currentTarget.value) || 0)
                  })
                }
              />
              <button
                type="button"
                onClick={onOpenPrice}
                className="h-9 rounded-lg border border-neutral-200 px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
              >
                Открыть аналитику цены
              </button>
            </div>
          </Field>`;

if (!component.includes(priceFieldBefore)) {
  throw new Error("Mobile price field marker was not found");
}
component = component.replace(priceFieldBefore, priceFieldAfter);
await writeFile(componentPath, component, "utf8");

let test = await readFile(testPath, "utf8");
const testBefore = `  const price = overlay.getByLabel("Цена позиции 1");
  await price.fill("650");
  await price.blur();
  await expect(price).toHaveValue("650");

  await overlay.getByRole("button", { name: "Готово", exact: true }).click();`;
const testAfter = `  if (testInfo.project.name === "mobile-chromium") {
    await overlay
      .getByRole("button", { name: /Укрытие и защита поверхностей/ })
      .click();
    const rowEditor = page.getByRole("dialog", { name: "Редактирование позиции" });
    await expect(rowEditor).toBeVisible();
    const mobilePrice = rowEditor.getByLabel("Цена");
    await mobilePrice.fill("650");
    await mobilePrice.blur();
    await expect(mobilePrice).toHaveValue("650");
    await rowEditor.getByRole("button", { name: "Готово", exact: true }).click();
    await expect(rowEditor).toHaveCount(0);
  } else {
    const price = overlay.getByLabel("Цена позиции 1");
    await price.fill("650");
    await price.blur();
    await expect(price).toHaveValue("650");
  }

  await overlay.getByRole("button", { name: "Готово", exact: true }).click();`;

if (!test.includes(testBefore)) {
  throw new Error("Mobile estimate E2E marker was not found");
}
test = test.replace(testBefore, testAfter);
await writeFile(testPath, test, "utf8");

console.log("Mobile estimate price editing and regression test applied");
