use prosmet_estimate_engine::{calculate, EstimateInput, EstimateLine, EstimateOutput};
use serde::{Deserialize, Serialize};

const MAX_ESTIMATE_LINES: usize = 10_000;
const MAX_BASIS_POINTS: i64 = 100_000;
const PRODUCTION_API_ORIGIN: &str = "https://kolibriai.online";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppMetadata {
    pub product_name: String,
    pub version: String,
    pub git_sha: String,
    pub operating_system: String,
    pub architecture: String,
    pub api_origin: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EstimateLineInput {
    pub quantity_milli: i64,
    pub unit_price_cents: i64,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EstimateCalculationInput {
    pub lines: Vec<EstimateLineInput>,
    pub overhead_basis_points: i64,
    pub profit_basis_points: i64,
    pub vat_basis_points: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EstimateCalculationOutput {
    pub direct_cents: i64,
    pub overhead_cents: i64,
    pub profit_cents: i64,
    pub vat_cents: i64,
    pub total_cents: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IpcError {
    pub code: String,
    pub message: String,
}

impl IpcError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_owned(),
            message: message.into(),
        }
    }
}

fn validate_basis_points(name: &str, value: i64) -> Result<(), IpcError> {
    if value < 0 {
        return Err(IpcError::new(
            "NEGATIVE_PERCENTAGE",
            format!("{name} cannot be negative"),
        ));
    }
    if value > MAX_BASIS_POINTS {
        return Err(IpcError::new(
            "PERCENTAGE_LIMIT_EXCEEDED",
            format!("{name} exceeds the supported limit"),
        ));
    }
    Ok(())
}

pub fn app_metadata() -> AppMetadata {
    AppMetadata {
        product_name: "ProSmet".to_owned(),
        version: env!("CARGO_PKG_VERSION").to_owned(),
        git_sha: option_env!("PROSMET_GIT_SHA")
            .unwrap_or("development")
            .to_owned(),
        operating_system: std::env::consts::OS.to_owned(),
        architecture: std::env::consts::ARCH.to_owned(),
        api_origin: PRODUCTION_API_ORIGIN.to_owned(),
    }
}

pub fn calculate_estimate_totals(
    input: EstimateCalculationInput,
) -> Result<EstimateCalculationOutput, IpcError> {
    if input.lines.len() > MAX_ESTIMATE_LINES {
        return Err(IpcError::new(
            "LINE_LIMIT_EXCEEDED",
            format!("estimate contains more than {MAX_ESTIMATE_LINES} lines"),
        ));
    }

    validate_basis_points("overheadBasisPoints", input.overhead_basis_points)?;
    validate_basis_points("profitBasisPoints", input.profit_basis_points)?;
    validate_basis_points("vatBasisPoints", input.vat_basis_points)?;

    for (index, line) in input.lines.iter().enumerate() {
        if line.quantity_milli < 0 || line.unit_price_cents < 0 {
            return Err(IpcError::new(
                "NEGATIVE_LINE_VALUE",
                format!("line {index} contains a negative value"),
            ));
        }
    }

    let output = calculate(&EstimateInput {
        lines: input
            .lines
            .into_iter()
            .map(|line| EstimateLine {
                quantity_milli: line.quantity_milli,
                unit_price_cents: line.unit_price_cents,
            })
            .collect(),
        overhead_basis_points: input.overhead_basis_points,
        profit_basis_points: input.profit_basis_points,
        vat_basis_points: input.vat_basis_points,
    })
    .map_err(map_engine_error)?;

    Ok(map_output(output))
}

fn map_engine_error(message: &'static str) -> IpcError {
    let code = match message {
        "negative percentage" => "NEGATIVE_PERCENTAGE",
        "negative line value" => "NEGATIVE_LINE_VALUE",
        "overflow" => "CALCULATION_OVERFLOW",
        _ => "CALCULATION_FAILED",
    };
    IpcError::new(code, message)
}

fn map_output(output: EstimateOutput) -> EstimateCalculationOutput {
    EstimateCalculationOutput {
        direct_cents: output.direct_cents,
        overhead_cents: output.overhead_cents,
        profit_cents: output.profit_cents,
        vat_cents: output.vat_cents,
        total_cents: output.total_cents,
    }
}

#[tauri::command]
pub fn get_app_metadata() -> AppMetadata {
    app_metadata()
}

#[tauri::command]
pub fn calculate_estimate(
    input: EstimateCalculationInput,
) -> Result<EstimateCalculationOutput, IpcError> {
    calculate_estimate_totals(input)
}

#[tauri::command]
pub fn calculate_line(quantity_milli: i64, unit_price_cents: i64) -> Result<i64, IpcError> {
    calculate_estimate_totals(EstimateCalculationInput {
        lines: vec![EstimateLineInput {
            quantity_milli,
            unit_price_cents,
        }],
        overhead_basis_points: 0,
        profit_basis_points: 0,
        vat_basis_points: 0,
    })
    .map(|output| output.total_cents)
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_app_metadata,
            calculate_estimate,
            calculate_line
        ])
        .run(tauri::generate_context!())
        .expect("error while running ProSmet desktop");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reference_input() -> EstimateCalculationInput {
        EstimateCalculationInput {
            lines: vec![
                EstimateLineInput {
                    quantity_milli: 56_000,
                    unit_price_cents: 52_000,
                },
                EstimateLineInput {
                    quantity_milli: 56_000,
                    unit_price_cents: 4_000,
                },
            ],
            overhead_basis_points: 500,
            profit_basis_points: 1_000,
            vat_basis_points: 2_000,
        }
    }

    #[test]
    fn returns_sanitized_app_metadata() {
        let metadata = app_metadata();
        assert_eq!(metadata.product_name, "ProSmet");
        assert!(metadata.api_origin.starts_with("https://"));
        assert!(!metadata.git_sha.contains("token"));
        assert!(!metadata.git_sha.contains("secret"));
    }

    #[test]
    fn calculates_the_authoritative_aggregate_contract() {
        let result = calculate_estimate_totals(reference_input()).expect("calculation");
        assert_eq!(result.direct_cents, 3_136_000);
        assert_eq!(result.overhead_cents, 156_800);
        assert_eq!(result.profit_cents, 329_280);
        assert_eq!(result.vat_cents, 724_416);
        assert_eq!(result.total_cents, 4_346_496);
    }

    #[test]
    fn preserves_the_legacy_calculate_line_command() {
        let result = calculate_line(1_500, 20_000).expect("line calculation");
        assert_eq!(result, 30_000);
    }

    #[test]
    fn rejects_invalid_percentage_and_line_values() {
        let mut percentage = reference_input();
        percentage.vat_basis_points = MAX_BASIS_POINTS + 1;
        assert_eq!(
            calculate_estimate_totals(percentage).expect_err("percentage must fail").code,
            "PERCENTAGE_LIMIT_EXCEEDED"
        );

        let mut line = reference_input();
        line.lines[0].quantity_milli = -1;
        assert_eq!(
            calculate_estimate_totals(line).expect_err("negative line must fail").code,
            "NEGATIVE_LINE_VALUE"
        );
    }

    #[test]
    fn rejects_unbounded_line_counts() {
        let input = EstimateCalculationInput {
            lines: vec![
                EstimateLineInput {
                    quantity_milli: 1_000,
                    unit_price_cents: 100,
                };
                MAX_ESTIMATE_LINES + 1
            ],
            overhead_basis_points: 0,
            profit_basis_points: 0,
            vat_basis_points: 0,
        };
        assert_eq!(
            calculate_estimate_totals(input).expect_err("line limit must fail").code,
            "LINE_LIMIT_EXCEEDED"
        );
    }
}
