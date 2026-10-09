"""
Anomaly and Event Explorer API endpoints.
Implements rigorous statistical and multivariate detection algorithms across sensor telemetry.
"""

from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException
import numpy as np
import pandas as pd

from backend.service import get_service

router = APIRouter(prefix="/api/anomalies", tags=["anomalies"])


@router.get("/events")
def detect_events(
    anomaly_type: Optional[str] = None,
    zone_id: Optional[str] = None,
    limit: int = 50,
):
    srv = get_service()
    if srv.df is None:
        raise HTTPException(status_code=503, detail="Dataset not loaded.")

    df = srv.df
    if zone_id and zone_id != "ALL":
        df = df[df["zone_id"] == zone_id]

    events = []
    event_counter = 1

    # Scan episodes for distinct physical and statistical anomalies
    # To keep response fast, scan up to 60 representative episodes
    sampled_episodes = df["episode_id"].unique()[:50]

    for ep_id in sampled_episodes:
        ep_df = df[df["episode_id"] == ep_id].sort_values("timestamp").reset_index(drop=True)
        if len(ep_df) < 30:
            continue

        m = ep_df["methane_pct"].values
        af = ep_df["airflow"].values
        act = ep_df["machine_activity"].values
        times = ep_df["timestamp"].values
        scenario = str(ep_df["scenario_type"].iloc[0])
        z = str(ep_df["zone_id"].iloc[0])

        # 1. Sudden Gas Surge: rapid 5m delta > 0.25%
        m_diff5 = pd.Series(m).diff(5).fillna(0).values
        surge_indices = np.where(m_diff5 > 0.25)[0]
        if len(surge_indices) > 0:
            idx = surge_indices[0]
            events.append(
                {
                    "event_id": f"EVT-SURGE-{event_counter:04d}",
                    "episode_id": ep_id,
                    "zone_id": z,
                    "category": "SUDDEN_GAS_SURGE",
                    "timestamp": str(times[idx]),
                    "step_index": int(idx),
                    "peak_value": float(np.round(np.max(m[max(0, idx - 5) : min(len(m), idx + 20)]), 3)),
                    "rate_of_increase_pct_min": float(np.round(m_diff5[idx] / 5.0, 4)),
                    "duration_minutes": 25,
                    "scenario_type": scenario,
                    "description": f"Rapid gas surge detected (+{m_diff5[idx]:.2f}% in 5m) exceeding statistical threshold.",
                }
            )
            event_counter += 1

        # 2. Abrupt Airflow Drop: airflow decreases by > 5.0 m3/s within 5 minutes
        af_diff5 = pd.Series(af).diff(5).fillna(0).values
        drop_indices = np.where(af_diff5 < -5.0)[0]
        if len(drop_indices) > 0:
            idx = drop_indices[0]
            events.append(
                {
                    "event_id": f"EVT-AIRFLOW-{event_counter:04d}",
                    "episode_id": ep_id,
                    "zone_id": z,
                    "category": "ABRUPT_AIRFLOW_DROP",
                    "timestamp": str(times[idx]),
                    "step_index": int(idx),
                    "peak_value": float(np.round(af[idx], 2)),
                    "rate_of_increase_pct_min": float(np.round(abs(af_diff5[idx]) / 5.0, 2)),
                    "duration_minutes": 40,
                    "scenario_type": scenario,
                    "description": f"Severe ventilation restriction detected: airflow collapsed by {abs(af_diff5[idx]):.1f} m³/s in 5m.",
                }
            )
            event_counter += 1

        # 3. Multivariate Compound Hazard: low airflow (< 10) + active cutting (>= 2) + elevated methane (> 0.7)
        compound_mask = (af < 10.0) & (act >= 2) & (m >= 0.70)
        compound_indices = np.where(compound_mask)[0]
        if len(compound_indices) > 0:
            idx = compound_indices[0]
            events.append(
                {
                    "event_id": f"EVT-MULTIVAR-{event_counter:04d}",
                    "episode_id": ep_id,
                    "zone_id": z,
                    "category": "MULTIVARIATE_HAZARD",
                    "timestamp": str(times[idx]),
                    "step_index": int(idx),
                    "peak_value": float(np.round(m[idx], 3)),
                    "rate_of_increase_pct_min": float(np.round(0.015, 4)),
                    "duration_minutes": len(compound_indices),
                    "scenario_type": scenario,
                    "description": f"Compound risk pattern: cutting machinery operating during restricted ventilation with rising gas ({m[idx]:.2f}%).",
                }
            )
            event_counter += 1

        # 4. Sensor Glitch: anomalous spike > 3.8% or dropout to 0.0
        glitch_mask = (m > 3.8) | (m <= 0.01)
        glitch_indices = np.where(glitch_mask)[0]
        if len(glitch_indices) > 0:
            idx = glitch_indices[0]
            events.append(
                {
                    "event_id": f"EVT-SENSOR-{event_counter:04d}",
                    "episode_id": ep_id,
                    "zone_id": z,
                    "category": "SENSOR_ANOMALY",
                    "timestamp": str(times[idx]),
                    "step_index": int(idx),
                    "peak_value": float(np.round(m[idx], 3)),
                    "rate_of_increase_pct_min": float(np.round(0.0, 4)),
                    "duration_minutes": 3,
                    "scenario_type": scenario,
                    "description": f"Implausible sensor telemetry detected (reading: {m[idx]:.2f}%) indicating possible hardware dropout or transient glitch.",
                }
            )
            event_counter += 1

    # Filter by category if requested
    if anomaly_type and anomaly_type != "ALL":
        events = [e for e in events if e["category"] == anomaly_type]

    return {
        "events": events[:limit],
        "total_detected": len(events),
        "categories": [
            "ALL",
            "SUDDEN_GAS_SURGE",
            "ABRUPT_AIRFLOW_DROP",
            "MULTIVARIATE_HAZARD",
            "SENSOR_ANOMALY",
        ],
    }


@router.get("/event/{episode_id}/{step_index}")
def inspect_event_window(episode_id: str, step_index: int, window: int = 40):
    srv = get_service()
    if srv.df is None:
        raise HTTPException(status_code=503, detail="Dataset not loaded.")

    ep_df = srv.df[srv.df["episode_id"] == episode_id].sort_values("timestamp").reset_index(drop=True)
    if len(ep_df) == 0:
        raise HTTPException(status_code=404, detail="Episode not found.")

    start_idx = max(0, step_index - window)
    end_idx = min(len(ep_df), step_index + window)
    slice_df = ep_df.iloc[start_idx:end_idx].copy()

    records = slice_df.to_dict(orient="records")
    for r in records:
        r["timestamp"] = str(r["timestamp"])

    # Compute forecast at trigger point
    forecast = None
    if srv.predictor and step_index >= 30:
        try:
            hist_slice = ep_df.iloc[max(0, step_index - 34) : step_index + 1]
            forecast = srv.predictor.predict(
                recent_records=hist_slice.to_dict(orient="records"),
                model_type="hist_gradient_boosting",
                preferred_horizon=15,
            )
        except Exception:
            forecast = None

    return {
        "episode_id": episode_id,
        "zone_id": str(ep_df["zone_id"].iloc[0]),
        "scenario_type": str(ep_df["scenario_type"].iloc[0]),
        "trigger_step_index": step_index,
        "trigger_timestamp": str(ep_df.iloc[step_index]["timestamp"]),
        "series": records,
        "forecast_at_trigger": forecast,
    }
