"""
Tests for Two-Workspace Architecture, Live Monitoring, Excel/CSV Data Inspection, and Historical Analysis.
"""

import io
import pytest
from fastapi.testclient import TestClient
from backend.main import app
import pandas as pd


@pytest.fixture
def client():
    return TestClient(app)


def test_live_monitoring_status_disconnected(client):
    """Verifies that live monitoring explicitly reports hardware is disconnected."""
    res = client.get("/api/live/status")
    assert res.status_code == 200
    data = res.json()
    assert data["is_hardware_connected"] is False
    assert "Live data source not connected" in data["connection_message"]
    assert "configured_threshold_pct" in data


def test_live_monitoring_overview_and_watchlist(client):
    """Verifies operational summary in live monitoring."""
    res = client.get("/api/live/overview")
    assert res.status_code == 200
    data = res.json()
    assert data["monitored_areas_count"] >= 1
    assert "area_watchlist" in data
    assert "configured_threshold_pct" in data
    assert len(data["area_watchlist"]) > 0


def test_live_monitoring_trends_and_forecast(client):
    """Verifies sensor trends and multi-horizon causal forecasts."""
    res = client.get("/api/live/trends?zone_id=ZONE-01-TAILGATE")
    assert res.status_code == 200
    data = res.json()
    assert data["zone_id"] == "ZONE-01-TAILGATE"
    assert "series" in data
    assert len(data["series"]) > 0
    assert "threshold_pct" in data


def test_live_monitoring_demo_toggle(client):
    """Verifies toggling demo simulation mode."""
    res = client.post("/api/live/toggle-demo", json={"enabled": True, "episode_id": "EP-0001", "step_index": 45})
    assert res.status_code == 200
    assert res.json()["demo_simulation_active"] is True

    # Revert to false
    res2 = client.post("/api/live/toggle-demo", json={"enabled": False})
    assert res2.status_code == 200
    assert res2.json()["demo_simulation_active"] is False


def test_historical_metadata_and_analyze_period(client):
    """Verifies historical date-range analysis endpoint."""
    meta_res = client.get("/api/historical/meta")
    assert meta_res.status_code == 200
    meta = meta_res.json()
    assert meta["total_rows"] > 0
    assert "start" in meta["time_range"]

    # Analyze period
    req_body = {
        "start_time": meta["time_range"]["start"],
        "end_time": meta["time_range"]["end"],
        "zone_id": "ALL",
        "horizon": 15,
    }
    analyze_res = client.post("/api/historical/analyze", json=req_body)
    assert analyze_res.status_code == 200
    data = analyze_res.json()
    assert "period_summary" in data
    assert "trend_chart" in data
    assert "zone_rankings" in data
    assert "observed_events" in data
    assert "preparation_guidance" in data
    assert len(data["preparation_guidance"]) > 0


def test_historical_events_categories(client):
    """Verifies historical event detection returns categorized physical events."""
    res = client.get("/api/historical/events")
    assert res.status_code == 200
    data = res.json()
    assert "events" in data
    assert len(data["events"]) > 0
    categories = [e["category"] for e in data["events"]]
    assert "THRESHOLD_CROSSING" in categories or "HIGH_ACTIVITY_REDUCED_VENT" in categories


def test_excel_and_csv_inspect_file(client):
    """Verifies Excel (.xlsx) and CSV file inspection and worksheet discovery."""
    # Test CSV inspection
    csv_bytes = b"timestamp,zone_id,methane_pct,airflow\n2026-06-01 00:00:00,ZONE-01,0.45,15.2\n2026-06-01 00:01:00,ZONE-01,0.48,15.0\n"
    res_csv = client.post("/api/dataset/inspect-file", files={"file": ("test.csv", csv_bytes, "text/csv")})
    assert res_csv.status_code == 200
    csv_data = res_csv.json()
    assert csv_data["is_valid"] is True
    assert "timestamp" in csv_data["detected_mapping"]
    assert "methane_pct" in csv_data["detected_mapping"]

    # Test load demo endpoint
    res_demo = client.post("/api/dataset/load-demo")
    assert res_demo.status_code == 200
    assert res_demo.json()["status"] == "LOADED_DEMO"
