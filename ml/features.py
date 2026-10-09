"""
MineGuard Predict - Causal Feature Engineering Pipeline.

Transforms raw minute-level sensor telemetry into rich temporal, physical,
and rate-of-change predictive signals strictly using information at or before time t.
"""

from typing import List, Optional, Tuple
import numpy as np
import pandas as pd


FEATURE_COLUMNS = [
    "methane_pct",
    "methane_lag_1",
    "methane_lag_2",
    "methane_lag_5",
    "methane_lag_10",
    "methane_lag_15",
    "methane_lag_30",
    "methane_diff_1",
    "methane_diff_5",
    "methane_diff_15",
    "methane_roll_mean_5",
    "methane_roll_std_5",
    "methane_roll_min_5",
    "methane_roll_max_5",
    "methane_roll_mean_15",
    "methane_roll_std_15",
    "methane_roll_min_15",
    "methane_roll_max_15",
    "methane_roll_mean_30",
    "methane_roll_std_30",
    "methane_roll_min_30",
    "methane_roll_max_30",
    "methane_slope_5",
    "methane_slope_15",
    "airflow",
    "airflow_lag_5",
    "airflow_lag_15",
    "airflow_diff_5",
    "airflow_diff_15",
    "airflow_roll_mean_15",
    "methane_airflow_ratio",
    "temperature_c",
    "temp_diff_15",
    "humidity_pct",
    "pressure_kpa",
    "pressure_diff_15",
    "machine_activity",
    "machine_activity_mean_15",
    "ventilation_is_degraded",
    "ventilation_is_boosted",
    "sin_hour",
    "cos_hour",
    "sin_day",
    "cos_day",
]


def extract_features_for_episode(df_episode: pd.DataFrame) -> pd.DataFrame:
    """
    Extracts causal lag, rolling, trend, and interaction features for a single continuous episode.
    Ensures zero forward information leakage.
    """
    df = df_episode.copy()
    if not pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
        df["timestamp"] = pd.to_datetime(df["timestamp"])

    # Base series
    m = df["methane_pct"]
    af = df["airflow"]
    temp = df["temperature_c"]
    pr = df["pressure_kpa"]
    act = df["machine_activity"]
    vent = df["ventilation_state"].astype(str)

    # 1. Lags (strictly backwards)
    for lag in [1, 2, 5, 10, 15, 30]:
        df[f"methane_lag_{lag}"] = m.shift(lag)

    # 2. Differences / Rates of change
    df["methane_diff_1"] = m - df["methane_lag_1"]
    df["methane_diff_5"] = m - df["methane_lag_5"]
    df["methane_diff_15"] = m - df["methane_lag_15"]

    # 3. Rolling metrics (closed='left' or backwards rolling on current and past)
    # rolling(window) on pandas series includes current row t and preceding (window-1) rows
    for w in [5, 15, 30]:
        roll = m.rolling(window=w, min_periods=1)
        df[f"methane_roll_mean_{w}"] = roll.mean()
        df[f"methane_roll_std_{w}"] = roll.std().fillna(0.0)
        df[f"methane_roll_min_{w}"] = roll.min()
        df[f"methane_roll_max_{w}"] = roll.max()

    # 4. Slope estimates
    df["methane_slope_5"] = (m - df["methane_lag_5"]) / 5.0
    df["methane_slope_15"] = (m - df["methane_lag_15"]) / 15.0

    # 5. Airflow features
    df["airflow_lag_5"] = af.shift(5)
    df["airflow_lag_15"] = af.shift(15)
    df["airflow_diff_5"] = af - df["airflow_lag_5"]
    df["airflow_diff_15"] = af - df["airflow_lag_15"]
    df["airflow_roll_mean_15"] = af.rolling(window=15, min_periods=1).mean()
    df["methane_airflow_ratio"] = m / (af.clip(lower=0.5) + 0.1)

    # 6. Environmental trends
    df["temp_diff_15"] = temp - temp.shift(15)
    df["pressure_diff_15"] = pr - pr.shift(15)

    # 7. Machine activity and ventilation states
    df["machine_activity_mean_15"] = act.rolling(window=15, min_periods=1).mean()
    df["ventilation_is_degraded"] = (vent == "DEGRADED").astype(float)
    df["ventilation_is_boosted"] = (vent == "BOOSTED").astype(float)

    # 8. Cyclic time features
    hours = df["timestamp"].dt.hour + df["timestamp"].dt.minute / 60.0
    days = df["timestamp"].dt.dayofweek
    df["sin_hour"] = np.sin(2 * np.pi * hours / 24.0)
    df["cos_hour"] = np.cos(2 * np.pi * hours / 24.0)
    df["sin_day"] = np.sin(2 * np.pi * days / 7.0)
    df["cos_day"] = np.cos(2 * np.pi * days / 7.0)

    # Fill initial lag warmup NaNs strictly causally using historical baseline without backward look
    for lag in [1, 2, 5, 10, 15, 30]:
        df[f"methane_lag_{lag}"] = df[f"methane_lag_{lag}"].fillna(m.iloc[0])
    for lag in [5, 15]:
        df[f"airflow_lag_{lag}"] = df[f"airflow_lag_{lag}"].fillna(af.iloc[0])
    df[FEATURE_COLUMNS] = df[FEATURE_COLUMNS].fillna(0.0)
    return df


def extract_features_dataset(df_full: pd.DataFrame) -> pd.DataFrame:
    """
    Applies feature engineering across each episode independently to avoid cross-episode boundary pollution.
    """
    groups = []
    for ep_id, ep_df in df_full.groupby("episode_id", sort=False):
        ep_feat = extract_features_for_episode(ep_df)
        groups.append(ep_feat)
    return pd.concat(groups, ignore_index=True)


def extract_features_single_window(recent_records: List[dict]) -> pd.DataFrame:
    """
    Computes feature vector for live inference given a recent window of records (e.g. 35 records up to time t).
    Returns a single-row DataFrame containing FEATURE_COLUMNS for the latest timestamp t.
    """
    df_window = pd.DataFrame(recent_records)
    if "timestamp" not in df_window.columns:
        df_window["timestamp"] = pd.date_range(end=pd.Timestamp.now(), periods=len(df_window), freq="1min")
    
    df_feat = extract_features_for_episode(df_window)
    # Return the last row (corresponding to current time t)
    latest_features = df_feat.iloc[[-1]][FEATURE_COLUMNS].copy()
    return latest_features
