use prosmet_estimate_engine::{calculate, EstimateInput, EstimateLine};

#[tauri::command]
fn calculate_line(quantity_milli: i64, unit_price_cents: i64) -> Result<i64, String> {
    let output = calculate(&EstimateInput {
        lines: vec![EstimateLine { quantity_milli, unit_price_cents }],
        overhead_basis_points: 0,
        profit_basis_points: 0,
        vat_basis_points: 0,
    }).map_err(str::to_string)?;
    Ok(output.total_cents)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![calculate_line])
        .run(tauri::generate_context!())
        .expect("error while running Prosmet desktop");
}
