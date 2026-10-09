"""
Temporal Risk Analytics API endpoints.
Computes real heatmap matrices, hourly/weekly distributions, duration and peak stats from the dataset.
"""

from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException
import numpy as np
import pandas as pd

from backend.service import get_service

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/temporal")
def get_temporal_analytics(zone_id: Optional[str] = None):
    srv = get_service()
    if srv.df is None:
        raise HTTPException(status_code=503, detail="Dataset not loaded.")

    df = srv.df
    if zone_id and zone_id != "ALL":
        df = df[df["zone_id"] == zone_id]

    if len(df) == 0:
        raise HTTPException(status_code=404, detail="No data for selected filter.")

    # 1. Hour-of-day (0-23) vs Day-of-week (0=Mon, ..., 6=Sun) Heatmap Matrix
    hours = df["timestamp"].dt.hour
    day_of_week = df["timestamp"].dt.dayofweek
    is_exceed = (df["methane_pct"] >= 1.0).astype(int)

    # 24x7 matrix of mean methane and event occurrence
    df_temp = pd.DataFrame(
        {"hour": hours, "day": day_of_week, "methane": df["methane_pct"], "exceed": is_exceed}
    )
    grouped = df_temp.groupby(["day", "hour"]).agg(
        avg_methane=("methane", "mean"),
        peak_methane=("methane", "max"),
        event_rate=("exceed", "mean"),
        count=("methane", "count"),
    ).reset_index()

    heatmap_cells = []
    days_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for _, r in grouped.iterrows():
        heatmap_cells.append(
            {
                "day_idx": int(r["day"]),
                "day_name": days_labels[int(r["day"])],
                "hour": int(r["hour"]),
                "avg_methane": float(np.round(r["avg_methane"], 3)),
                "peak_methane": float(np.round(r["peak_methane"], 3)),
                "event_rate": float(np.round(r["event_rate"] * 100, 2)),
                "count": int(r["count"]),
            }
        )

    # 2. Hourly risk frequency profile
    hourly_profile = (
        df_temp.groupby("hour")
        .agg(avg_methane=("methane", "mean"), event_count=("exceed", "sum"))
        .reset_index()
    )
    hourly_data = [
        {
            "hour": int(r["hour"]),
            "avg_methane": float(np.round(r["avg_methane"], 3)),
            "events": int(r["event_count"]),
        }
        for _, r in hourly_profile.iterrows()
    ]

    # 3. Methane concentration histogram distribution
    bins = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.25, 1.5, 2.0, 5.0]
    bin_labels = [
        "0.0-0.2%",
        "0.2-0.4%",
        "0.4-0.6%",
        "0.6-0.8%",
        "0.8-1.0%",
        "1.0-1.25%",
        "1.25-1.5%",
        "1.5-2.0%",
        ">2.0%",
    ]
    counts, _ = np.histogram(df["methane_pct"], bins=bins)
    concentration_dist = [
        {"bin": label, "count": int(c), "pct": float(np.round(c / len(df) * 100, 2))}
        for label, c in zip(bin_labels, counts)
    ]

    # 4. Zone risk breakdown
    zone_dist = []
    for z, z_grp in srv.df.groupby("zone_id"):
        z_exceed = (z_grp["methane_pct"] >= 1.0).sum()
        zone_dist.append(
            {
                "zone_id": z,
                "total_records": len(z_grp),
                "exceedance_minutes": int(z_exceed),
                "exceedance_pct": float(np.round(z_exceed / len(z_grp) * 100, 2)),
                "mean_methane": float(np.round(z_grp["methane_pct"].mean(), 3)),
                "peak_methane": float(np.round(z_grp["methane_pct"].max(), 3)),
            }
        )

    # 5. Peak concentration and event duration distributions
    # Group contiguous exceedance episodes
    events_durations = []
    events_peaks = []
    for ep, ep_df in df.groupby("episode_id"):
        in_ev = False
        cur_dur = 0
        cur_pk = 0.0
        for m in ep_df["methane_pct"]:
            if m >= 1.0:
                in_ev = True
                cur_dur += 1
                cur_pk = max(cur_pk, m)
            else:
                if in_ev:
                    events_durations.append(cur_dur)
                    events_peaks.append(cur_pk)
                    in_ev = False
                    cur_dur = 0
                    cur_pk = 0.0
        if in_ev:
            events_durations.append(cur_dur)
            events_peaks.append(cur_pk)

    dur_hist, dur_bins = np.histogram(
        events_durations if events_durations else [0], bins=[0, 10, 20, 30, 60, 120, 300]
    )
    dur_labels = ["<10m", "10-20m", "20-30m", "30-60m", "1-2h", ">2h"]
    duration_dist = [
        {"duration_range": lbl, "count": int(c)} for lbl, c in zip(dur_labels, dur_hist)
    ]

    # 6. Scenario operational condition risk comparisons
    scenario_comparison = []
    for scn, scn_df in df.groupby("scenario_type"):
        scn_exceed = (scn_df["methane_pct"] >= 1.0).sum()
        scenario_comparison.append(
            {
                "scenario_type": scn,
                "records": len(scn_df),
                "avg_methane": float(np.round(scn_df["methane_pct"].mean(), 3)),
                "avg_airflow": float(np.round(scn_df["airflow"].mean(), 2)),
                "exceedance_pct": float(np.round(scn_exceed / len(scn_df) * 100, 2)),
                "peak_methane": float(np.round(scn_df["methane_pct"].max(), 3)),
            }
        )

    return {
        "heatmap": heatmap_cells,
        "hourly_profile": hourly_data,
        "concentration_distribution": concentration_dist,
        "zone_distribution": zone_dist,
        "duration_distribution": duration_dist,
        "scenario_comparison": scenario_comparison,
        "total_analyzed_records": len(df),
    }
