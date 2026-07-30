use rust_decimal::{Decimal, RoundingStrategy};
use serde::de::{self, Visitor};
use serde::{Deserialize, Deserializer, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fmt;
use std::str::FromStr;
use thiserror::Error;

pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, Copy)]
pub struct DecimalInput(pub Decimal);

impl<'de> Deserialize<'de> for DecimalInput {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct DecimalVisitor;

        impl<'de> Visitor<'de> for DecimalVisitor {
            type Value = DecimalInput;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("a finite decimal number or decimal string")
            }

            fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(DecimalInput(Decimal::from(value)))
            }

            fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(DecimalInput(Decimal::from(value)))
            }

            fn visit_f64<E>(self, value: f64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                if !value.is_finite() {
                    return Err(E::custom("non-finite decimal"));
                }
                Decimal::from_str(&value.to_string())
                    .map(DecimalInput)
                    .map_err(E::custom)
            }

            fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Decimal::from_str(value.trim())
                    .map(DecimalInput)
                    .map_err(E::custom)
            }

            fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                self.visit_str(&value)
            }
        }

        deserializer.deserialize_any(DecimalVisitor)
    }
}

fn one() -> DecimalInput {
    DecimalInput(Decimal::ONE)
}

fn zero() -> DecimalInput {
    DecimalInput(Decimal::ZERO)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstimateItemInput {
    pub id: String,
    pub quantity: DecimalInput,
    #[serde(default = "one")]
    pub norm: DecimalInput,
    #[serde(default = "one")]
    pub coefficient: DecimalInput,
    pub unit_price: DecimalInput,
}

#[derive(Debug, Deserialize)]
pub struct EstimateSectionInput {
    pub id: String,
    #[serde(default)]
    pub items: Vec<EstimateItemInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstimateInput {
    #[serde(default)]
    pub sections: Vec<EstimateSectionInput>,
    #[serde(default = "zero")]
    pub overhead_percent: DecimalInput,
    #[serde(default = "zero")]
    pub profit_percent: DecimalInput,
    #[serde(default = "zero")]
    pub discount_percent: DecimalInput,
    #[serde(default = "zero")]
    pub vat_percent: DecimalInput,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalculationCore {
    pub item_amounts: BTreeMap<String, String>,
    pub section_totals: BTreeMap<String, String>,
    pub direct_cost: String,
    pub overhead: String,
    pub profit: String,
    pub discount: String,
    pub subtotal: String,
    pub vat: String,
    pub total: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalculationOutput {
    #[serde(flatten)]
    pub calculation: CalculationCore,
    pub engine: &'static str,
    pub engine_version: &'static str,
    pub digest: String,
}

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("negative value in {0}")]
    NegativeValue(String),
    #[error("duplicate item id: {0}")]
    DuplicateItem(String),
    #[error("duplicate section id: {0}")]
    DuplicateSection(String),
    #[error("calculation serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),
}

fn money(value: Decimal) -> Decimal {
    value.round_dp_with_strategy(2, RoundingStrategy::MidpointAwayFromZero)
}

fn decimal_string(value: Decimal) -> String {
    money(value).normalize().to_string()
}

fn non_negative(label: &str, value: Decimal) -> Result<(), EngineError> {
    if value < Decimal::ZERO {
        return Err(EngineError::NegativeValue(label.to_owned()));
    }
    Ok(())
}

pub fn calculate_estimate(input: &EstimateInput) -> Result<CalculationOutput, EngineError> {
    for (label, value) in [
        ("overheadPercent", input.overhead_percent.0),
        ("profitPercent", input.profit_percent.0),
        ("discountPercent", input.discount_percent.0),
        ("vatPercent", input.vat_percent.0),
    ] {
        non_negative(label, value)?;
    }

    let mut item_amounts = BTreeMap::new();
    let mut section_totals = BTreeMap::new();
    let mut direct = Decimal::ZERO;

    for section in &input.sections {
        if section_totals.contains_key(&section.id) {
            return Err(EngineError::DuplicateSection(section.id.clone()));
        }
        let mut section_total = Decimal::ZERO;
        for item in &section.items {
            for (label, value) in [
                ("quantity", item.quantity.0),
                ("norm", item.norm.0),
                ("coefficient", item.coefficient.0),
                ("unitPrice", item.unit_price.0),
            ] {
                non_negative(&format!("{}.{}", item.id, label), value)?;
            }
            if item_amounts.contains_key(&item.id) {
                return Err(EngineError::DuplicateItem(item.id.clone()));
            }
            let amount = money(
                money(item.quantity.0) * item.norm.0 * item.coefficient.0 * item.unit_price.0,
            );
            item_amounts.insert(item.id.clone(), decimal_string(amount));
            section_total += amount;
        }
        let rounded_section = money(section_total);
        section_totals.insert(section.id.clone(), decimal_string(rounded_section));
        direct += rounded_section;
    }

    direct = money(direct);
    let overhead = money(direct * input.overhead_percent.0 / Decimal::from(100));
    let profit_base = direct + overhead;
    let profit = money(profit_base * input.profit_percent.0 / Decimal::from(100));
    let before_discount = profit_base + profit;
    let discount = money(before_discount * input.discount_percent.0 / Decimal::from(100));
    let subtotal = money(before_discount - discount);
    let vat = money(subtotal * input.vat_percent.0 / Decimal::from(100));
    let total = money(subtotal + vat);

    let calculation = CalculationCore {
        item_amounts,
        section_totals,
        direct_cost: decimal_string(direct),
        overhead: decimal_string(overhead),
        profit: decimal_string(profit),
        discount: decimal_string(discount),
        subtotal: decimal_string(subtotal),
        vat: decimal_string(vat),
        total: decimal_string(total),
    };
    let canonical = serde_json::to_vec(&calculation)?;
    let digest = hex::encode(Sha256::digest(canonical));

    Ok(CalculationOutput {
        calculation,
        engine: "rust",
        engine_version: ENGINE_VERSION,
        digest,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(value: serde_json::Value) -> EstimateInput {
        serde_json::from_value(value).expect("valid estimate")
    }

    #[test]
    fn matches_the_reference_estimate() {
        let input = parse(serde_json::json!({
            "sections": [{
                "id": "main",
                "items": [
                    {"id":"work","quantity":56,"norm":1,"coefficient":1,"unitPrice":520},
                    {"id":"primer","quantity":56,"norm":1,"coefficient":1,"unitPrice":40},
                    {"id":"beacons","quantity":120,"norm":1,"coefficient":1,"unitPrice":28},
                    {"id":"corners","quantity":60,"norm":1,"coefficient":1,"unitPrice":18},
                    {"id":"film","quantity":70,"norm":1,"coefficient":1,"unitPrice":12}
                ]
            }],
            "overheadPercent": 0,
            "profitPercent": 0,
            "discountPercent": 0,
            "vatPercent": 0
        }));
        let result = calculate_estimate(&input).expect("calculation");
        assert_eq!(result.calculation.total, "36640");
        assert_eq!(result.calculation.item_amounts["work"], "29120");
        assert_eq!(result.digest.len(), 64);
    }

    #[test]
    fn applies_markups_discount_and_vat_in_the_same_order_as_the_web_engine() {
        let input = parse(serde_json::json!({
            "sections": [{"id":"s","items":[{"id":"i","quantity":"3.335","norm":1,"coefficient":1,"unitPrice":"100.005"}]}],
            "overheadPercent":10,
            "profitPercent":20,
            "discountPercent":5,
            "vatPercent":20
        }));
        let result = calculate_estimate(&input).expect("calculation");
        assert_eq!(result.calculation.direct_cost, "334.02");
        assert_eq!(result.calculation.overhead, "33.4");
        assert_eq!(result.calculation.profit, "73.48");
        assert_eq!(result.calculation.discount, "22.05");
        assert_eq!(result.calculation.subtotal, "418.85");
        assert_eq!(result.calculation.vat, "83.77");
        assert_eq!(result.calculation.total, "502.62");
    }
}
