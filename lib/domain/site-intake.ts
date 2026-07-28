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
    objectName: objectName || address,
    customer,
    address
  };
}
