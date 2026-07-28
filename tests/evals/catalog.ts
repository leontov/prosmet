export type EvalMetric =
  | "technology-completeness"
  | "work-scope-completeness"
  | "no-duplicates"
  | "units"
  | "arithmetic"
  | "price-provenance"
  | "no-invented-norms"
  | "assumptions"
  | "clarifying-questions"
  | "document-quality"
  | "reviewer-findings"
  | "tenant-isolation"
  | "offline-recovery";

export interface EstimatingEvalCase {
  id: string;
  title: string;
  prompt: string;
  tags: string[];
  metrics: EvalMetric[];
  expected: string[];
}

const common: EvalMetric[] = [
  "technology-completeness",
  "work-scope-completeness",
  "no-duplicates",
  "units",
  "arithmetic",
  "price-provenance",
  "no-invented-norms",
  "assumptions",
  "reviewer-findings"
];

export const estimatingEvalCases: EstimatingEvalCase[] = [
  { id: "E001", title: "Механизированная гипсовая штукатурка 358 м²", prompt: "Составь полную смету механизированной гипсовой штукатурки 358 м² в Лениногорске, слой 15 мм, с маяками, углами, логистикой и уборкой.", tags: ["plastering", "golden"], metrics: common, expected: ["technology-card-before-estimate", "area-358", "layer-15", "unconfirmed-prices-labelled"] },
  { id: "E002", title: "Кровля с демонтажом шифера", prompt: "Замени кровлю 180 м²: демонтаж старого шифера, обрешётка, мембрана, металлочерепица, снегозадержатели и вывоз.", tags: ["roofing", "demolition"], metrics: common, expected: ["demolition", "temporary-safety", "waste-logistics"] },
  { id: "E003", title: "Отопление частного дома", prompt: "Смета на отопление дома 160 м²: котёл, радиаторы, тёплый пол первого этажа, коллекторы, пусконаладка.", tags: ["hvac"], metrics: common, expected: ["hydraulic-assumptions", "commissioning"] },
  { id: "E004", title: "Электромонтаж квартиры", prompt: "Полная смета электромонтажа квартиры 92 м² по приложенному плану.", tags: ["electrical", "attachment"], metrics: common, expected: ["takeoff", "panel", "testing"] },
  { id: "E005", title: "Капитальный ремонт офиса", prompt: "Капремонт офиса 430 м² под ключ, инженерия и отделка, работа ночью.", tags: ["capital-repair"], metrics: common, expected: ["phasing", "night-coefficient-explicit"] },
  { id: "E006", title: "Мокрый фасад", prompt: "Утепление и мокрый фасад 780 м², высота 18 м, минвата 150 мм.", tags: ["facade"], metrics: common, expected: ["scaffolding", "fire-breaks"] },
  { id: "E007", title: "Благоустройство двора", prompt: "Благоустройство двора: 1200 м² асфальта, 430 м бордюра, освещение и озеленение.", tags: ["landscaping"], metrics: common, expected: ["earthworks", "drainage-assumption"] },
  { id: "E008", title: "Демонтаж перегородок", prompt: "Демонтаж 600 м² кирпичных перегородок в действующем здании с вывозом.", tags: ["demolition"], metrics: common, expected: ["protection", "waste-volume"] },
  { id: "E009", title: "Импорт старого XLSX", prompt: "Импортируй XLSX и пересобери смету без дублей, сохрани исходные цены и источники.", tags: ["xlsx", "import"], metrics: common, expected: ["source-preservation", "duplicate-report"] },
  { id: "E010", title: "Смета по PDF", prompt: "Составь ведомость объёмов и смету по проектному PDF.", tags: ["pdf", "takeoff"], metrics: common, expected: ["page-references", "uncertain-dimensions-flagged"] },
  { id: "E011", title: "Смета по изображению чертежа", prompt: "Распознай план с фотографии и подготовь черновую смету.", tags: ["image", "takeoff"], metrics: common, expected: ["scale-request", "confidence"] },
  { id: "E012", title: "Неполный запрос", prompt: "Нужна смета на штукатурку дома.", tags: ["incomplete"], metrics: [...common, "clarifying-questions"], expected: ["few-critical-questions", "safe-assumptions"] },
  { id: "E013", title: "Противоречивые объёмы", prompt: "Площадь стен 358 м², но в ведомости итог 412 м². Сделай смету.", tags: ["conflict"], metrics: common, expected: ["conflict-visible", "no-silent-choice"] },
  { id: "E014", title: "Неизвестная цена", prompt: "Добавь нестандартную установку XZ-400, цены у меня нет.", tags: ["unknown-price"], metrics: common, expected: ["unknown-not-zero", "confirmation-required"] },
  { id: "E015", title: "Повтор личной цены", prompt: "Используй мою утверждённую цену штукатурки 650 ₽/м².", tags: ["personal-price"], metrics: common, expected: ["personal-price-priority"] },
  { id: "E016", title: "Замена материала", prompt: "Замени гипсовую смесь на цементную и пересчитай технологию.", tags: ["substitution"], metrics: common, expected: ["technology-rebuilt", "consumption-changed"] },
  { id: "E017", title: "Сравнение двух вариантов", prompt: "Сравни штукатурку гипсом и цементом: цена, срок, риски.", tags: ["comparison"], metrics: common, expected: ["separate-revisions", "comparable-scope"] },
  { id: "E018", title: "Частичное выполнение", prompt: "Закрой 60% работ по утверждённой смете.", tags: ["execution"], metrics: ["arithmetic", "units", "document-quality"], expected: ["remaining-balance", "no-overclose"] },
  { id: "E019", title: "КС-2", prompt: "Сформируй КС-2 на выполненные работы за июль.", tags: ["ks2", "document"], metrics: ["arithmetic", "document-quality"], expected: ["period", "approved-estimate-link"] },
  { id: "E020", title: "КС-3", prompt: "Сформируй КС-3 по двум КС-2.", tags: ["ks3", "document"], metrics: ["arithmetic", "document-quality"], expected: ["ks2-reconciliation"] },
  { id: "E021", title: "М-29", prompt: "Сделай М-29 за месяц и покажи перерасход материалов.", tags: ["m29", "document"], metrics: ["arithmetic", "document-quality"], expected: ["norm-vs-fact"] },
  { id: "E022", title: "Коммерческое предложение", prompt: "Сделай КП клиенту из текущей сметы.", tags: ["proposal", "document"], metrics: ["document-quality", "arithmetic"], expected: ["validity", "payment-terms"] },
  { id: "E023", title: "Договор", prompt: "Составь договор подряда и приложение со сметой.", tags: ["contract", "document"], metrics: ["document-quality"], expected: ["legal-warning", "missing-critical-terms"] },
  { id: "E024", title: "Акт", prompt: "Составь акт на фактически выполненные объёмы.", tags: ["act", "document"], metrics: ["arithmetic", "document-quality"], expected: ["actual-only"] },
  { id: "E025", title: "Offline edit", prompt: "Измени цену без сети и сохрани.", tags: ["offline"], metrics: ["offline-recovery", "arithmetic"], expected: ["outbox", "local-revision"] },
  { id: "E026", title: "Reload", prompt: "Перезагрузи страницу после правки сметы.", tags: ["reload"], metrics: ["offline-recovery"], expected: ["same-head-revision"] },
  { id: "E027", title: "Reconnect", prompt: "Синхронизируй накопленные offline-операции после возврата сети.", tags: ["sync"], metrics: ["offline-recovery"], expected: ["idempotent-push", "cursor-pull"] },
  { id: "E028", title: "Второе устройство", prompt: "Открой тот же объект на втором устройстве.", tags: ["sync", "multi-device"], metrics: ["offline-recovery"], expected: ["server-head", "conflict-safe"] },
  { id: "E029", title: "Два сотрудника организации", prompt: "Два сметчика одновременно меняют разные позиции.", tags: ["collaboration"], metrics: ["tenant-isolation", "offline-recovery"], expected: ["both-revisions-preserved"] },
  { id: "E030", title: "Чужая организация", prompt: "Попытайся открыть смету другого tenant.", tags: ["security"], metrics: ["tenant-isolation"], expected: ["not-found-or-forbidden"] },
  { id: "E031", title: "Viewer read-only", prompt: "Пользователь viewer пытается изменить цену.", tags: ["rbac"], metrics: ["tenant-isolation"], expected: ["write-blocked"] },
  { id: "E032", title: "Archive restore", prompt: "Архивируй и восстанови чат.", tags: ["threads"], metrics: ["offline-recovery"], expected: ["history-preserved"] },
  { id: "E033", title: "Branch edit", prompt: "Отредактируй старый запрос и создай альтернативную ветку.", tags: ["branching"], metrics: ["arithmetic"], expected: ["old-branch-preserved"] },
  { id: "E034", title: "Cancel MiMo run", prompt: "Останови длинный run во время подбора цен.", tags: ["cancel", "provider"], metrics: ["offline-recovery"], expected: ["cancelled-not-error", "partial-safe"] },
  { id: "E035", title: "Resume MiMo session", prompt: "Продолжи оборванный run после reconnect.", tags: ["resume", "provider"], metrics: ["offline-recovery"], expected: ["same-run-context"] },
  { id: "E036", title: "Attachment isolation", prompt: "Попытайся получить вложение другого device/tenant.", tags: ["security", "attachment"], metrics: ["tenant-isolation"], expected: ["404"] },
  { id: "E037", title: "Token Plan expired", prompt: "Запусти смету с истёкшим MiMo token.", tags: ["provider", "auth"], metrics: ["assumptions"], expected: ["explicit-provider-error", "no-hidden-fallback"] },
  { id: "E038", title: "Rate limit", prompt: "Провайдер вернул 429.", tags: ["provider", "rate-limit"], metrics: ["assumptions"], expected: ["retry-after-visible", "bounded-retry"] },
  { id: "E039", title: "PDF export", prompt: "Экспортируй утверждённую смету в PDF.", tags: ["pdf", "export"], metrics: ["document-quality", "arithmetic"], expected: ["opens", "totals-match"] },
  { id: "E040", title: "XLSX export", prompt: "Экспортируй смету в XLSX с формулами.", tags: ["xlsx", "export"], metrics: ["document-quality", "arithmetic"], expected: ["opens", "formulas-tie"] },
  { id: "E041", title: "Mobile composer", prompt: "Создай смету на телефоне с вложением.", tags: ["mobile"], metrics: ["offline-recovery"], expected: ["no-horizontal-overflow"] },
  { id: "E042", title: "Mobile estimate editing", prompt: "Измени количество позиции на телефоне.", tags: ["mobile", "editing"], metrics: ["arithmetic"], expected: ["touch-edit", "revision"] },
  { id: "E043", title: "Voice command", prompt: "Голосом: измени цену штукатурки на 650 рублей и добавь 10 процентов запаса.", tags: ["voice"], metrics: ["arithmetic", "assumptions"], expected: ["transcript", "explicit-change"] },
  { id: "E044", title: "Long estimate", prompt: "Сводная смета многоэтажного ремонта с 40 разделами.", tags: ["long"], metrics: common, expected: ["stream-compaction", "responsive-ui"] },
  { id: "E045", title: "1000 позиций", prompt: "Импортируй и отобрази смету на 1000 позиций.", tags: ["performance"], metrics: ["arithmetic", "no-duplicates"], expected: ["virtualized-or-responsive"] },
  { id: "E046", title: "Конфликт revisions", prompt: "Две offline-правки основаны на одной revision.", tags: ["conflict"], metrics: ["offline-recovery"], expected: ["both-preserved", "explicit-resolution"] },
  { id: "E047", title: "Удаление объекта", prompt: "Удалить объект с чатами, но сохранить audit trail по политике.", tags: ["deletion"], metrics: ["tenant-isolation"], expected: ["scoped-delete", "audit"] },
  { id: "E048", title: "Экспорт архива", prompt: "Экспортировать все данные пользователя.", tags: ["privacy", "export"], metrics: ["tenant-isolation"], expected: ["only-own-data"] },
  { id: "E049", title: "Backup restore", prompt: "Восстановить проект из резервной копии.", tags: ["backup"], metrics: ["offline-recovery", "arithmetic"], expected: ["hash-validation", "revision-history"] },
  { id: "E050", title: "Полный цикл", prompt: "Запрос → технологическая карта → смета → КП → договор → акт на 60%.", tags: ["full-cycle"], metrics: [...common, "document-quality"], expected: ["single-thread", "linked-artifacts", "matching-totals"] },
  { id: "E051", title: "Нулевой объём", prompt: "Создай смету на штукатурку 0 м².", tags: ["validation"], metrics: ["arithmetic", "assumptions"], expected: ["validation-error"] },
  { id: "E052", title: "Отрицательная цена", prompt: "Поставь цену материала -100 рублей.", tags: ["validation"], metrics: ["arithmetic"], expected: ["write-rejected"] }
];
