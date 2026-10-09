"""
Multi-Zone Risk Explorer API endpoints.
Provides real-time state, model-evaluated multi-horizon risk, and historical context for all zones.
"""

from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException
import numpy as np
import pandas as pd

from backend.service import get_service

router = APIRouter(prefix="/api/zones", tags=["zones"])


@router.get("")
def get_zones_summary():
    srv = get_service()
    if srv.df is None:
        raise HTTPException(status_code=503, detail="Dataset not loaded.")

    df = srv.df
    unique_zones = sorted(df["zone_id"].unique())
    zone_results = []

    for z_id in unique_zones:
        z_df = df[df["zone_id"] == z_id].sort_values("timestamp").reset_index(drop=True)
        if len(z_df) == 0:
            continue

        # Get latest window of 35 records for live inference
        latest_slice = z_df.iloc[-35:].copy()
        current_row = latest_slice.iloc[-1]
        curr_ch4 = float(current_row["methane_pct"])
        curr_af = float(current_row["airflow"])
        curr_temp = float(current_row["temperature_c"])
        curr_press = float(current_row["pressure_kpa"])
        curr_act = int(current_row["machine_activity"])
        curr_vent = str(current_row["ventilation_state"])

        # Run real model prediction if predictor is available
        predictions = {}
        contributing_drivers = []
        if srv.predictor:
            try:
                pred_out = srv.predictor.predict(
                    recent_records=latest_slice.to_dict(orient="records"),
                    model_type="hist_gradient_boosting",
                    preferred_horizon=15,
                )
                predictions = pred_out.get("horizons", {})
                contributing_drivers = pred_out.get("explanation", {}).get("top_drivers", [])
            except Exception:
                predictions = {}

        # Historical threshold crossings
        is_exceed = z_df["methane_pct"] >= 1.0
        event_count = int((is_exceed & (~is_exceed.shift(1, fill_value=False))).sum())
        total_exceed_minutes = int(is_exceed.sum())

        # Recent 30m trend direction
        recent_15m_m = z_df.iloc[-15:]["methane_pct"].values
        slope_15m = float(np.round((recent_15m_m[-1] - recent_15m_m[0]) / 15.0, 4))
        trend_label = "RISING" if slope_15m > 0.005 else "FALLING" if slope_15m < -0.005 else "STABLE"

        # Overall risk index for ranking
        p15 = predictions.get("15m", {}).get("probability", 0.05)
        risk_score = float(np.round(p15 * 70 + (curr_ch4 / 2.0) * 30, 1))
        risk_category = "CRITICAL" if p15 >= 0.70 else "ELEVATED" if p15 >= 0.30 else "NORMAL"

        zone_results.append(
            {
                "zone_id": z_id,
                "current_methane_pct": curr_ch4,
                "current_airflow": curr_af,
                "current_temperature_c": curr_temp,
                "current_pressure_kpa": curr_press,
                "machine_activity": curr_act,
                "ventilation_state": curr_vent,
                "recent_trend": trend_label,
                "slope_15m": slope_15m,
                "risk_score": risk_score,
                "risk_category": risk_category,
                "predictions": predictions,
                "historical_events_count": event_count,
                "historical_exceedance_minutes": total_exceed_minutes,
                "historical_peak_methane": float(np.round(z_df["methane_pct"].max(), 3)),
                "contributing_drivers": contributing_drivers[:3],
                "schematic_position": _get_zone_schematic_position(z_id),
            }
        )

    # Rank zones descending by model risk score
    zone_results.sort(key=lambda x: x["risk_score"], reverse=True)
    return {
        "zones": zone_results,
        "total_zones": len(zone_results),
        "timestamp": str(df["timestamp"].max()),
    }


def _get_zone_schematic_position(zone_id: str) -> Dict[str, float]:
    """Provides normalized schematic diagram coordinates (x, y % 0-100) for UI display."""
    positions = {
        "ZONE-01-TAILGATE": {"x": 20, "y": 30, "type": "RETURN"},
        "ZONE-02-LONGWALL-FACE": {"x": 50, "y": 30, "type": "WORKING_FACE"},
        "ZONE-03-MAINGATE": {"x": 80, "y": 30, "type": "INTAKE"},
        "ZONE-04-BLEEDER-SEAL": {"x": 20, "y": 70, "type": "GOAF_BLEEDER"},
        "ZONE-05-DEVELOPMENT-HEADING": {"x": 50, "y": 70, "type": "DEVELOPMENT"},
        "ZONE-06-RETURN-AIRWAY": {"x": 80, "y": 70, "type": "MAIN_RETURN"},
    }
    return positions.get(zone_id, {"x": 50, "y": 50, "type": "GENERAL"})
