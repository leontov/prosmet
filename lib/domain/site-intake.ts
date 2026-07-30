export type SiteIntake = {
  objectName?: string;
  customer?: string;
  address?: string;
};

const FIELD_LABELS = [
  "объект",
  "помещение",
  "название объекта",
  "заказчик",
  "клиент",
  "адрес",
  "место работ"
];

function clean(value: string | undefined) {
  return value
    ?.replace(/^[\s:—–-]+|[\s,.;]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 180);
}

function displayName(value: string | undefined) {
  const normalized = clean(value);
  return normalized
    ? `${normalized.charAt(0).toLocaleUpperCase("ru-RU")}${normalized.slice(1)}`
    : undefined;
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fieldValue(input: string, labels: string[]) {
  const requested = labels.map(escapePattern);
  const boundaries = FIELD_LABELS.map(escapePattern);
  const pattern = new RegExp(
    `(?:^|[\\n;]|[.!?]\\s+)\\s*(?:${requested.join("|")})\\s*[:—–-]\\s*(.+?)(?=(?:\\s*[.!?]?\\s*(?:${boundaries.join("|")})\\s*[:—–-])|[\\n;]|$)`,
    "iu"
  );
  return clean(input.match(pattern)?.[1]);
}

export function extractSiteIntake(input: string): SiteIntake {
  const address = fieldValue(input, ["адрес", "место работ"]);
  const objectName = fieldValue(input, ["объект", "помещение", "название объекта"]);
  const customer = fieldValue(input, ["заказчик", "клиент"]);

  return {
    objectName: displayName(objectName || address),
    customer: displayName(customer),
    address: displayName(address)
  };
}
