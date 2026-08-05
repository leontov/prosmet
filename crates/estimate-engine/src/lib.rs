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

fn round_div(value: i128, divisor: i128) -> i64 {
    ((value + divisor / 2) / divisor) as i64
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
