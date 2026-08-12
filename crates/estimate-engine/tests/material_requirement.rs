use prosmet_estimate_engine::{
    MaterialRequirementInput, calculate_material_requirement,
};

#[test]
fn plaster_reference_case_is_stable() {
    let result = calculate_material_requirement(&MaterialRequirementInput {
        area_milli: 180_000,
        consumption_kg_per_m2_milli: 10_000,
        waste_basis_points: 1_000,
        package_kg_milli: 30_000,
    })
    .expect("reference material requirement");

    assert_eq!(result.net_kg_milli, 1_800_000);
    assert_eq!(result.required_kg_milli, 1_980_000);
    assert_eq!(result.packages, 66);
    assert_eq!(result.purchased_kg_milli, 1_980_000);
}

#[test]
fn fractional_package_requirement_always_rounds_up() {
    let result = calculate_material_requirement(&MaterialRequirementInput {
        area_milli: 50_000,
        consumption_kg_per_m2_milli: 10_000,
        waste_basis_points: 1_000,
        package_kg_milli: 30_000,
    })
    .expect("package rounding");

    assert_eq!(result.required_kg_milli, 550_000);
    assert_eq!(result.packages, 19);
    assert_eq!(result.purchased_kg_milli, 570_000);
}

#[test]
fn invalid_package_size_is_rejected() {
    let result = calculate_material_requirement(&MaterialRequirementInput {
        area_milli: 1_000,
        consumption_kg_per_m2_milli: 10_000,
        waste_basis_points: 1_000,
        package_kg_milli: 0,
    });

    assert_eq!(result, Err("invalid material requirement"));
}
