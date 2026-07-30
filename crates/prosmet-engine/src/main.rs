use prosmet_engine::{ENGINE_VERSION, EstimateInput, calculate_estimate};
use serde_json::json;
use std::io::{self, Read};

fn main() {
    if std::env::args().any(|arg| arg == "--health") {
        println!(
            "{}",
            json!({"ok": true, "engine": "rust", "version": ENGINE_VERSION})
        );
        return;
    }

    let mut raw = String::new();
    if let Err(error) = io::stdin().read_to_string(&mut raw) {
        eprintln!(
            "{}",
            json!({"ok": false, "error": "read_failed", "message": error.to_string()})
        );
        std::process::exit(2);
    }

    let input: EstimateInput = match serde_json::from_str(&raw) {
        Ok(value) => value,
        Err(error) => {
            eprintln!(
                "{}",
                json!({"ok": false, "error": "invalid_input", "message": error.to_string()})
            );
            std::process::exit(2);
        }
    };

    match calculate_estimate(&input) {
        Ok(result) => println!(
            "{}",
            serde_json::to_string(&result).expect("serialize result")
        ),
        Err(error) => {
            eprintln!(
                "{}",
                json!({"ok": false, "error": "calculation_failed", "message": error.to_string()})
            );
            std::process::exit(3);
        }
    }
}
