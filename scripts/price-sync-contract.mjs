import { access, readFile } from "node:fs/promises";

const failures = [];
const need = (source, token, scope) => {
  if (!source.includes(token)) failures.push(`${scope}:missing:${token}`);
};

await access("e2e/price-intelligence-sync.spec.ts");
const [sync, e2e] = await Promise.all([
  readFile("lib/local/sync.ts", "utf8"),
  readFile("e2e/price-intelligence-sync.spec.ts", "utf8")
]);

for (const token of [
  "PRICE_STORES",
  "LOCAL_STORES.canonicalWorks",
  "LOCAL_STORES.priceObservations",
  "LOCAL_STORES.priceHistory",
  "LOCAL_STORES.marketPriceBuckets",
  "LOCAL_STORES.priceResearchEvidence",
  "priceStore(payload)",
  "putRemotePrice",
  "deleteRemotePrice"
]) {
  need(sync, token, "price-sync");
}

for (const token of [
  "price_observation",
  "priceObservations",
  "PostgreSQL",
  "openSecondDevice",
  "status: \"sent_to_client\""
]) {
  need(e2e, token, "price-sync-e2e");
}

if (failures.length) {
  console.error("PRICE SYNC CONTRACT FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PRICE SYNC CONTRACT PASS");
