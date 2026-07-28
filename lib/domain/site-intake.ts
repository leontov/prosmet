export type SiteIntake = {
  objectName?: string;
  customer?: string;
  address?: string;
};

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

function lineValue(input: string, labels: string[]) {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(
    `(?:^|\\n)\\s*(?:${escaped.join("|")})\\s*[:—–-]\\s*([^\\n;]+)`,
    "iu"
  );
  return clean(input.match(pattern)?.[1]);
}

export function extractSiteIntake(input: string): SiteIntake {
  const address = lineValue(input, ["адрес", "место работ"]);
  const objectName = lineValue(input, ["объект", "помещение", "название объекта"]);
  const customer = lineValue(input, ["заказчик", "клиент"]);

  return {
    objectName: displayName(objectName || address),
    customer: displayName(customer),
    address: displayName(address)
  };
}
