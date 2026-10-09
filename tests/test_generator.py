"""
Tests for Synthetic Telemetry Generator.
"""

import pandas as pd
import pytest
from ml.generator import GeneratorConfig, MineTelemetryGenerator, SCENARIO_TYPES


def test_generator_output_structure():
    cfg = GeneratorConfig(seed=42, target_rows=3000, episode_duration_minutes=360)
    gen = MineTelemetryGenerator(cfg)
    df = gen.generate_dataset()

    assert len(df) == 3000
    expected_cols = [
        "timestamp",
        "zone_id",
        "episode_id",
        "methane_pct",
        "airflow",
        "temperature_c",
        "humidity_pct",
        "pressure_kpa",
        "machine_activity",
        "ventilation_state",
        "scenario_type",
    ]
    for col in expected_cols:
        assert col in df.columns

    # Check bounds
    assert (df["methane_pct"] >= 0.0).all()
    assert (df["methane_pct"] <= 5.0).all()
    assert (df["airflow"] > 1.0).all()
    assert (df["humidity_pct"] >= 30.0).all()
    assert (df["humidity_pct"] <= 100.0).all()

    # Multiple episodes and zones
    assert df["episode_id"].nunique() >= 2
    assert df["zone_id"].nunique() >= 2


def test_generator_reproducibility():
    cfg1 = GeneratorConfig(seed=123, target_rows=500, episode_duration_minutes=180)
    df1 = MineTelemetryGenerator(cfg1).generate_dataset()

    cfg2 = GeneratorConfig(seed=123, target_rows=500, episode_duration_minutes=180)
    df2 = MineTelemetryGenerator(cfg2).generate_dataset()

    pd.testing.assert_frame_equal(df1, df2)
