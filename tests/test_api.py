"""
Integration tests for FastAPI endpoints.
"""

from fastapi.testclient import TestClient
import pytest
from backend.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_health_endpoint(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "HEALTHY"
    assert data["dataset_loaded"] is True
    assert data["models_loaded"] is True


def test_overview_endpoint(client):
    res = client.get("/api/overview")
    assert res.status_code == 200
    data = res.json()
    assert data["total_records"] >= 100000
    assert data["total_zones"] == 6
    assert "flagship_metrics" in data


def test_temporal_analytics(client):
    res = client.get("/api/analytics/temporal")
    assert res.status_code == 200
    data = res.json()
    assert "heatmap" in data
    assert len(data["heatmap"]) == 24 * 7  # 168 cells
    assert "concentration_distribution" in data


def test_benchmark_metrics(client):
    res = client.get("/api/benchmark/metrics")
    assert res.status_code == 200
    data = res.json()
    assert "metrics" in data
    assert len(data["metrics"]) >= 9  # 3 models x 3 horizons


def test_anomalies_events(client):
    res = client.get("/api/anomalies/events")
    assert res.status_code == 200
    data = res.json()
    assert "events" in data
    assert len(data["events"]) > 0


def test_scenario_simulation(client):
    payload = {
        "initial_methane_pct": 0.40,
        "gas_inflow_rate": 1.5,
        "airflow_m3s": 14.0,
        "machine_activity": 3,
        "ventilation_state": "NORMAL",
        "simulation_minutes": 60,
    }
    res = client.post("/api/scenario/simulate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "COMPLETED"
    assert len(data["records"]) == 60
    assert "timeline_predictions" in data
    # Verify predictions are populated across entire timeline (all 60 minutes)
    assert len(data["timeline_predictions"]) == 60
    assert "advance_warning_lead_time_minutes" in data


def test_replay_episodes_and_step(client):
    res = client.get("/api/replay/episodes")
    assert res.status_code == 200
    episodes = res.json()
    assert len(episodes) > 0
    # EP-0001 must be the first episode (canonical physical hazard)
    first_ep = episodes[0]
    assert first_ep["episode_id"] == "EP-0001"
    assert first_ep["hazard_category"] == "PHYSICAL_HAZARD"
    assert first_ep["scenario_type"] == "DEGRADED_VENTILATION"

    # Test replay step on EP-0001 around the transition
    step_res = client.post(
        "/api/replay/step",
        json={
            "episode_id": "EP-0001",
            "current_index": 385,
            "horizon_minutes": 15,
            "threshold_pct": 1.0,
            "model_type": "hist_gradient_boosting",
        },
    )
    assert step_res.status_code == 200
    step_data = step_res.json()
    assert "prediction" in step_data
    assert "horizons" in step_data["prediction"]
    assert "15m" in step_data["prediction"]["horizons"]
    # Model should have high warning probability on real degraded ventilation
    assert step_data["prediction"]["horizons"]["15m"]["probability"] > 0.50


def test_dataset_summary_and_validation(client):
    res = client.get("/api/dataset/summary")
    assert res.status_code == 200
    data = res.json()
    assert data["loaded"] is True
    assert "target_balance" in data

    # Test invalid CSV rejection
    invalid_csv = b"random_col,other_col\n1,2\n3,4"
    files = {"file": ("bad.csv", invalid_csv, "text/csv")}
    upload_res = client.post("/api/dataset/upload", files=files)
    assert upload_res.status_code == 422
    err_data = upload_res.json()["detail"]
    assert err_data["error"] == "SCHEMA_VALIDATION_FAILED"
    assert "missing_columns" in err_data
