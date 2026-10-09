"""
Interactive Event Replay API endpoints.
Enables step-by-step or streaming playback of simulated episodes with live model inference
strictly utilizing history up to step t, revealing actual outcomes only after the horizon window passes.
"""

from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import numpy as np
import pandas as pd

from backend.service import get_service

router = APIRouter(prefix="/api/replay", tags=["replay"])


class ReplayStepRequest(BaseModel):
    episode_id: str
    current_index: int  # index within the episode
    horizon_minutes: int = 15
    threshold_pct: float = 1.0
    model_type: str = "hist_gradient_boosting"


@router.get("/episodes")
def list_replay_episodes():
    srv = get_service()
    if srv.df is None:
        raise HTTPException(status_code=503, detail="Dataset not loaded.")

    df = srv.df
    physical_events = []
    normal_shifts = []
    sensor_glitches = []

    for ep_id, group in df.groupby("episode_id", sort=False):
        max_ch4 = float(np.round(group["methane_pct"].max(), 3))
        has_event = bool(max_ch4 >= 1.0)
        scenario = str(group["scenario_type"].iloc[0])
        zone = str(group["zone_id"].iloc[0])

        category = (
            "PHYSICAL_HAZARD"
            if (has_event and scenario != "SENSOR_ANOMALY")
            else "SENSOR_ANOMALY"
            if scenario == "SENSOR_ANOMALY"
            else "NORMAL_BASELINE"
        )

        item = {
            "episode_id": ep_id,
            "zone_id": zone,
            "scenario_type": scenario,
            "hazard_category": category,
            "duration_minutes": len(group),
            "peak_methane_pct": max_ch4,
            "has_threshold_crossing": has_event,
            "start_time": str(group["timestamp"].iloc[0]),
        }

        if scenario == "SENSOR_ANOMALY":
            sensor_glitches.append(item)
        elif has_event:
            physical_events.append(item)
        else:
            normal_shifts.append(item)

    # Sort physical events so EP-0001 (canonical degraded ventilation shift) is #1, then by peak
    physical_events.sort(key=lambda x: (x["episode_id"] != "EP-0001", -x["peak_methane_pct"]))
    # Sort normal shifts by episode_id
    normal_shifts.sort(key=lambda x: x["episode_id"])
    # Sort sensor anomalies by episode_id
    sensor_glitches.sort(key=lambda x: x["episode_id"])

    # Combine: physical hazard events first (EP-0001 as #1 default), then normal shifts, then sensor glitches
    episodes = physical_events + normal_shifts[:15] + sensor_glitches[:5]
    return episodes


@router.get("/episode/{episode_id}")
def get_full_episode_series(episode_id: str):
    srv = get_service()
    if srv.df is None:
        raise HTTPException(status_code=503, detail="Dataset not loaded.")

    ep_matches = srv.df[srv.df["episode_id"] == episode_id]
    if len(ep_matches) == 0:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} not found.")

    # Guarantee isolation to a single sensor stream and strictly monotonic timestamps
    primary_zone = str(ep_matches["zone_id"].iloc[0])
    ep_df = (
        ep_matches[ep_matches["zone_id"] == primary_zone]
        .drop_duplicates(subset=["timestamp"])
        .sort_values("timestamp")
        .reset_index(drop=True)
    )

    records = ep_df.to_dict(orient="records")
    for r in records:
        r["timestamp"] = str(r["timestamp"])

    return {
        "episode_id": episode_id,
        "zone_id": primary_zone,
        "scenario_type": str(ep_df["scenario_type"].iloc[0]),
        "total_steps": len(ep_df),
        "records": records,
    }


@router.post("/step")
def process_replay_step(req: ReplayStepRequest):
    srv = get_service()
    if srv.df is None or srv.predictor is None:
        raise HTTPException(status_code=503, detail="Service not ready.")

    ep_matches = srv.df[srv.df["episode_id"] == req.episode_id]
    if len(ep_matches) == 0:
        raise HTTPException(status_code=404, detail="Episode not found.")

    primary_zone = str(ep_matches["zone_id"].iloc[0])
    ep_df = (
        ep_matches[ep_matches["zone_id"] == primary_zone]
        .drop_duplicates(subset=["timestamp"])
        .sort_values("timestamp")
        .reset_index(drop=True)
    )

    n = len(ep_df)
    idx = max(0, min(req.current_index, n - 1))

    # Slice past records strictly up to idx (using up to 35 past rows for feature window)
    window_start = max(0, idx - 34)
    past_slice = ep_df.iloc[window_start : idx + 1]
    current_row = ep_df.iloc[idx].to_dict()
    current_row["timestamp"] = str(current_row["timestamp"])

    # Run genuine model inference
    recent_records = past_slice.to_dict(orient="records")
    prediction = srv.predictor.predict(
        recent_records=recent_records,
        model_type=req.model_type,
        preferred_horizon=req.horizon_minutes,
    )

    h_key = f"{req.horizon_minutes}m"
    horizon_info = prediction["horizons"].get(h_key, {})
    pred_prob = horizon_info.get("probability", 0.0)
    pred_alert = pred_prob >= 0.50

    # Reveal observed outcome for an earlier prediction made H minutes ago:
    # If idx >= H, the prediction made at past_pred_idx = idx - H has now completed its horizon!
    past_evaluation = None
    if idx >= req.horizon_minutes:
        past_pred_idx = idx - req.horizon_minutes
        # Outcome window is actual methane from past_pred_idx + 1 up to idx
        observed_window = ep_df.iloc[past_pred_idx + 1 : idx + 1]["methane_pct"]
        actual_peak = float(np.round(observed_window.max(), 3))
        actual_occurred = actual_peak >= req.threshold_pct

        # Retrieve what the model would have predicted at past_pred_idx
        past_window_start = max(0, past_pred_idx - 34)
        past_pred_slice = ep_df.iloc[past_window_start : past_pred_idx + 1]
        past_pred_res = srv.predictor.predict(
            recent_records=past_pred_slice.to_dict(orient="records"),
            model_type=req.model_type,
            preferred_horizon=req.horizon_minutes,
        )
        past_prob = past_pred_res["horizons"].get(h_key, {}).get("probability", 0.0)
        past_alert = past_prob >= 0.50

        # Classification label for that past window
        if past_alert and actual_occurred:
            eval_category = "TRUE_POSITIVE"
        elif past_alert and not actual_occurred:
            eval_category = "FALSE_ALARM"
        elif not past_alert and actual_occurred:
            eval_category = "MISSED_EVENT"
        else:
            eval_category = "TRUE_NEGATIVE"

        past_evaluation = {
            "evaluated_step_index": past_pred_idx,
            "evaluated_timestamp": str(ep_df.iloc[past_pred_idx]["timestamp"]),
            "predicted_probability": past_prob,
            "actual_observed_peak_ch4": actual_peak,
            "threshold_exceeded": actual_occurred,
            "eval_category": eval_category,
        }

    return {
        "episode_id": req.episode_id,
        "current_index": idx,
        "total_steps": n,
        "current_telemetry": current_row,
        "prediction": prediction,
        "past_revealed_outcome": past_evaluation,
    }
