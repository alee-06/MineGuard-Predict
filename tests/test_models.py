"""
Tests for Model Inference, Scaler, Regressors, and Explainability.
"""

import os
import pytest
from ml.inference import Predictor
from ml.generator import GeneratorConfig, MineTelemetryGenerator


@pytest.fixture
def predictor():
    if not os.path.exists("artifacts/scaler.joblib"):
        pytest.skip("Models not trained yet.")
    return Predictor("artifacts")


def test_predictor_multi_horizon(predictor):
    # Create 35 simulated records
    cfg = GeneratorConfig(seed=77, target_rows=35, episode_duration_minutes=35)
    gen = MineTelemetryGenerator(cfg)
    records = gen.generate_dataset().to_dict(orient="records")

    res = predictor.predict(records, model_type="hist_gradient_boosting", preferred_horizon=15)

    assert "horizons" in res
    assert "5m" in res["horizons"]
    assert "15m" in res["horizons"]
    assert "30m" in res["horizons"]

    for h in ["5m", "15m", "30m"]:
        h_data = res["horizons"][h]
        assert 0.0 <= h_data["probability"] <= 1.0
        assert h_data["risk_tier"] in ["NORMAL", "ELEVATED", "CRITICAL"]
        assert isinstance(h_data["predicted_peak_methane_pct"], float)
        assert h_data["trend_direction"] in ["RISING", "FALLING", "STABLE"]

    assert "explanation" in res
    assert "top_drivers" in res["explanation"]
    assert len(res["explanation"]["top_drivers"]) >= 3
    assert "narrative_explanation" in res["explanation"]
