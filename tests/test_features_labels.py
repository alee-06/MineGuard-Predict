"""
Tests for Feature Engineering and Leakage-Safe Target Labeling.
"""

import numpy as np
import pandas as pd
import pytest
from ml.generator import GeneratorConfig, MineTelemetryGenerator
from ml.features import FEATURE_COLUMNS, extract_features_dataset, extract_features_single_window
from ml.labels import HORIZONS, create_forward_labels, verify_no_target_leakage


@pytest.fixture
def sample_dataset():
    cfg = GeneratorConfig(seed=99, target_rows=1500, episode_duration_minutes=300)
    gen = MineTelemetryGenerator(cfg)
    return gen.generate_dataset()


def test_labels_no_leakage(sample_dataset):
    df_feat = extract_features_dataset(sample_dataset)
    df_labeled = create_forward_labels(df_feat, threshold=1.0, horizons=HORIZONS)

    target_cols = [f"target_exceed_{h}m" for h in HORIZONS]
    assert verify_no_target_leakage(df_labeled, FEATURE_COLUMNS, target_cols)

    # Check that labels are binary or NaN
    for h in HORIZONS:
        col = f"target_exceed_{h}m"
        valid_vals = df_labeled[col].dropna().unique()
        assert set(valid_vals).issubset({0.0, 1.0})

        # Check that the last h rows of each episode are NaN (future unobserved)
        for ep_id, group in df_labeled.groupby("episode_id"):
            last_h = group.iloc[-h:][col]
            assert last_h.isna().all()


def test_single_window_feature_extraction(sample_dataset):
    records = sample_dataset.iloc[:35].to_dict(orient="records")
    latest_feat = extract_features_single_window(records)

    assert len(latest_feat) == 1
    for col in FEATURE_COLUMNS:
        assert col in latest_feat.columns
        assert not latest_feat[col].isna().any()


def test_causal_warmup_no_future_leak():
    # If a spike occurs at t=10, features at t=0 must NOT show any diff or slope
    ep_df = pd.DataFrame({
        "timestamp": pd.date_range("2026-01-01", periods=20, freq="1min"),
        "episode_id": "EP-TEST",
        "zone_id": "ZONE-01",
        "methane_pct": [0.3] * 10 + [2.5] * 10,  # sudden surge at t=10
        "airflow": [15.0] * 20,
        "temperature_c": [25.0] * 20,
        "humidity_pct": [75.0] * 20,
        "pressure_kpa": [101.3] * 20,
        "machine_activity": [0] * 20,
        "ventilation_state": ["NORMAL"] * 20,
        "scenario_type": ["NORMAL"] * 20,
    })
    feat = extract_features_dataset(ep_df)
    # Check at t=0
    assert feat.loc[0, "methane_diff_1"] == 0.0
    assert feat.loc[0, "methane_diff_5"] == 0.0
    assert feat.loc[0, "methane_diff_15"] == 0.0
    assert feat.loc[0, "methane_slope_5"] == 0.0
    assert feat.loc[0, "methane_slope_15"] == 0.0
    # At t=9 (before the spike at t=10), diff_1 must still be 0.0
    assert feat.loc[9, "methane_diff_1"] == 0.0
    # At t=10, diff_1 is 2.5 - 0.3 = 2.2
    assert np.isclose(feat.loc[10, "methane_diff_1"], 2.2)

