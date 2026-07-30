use prosmet_engine::{EstimateInput, calculate_estimate};
use serde_json::Value;

#[tauri::command]
fn calculate_estimate_native(input: Value) -> Result<Value, String> {
    let estimate: EstimateInput =
        serde_json::from_value(input).map_err(|error| error.to_string())?;
    let result = calculate_estimate(&estimate).map_err(|error| error.to_string())?;
    serde_json::to_value(result).map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![calculate_estimate_native])
        .setup(|app| {
            let origin = std::env::var("PROSMET_DESKTOP_ORIGIN")
                .unwrap_or_else(|_| "https://kolibriai.online".to_owned());
            let url = tauri::Url::parse(&origin)?;
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(url))
                .title("Просметчик")
                .inner_size(1440.0, 900.0)
                .min_inner_size(980.0, 640.0)
                .resizable(true)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Prosmet desktop");
}
