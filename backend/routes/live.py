"""
MineGuard Predict - Live Monitoring API endpoints.
Provides operational overview, priority alerts, area watchlists, trends, and warning lists.
Faithfully indicates whether a live hardware connection exists and supports demo simulation mode.
"""

from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import numpy as np
import pandas as pd

from backend.service import get_service
from ml.events import ZONE_NAMES

router = APIRouter(prefix="/api/live", tags=["live"])

ZONE_DEMO_EPISODES: Dict[str, str] = {
    "ZONE-01-TAILGATE": "EP-0001",
    "ZONE-02-LONGWALL-FACE": "EP-0002",
    "ZONE-03-MAINGATE": "EP-0003",
    "ZONE-04-BLEEDER-SEAL": "EP-0004",
    "ZONE-05-BELT-CONVEYOR": "EP-0005",
    "ZONE-05-DEVELOPMENT-HEADING": "EP-0005",
    "ZONE-06-DEV-HEADING": "EP-0006",
    "ZONE-06-RETURN-AIRWAY": "EP-0006",
}


class ToggleDemoRequest(BaseModel):
    enabled: Optional[bool] = None
    episode_id: Optional[str] = None
    step_index: Optional[int] = None


@router.get("/status")
def get_live_status():
    srv = get_service()
    last_time = "N/A"
    if srv.df is not None and len(srv.df) > 0:
        last_time = pd.to_datetime(srv.df["timestamp"].max()).strftime("%Y-%m-%d %H:%M:%S")

    total_zones = int(srv.df["zone_id"].nunique()) if srv.df is not None else 6

    return {
        "is_hardware_connected": False,
        "connection_state": "DISCONNECTED",
        "connection_status_text": "Live data source not connected",
        "connection_message": "Live data source not connected. No active hardware gateway or telemetry stream detected.",
        "threshold_pct": 1.0,
        "is_demo_mode": bool(srv.is_demo_mode),
        "demo_simulation_active": bool(srv.is_demo_mode),
        "demo_episode_id": str(srv.demo_episode_id),
        "demo_step_index": int(srv.demo_step_index),
        "configured_threshold_pct": 1.0,
        "last_telemetry_timestamp": last_time,
        "active_dataset": str(srv.active_dataset_name),
        "total_zones": total_zones,
        "available_demo_shifts": ["EP-0001", "EP-0002", "EP-0004", "EP-0007"],
    }


@router.post("/toggle-demo")
def toggle_demo_mode(
    enable: Optional[bool] = Query(None),
    episode_id: Optional[str] = Query(None),
    req: Optional[ToggleDemoRequest] = None,
):
    srv = get_service()
    target_enable = None
    target_ep = None
    target_step = None

    if req is not None:
        target_enable = req.enabled
        target_ep = req.episode_id
        target_step = req.step_index

    if enable is not None:
        target_enable = enable
    if episode_id is not None:
        target_ep = episode_id

    if target_enable is None:
        srv.is_demo_mode = not srv.is_demo_mode
    else:
        srv.is_demo_mode = bool(target_enable)

    if srv.is_demo_mode:
        if srv.demo_step_index < 360 or srv.demo_step_index > getattr(srv, "demo_max_step", 432):
            srv.demo_step_index = getattr(srv, "demo_start_step", 372)

    if target_ep:
        srv.demo_episode_id = target_ep
    if target_step is not None:
        srv.demo_step_index = int(target_step)

    return {
        "status": "SUCCESS",
        "is_demo_mode": bool(srv.is_demo_mode),
        "demo_simulation_active": bool(srv.is_demo_mode),
        "demo_episode_id": str(srv.demo_episode_id),
        "demo_step_index": int(srv.demo_step_index),
        "message": f"Demo simulation mode {'ACTIVATED' if srv.is_demo_mode else 'DEACTIVATED'}.",
    }


@router.post("/tick")
def tick_demo_simulation(steps: int = Query(1, ge=1, le=15)):
    srv = get_service()
    srv.is_demo_mode = True
    new_step = srv.advance_demo_step(steps)
    return {
        "status": "SUCCESS",
        "is_demo_mode": True,
        "demo_step_index": new_step,
        "episode_id": srv.demo_episode_id,
        "message": f"Simulation advanced by {steps} min (now at step {new_step}).",
    }


@router.post("/jump-hazard")
def jump_to_hazard_buildup():
    srv = get_service()
    srv.is_demo_mode = True
    new_step = srv.jump_to_hazard()
    return {
        "status": "SUCCESS",
        "is_demo_mode": True,
        "demo_step_index": new_step,
        "episode_id": srv.demo_episode_id,
        "message": f"Fast-forwarded to active hazard buildup (step {new_step}).",
    }


@router.post("/reset-demo")
def reset_demo_baseline():
    srv = get_service()
    new_step = srv.reset_demo()
    return {
        "status": "SUCCESS",
        "is_demo_mode": bool(srv.is_demo_mode),
        "demo_step_index": new_step,
        "episode_id": srv.demo_episode_id,
        "message": f"Simulation reset to baseline safe state (step {new_step}).",
    }


@router.get("/overview")
def get_live_overview():
    srv = get_service()
    if srv.df is None or len(srv.df) == 0:
        raise HTTPException(status_code=503, detail="Dataset not loaded.")

    if srv.is_demo_mode:
        srv.advance_demo_step(1)

    df = srv.df
    unique_zones = sorted(df["zone_id"].unique().tolist())
    threshold = 1.0

    watchlist = []
    active_warnings = []
    rising_count = 0
    warning_criteria_count = 0

    for z in unique_zones:
        z_df = df[df["zone_id"] == z].sort_values("timestamp").reset_index(drop=True)
        if len(z_df) == 0:
            continue

        if srv.is_demo_mode:
            target_ep = srv.demo_episode_id if z == "ZONE-01-TAILGATE" else ZONE_DEMO_EPISODES.get(z, srv.demo_episode_id)
            ep_match = df[(df["zone_id"] == z) & (df["episode_id"] == target_ep)].sort_values("timestamp").reset_index(drop=True)
            if len(ep_match) >= 35:
                step_idx = min(len(ep_match) - 1, max(35, srv.demo_step_index))
                slice_data = ep_match.iloc[max(0, step_idx - 34) : step_idx + 1]
            else:
                slice_data = z_df.iloc[-35:]
        else:
            slice_data = z_df.iloc[-35:]

        curr_row = slice_data.iloc[-1]
        curr_ch4 = float(np.round(curr_row["methane_pct"], 3))
        curr_af = float(np.round(curr_row["airflow"], 1)) if "airflow" in curr_row else 20.0
        curr_time = str(curr_row["timestamp"])

        # Calculate slope
        m_vals = slice_data["methane_pct"].values
        slope_15m = float(np.round((m_vals[-1] - m_vals[max(0, len(m_vals) - 15)]) / max(1, min(15, len(m_vals))), 4))
        trend = "RISING" if slope_15m > 0.005 else "FALLING" if slope_15m < -0.005 else "STABLE"
        if trend == "RISING":
            rising_count += 1

        # Model prediction
        p5, p15, p30 = 0.05, 0.05, 0.05
        drivers = []
        if srv.predictor:
            try:
                res = srv.predictor.predict(
                    recent_records=slice_data.to_dict(orient="records"),
                    preferred_horizon=15,
                )
                p5 = float(res["horizons"].get("5m", {}).get("probability", 0.05))
                p15 = float(res["horizons"].get("15m", {}).get("probability", 0.05))
                p30 = float(res["horizons"].get("30m", {}).get("probability", 0.05))
                drivers = res.get("explanation", {}).get("top_drivers", [])
            except Exception:
                pass

        risk_tier = "CRITICAL" if p15 >= 0.70 or curr_ch4 >= threshold else "ELEVATED" if p15 >= 0.30 or curr_ch4 >= 0.70 else "NORMAL"
        is_active_incident = bool(curr_ch4 >= threshold)
        if risk_tier in ["ELEVATED", "CRITICAL"] or is_active_incident:
            warning_criteria_count += 1

        zone_name = ZONE_NAMES.get(z, z)
        item = {
            "zone_id": z,
            "zone_name": zone_name,
            "current_methane": curr_ch4,
            "current_methane_pct": curr_ch4,
            "current_airflow": curr_af,
            "trend": trend,
            "recent_trend": trend,
            "status": "WARNING" if is_active_incident else ("ELEVATED" if risk_tier != "NORMAL" else "NORMAL"),
            "risk_level": risk_tier,
            "risk_tier": risk_tier,
            "forecast_30m_prob": round(p30, 3),
            "risk_5m": round(p5 * 100, 1),
            "risk_15m": round(p15 * 100, 1),
            "risk_30m": round(p30 * 100, 1),
            "active_incident": is_active_incident,
            "slope_15m": slope_15m,
            "last_reading_time": curr_time,
            "top_drivers": drivers[:2],
        }
        watchlist.append(item)

        if risk_tier in ["ELEVATED", "CRITICAL"] or is_active_incident:
            active_warnings.append({
                "warning_id": f"WARN-{z[:7]}-{curr_time[11:16].replace(':', '')}",
                "zone_id": z,
                "zone_name": zone_name,
                "current_methane_pct": curr_ch4,
                "slope_15m": slope_15m,
                "recent_trend": trend,
                "threshold_pct": threshold,
                "prediction_horizon": 15,
                "warning_category": risk_tier,
                "timestamp": curr_time,
                "probability_pct": round(p15 * 100, 1),
                "operational_advice": f"Elevated gas-risk forecast for {zone_name}. Methane has been {trend.lower()} ({slope_15m:+.3f}%/min). Review ventilation intake.",
            })

    # Sort watchlist by risk descending
    watchlist.sort(key=lambda x: (x["active_incident"], x["forecast_30m_prob"], x["current_methane"]), reverse=True)

    # Priority alert if any zone is elevated or warning
    priority_alert = None
    if watchlist and (watchlist[0]["active_incident"] or watchlist[0]["risk_level"] != "NORMAL"):
        top = watchlist[0]
        priority_alert = {
            "zone_id": top["zone_id"],
            "zone_name": top["zone_name"],
            "severity": top["risk_level"],
            "current_methane": top["current_methane"],
            "peak_methane": max(top["current_methane"], 1.0 if top["active_incident"] else top["current_methane"]),
            "trend": top["trend"],
            "recommendation": f"Inspect bleeder seals and ventilation volume in {top['zone_name']}. Methane trend is {top['trend'].lower()}.",
            "minutes_active": 12 if top["active_incident"] else 0,
        }

    latest_time = watchlist[0]["last_reading_time"] if watchlist else "N/A"

    # Build live telemetry stream for the primary area
    elevated_zones = [w["zone_id"] for w in watchlist if w["active_incident"] or w["risk_level"] in ["CRITICAL", "ELEVATED"]]
    if elevated_zones:
        primary_z = elevated_zones[0]
    else:
        primary_z = "ZONE-01-TAILGATE" if any(w["zone_id"] == "ZONE-01-TAILGATE" for w in watchlist) else (watchlist[0]["zone_id"] if watchlist else "ZONE-01-TAILGATE")

    primary_name = ZONE_NAMES.get(primary_z, primary_z)
    if srv.is_demo_mode:
        target_stream_ep = srv.demo_episode_id if primary_z == "ZONE-01-TAILGATE" else ZONE_DEMO_EPISODES.get(primary_z, srv.demo_episode_id)
        ep_stream_df = df[(df["zone_id"] == primary_z) & (df["episode_id"] == target_stream_ep)].sort_values("timestamp").reset_index(drop=True)
        if len(ep_stream_df) >= 35:
            tg_step = min(len(ep_stream_df) - 1, max(35, srv.demo_step_index))
            stream_slice = ep_stream_df.iloc[max(0, tg_step - 29) : tg_step + 1]
        else:
            stream_slice = df[df["zone_id"] == primary_z].iloc[-30:]
    else:
        stream_slice = df[df["zone_id"] == primary_z].iloc[-30:]

    stream_points = []
    for _, r in stream_slice.iterrows():
        stream_points.append({
            "timestamp": pd.to_datetime(r["timestamp"]).strftime("%Y-%m-%d %H:%M"),
            "time_label": pd.to_datetime(r["timestamp"]).strftime("%H:%M"),
            "methane_pct": float(np.round(r["methane_pct"], 3)),
            "airflow": float(np.round(r["airflow"], 1)) if "airflow" in r else 10.0,
            "is_crossing": bool(r["methane_pct"] >= threshold),
        })

    live_stream = {
        "zone_id": primary_z,
        "zone_name": primary_name,
        "current_methane": float(stream_points[-1]["methane_pct"]) if stream_points else 0.5,
        "current_airflow": float(stream_points[-1]["airflow"]) if stream_points else 10.0,
        "step_index": int(srv.demo_step_index),
        "simulated_time": stream_points[-1]["timestamp"] if stream_points else "N/A",
        "points": stream_points,
    }

    return {
        "is_hardware_connected": False,
        "connection_state": "DISCONNECTED",
        "status_message": "Live data source not connected. Running offline safety mode.",
        "is_demo_mode": bool(srv.is_demo_mode),
        "demo_simulation_active": bool(srv.is_demo_mode),
        "threshold_pct": threshold,
        "configured_threshold_pct": threshold,
        "zones_monitored_count": len(watchlist),
        "monitored_areas_count": len(watchlist),
        "active_warning_zones_count": int(sum(1 for w in watchlist if w["active_incident"] or w["risk_level"] == "CRITICAL")),
        "areas_meeting_warning_criteria": warning_criteria_count,
        "rising_gas_zones_count": rising_count,
        "areas_with_rising_gas": rising_count,
        "priority_alert": priority_alert,
        "priority_warning": priority_alert,
        "watchlist": watchlist,
        "area_watchlist": watchlist,
        "active_warnings": active_warnings,
        "latest_reading_time": latest_time,
        "live_stream": live_stream,
    }


def generate_human_language_effectors(
    slice_data: pd.DataFrame,
    curr_methane: float,
    curr_airflow: float,
    top_drvs: Optional[List[Dict]] = None,
) -> List[Dict[str, str]]:
    """
    Translates underlying model drivers and sensor telemetry into short, concise,
    human-language physical effectors for mine administrators (e.g. 'Airflow is an issue',
    'Ventilation is degraded', 'Methane is rising', 'Humidity is too much').
    """
    n = len(slice_data)
    af_15m_ago = float(slice_data["airflow"].iloc[max(0, n - 15)]) if n > 0 else curr_airflow
    af_drop = af_15m_ago - curr_airflow

    m_15m_ago = float(slice_data["methane_pct"].iloc[max(0, n - 15)]) if n > 0 else curr_methane
    m_rise = curr_methane - m_15m_ago

    vent_state = str(slice_data["ventilation_state"].iloc[-1]) if ("ventilation_state" in slice_data and n > 0) else "NORMAL"
    act = int(slice_data["machine_activity"].iloc[-1]) if ("machine_activity" in slice_data and n > 0) else 0
    hum = float(slice_data["humidity_pct"].iloc[-1]) if ("humidity_pct" in slice_data and n > 0) else 75.0
    temp = float(slice_data["temperature_c"].iloc[-1]) if ("temperature_c" in slice_data and n > 0) else 25.0

    effectors = []

    # 1. Ventilation State
    if vent_state == "DEGRADED":
        effectors.append({
            "feature": "ventilation_state",
            "label": "Ventilation is degraded",
            "effect": "Airway fan operating below standard capacity",
            "severity": "CRITICAL",
        })

    # 2. Airflow Velocity / Issue
    if curr_airflow < 9.0 or af_drop > 2.0:
        effectors.append({
            "feature": "airflow",
            "label": "Airflow is an issue",
            "effect": f"Velocity restricted to {curr_airflow:.1f} m³/s",
            "severity": "CRITICAL" if curr_airflow < 7.0 else "ELEVATED",
        })
    elif curr_airflow < 12.0:
        effectors.append({
            "feature": "airflow",
            "label": "Airflow is reduced",
            "effect": f"Current velocity is {curr_airflow:.1f} m³/s",
            "severity": "ELEVATED",
        })

    # 3. Gas Accumulation Rate
    if m_rise > 0.05 or curr_methane >= 0.85:
        effectors.append({
            "feature": "methane_pct",
            "label": "Methane is rising",
            "effect": f"Concentration climbing steadily at {curr_methane:.2f}%",
            "severity": "CRITICAL" if curr_methane >= 1.0 else "ELEVATED",
        })
    elif m_rise > 0.02:
        effectors.append({
            "feature": "methane_pct",
            "label": "Gas level trending upward",
            "effect": f"Gradual rise detected ({curr_methane:.2f}%)",
            "severity": "ELEVATED",
        })

    # 4. Coal Cutting Activity
    if act >= 2:
        effectors.append({
            "feature": "machine_activity",
            "label": "Coal cutting active",
            "effect": f"Machinery cutting at level {act} releasing seam gas",
            "severity": "ELEVATED",
        })

    # 5. Humidity
    if hum > 82.0:
        effectors.append({
            "feature": "humidity_pct",
            "label": "Humidity is too much",
            "effect": f"High relative moisture accumulation ({hum:.0f}% RH)",
            "severity": "ELEVATED",
        })

    # 6. Temperature
    if temp > 28.0:
        effectors.append({
            "feature": "temperature_c",
            "label": "Temperature is elevated",
            "effect": f"Warm air reading at {temp:.1f}°C",
            "severity": "ELEVATED",
        })

    # Fallback to nominal conditions if completely safe
    if len(effectors) < 3:
        if not any("Airflow" in e["label"] or "Ventilation" in e["label"] for e in effectors):
            effectors.append({
                "feature": "airflow",
                "label": "Airflow is adequate",
                "effect": f"Steady velocity at {curr_airflow:.1f} m³/s",
                "severity": "NORMAL",
            })
        if not any("Methane" in e["label"] or "Gas" in e["label"] for e in effectors):
            effectors.append({
                "feature": "methane_pct",
                "label": "Gas level normal",
                "effect": f"Methane safe at {curr_methane:.2f}%",
                "severity": "NORMAL",
            })
        if not any("cutting" in e["label"].lower() for e in effectors):
            effectors.append({
                "feature": "machine_activity",
                "label": "Machinery cutting idle",
                "effect": "Minimal strata gas disturbance",
                "severity": "NORMAL",
            })

    return effectors[:3]


@router.get("/trends")
def get_live_trends(zone_id: Optional[str] = None):
    srv = get_service()
    if srv.df is None or len(srv.df) == 0:
        raise HTTPException(status_code=503, detail="Dataset not loaded.")

    df = srv.df
    target_zone = zone_id or "ZONE-01-TAILGATE"

    # Select history slice
    if srv.is_demo_mode:
        target_ep = srv.demo_episode_id if target_zone == "ZONE-01-TAILGATE" else ZONE_DEMO_EPISODES.get(target_zone, srv.demo_episode_id)
        ep_match = df[(df["zone_id"] == target_zone) & (df["episode_id"] == target_ep)].sort_values("timestamp").reset_index(drop=True)
        if len(ep_match) >= 35:
            step_idx = min(len(ep_match) - 1, max(35, srv.demo_step_index))
            slice_data = ep_match.iloc[max(0, step_idx - 60) : step_idx + 1]
        else:
            slice_data = df[df["zone_id"] == target_zone].iloc[-60:]
    else:
        slice_data = df[df["zone_id"] == target_zone].iloc[-60:]

    if len(slice_data) == 0:
        slice_data = df.iloc[-60:]

    series_points = []
    observed_events = []
    for _, r in slice_data.iterrows():
        is_crossing = bool(pd.notnull(r["methane_pct"]) and r["methane_pct"] >= 1.0)
        series_points.append({
            "timestamp": str(r["timestamp"]),
            "time_label": str(r["timestamp"])[11:16] if len(str(r["timestamp"])) >= 16 else str(r["timestamp"]),
            "methane_pct": float(np.round(r["methane_pct"], 3)) if pd.notnull(r["methane_pct"]) else 0.0,
            "airflow": float(np.round(r["airflow"], 2)) if "airflow" in r and pd.notnull(r["airflow"]) else 20.0,
            "is_crossing": is_crossing,
            "is_exceed": is_crossing,
        })

    last_row = slice_data.iloc[-1]
    curr_methane = float(np.round(last_row["methane_pct"], 3))
    curr_airflow = float(np.round(last_row["airflow"], 2)) if "airflow" in last_row else 20.0

    # Trend direction
    m_vals = slice_data["methane_pct"].values
    slope_15m = float((m_vals[-1] - m_vals[max(0, len(m_vals) - 15)]) / max(1, min(15, len(m_vals))))
    trend_dir = "RISING" if slope_15m > 0.005 else "FALLING" if slope_15m < -0.005 else "STABLE"

    # Model forecast
    forecast_card = {
        "current_methane": curr_methane,
        "5m": {"probability": 0.05, "risk_tier": "NORMAL", "predicted_peak": curr_methane, "alert_triggered": False},
        "15m": {"probability": 0.05, "risk_tier": "NORMAL", "predicted_peak": curr_methane, "alert_triggered": False},
        "30m": {"probability": 0.05, "risk_tier": "NORMAL", "predicted_peak": curr_methane, "alert_triggered": False},
        "lead_time_minutes": 15,
        "operational_recommendation": "Maintain standard crosscut ventilation. Atmospheric parameters nominal.",
        "confidence_level": "High",
        "key_drivers": generate_human_language_effectors(slice_data, curr_methane, curr_airflow),
    }

    if srv.predictor and len(slice_data) >= 5:
        try:
            pred = srv.predictor.predict(
                recent_records=slice_data.iloc[-35:].to_dict(orient="records"),
                preferred_horizon=15,
            )
            for h in ["5m", "15m", "30m"]:
                if h in pred.get("horizons", {}):
                    hp = pred["horizons"][h]
                    p_val = float(hp.get("probability", 0.05))
                    tier = str(hp.get("risk_tier", "NORMAL"))
                    peak = float(hp.get("predicted_peak_methane_pct", curr_methane))
                    forecast_card[h] = {
                        "probability": p_val,
                        "risk_tier": tier,
                        "predicted_peak": peak,
                        "alert_triggered": bool(p_val >= 0.40 or tier in ["ELEVATED", "CRITICAL"]),
                    }

            if pred.get("explanation", {}).get("narrative_explanation"):
                forecast_card["operational_recommendation"] = pred["explanation"]["narrative_explanation"]

            top_drvs = pred.get("explanation", {}).get("top_drivers", [])
            forecast_card["key_drivers"] = generate_human_language_effectors(
                slice_data, curr_methane, curr_airflow, top_drvs
            )
        except Exception:
            pass

    return {
        "zone_id": target_zone,
        "zone_name": ZONE_NAMES.get(target_zone, target_zone),
        "current_methane": curr_methane,
        "current_airflow": curr_airflow,
        "trend_direction": trend_dir,
        "threshold_pct": 1.0,
        "observed_events_count": int(sum(1 for p in series_points if p["is_crossing"])),
        "history": series_points,
        "series": series_points,
        "observed_events": observed_events,
        "forecast": forecast_card,
        "demo_simulation_active": bool(srv.is_demo_mode),
        "is_hardware_connected": False,
    }


@router.get("/warnings")
def get_live_warnings(
    severity: Optional[str] = None,
    zone_id: Optional[str] = None,
    active_only: bool = False,
):
    srv = get_service()
    if srv.df is None or len(srv.df) == 0:
        return {"warnings": [], "total_warnings": 0, "total": 0, "active_count": 0, "threshold_pct": 1.0}

    df = srv.df
    if zone_id and zone_id != "ALL":
        df = df[df["zone_id"] == zone_id]

    warnings = []
    counter = 1
    active_count = 0

    # If in live demo simulation, prioritize currently active incidents and advance warnings
    live_active_warnings = []
    if srv.is_demo_mode:
        for z in sorted(df["zone_id"].unique()):
            if zone_id and zone_id != "ALL" and z != zone_id:
                continue
            target_ep = srv.demo_episode_id if z == "ZONE-01-TAILGATE" else ZONE_DEMO_EPISODES.get(z, srv.demo_episode_id)
            ep_df = df[(df["zone_id"] == z) & (df["episode_id"] == target_ep)].sort_values("timestamp").reset_index(drop=True)
            if len(ep_df) < 35:
                continue
            step_idx = min(len(ep_df) - 1, max(35, srv.demo_step_index))
            slice_data = ep_df.iloc[max(0, step_idx - 34) : step_idx + 1]
            curr_row = slice_data.iloc[-1]
            curr_ch4 = float(np.round(curr_row["methane_pct"], 3))
            curr_time = pd.to_datetime(curr_row["timestamp"]).strftime("%Y-%m-%d %H:%M")
            zone_name = ZONE_NAMES.get(z, z)

            p15 = 0.05
            if srv.predictor:
                try:
                    p_res = srv.predictor.predict(recent_records=slice_data.to_dict(orient="records"), preferred_horizon=15)
                    p15 = float(p_res["horizons"].get("15m", {}).get("probability", 0.05))
                except Exception:
                    pass

            if curr_ch4 >= 1.0:
                active_count += 1
                m_vals = ep_df.iloc[:step_idx + 1]["methane_pct"].values
                dur_mins = 1
                for back in range(step_idx - 1, -1, -1):
                    if m_vals[back] >= 1.0:
                        dur_mins += 1
                    else:
                        break
                peak_val = float(np.max(m_vals[max(0, step_idx - dur_mins + 1) : step_idx + 1]))
                start_t = pd.to_datetime(ep_df.iloc[step_idx - dur_mins + 1]["timestamp"]).strftime("%Y-%m-%d %H:%M")
                live_active_warnings.append({
                    "event_id": f"ACTIVE-EXCEED-{counter:03d}",
                    "warning_id": f"ACTIVE-EXCEED-{counter:03d}",
                    "warning_type": "Methane Safety Threshold Exceeded",
                    "zone_id": z,
                    "zone_name": zone_name,
                    "start_time": start_t,
                    "end_time": curr_time,
                    "duration_minutes": dur_mins,
                    "peak_methane": round(peak_val, 3),
                    "peak_methane_pct": round(peak_val, 3),
                    "severity": "CRITICAL",
                    "current_status": "ACTIVE",
                    "is_active": True,
                    "observed_outcome": f"Active threshold exceedance ({curr_ch4:.2f}% CH₄) for {dur_mins} min.",
                    "description": f"URGENT ALARM: Current concentration {curr_ch4:.2f}% CH₄ exceeds 1.0% statutory limit in {zone_name}.",
                    "advisory_check": "Initiate airway evacuation protocol. Adjust bleeder exhaust regulators immediately.",
                })
                counter += 1
            elif p15 >= 0.50:
                active_count += 1
                live_active_warnings.append({
                    "event_id": f"ACTIVE-PRED-{counter:03d}",
                    "warning_id": f"ACTIVE-PRED-{counter:03d}",
                    "warning_type": "Advance 15-Minute Threshold Hazard Warning",
                    "zone_id": z,
                    "zone_name": zone_name,
                    "start_time": curr_time,
                    "end_time": (pd.to_datetime(curr_row["timestamp"]) + pd.Timedelta(minutes=15)).strftime("%Y-%m-%d %H:%M"),
                    "duration_minutes": 15,
                    "peak_methane": curr_ch4,
                    "peak_methane_pct": curr_ch4,
                    "severity": "ELEVATED",
                    "current_status": "ACTIVE",
                    "is_active": True,
                    "observed_outcome": f"ML model estimates {round(p15*100)}% chance of reaching 1.0% threshold in 15m.",
                    "description": f"Pre-emptive warning: Rapid methane buildup with reduced ventilation detected in {zone_name}.",
                    "advisory_check": "Inspect aux fan operation and heading ventilation before physical exceedance occurs.",
                })
                counter += 1

    # Scan episodes for historical crossings
    for (z, ep), group in df.groupby(["zone_id", "episode_id"]):
        g = group.sort_values("timestamp").reset_index(drop=True)
        ex = (g["methane_pct"] >= 1.0).values
        if np.any(ex):
            diff = np.diff(np.concatenate(([0], ex.astype(int), [0])))
            starts = np.where(diff == 1)[0]
            ends = np.where(diff == -1)[0]
            for s, e in zip(starts, ends):
                peak = float(np.max(g["methane_pct"].iloc[s:e]))
                sev = "CRITICAL" if peak >= 1.5 else "ELEVATED"
                if severity and severity != "ALL" and sev != severity:
                    continue

                w_id = f"WARN-{counter:04d}"
                zone_name = ZONE_NAMES.get(z, z)
                st_time = pd.to_datetime(g["timestamp"].iloc[s]).strftime("%Y-%m-%d %H:%M")
                end_time = pd.to_datetime(g["timestamp"].iloc[e - 1]).strftime("%Y-%m-%d %H:%M")
                dur = int(e - s)

                warnings.append({
                    "event_id": w_id,
                    "warning_id": w_id,
                    "warning_type": "Methane Safety Threshold Exceeded",
                    "zone_id": z,
                    "zone_name": zone_name,
                    "start_time": st_time,
                    "end_time": end_time,
                    "duration_minutes": dur,
                    "peak_methane": round(peak, 3),
                    "peak_methane_pct": round(peak, 3),
                    "severity": sev,
                    "current_status": "CLEARED",
                    "is_active": False,
                    "observed_outcome": f"Exceeded warning limit for {dur} minutes reaching peak {peak:.2f}% CH₄.",
                    "description": f"Threshold crossing detected in {zone_name}. Maximum observed concentration: {peak:.2f}% CH₄.",
                    "advisory_check": f"Inspect bleeder seals in {zone_name}. Peak exceeded 1.0% threshold.",
                })
                counter += 1

    all_warnings = live_active_warnings + warnings
    if active_only:
        all_warnings = [w for w in all_warnings if w["is_active"]]

    all_warnings.sort(key=lambda x: (x["is_active"], x["start_time"]), reverse=True)
    return {
        "threshold_pct": 1.0,
        "total_warnings": len(all_warnings),
        "total": len(all_warnings),
        "active_count": active_count,
        "warnings": all_warnings[:50],
    }
