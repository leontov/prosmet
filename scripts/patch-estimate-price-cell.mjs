import { readFile, writeFile } from "node:fs/promises";

const path = "components/tools/estimate-document-experience.tsx";
const source = await readFile(path, "utf8");
const before = `          <button type="button" onClick={onOpenPrice} className="group/price relative flex min-h-11 flex-col items-end justify-center px-2 text-right hover:bg-indigo-50">
            <DocumentNumberInput value={item.unitPrice} ariaLabel={\`Цена позиции \${position}\`} onChange={(value) => onUpdate("unitPrice", value, false)} onFocus={onPriceFocus} onBlur={onPriceBlur} className="w-full text-right text-sm font-medium" stopPropagation />
            <span className="text-[10px] text-indigo-600 opacity-0 group-hover/price:opacity-100">{sourceLabels[item.source.kind]}</span>
          </button>`;
const after = `          <div className="group/price relative flex min-h-11 flex-col items-end justify-center px-2 text-right hover:bg-indigo-50">
            <DocumentNumberInput value={item.unitPrice} ariaLabel={\`Цена позиции \${position}\`} onChange={(value) => onUpdate("unitPrice", value, false)} onFocus={onPriceFocus} onBlur={onPriceBlur} className="w-full text-right text-sm font-medium" stopPropagation />
            <button type="button" onClick={onOpenPrice} aria-label={\`Показать аналитику цены позиции \${position}\`} className="text-[10px] text-indigo-600 opacity-0 transition-opacity group-hover/price:opacity-100 focus:opacity-100">
              {sourceLabels[item.source.kind]}
            </button>
          </div>`;

if (!source.includes(before)) {
  throw new Error("Expected nested price-cell markup was not found");
}

await writeFile(path, source.replace(before, after), "utf8");
console.log("Accessible estimate price cell applied");
