"""
MineGuard Predict - Authoritative Event and Anomaly Detection Engine.

Provides deterministic, physical, and statistical event identification across
underground sensor telemetry for historical analysis, timelines, and reporting.
"""

from typing import Dict, List, Optional
import numpy as np
import pandas as pd

def _format_ts(val) -> str:
    if val is None or pd.isna(val):
        return ""
    try:
        return pd.to_datetime(val).strftime("%Y-%m-%d %H:%M")
    except Exception:
        s = str(val).replace("T", " ")
        if "." in s:
            s = s.split(".")[0]
        return s[:16]


ZONE_NAMES = {
    "ZONE-01-TAILGATE": "Tailgate Return (Bleeder Junction)",
    "ZONE-02-LONGWALL-FACE": "Longwall Working Face",
    "ZONE-03-MAINGATE": "Maingate Fresh Intake",
    "ZONE-04-BLEEDER-SEAL": "Goaf / Bleeder Seal Area",
    "ZONE-05-DEVELOPMENT-HEADING": "Rapid Development Heading",
    "ZONE-06-RETURN-AIRWAY": "Main Return Airway",
}

EVENT_CATEGORIES = [
    "ALL",
    "THRESHOLD_CROSSING",
    "SUDDEN_GAS_SURGE",
    "ABRUPT_AIRFLOW_DROP",
    "HIGH_ACTIVITY_REDUCED_VENT",
    "SENSOR_ANOMALY",
]


def detect_events_in_dataframe(
    df: pd.DataFrame,
    threshold_pct: float = 1.0,
    zone_id: Optional[str] = None,
    start_time: Optional[pd.Timestamp] = None,
    end_time: Optional[pd.Timestamp] = None,
    category_filter: Optional[str] = None,
    limit: Optional[int] = None,
) -> List[Dict]:
    """
    Detects discrete physical and statistical events in the provided telemetry slice.
    """
    if df is None or len(df) == 0:
        return []

    # Optional filtering
    filtered_df = df
    if zone_id and zone_id != "ALL":
        filtered_df = filtered_df[filtered_df["zone_id"] == zone_id]
    if start_time is not None:
        filtered_df = filtered_df[filtered_df["timestamp"] >= start_time]
    if end_time is not None:
        filtered_df = filtered_df[filtered_df["timestamp"] <= end_time]

    if len(filtered_df) == 0:
        return []

    events = []
    counter = 1

    # Ensure timestamp is datetime
    if not pd.api.types.is_datetime64_any_dtype(filtered_df["timestamp"]):
        filtered_df = filtered_df.copy()
        filtered_df["timestamp"] = pd.to_datetime(filtered_df["timestamp"])

    # Group by zone and episode to prevent cross-boundary false detections
    for (z, ep), group in filtered_df.groupby(["zone_id", "episode_id"], sort=False):
        g = group.sort_values("timestamp").reset_index(drop=True)
        n = len(g)
        if n < 3:
            continue

        m = g["methane_pct"].values
        af = g["airflow"].values
        act = g["machine_activity"].values if "machine_activity" in g.columns else np.zeros(n)
        times = g["timestamp"].values
        zone_name = ZONE_NAMES.get(z, z)

        # 1. Observed Methane Threshold Crossing (Continuous above threshold)
        is_exceed = m >= threshold_pct
        if np.any(is_exceed):
            diff = np.diff(np.concatenate(([0], is_exceed.astype(int), [0])))
            starts = np.where(diff == 1)[0]
            ends = np.where(diff == -1)[0]
            for s, e in zip(starts, ends):
                s_int = int(s)
                e_int = int(e)
                peak = float(np.max(m[s_int:e_int]))
                duration = int(e_int - s_int)
                severity = "CRITICAL" if peak >= 1.5 else "HIGH"
                events.append(
                    {
                        "event_id": f"EVT-CROSS-{counter:04d}",
                        "episode_id": str(ep),
                        "zone_id": str(z),
                        "zone_name": zone_name,
                        "category": "THRESHOLD_CROSSING",
                        "start_time": _format_ts(times[s_int]),
                        "end_time": _format_ts(times[e_int - 1]),
                        "step_index": s_int,
                        "duration_minutes": duration,
                        "peak_value": float(round(peak, 3)),
                        "rate_of_increase_pct_min": float(round(
                            float((peak - m[max(0, s_int - 5)]) / max(1, min(5, s_int))), 4
                        )),
                        "severity": severity,
                        "description": f"Methane concentration crossed demonstration threshold ({threshold_pct}% CH₄), reaching peak {peak:.3f}%.",
                    }
                )
                counter += 1

        # 2. Sudden Gas Surge (Rapid 5m delta >= 0.20%)
        if n >= 5:
            m_series = pd.Series(m)
            delta5 = m_series.diff(5).fillna(0).values
            surge_indices = np.where(delta5 >= 0.20)[0]
            if len(surge_indices) > 0:
                surge_clusters = _cluster_indices(surge_indices, max_gap=10)
                for cluster in surge_clusters:
                    s_idx = int(cluster[0])
                    e_idx = int(min(n - 1, s_idx + 25))
                    peak = float(np.max(m[s_idx : e_idx + 1]))
                    rate = float(delta5[s_idx] / 5.0)
                    events.append(
                        {
                            "event_id": f"EVT-SURGE-{counter:04d}",
                            "episode_id": str(ep),
                            "zone_id": str(z),
                            "zone_name": zone_name,
                            "category": "SUDDEN_GAS_SURGE",
                            "start_time": _format_ts(times[s_idx]),
                            "end_time": _format_ts(times[e_idx]),
                            "step_index": int(s_idx),
                            "duration_minutes": int(e_idx - s_idx + 1),
                            "peak_value": float(round(peak, 3)),
                            "rate_of_increase_pct_min": float(round(rate, 4)),
                            "severity": "HIGH" if peak < 1.4 else "CRITICAL",
                            "description": f"Rapid gas surge detected (+{delta5[s_idx]:.3f}% in 5m, rate +{rate:.3f}%/min).",
                        }
                    )
                    counter += 1

        # 3. Abrupt Airflow Drop (Airflow drops by >= 4.0 m³/s in 5 minutes)
        if n >= 5:
            af_series = pd.Series(af)
            af_delta5 = af_series.diff(5).fillna(0).values
            drop_indices = np.where(af_delta5 <= -4.0)[0]
            if len(drop_indices) > 0:
                drop_clusters = _cluster_indices(drop_indices, max_gap=15)
                for cluster in drop_clusters:
                    d_idx = int(cluster[0])
                    e_idx = int(min(n - 1, d_idx + 30))
                    drop_mag = float(abs(af_delta5[d_idx]))
                    events.append(
                        {
                            "event_id": f"EVT-AIRFLOW-{counter:04d}",
                            "episode_id": str(ep),
                            "zone_id": str(z),
                            "zone_name": zone_name,
                            "category": "ABRUPT_AIRFLOW_DROP",
                            "start_time": _format_ts(times[d_idx]),
                            "end_time": _format_ts(times[e_idx]),
                            "step_index": int(d_idx),
                            "duration_minutes": int(e_idx - d_idx + 1),
                            "peak_value": float(round(float(af[d_idx]), 2)),
                            "rate_of_increase_pct_min": float(round(drop_mag / 5.0, 2)),
                            "severity": "MEDIUM" if drop_mag < 6.0 else "HIGH",
                            "description": f"Ventilation airflow restriction detected: flow collapsed by {drop_mag:.1f} m³/s in 5m.",
                        }
                    )
                    counter += 1

        # 4. Multivariate Compound Hazard (Cutting machine active >= 2, airflow < 12, methane >= 0.65)
        compound_mask = (af < 12.0) & (act >= 2) & (m >= 0.65)
        if np.any(compound_mask):
            comp_diff = np.diff(np.concatenate(([0], compound_mask.astype(int), [0])))
            c_starts = np.where(comp_diff == 1)[0]
            c_ends = np.where(comp_diff == -1)[0]
            for cs, ce in zip(c_starts, c_ends):
                if ce - cs >= 3:
                    cs_int = int(cs)
                    ce_int = int(ce)
                    peak = float(np.max(m[cs_int:ce_int]))
                    events.append(
                        {
                            "event_id": f"EVT-COMPOUND-{counter:04d}",
                            "episode_id": str(ep),
                            "zone_id": str(z),
                            "zone_name": zone_name,
                            "category": "HIGH_ACTIVITY_REDUCED_VENT",
                            "start_time": _format_ts(times[cs_int]),
                            "end_time": _format_ts(times[ce_int - 1]),
                            "step_index": cs_int,
                            "duration_minutes": int(ce_int - cs_int),
                            "peak_value": float(round(peak, 3)),
                            "rate_of_increase_pct_min": 0.015,
                            "severity": "HIGH",
                            "description": f"Compound operational hazard: cutting machinery operating during restricted ventilation with elevated methane ({peak:.2f}%).",
                        }
                    )
                    counter += 1

        # 5. Sensor Anomalies (dropout <= 0.005 or spike >= 3.8)
        sensor_mask = (m <= 0.005) | (m >= 3.8)
        if np.any(sensor_mask):
            s_diff = np.diff(np.concatenate(([0], sensor_mask.astype(int), [0])))
            s_starts = np.where(s_diff == 1)[0]
            s_ends = np.where(s_diff == -1)[0]
            for ss, se in zip(s_starts, s_ends):
                ss_int = int(ss)
                se_int = int(se)
                peak = float(np.max(m[ss_int:se_int]))
                events.append(
                    {
                        "event_id": f"EVT-SENSOR-{counter:04d}",
                        "episode_id": str(ep),
                        "zone_id": str(z),
                        "zone_name": zone_name,
                        "category": "SENSOR_ANOMALY",
                        "start_time": _format_ts(times[ss_int]),
                        "end_time": _format_ts(times[se_int - 1]),
                        "step_index": ss_int,
                        "duration_minutes": int(se_int - ss_int),
                        "peak_value": float(round(peak, 3)),
                        "rate_of_increase_pct_min": 0.0,
                        "severity": "LOW",
                        "description": f"Sensor irregularity detected (reading: {peak:.2f}%) indicating possible hardware dropout or transient glitch.",
                    }
                )
                counter += 1

    # Filter by category if requested
    if category_filter and category_filter != "ALL":
        events = [e for e in events if e["category"] == category_filter]

    # Sort chronologically by start_time
    events.sort(key=lambda x: x["start_time"])

    if limit is not None:
        return events[:limit]
    return events


def _cluster_indices(indices: np.ndarray, max_gap: int = 10) -> List[List[int]]:
    """Clusters consecutive or near-neighbor indices."""
    if len(indices) == 0:
        return []
    clusters = [[indices[0]]]
    for idx in indices[1:]:
        if idx - clusters[-1][-1] <= max_gap:
            clusters[-1].append(idx)
        else:
            clusters.append([idx])
    return clusters
