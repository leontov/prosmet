use crate::{
    AppMetadata, EstimateCalculationInput, EstimateCalculationOutput, IpcError, app_metadata,
    calculate_estimate_totals, calculate_line_total,
};

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
    calculate_line_total(quantity_milli, unit_price_cents)
}
