---
applyTo: "lib/domain/**/*.ts,lib/exports/**/*.ts,lib/sharing/**/*.ts,components/tools/document-*.tsx,components/tools/estimate-*.tsx"
---

# Смета, цены и документы

- Денежные значения вычисляются Decimal-based domain engine, не AI-текстом и не неявным floating point.
- Порядок: технология → ресурсы → цены/provenance → расчёт → review → draft/revision.
- Любое изменение формулы сопровождается unit tests на округление и контрольные примеры.
- Estimate revision immutable после сохранения версии; дальнейшая правка создаёт новый draft/revision.
- Lifecycle действий различается: сохранить версию, утвердить, передать клиенту, contracted, executed.
- Цена — версионируемое наблюдение с регионом, датой, единицей, источником, НДС/доставкой, confidence и context.
- Новая цена не перезаписывает историю.
- Unknown/indicative source не маскируется как подтверждённый.
- Документы и exports ссылаются на конкретную estimate revision.
- Экранный preview, PDF и XLSX обязаны совпадать по составу и итогам.
- Runtime-вход валидируется Zod; внешние данные сначала `unknown`.
- Не копируй доменные типы в UI; импортируй из `lib/domain`.
- Не импортируй browser/React API в pure domain modules.
- Пользовательские правки должны сохранять audit/provenance, а не только новое число.
- Validation blockers не удаляются ради возможности отправки; UI объясняет, что требуется исправить.
