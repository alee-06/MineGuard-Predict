"""
Scenario Simulator API endpoints.
Generates hypothetical synthetic episodes based on user-configured atmospheric parameters
and feeds them in real-time through the actual trained models.
"""

from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import numpy as np
import pandas as pd

from backend.service import get_service

router = APIRouter(prefix="/api/scenario", tags=["scenario"])


class ScenarioSimRequest(BaseModel):
    initial_methane_pct: float = 0.35
    gas_inflow_rate: float = 1.0  # multiplier 0.5 to 3.0
    airflow_m3s: float = 16.0  # 4.0 to 25.0
    machine_activity: int = 2  # 0 to 3
    ventilation_state: str = "NORMAL"  # NORMAL, DEGRADED, BOOSTED
    noise_level: float = 0.02
    simulation_minutes: int = 90
    inject_surge_minute: Optional[int] = 30
    surge_magnitude: Optional[float] = 0.60


@router.post("/simulate")
def run_hypothetical_simulation(req: ScenarioSimRequest):
    srv = get_service()
    if srv.predictor is None:
        raise HTTPException(status_code=503, detail="Prediction models not ready.")

    n = max(45, min(req.simulation_minutes, 180))
    rng = np.random.default_rng(999)

    # Base profile initialization
    ch4_series = np.zeros(n)
    airflow_series = np.zeros(n)
    temp_series = np.zeros(n)
    press_series = np.zeros(n)
    activity_series = np.full(n, req.machine_activity, dtype=int)
    vent_series = [req.ventilation_state] * n

    # Dynamic differential loop
    ch4 = req.initial_methane_pct
    af = req.airflow_m3s
    if req.ventilation_state == "DEGRADED":
        af *= 0.55
    elif req.ventilation_state == "BOOSTED":
        af *= 1.30

    base_temp = 25.0
    base_press = 101.3

    for t in range(n):
        # Current airflow with small variation
        af_cur = max(2.0, af + rng.normal(0, 0.2))
        airflow_series[t] = np.round(af_cur, 2)

        # Machine activity contribution
        act = activity_series[t]
        act_desorp = act * 0.05 * req.gas_inflow_rate

        # Surge injection if configured
        surge_val = 0.0
        if req.inject_surge_minute and t >= req.inject_surge_minute and t < req.inject_surge_minute + 20:
            surge_dt = t - req.inject_surge_minute
            surge_val = (req.surge_magnitude or 0.5) * np.exp(-surge_dt / 8.0)

        # Target equilibrium
        target_ch4 = (req.initial_methane_pct + act_desorp + surge_val) * (16.0 / af_cur) ** 0.8
        alpha = 0.10
        ch4 += alpha * (target_ch4 - ch4) + rng.normal(0, req.noise_level)
        ch4 = float(np.clip(ch4, 0.05, 4.5))
        ch4_series[t] = np.round(ch4, 4)

        temp_series[t] = np.round(base_temp + act * 0.3 + rng.normal(0, 0.1), 2)
        press_series[t] = np.round(base_press + rng.normal(0, 0.04), 2)

    # Construct records
    times = pd.date_range(start="2026-10-09 10:00:00", periods=n, freq="1min")
    records = []
    for t in range(n):
        records.append(
            {
                "timestamp": str(times[t]),
                "zone_id": "ZONE-SIM-HYPOTHETICAL",
                "episode_id": "EP-HYPOTHETICAL-001",
                "methane_pct": ch4_series[t],
                "airflow": airflow_series[t],
                "temperature_c": temp_series[t],
                "humidity_pct": 75.0,
                "pressure_kpa": press_series[t],
                "machine_activity": int(activity_series[t]),
                "ventilation_state": vent_series[t],
                "scenario_type": "USER_CONFIGURED_HYPOTHETICAL",
            }
        )

    # Evaluate model predictions along the simulated timeline
    # We sample every 2 minutes to provide instant response time (~1 sec), then interpolate
    sampled_steps = list(range(0, n, 2))
    if (n - 1) not in sampled_steps:
        sampled_steps.append(n - 1)

    step_preds_map = {}
    for step in sampled_steps:
        hist_slice = records[max(0, step - 34) : step + 1]
        try:
            pred = srv.predictor.predict(
                recent_records=hist_slice,
                model_type="hist_gradient_boosting",
                preferred_horizon=15,
            )
            step_preds_map[step] = {
                "prob_5m": float(pred["horizons"]["5m"]["probability"]),
                "prob_15m": float(pred["horizons"]["15m"]["probability"]),
                "prob_30m": float(pred["horizons"]["30m"]["probability"]),
                "risk_tier": pred["horizons"]["15m"]["risk_tier"],
                "predicted_peak_15m": float(pred["horizons"]["15m"]["predicted_peak_methane_pct"]),
            }
        except Exception:
            step_preds_map[step] = {
                "prob_5m": 0.0,
                "prob_15m": 0.0,
                "prob_30m": 0.0,
                "risk_tier": "NORMAL",
                "predicted_peak_15m": float(ch4_series[step]),
            }

    # Interpolate for all minutes 0 .. n-1
    timeline_predictions = []
    known_steps = sorted(step_preds_map.keys())
    for t in range(n):
        if t in step_preds_map:
            p_data = step_preds_map[t]
        else:
            prev_s = max(s for s in known_steps if s < t)
            next_s = min(s for s in known_steps if s > t)
            ratio = (t - prev_s) / float(next_s - prev_s)
            p_prev = step_preds_map[prev_s]
            p_next = step_preds_map[next_s]
            interp_p15 = round(p_prev["prob_15m"] + ratio * (p_next["prob_15m"] - p_prev["prob_15m"]), 4)
            interp_p5 = round(p_prev["prob_5m"] + ratio * (p_next["prob_5m"] - p_prev["prob_5m"]), 4)
            interp_p30 = round(p_prev["prob_30m"] + ratio * (p_next["prob_30m"] - p_prev["prob_30m"]), 4)
            interp_peak = round(p_prev["predicted_peak_15m"] + ratio * (p_next["predicted_peak_15m"] - p_prev["predicted_peak_15m"]), 3)
            p_data = {
                "prob_5m": interp_p5,
                "prob_15m": interp_p15,
                "prob_30m": interp_p30,
                "risk_tier": "CRITICAL" if interp_p15 >= 0.70 else "ELEVATED" if interp_p15 >= 0.30 else "NORMAL",
                "predicted_peak_15m": interp_peak,
            }

        timeline_predictions.append(
            {
                "step_minute": t,
                "timestamp": str(times[t]),
                "methane_pct": float(ch4_series[t]),
                "prob_5m": p_data["prob_5m"],
                "prob_15m": p_data["prob_15m"],
                "prob_30m": p_data["prob_30m"],
                "risk_tier": p_data["risk_tier"],
                "predicted_peak_15m": p_data["predicted_peak_15m"],
            }
        )

    # Calculate actual advance warning lead time (minutes before methane breaches 1.0%)
    crossing_idx = None
    for i, ch4_val in enumerate(ch4_series):
        if ch4_val >= 1.0:
            crossing_idx = i
            break

    earliest_warn_idx = None
    advance_lead_time = None
    if crossing_idx is not None:
        for p in timeline_predictions:
            if p["step_minute"] <= crossing_idx and p["prob_15m"] >= 0.30:
                earliest_warn_idx = p["step_minute"]
                advance_lead_time = max(0, crossing_idx - earliest_warn_idx)
                break

    return {
        "status": "COMPLETED",
        "parameters": req.model_dump(),
        "total_minutes": n,
        "records": records,
        "timeline_predictions": timeline_predictions,
        "advance_warning_lead_time_minutes": advance_lead_time,
        "first_threshold_crossing_minute": crossing_idx,
        "earliest_warning_minute": earliest_warn_idx,
        "disclaimer": "HYPOTHETICAL SIMULATION ONLY: Generated programmatically. Does not represent physical validation or guaranteed outcome in real underground mine workings.",
    }
