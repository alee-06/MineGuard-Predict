"""
Overview dashboard API endpoints.
Computes genuine summary statistics from the loaded dataset and trained model metrics.
"""

from typing import Optional
from fastapi import APIRouter
import numpy as np
import pandas as pd
from backend.service import get_service

router = APIRouter(prefix="/api/overview", tags=["overview"])

ZONE_NAMES = {
    "ZONE-01-TAILGATE": "Tailgate Return (Bleeder Junction)",
    "ZONE-02-LONGWALL-FACE": "Longwall Working Face",
    "ZONE-03-MAINGATE": "Maingate Fresh Intake",
    "ZONE-04-BLEEDER-SEAL": "Goaf / Bleeder Seal Area",
    "ZONE-05-DEVELOPMENT-HEADING": "Rapid Development Heading",
    "ZONE-06-RETURN-AIRWAY": "Main Return Airway",
}


@router.get("")
def get_overview_metrics(horizon: Optional[int] = 15):
    srv = get_service()
    if srv.df is None or len(srv.df) == 0:
        return {
            "status": "DATASET_NOT_LOADED",
            "message": "Dataset has not been generated or loaded.",
            "total_zones": 0,
            "total_records": 0,
            "total_episodes": 0,
            "simulated_events": 0,
            "highest_risk_zone": "N/A",
            "highest_risk_zone_name": "N/A",
            "model_ready": False,
        }

    df = srv.df
    total_records = len(df)
    total_episodes = int(df["episode_id"].nunique())
    zones = df["zone_id"].unique().tolist()
    total_zones = len(zones)

    # Calculate actual simulated events (contiguous periods where methane >= 1.0%)
    threshold = 1.0
    is_exceed = df["methane_pct"] >= threshold
    # Count transitions into exceedance (discrete event crossings)
    event_starts = int((is_exceed & (~is_exceed.shift(1, fill_value=False))).sum())
    threshold_exceedance_minutes = int(is_exceed.sum())
    threshold_exceedance_percentage = float(np.round(is_exceed.mean() * 100, 2))

    # Zone stats
    zone_stats = []
    for z in zones:
        z_df = df[df["zone_id"] == z]
        z_exceed = z_df["methane_pct"] >= threshold
        z_events = int((z_exceed & (~z_exceed.shift(1, fill_value=False))).sum())
        zone_stats.append(
            {
                "zone_id": z,
                "zone_name": ZONE_NAMES.get(z, z),
                "event_count": z_events,
                "peak_methane": float(np.round(z_df["methane_pct"].max(), 3)),
                "avg_methane": float(np.round(z_df["methane_pct"].mean(), 3)),
                "avg_airflow": float(np.round(z_df["airflow"].mean(), 2)),
                "risk_index": float(np.round((z_events * 10) + (z_df["methane_pct"].mean() * 5), 2)),
            }
        )

    # Sort zone stats by risk index descending
    zone_stats.sort(key=lambda x: x["risk_index"], reverse=True)
    highest_risk_zone = zone_stats[0]["zone_id"] if zone_stats else "N/A"
    highest_risk_zone_name = ZONE_NAMES.get(highest_risk_zone, highest_risk_zone)

    # Historical event frequency by scenario type
    scenario_counts = df[is_exceed]["scenario_type"].value_counts().to_dict()

    # Time range
    time_min = str(df["timestamp"].min())
    time_max = str(df["timestamp"].max())
    simulated_days = float(np.round(total_records / 1440.0, 1))

    # Model readiness
    model_ready = srv.predictor is not None
    model_meta = srv.metadata or {}
    metrics_summary = {}
    target_horizon = horizon if horizon in [5, 15, 30] else 15
    if srv.metrics_data:
        # Find HistGradientBoosting metrics matching the requested horizon
        for m in srv.metrics_data.get("metrics", []):
            if m.get("model_name") == "hist_gradient_boosting" and m.get("horizon_minutes") == target_horizon:
                cal = m.get("calibration", {})
                fa_analysis = m.get("false_alarm_analysis", {})
                metrics_summary = {
                    "flagship_model": f"HistGradientBoosting ({target_horizon}m)",
                    "horizon_minutes": target_horizon,
                    "roc_auc": m.get("roc_auc"),
                    "pr_auc": m.get("pr_auc"),
                    "f1_score": m.get("f1_score"),
                    "precision": m.get("precision"),
                    "recall": m.get("recall"),
                    "decision_threshold": m.get("decision_threshold", 0.50),
                    "validation_tuned_threshold": m.get("validation_tuned_threshold"),
                    "brier_score": cal.get("brier_score"),
                    "expected_calibration_error": cal.get("expected_calibration_error"),
                    "false_alarms_per_day": fa_analysis.get("false_alarm_incidents_per_day", m.get("false_alarms_per_day")),
                    "false_alarm_incidents_per_day": fa_analysis.get("false_alarm_incidents_per_day", m.get("false_alarms_per_day")),
                    "false_alarm_minutes_per_day": fa_analysis.get("false_alarm_minutes_per_day"),
                    "false_alarm_analysis": fa_analysis,
                    "sample_counts": m.get("sample_counts", {}),
                    "eval_data_fingerprint": m.get("eval_data_fingerprint"),
                }
                break

    return {
        "status": "READY",
        "dataset_name": "synthetic_mine_sensors_150k.csv",
        "total_records": total_records,
        "total_episodes": total_episodes,
        "total_zones": total_zones,
        "simulated_days": simulated_days,
        "time_range": {"start": time_min, "end": time_max},
        "threshold_crossing_events": int(event_starts),
        "threshold_exceedance_minutes": threshold_exceedance_minutes,
        "threshold_exceedance_percentage": threshold_exceedance_percentage,
        "highest_risk_zone": highest_risk_zone,
        "highest_risk_zone_name": highest_risk_zone_name,
        "zone_rankings": zone_stats,
        "scenario_event_breakdown": scenario_counts,
        "model_readiness": {
            "model_ready": model_ready,
            "version": model_meta.get("version", "1.0.0"),
            "timestamp": model_meta.get("timestamp"),
            "horizons": [5, 15, 30],
            "threshold_pct": model_meta.get("target_threshold_ch4_pct", 1.0),
        },
        "flagship_metrics": metrics_summary,
        "synthetic_notice": "ALL DATA SYNTHETIC: Programmatically generated with continuous physical atmospheric differential equations.",
    }
