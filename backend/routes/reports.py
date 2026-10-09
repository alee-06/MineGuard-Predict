"""
Reports and Export API endpoints.
Generates polished printable HTML reports and CSV summaries with complete benchmark metrics,
risk profiles, feature rankings, and synthetic data disclaimers.
"""

from datetime import datetime
import io
import os
from typing import Dict, List
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, Response
import pandas as pd

from backend.service import get_service

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/summary")
def get_report_summary():
    srv = get_service()
    if srv.metrics_data is None:
        raise HTTPException(status_code=503, detail="Metrics not available.")

    df = srv.df
    total_records = len(df) if df is not None else 0
    total_episodes = int(df["episode_id"].nunique()) if df is not None else 0
    zones = list(df["zone_id"].unique()) if df is not None else []

    return {
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
        "platform": "MineGuard Predict - AI Mine Gas-Risk Intelligence Platform",
        "dataset_rows": total_records,
        "total_episodes": total_episodes,
        "monitoring_zones": zones,
        "metrics": srv.metrics_data.get("metrics", []),
        "global_importances": srv.metrics_data.get("global_importances", {}),
        "disclaimer": "SYNTHETIC BENCHMARK: All telemetry, models, and scores reflect programmatic simulations and are not certified for physical mine safety decision-making.",
    }


@router.get("/export/csv")
def export_metrics_csv():
    srv = get_service()
    if srv.metrics_data is None:
        raise HTTPException(status_code=503, detail="Metrics not available.")

    rows = []
    for m in srv.metrics_data.get("metrics", []):
        cm = m.get("confusion_matrix", {})
        cal = m.get("calibration", {})
        fa = m.get("false_alarm_analysis", {})
        sc = m.get("sample_counts", {})
        rows.append(
            {
                "Model": m.get("model_name"),
                "Horizon_Minutes": m.get("horizon_minutes"),
                "Decision_Threshold": m.get("decision_threshold", 0.50),
                "Validation_Tuned_Threshold": m.get("validation_tuned_threshold"),
                "ROC_AUC": m.get("roc_auc"),
                "PR_AUC": m.get("pr_auc"),
                "F1_Score": m.get("f1_score"),
                "Precision": m.get("precision"),
                "Recall": m.get("recall"),
                "Brier_Score": cal.get("brier_score"),
                "ECE": cal.get("expected_calibration_error"),
                "FA_Incidents_Per_Day": fa.get("false_alarm_incidents_per_day", m.get("false_alarms_per_day")),
                "FA_Minutes_Per_Day": fa.get("false_alarm_minutes_per_day"),
                "FA_Merged_5m_Per_Day": fa.get("false_alarm_incidents_merged_5m_per_day"),
                "True_Positives": cm.get("tp"),
                "False_Positives": cm.get("fp"),
                "False_Negatives": cm.get("fn"),
                "True_Negatives": cm.get("tn"),
                "Total_Samples": sc.get("total_samples"),
                "Positive_Samples": sc.get("positive_samples"),
                "Data_Fingerprint": m.get("eval_data_fingerprint", "N/A"),
            }
        )

    out_df = pd.DataFrame(rows)
    stream = io.StringIO()
    out_df.to_csv(stream, index=False)

    return Response(
        content=stream.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=mineguard_benchmark_report.csv"},
    )


@router.get("/export/html", response_class=HTMLResponse)
def export_printable_html_report():
    srv = get_service()
    metrics = srv.metrics_data.get("metrics", []) if srv.metrics_data else []
    importances = srv.metrics_data.get("global_importances", {}).get("15m", {}) if srv.metrics_data else {}
    top_features = list(importances.items())[:8]

    rows_html = ""
    for m in metrics:
        cm = m.get("confusion_matrix", {})
        cal = m.get("calibration", {})
        fa = m.get("false_alarm_analysis", {})
        fa_inc = fa.get("false_alarm_incidents_per_day", m.get("false_alarms_per_day", 0.0))
        fa_min = fa.get("false_alarm_minutes_per_day", 0.0)
        rows_html += f"""
        <tr>
            <td><strong>{m.get('model_name').replace('_', ' ').title()}</strong></td>
            <td>{m.get('horizon_minutes')} min</td>
            <td>{m.get('roc_auc'):.4f}</td>
            <td>{m.get('pr_auc'):.4f}</td>
            <td>{m.get('f1_score'):.4f}</td>
            <td>{m.get('precision'):.4f}</td>
            <td>{m.get('recall'):.4f}</td>
            <td>{cal.get('brier_score', 0.0):.4f}</td>
            <td>{cal.get('expected_calibration_error', 0.0):.4f}</td>
            <td><span class="badge">{fa_inc:.2f} inc/d</span> ({fa_min:.1f} m/d)</td>
            <td>TP:{cm.get('tp')} | FP:{cm.get('fp')} | FN:{cm.get('fn')}</td>
        </tr>
        """

    feats_html = ""
    for feat, imp in top_features:
        pct = imp * 100
        feats_html += f"""
        <div class="feat-row">
            <span class="feat-name">{feat}</span>
            <div class="feat-bar-bg"><div class="feat-bar-fill" style="width: {min(100, pct*4):.1f}%;"></div></div>
            <span class="feat-val">{imp:.4f}</span>
        </div>
        """

    now_str = datetime.utcnow().strftime("%B %d, %Y - %H:%M UTC")

    html_doc = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>MineGuard Predict - Model Evaluation & Risk Intelligence Report</title>
<style>
    @page {{ size: A4; margin: 18mm; }}
    body {{
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #1e293b;
        line-height: 1.5;
        background: #ffffff;
        margin: 0;
        padding: 24px;
    }}
    .header {{
        border-bottom: 2px solid #0f172a;
        padding-bottom: 16px;
        margin-bottom: 24px;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
    }}
    .title {{ font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }}
    .subtitle {{ font-size: 13px; color: #64748b; margin-top: 4px; }}
    .badge {{ background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }}
    .alert-banner {{
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #991b1b;
        padding: 12px 16px;
        border-radius: 6px;
        font-size: 12px;
        margin-bottom: 24px;
    }}
    .section-title {{ font-size: 16px; font-weight: 700; color: #0f172a; margin: 24px 0 12px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px; }}
    th {{ background: #f8fafc; text-align: left; padding: 8px 10px; border: 1px solid #cbd5e1; font-weight: 600; color: #334155; }}
    td {{ padding: 8px 10px; border: 1px solid #e2e8f0; }}
    tr:nth-child(even) {{ background: #f8fafc; }}
    .feat-row {{ display: flex; align-items: center; margin-bottom: 8px; font-size: 12px; }}
    .feat-name {{ width: 220px; font-weight: 500; }}
    .feat-bar-bg {{ flex: 1; height: 10px; background: #e2e8f0; border-radius: 5px; overflow: hidden; margin: 0 12px; }}
    .feat-bar-fill {{ height: 100%; background: #3b82f6; border-radius: 5px; }}
    .feat-val {{ width: 60px; text-align: right; font-weight: 600; color: #0f172a; }}
    .footer {{ margin-top: 40px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 16px; }}
    @media print {{
        body {{ padding: 0; }}
        button {{ display: none; }}
    }}
</style>
</head>
<body>
<div style="text-align: right; margin-bottom: 16px;">
    <button onclick="window.print()" style="background: #0f172a; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-size: 12px; cursor: pointer; font-weight: 600;">Print / Save as PDF</button>
</div>

<div class="header">
    <div>
        <h1 class="title">MineGuard Predict</h1>
        <div class="subtitle">AI-Powered Coal Mine Atmospheric Telemetry & Gas-Risk Forecasting Platform</div>
    </div>
    <div style="text-align: right; font-size: 12px; color: #64748b;">
        <div><strong>Report Date:</strong> {now_str}</div>
        <div><strong>Dataset:</strong> 150,000 Synthetic Minute Records</div>
    </div>
</div>

<div class="alert-banner">
    <strong>DISCLAIMER & DEMONSTRATION NOTICE:</strong> This intelligence report and underlying predictive models were trained strictly on programmatic synthetic data simulating underground coal mine ventilation and methane dynamics. These results demonstrate machine learning workflow capability and DO NOT constitute certified real-world mine safety compliance or a replacement for physical methane detectors.
</div>

<div class="section-title">1. Multi-Horizon Model Benchmark (Held-Out Test Episodes)</div>
<p style="font-size: 12px; color: #475569;">
    All models were trained on 146 independent episodes and evaluated on 32 completely disjoint test episodes. The objective is predicting whether methane concentration will cross the early-alert threshold (1.0% CH₄) in the subsequent 5, 15, or 30 minutes.
</p>
<table>
    <thead>
        <tr>
            <th>Model Architecture</th>
            <th>Horizon</th>
            <th>ROC-AUC</th>
            <th>PR-AUC</th>
            <th>F1-Score</th>
            <th>Precision</th>
            <th>Recall</th>
            <th>Brier Score</th>
            <th>ECE</th>
            <th>False Alarms</th>
            <th>Confusion Counts</th>
        </tr>
    </thead>
    <tbody>
        {rows_html}
    </tbody>
</table>

<div class="section-title">2. Primary Predictive Feature Drivers (15-Minute Horizon)</div>
<p style="font-size: 12px; color: #475569;">
    Normalized feature importance extracted from the flagship tree-based classifier, demonstrating causal dependency on recent rates of change, ventilation dilution, and extraction machinery.
</p>
<div style="max-width: 600px; margin-top: 12px;">
    {feats_html}
</div>

<div class="section-title">3. Operational Risk Categories & Demonstration Guidelines</div>
<ul style="font-size: 12px; color: #334155; line-height: 1.8;">
    <li><strong>NORMAL (< 30% Probability):</strong> Atmospheric telemetry stable with adequate dilution airflow and negative/neutral methane slope.</li>
    <li><strong>ELEVATED (30% - 70% Probability):</strong> Early warning indicator. Increasing gas desorption rate, falling barometric pressure, or gradual ventilation drop.</li>
    <li><strong>CRITICAL (≥ 70% Probability):</strong> High-probability imminent threshold-crossing hazard requiring supervisory ventilation inspection.</li>
</ul>

<div class="footer">
    MineGuard Predict Platform &bull; Autonomous Machine Learning & Analytics &bull; Verified Disjoint Validation
</div>
</body>
</html>
"""
    return HTMLResponse(content=html_doc)
