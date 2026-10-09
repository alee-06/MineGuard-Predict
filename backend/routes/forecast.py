"""
Forecast Console API endpoints.
Provides multi-horizon predictions, trend estimates, and prediction explanations.
"""

from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import pandas as pd
import numpy as np

from backend.service import get_service

router = APIRouter(prefix="/api/forecast", tags=["forecast"])


class PredictRequest(BaseModel):
    recent_records: List[Dict]
    model_type: Optional[str] = "hist_gradient_boosting"
    preferred_horizon: Optional[int] = 15


@router.post("/predict")
def predict_gas_risk(req: PredictRequest):
    srv = get_service()
    if srv.predictor is None:
        raise HTTPException(
            status_code=503, detail="Prediction models not loaded. Please train models first."
        )

    try:
        res = srv.predictor.predict(
            recent_records=req.recent_records,
            model_type=req.model_type or "hist_gradient_boosting",
            preferred_horizon=req.preferred_horizon or 15,
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/sample-series")
def get_sample_forecast_series(
    zone_id: Optional[str] = None,
    scenario_type: Optional[str] = None,
    window_minutes: int = 60,
):
    """
    Returns a realistic 60-minute historical segment plus future 30 minutes,
    along with the model's live forecast evaluated at time t = 60.
    """
    srv = get_service()
    if srv.df is None or srv.predictor is None:
        raise HTTPException(status_code=503, detail="Service or models not ready.")

    df = srv.df
    filtered = df
    if zone_id:
        filtered = filtered[filtered["zone_id"] == zone_id]
    if scenario_type:
        filtered = filtered[filtered["scenario_type"] == scenario_type]

    if len(filtered) == 0:
        filtered = df

    # Pick an episode with interesting variation
    # Group by episode and find one where max methane >= 0.8
    ep_candidates = []
    for ep, group in filtered.groupby("episode_id"):
        if group["methane_pct"].max() >= 0.8 and len(group) >= window_minutes + 35:
            ep_candidates.append(ep)
            if len(ep_candidates) >= 5:
                break

    chosen_ep = ep_candidates[0] if ep_candidates else filtered["episode_id"].iloc[0]
    ep_df = df[df["episode_id"] == chosen_ep].sort_values("timestamp").reset_index(drop=True)

    # Find inflection point where methane starts climbing or peaks
    peak_idx = int(ep_df["methane_pct"].idxmax())
    # Cut point t around 15 minutes before peak or middle
    cut_idx = max(35, min(peak_idx - 10, len(ep_df) - 35))

    history_slice = ep_df.iloc[cut_idx - 35 : cut_idx + 1].copy()
    future_slice = ep_df.iloc[cut_idx + 1 : cut_idx + 31].copy()

    recent_records = history_slice.to_dict(orient="records")
    forecast_result = srv.predictor.predict(
        recent_records=recent_records,
        model_type="hist_gradient_boosting",
        preferred_horizon=15,
    )

    series_data = []
    # Historical points
    for _, row in history_slice.iterrows():
        series_data.append(
            {
                "timestamp": str(row["timestamp"]),
                "methane_pct": float(row["methane_pct"]),
                "airflow": float(row["airflow"]),
                "type": "HISTORICAL",
            }
        )

    # Future ground truth points
    for _, row in future_slice.iterrows():
        series_data.append(
            {
                "timestamp": str(row["timestamp"]),
                "methane_pct": float(row["methane_pct"]),
                "airflow": float(row["airflow"]),
                "type": "FUTURE_ACTUAL",
            }
        )

    return {
        "episode_id": chosen_ep,
        "zone_id": str(ep_df["zone_id"].iloc[0]),
        "scenario_type": str(ep_df["scenario_type"].iloc[0]),
        "cut_timestamp": str(history_slice["timestamp"].iloc[-1]),
        "forecast": forecast_result,
        "series": series_data,
    }
