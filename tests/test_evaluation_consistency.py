"""
Regression test suite for evaluation consistency, mathematical fidelity,
calibration metrics, false-alarm structure, and dynamic horizon API responses.
"""

import json
import os
import pytest
from fastapi.testclient import TestClient
from backend.main import app

CLIENT = TestClient(app)
METRICS_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "artifacts", "evaluation_metrics.json")


def test_metrics_artifact_structure():
    assert os.path.exists(METRICS_PATH), f"Missing {METRICS_PATH}"
    with open(METRICS_PATH, "r") as f:
        data = json.load(f)

    assert "metrics" in data
    assert len(data["metrics"]) == 9, f"Expected 9 model evaluations, got {len(data['metrics'])}"
    assert data["horizons"] == [5, 15, 30]
    assert data["threshold_pct"] == 1.0


def test_all_nine_combinations_present_and_consistent():
    with open(METRICS_PATH, "r") as f:
        data = json.load(f)

    expected_models = {"logistic_regression", "random_forest", "hist_gradient_boosting"}
    expected_horizons = {5, 15, 30}
    seen = set()
    fingerprints_by_horizon = {}

    for m in data["metrics"]:
        model_name = m["model_name"]
        horizon = m["horizon_minutes"]
        seen.add((model_name, horizon))

        assert model_name in expected_models
        assert horizon in expected_horizons

        # 1. Decision threshold explicitly recorded
        assert "decision_threshold" in m
        assert m["decision_threshold"] == 0.50
        assert "validation_tuned_threshold" in m
        assert 0.0 < m["validation_tuned_threshold"] < 1.0

        # 2. Confusion matrix & sample counts consistency
        cm = m["confusion_matrix"]
        tp, fp, fn, tn = cm["tp"], cm["fp"], cm["fn"], cm["tn"]
        sc = m["sample_counts"]

        assert tp + fp + fn + tn == sc["total_samples"]
        assert tp + fn == sc["positive_samples"]
        assert fp + tn == sc["negative_samples"]
        assert sc["total_samples"] > 20000
        assert sc["positive_samples"] > 0

        # 3. Precision, Recall, F1 mathematical integrity
        calc_precision = round(tp / max(1, tp + fp), 4)
        calc_recall = round(tp / max(1, tp + fn), 4)
        calc_f1 = round(2 * calc_precision * calc_recall / max(1e-9, calc_precision + calc_recall), 4)

        assert abs(m["precision"] - calc_precision) <= 0.001, (
            f"Precision mismatch for {model_name} {horizon}m: reported={m['precision']}, calc={calc_precision}"
        )
        assert abs(m["recall"] - calc_recall) <= 0.001, (
            f"Recall mismatch for {model_name} {horizon}m: reported={m['recall']}, calc={calc_recall}"
        )
        assert abs(m["f1_score"] - calc_f1) <= 0.002, (
            f"F1 mismatch for {model_name} {horizon}m: reported={m['f1_score']}, calc={calc_f1}"
        )

        # 4. Calibration metrics
        cal = m["calibration"]
        assert "brier_score" in cal
        assert 0.0 <= cal["brier_score"] <= 0.05, f"Brier score unexpectedly high: {cal['brier_score']}"
        assert "expected_calibration_error" in cal
        assert 0.0 <= cal["expected_calibration_error"] <= 0.05

        # 5. False alarm minutes vs discrete incidents
        fa = m["false_alarm_analysis"]
        assert fa["false_alarm_minutes"] == fp
        assert fa["false_alarm_incidents"] <= fa["false_alarm_minutes"]
        assert fa["false_alarm_incidents_merged_5m"] <= fa["false_alarm_incidents"]
        assert fa["false_alarm_incidents_per_day"] <= fa["false_alarm_minutes_per_day"]

        # 6. Evaluation data fingerprint
        fp_hash = m["eval_data_fingerprint"]
        assert len(fp_hash) >= 16, "Fingerprint must be at least 16 hex characters"
        if horizon not in fingerprints_by_horizon:
            fingerprints_by_horizon[horizon] = fp_hash
        else:
            assert fingerprints_by_horizon[horizon] == fp_hash, (
                f"Data fingerprint for horizon {horizon}m must be identical across models"
            )

    assert len(seen) == 9


def test_api_overview_dynamic_horizons():
    for h in [5, 15, 30]:
        resp = CLIENT.get(f"/api/overview?horizon={h}")
        assert resp.status_code == 200
        body = resp.json()

        assert body["status"] == "READY"
        flagship = body["flagship_metrics"]
        assert flagship["horizon_minutes"] == h
        assert f"({h}m)" in flagship["flagship_model"]
        assert "brier_score" in flagship
        assert "expected_calibration_error" in flagship
        assert "eval_data_fingerprint" in flagship
        assert len(flagship["eval_data_fingerprint"]) >= 16

        # Distinguish crossings from exceedance duration
        assert body["threshold_crossing_events"] > 0
        assert body["threshold_exceedance_minutes"] >= body["threshold_crossing_events"]
        assert 0.0 < body["threshold_exceedance_percentage"] < 100.0


def test_api_reports_csv_and_benchmark():
    # Benchmark metrics endpoint
    resp_bench = CLIENT.get("/api/benchmark/metrics")
    assert resp_bench.status_code == 200
    bench_data = resp_bench.json()
    assert len(bench_data["metrics"]) == 9

    # CSV Export endpoint
    resp_csv = CLIENT.get("/api/reports/export/csv")
    assert resp_csv.status_code == 200
    csv_text = resp_csv.text
    assert "Decision_Threshold" in csv_text
    assert "Brier_Score" in csv_text
    assert "ECE" in csv_text
    assert "FA_Incidents_Per_Day" in csv_text
    assert "FA_Minutes_Per_Day" in csv_text
    assert "Data_Fingerprint" in csv_text
