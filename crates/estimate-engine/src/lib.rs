#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EstimateLine {
    pub quantity_milli: i64,
    pub unit_price_cents: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EstimateInput {
    pub lines: Vec<EstimateLine>,
    pub overhead_basis_points: i64,
    pub profit_basis_points: i64,
    pub vat_basis_points: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EstimateOutput {
    pub direct_cents: i64,
    pub overhead_cents: i64,
    pub profit_cents: i64,
    pub vat_cents: i64,
    pub total_cents: i64,
}

/// Deterministic material requirement calculation for construction workflows.
///
/// All quantities are represented in thousandths of the displayed unit. This
/// keeps the calculation independent from floating-point rounding. For
/// example, `10_000` means 10.000 kg/m² and `30_000` means a 30.000 kg bag.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MaterialRequirementInput {
    pub area_milli: i64,
    pub consumption_kg_per_m2_milli: i64,
    pub waste_basis_points: i64,
    pub package_kg_milli: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MaterialRequirementOutput {
    pub net_kg_milli: i64,
    pub required_kg_milli: i64,
    pub packages: i64,
    pub purchased_kg_milli: i64,
}

fn round_div(value: i128, divisor: i128) -> i64 {
    ((value + divisor / 2) / divisor) as i64
}

fn ceil_div(value: i128, divisor: i128) -> i64 {
    ((value + divisor - 1) / divisor) as i64
}

pub fn calculate(input: &EstimateInput) -> Result<EstimateOutput, &'static str> {
    if input.overhead_basis_points < 0
        || input.profit_basis_points < 0
        || input.vat_basis_points < 0
    {
        return Err("negative percentage");
    }

    let mut direct: i64 = 0;
    for line in &input.lines {
        if line.quantity_milli < 0 || line.unit_price_cents < 0 {
            return Err("negative line value");
        }
        direct = direct
            .checked_add(round_div(
                line.quantity_milli as i128 * line.unit_price_cents as i128,
                1_000,
            ))
            .ok_or("overflow")?;
    }

    let overhead = round_div(direct as i128 * input.overhead_basis_points as i128, 10_000);
    let profit_base = direct.checked_add(overhead).ok_or("overflow")?;
    let profit = round_div(
        profit_base as i128 * input.profit_basis_points as i128,
        10_000,
    );
    let subtotal = profit_base.checked_add(profit).ok_or("overflow")?;
    let vat = round_div(subtotal as i128 * input.vat_basis_points as i128, 10_000);
    let total = subtotal.checked_add(vat).ok_or("overflow")?;

    Ok(EstimateOutput {
        direct_cents: direct,
        overhead_cents: overhead,
        profit_cents: profit,
        vat_cents: vat,
        total_cents: total,
    })
}

/// Calculates the purchased quantity of a packaged material.
///
/// The function deliberately uses integer arithmetic and rounds package count
/// upward: a construction estimate cannot purchase a fractional bag. Waste is
/// applied before package rounding.
pub fn calculate_material_requirement(
    input: &MaterialRequirementInput,
) -> Result<MaterialRequirementOutput, &'static str> {
    if input.area_milli < 0
        || input.consumption_kg_per_m2_milli < 0
        || input.waste_basis_points < 0
        || input.package_kg_milli <= 0
    {
        return Err("invalid material requirement");
    }

    // area_milli * consumption_milli has scale 1e6; divide by 1e3 to return
    // kilograms in milli-units.
    let net_kg_milli = round_div(
        input.area_milli as i128 * input.consumption_kg_per_m2_milli as i128,
        1_000,
    );

    let required_kg_milli = round_div(
        net_kg_milli as i128 * (10_000 + input.waste_basis_points) as i128,
        10_000,
    );

    let packages = ceil_div(
        required_kg_milli as i128,
        input.package_kg_milli as i128,
    );
    let purchased_kg_milli = packages
        .checked_mul(input.package_kg_milli)
        .ok_or("overflow")?;

    Ok(MaterialRequirementOutput {
        net_kg_milli,
        required_kg_milli,
        packages,
        purchased_kg_milli,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calculates_reference_estimate() {
        let result = calculate(&EstimateInput {
            lines: vec![
                EstimateLine {
                    quantity_milli: 56_000,
                    unit_price_cents: 52_000,
                },
                EstimateLine {
                    quantity_milli: 56_000,
                    unit_price_cents: 4_000,
                },
            ],
            overhead_basis_points: 500,
            profit_basis_points: 1_000,
            vat_basis_points: 2_000,
        })
        .expect("calculation");

        assert_eq!(result.direct_cents, 3_136_000);
        assert_eq!(result.overhead_cents, 156_800);
        assert_eq!(result.profit_cents, 329_280);
        assert_eq!(result.vat_cents, 724_416);
        assert_eq!(result.total_cents, 4_346_496);
    }

    #[test]
    fn calculates_packaged_material_with_waste() {
        // 180 m² × 10 kg/m² = 1,800 kg; +10% = 1,980 kg;
        // 30 kg bags => exactly 66 bags.
        let result = calculate_material_requirement(&MaterialRequirementInput {
            area_milli: 180_000,
            consumption_kg_per_m2_milli: 10_000,
            waste_basis_points: 1_000,
            package_kg_milli: 30_000,
        })
        .expect("material calculation");

        assert_eq!(result.net_kg_milli, 1_800_000);
        assert_eq!(result.required_kg_milli, 1_980_000);
        assert_eq!(result.packages, 66);
        assert_eq!(result.purchased_kg_milli, 1_980_000);
    }

    #[test]
    fn rounds_packaged_material_up() {
        // 50 m² × 10 kg/m² = 500 kg; +10% = 550 kg;
        // 30 kg bags => 19 bags, not 18.333...
        let result = calculate_material_requirement(&MaterialRequirementInput {
            area_milli: 50_000,
            consumption_kg_per_m2_milli: 10_000,
            waste_basis_points: 1_000,
            package_kg_milli: 30_000,
        })
        .expect("material calculation");

        assert_eq!(result.required_kg_milli, 550_000);
        assert_eq!(result.packages, 19);
        assert_eq!(result.purchased_kg_milli, 570_000);
    }

    #[test]
    fn rejects_invalid_material_input() {
        let result = calculate_material_requirement(&MaterialRequirementInput {
            area_milli: 1,
            consumption_kg_per_m2_milli: 10_000,
            waste_basis_points: 0,
            package_kg_milli: 0,
        });
        assert!(result.is_err());
    }

    #[test]
    fn rejects_negative_values() {
        let result = calculate(&EstimateInput {
            lines: vec![EstimateLine {
                quantity_milli: -1,
                unit_price_cents: 100,
            }],
            overhead_basis_points: 0,
            profit_basis_points: 0,
            vat_basis_points: 0,
        });
        assert!(result.is_err());
    }
}
