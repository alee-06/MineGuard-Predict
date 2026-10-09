"""
MineGuard Predict - Script to generate curated demonstration datasets (CSV & XLSX).
Provides realistic, multi-zone, multi-episode underground coal mine telemetry
with 8 distinct, authentic threshold crossing incidents distributed across the 7-day period.
"""

import os
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

from ml.generator import MineTelemetryGenerator, GeneratorConfig, DEFAULT_ZONES, SCENARIO_TYPES
from ml.events import detect_events_in_dataframe


def create_demo_datasets(output_csv="data/demo_mine_sensors.csv", output_xlsx="data/demo_mine_sensors.xlsx"):
    os.makedirs(os.path.dirname(output_csv), exist_ok=True)
    
    # 24 diverse 12-hour shifts = 17,280 rows across 6 zones
    config = GeneratorConfig(
        seed=101,
        target_rows=17280,
        start_time="2026-06-01 00:00:00",
        episode_duration_minutes=720,
    )
    generator = MineTelemetryGenerator(config)
    df = generator.generate_dataset()
    
    # Cap normal baseline oscillations below warning limit (0.85% CH4) so only our curated events cross 1.0%
    df.loc[df["methane_pct"] >= 0.90, "methane_pct"] = 0.82

    # Curate exactly 8 distinct, authentic hazard events distributed across the 7-day timeline and zones
    # (episode_id, minute_offset, duration, peak_ch4, min_airflow)
    curated_hazard_events = [
        ("EP-0002", 320, 18, 1.08, 8.5),   # June 1 ~11:20 (Longwall Face)
        ("EP-0004", 380, 22, 1.14, 4.2),   # June 2 ~00:20 (Bleeder Seal)
        ("EP-0007", 280, 16, 1.07, 7.8),   # June 2 ~16:40 (Tailgate Return)
        ("EP-0010", 350, 25, 1.18, 3.8),   # June 3 ~11:50 (Bleeder Seal)
        ("EP-0013", 290, 15, 1.06, 7.2),   # June 4 ~04:50 (Tailgate Return)
        ("EP-0014", 330, 24, 1.15, 8.1),   # June 4 ~11:30 (Longwall Face)
        ("EP-0018", 360, 20, 1.12, 11.2),  # June 5 ~12:00 (Return Airway)
        ("EP-0022", 310, 22, 1.16, 4.0),   # June 6 ~11:10 (Bleeder Seal)
    ]

    for ep_id, offset, dur, peak, min_af in curated_hazard_events:
        ep_idx = df[df["episode_id"] == ep_id].index
        if len(ep_idx) > offset + dur:
            target_idx = ep_idx[offset : offset + dur]
            t = np.linspace(0, np.pi, dur)
            curve = np.sin(t)
            base_ch4 = df.loc[target_idx, "methane_pct"].values[0]
            added_ch4 = (peak - base_ch4) * curve
            df.loc[target_idx, "methane_pct"] = np.round(base_ch4 + added_ch4, 4)
            base_af = df.loc[target_idx, "airflow"].values[0]
            af_drop = (base_af - min_af) * curve
            df.loc[target_idx, "airflow"] = np.round(base_af - af_drop, 2)

    # Add a few explicit missing readings for data quality resilience testing
    df_with_tests = df.copy()
    null_idx = df_with_tests[df_with_tests["episode_id"] == "EP-0008"].index[:5]
    if len(null_idx) > 0:
        df_with_tests.loc[null_idx, "methane_pct"] = np.nan
        df_with_tests.loc[null_idx, "airflow"] = np.nan

    # Validate exact event count
    detected = detect_events_in_dataframe(df_with_tests, threshold_pct=1.0)
    crossings = [e for e in detected if e["category"] == "THRESHOLD_CROSSING"]
    print(f"Validated demo dataset: {len(crossings)} distinct threshold crossings detected across the 7-day period.")

    # Save primary CSV
    df_with_tests.to_csv(output_csv, index=False)
    print(f"Saved demo CSV to {output_csv} ({len(df_with_tests)} rows)")

    # Save multi-sheet Excel workbook
    with pd.ExcelWriter(output_xlsx, engine="openpyxl") as writer:
        df_with_tests.to_excel(writer, sheet_name="All_Sensors", index=False)
        df_with_tests[df_with_tests["zone_id"] == "ZONE-01-TAILGATE"].to_excel(
            writer, sheet_name="Tailgate_Return", index=False
        )
        df_with_tests[df_with_tests["zone_id"] == "ZONE-02-LONGWALL-FACE"].to_excel(
            writer, sheet_name="Longwall_Face", index=False
        )
        df_with_tests[df_with_tests["zone_id"] == "ZONE-04-BLEEDER-SEAL"].to_excel(
            writer, sheet_name="Bleeder_Seal", index=False
        )
    print(f"Saved demo XLSX to {output_xlsx}")


if __name__ == "__main__":
    create_demo_datasets()
