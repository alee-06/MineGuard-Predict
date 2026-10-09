"""
Dataset Lab API endpoints.
Provides dataset inspection, Excel/CSV file upload, worksheet selection, column mapping,
schema validation, dataset activation, generation, pagination, and CSV export.
"""

import io
import os
import shutil
import uuid
from datetime import datetime
from typing import Dict, List, Optional
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
import pandas as pd
import numpy as np

from backend.service import DATA_PATH_STANDARD, DATA_PATH_DEMO, get_service
from ml.generator import generate_and_save_dataset

router = APIRouter(prefix="/api/dataset", tags=["dataset"])

TEMP_UPLOAD_DIR = "data/uploads"
os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)

CANONICAL_COLUMNS = [
    "timestamp",
    "zone_id",
    "episode_id",
    "methane_pct",
    "airflow",
    "temperature_c",
    "humidity_pct",
    "pressure_kpa",
    "machine_activity",
    "ventilation_state",
    "scenario_type",
]

COLUMN_ALIASES = {
    "timestamp": ["timestamp", "datetime", "time", "date_time", "date", "recorded_at", "dt"],
    "methane_pct": ["methane_pct", "methane", "ch4", "methane_percentage", "ch4_pct", "gas_pct", "ch4_concentration"],
    "airflow": ["airflow", "ventilation_flow", "air_velocity", "flow_rate", "m3s", "air_flow"],
    "zone_id": ["zone_id", "zone", "area", "monitoring_area", "location", "sensor_id", "panel"],
    "temperature_c": ["temperature_c", "temp", "temperature", "temp_c", "ambient_temp"],
    "humidity_pct": ["humidity_pct", "humidity", "rel_humidity", "rh", "relative_humidity"],
    "pressure_kpa": ["pressure_kpa", "pressure", "barometer", "press_kpa", "barometric_pressure"],
    "machine_activity": ["machine_activity", "activity", "cutting_level", "shearer_state", "machine_level"],
    "ventilation_state": ["ventilation_state", "fan_state", "vent_status", "vent_mode"],
}


class ActivateDatasetRequest(BaseModel):
    file_token: Optional[str] = None
    token: Optional[str] = None
    worksheet: Optional[str] = None
    sheet_name: Optional[str] = None
    column_mapping: Optional[Dict[str, str]] = None
    dataset_name: Optional[str] = "Imported Dataset"


@router.get("/summary")
def get_dataset_summary():
    srv = get_service()
    if srv.df is None or len(srv.df) == 0:
        return {
            "loaded": False,
            "message": "No dataset currently loaded.",
            "total_rows": 0,
            "total_records": 0,
            "total_zones": 0,
            "zones": [],
            "schema": CANONICAL_COLUMNS,
        }

    df = srv.df
    missing_dict = df.isnull().sum().to_dict()
    dtypes_dict = {col: str(dtype) for col, dtype in df.dtypes.items()}

    exceed_count = int((df["methane_pct"] >= 1.0).sum())
    exceed_pct = float(np.round(exceed_count / len(df) * 100, 2))

    num_cols = ["methane_pct", "airflow", "temperature_c", "humidity_pct", "pressure_kpa"]
    stats_dict = {}
    for c in num_cols:
        if c in df.columns and pd.api.types.is_numeric_dtype(df[c]):
            stats_dict[c] = {
                "mean": float(np.round(df[c].mean(), 3)),
                "std": float(np.round(df[c].std(), 3)),
                "min": float(np.round(df[c].min(), 3)),
                "max": float(np.round(df[c].max(), 3)),
            }

    unique_zones = sorted(df["zone_id"].unique().tolist()) if "zone_id" in df.columns else ["ZONE-01-PRIMARY"]

    return {
        "loaded": True,
        "filename": srv.active_dataset_name,
        "dataset_type": srv.active_dataset_type,
        "total_rows": len(df),
        "total_records": len(df),  # Guarantee total_records is ALWAYS present!
        "total_episodes": int(df["episode_id"].nunique()) if "episode_id" in df.columns else 1,
        "total_zones": len(unique_zones),
        "zones": unique_zones,
        "timestamp_start": str(df["timestamp"].min()),
        "timestamp_end": str(df["timestamp"].max()),
        "columns": list(df.columns),
        "dtypes": dtypes_dict,
        "missing_values": missing_dict,
        "target_balance": {
            "threshold_pct": 1.0,
            "exceedance_rows": exceed_count,
            "exceedance_pct": exceed_pct,
            "normal_rows": len(df) - exceed_count,
            "positive_pct": exceed_pct,
        },
        "stats": stats_dict,
        "scenario_distribution": df["scenario_type"].value_counts().to_dict() if "scenario_type" in df.columns else {},
        "disclaimer": "MINEGUARD SENSOR INTELLIGENCE PLATFORM",
    }


@router.post("/inspect-file")
async def inspect_uploaded_file(file: UploadFile = File(...), worksheet: Optional[str] = None):
    """
    Accepts CSV, XLSX, or XLS file. Inspects sheets, previews data,
    detects column mappings, and validates time ordering.
    """
    filename = file.filename or "uploaded_data.csv"
    ext = os.path.splitext(filename)[1].lower()

    if ext not in [".csv", ".xlsx", ".xls"]:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{ext}'. Please upload a valid .csv, .xlsx, or .xls file.",
        )

    file_token = str(uuid.uuid4())
    stored_path = os.path.join(TEMP_UPLOAD_DIR, f"{file_token}{ext}")

    content = await file.read()
    with open(stored_path, "wb") as f:
        f.write(content)

    worksheets = []
    selected_sheet = worksheet

    try:
        if ext in [".xlsx", ".xls"]:
            excel_file = pd.ExcelFile(stored_path)
            worksheets = excel_file.sheet_names
            if not selected_sheet or selected_sheet not in worksheets:
                selected_sheet = worksheets[0]
            df_preview = pd.read_excel(stored_path, sheet_name=selected_sheet, nrows=50)
            df_full = pd.read_excel(stored_path, sheet_name=selected_sheet)
        else:
            df_preview = pd.read_csv(stored_path, nrows=50)
            df_full = pd.read_csv(stored_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")

    raw_columns = list(df_preview.columns)

    # Detect recognized columns
    detected_mapping = {}
    lower_raw = {c.lower().strip().replace(" ", "_"): c for c in raw_columns}

    for canonical, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in lower_raw:
                detected_mapping[canonical] = lower_raw[alias]
                break

    # Validation checks
    validation_errors = []
    validation_warnings = []

    if "timestamp" not in detected_mapping:
        validation_errors.append("No recognizable timestamp column found. Please map a timestamp column explicitly.")
    if "methane_pct" not in detected_mapping:
        validation_errors.append("No recognizable methane column found. Please map a methane concentration column explicitly.")
    if "airflow" not in detected_mapping:
        validation_warnings.append("No airflow column detected. Airflow will default to baseline 15.0 m³/s.")
    if "zone_id" not in detected_mapping:
        validation_warnings.append("No area/zone identifier column detected. All readings will be assigned to 'ZONE-01-PRIMARY'.")

    # Timestamp parse check
    ts_col = detected_mapping.get("timestamp")
    start_time_str = "N/A"
    end_time_str = "N/A"
    if ts_col and ts_col in df_full.columns:
        try:
            parsed_ts = pd.to_datetime(df_full[ts_col], errors="coerce")
            valid_ts_count = parsed_ts.notnull().sum()
            if valid_ts_count < len(df_full) * 0.9:
                validation_errors.append("Over 10% of timestamps could not be parsed into valid dates.")
            else:
                start_time_str = str(parsed_ts.min())
                end_time_str = str(parsed_ts.max())
                if not parsed_ts.is_monotonic_increasing:
                    validation_warnings.append("Timestamps are not strictly in chronological order. They will be sorted automatically upon activation.")
        except Exception:
            validation_errors.append("Failed to convert timestamp column to date format.")

    # Methane unit validation
    m_col = detected_mapping.get("methane_pct")
    if m_col and m_col in df_full.columns:
        m_vals = pd.to_numeric(df_full[m_col], errors="coerce").dropna()
        if len(m_vals) > 0:
            if m_vals.max() > 20.0:
                validation_warnings.append(
                    f"Maximum gas reading is {m_vals.max():.1f}. If readings are in ppm, divide by 10,000 to convert to percentage (% CH₄)."
                )

    preview_rows = df_preview.head(10).to_dict(orient="records")
    for row in preview_rows:
        for k, v in row.items():
            if pd.isnull(v):
                row[k] = None
            elif isinstance(v, (pd.Timestamp, datetime)):
                row[k] = str(v)

    matched_count = int(sum(1 for v in detected_mapping.values() if v is not None))
    validation_obj = {
        "is_valid": len(validation_errors) == 0,
        "errors": validation_errors,
        "warnings": validation_warnings,
        "matched_canonical_count": matched_count,
        "total_canonical_count": len(CANONICAL_COLUMNS),
    }

    return {
        "token": file_token,
        "file_token": file_token,
        "filename": filename,
        "format": ext[1:].upper(),
        "available_sheets": worksheets,
        "worksheets": worksheets,
        "selected_sheet": selected_sheet,
        "selected_worksheet": selected_sheet,
        "total_rows": len(df_full),
        "columns": raw_columns,
        "raw_columns": raw_columns,
        "detected_mapping": detected_mapping,
        "time_range": {"start": start_time_str, "end": end_time_str},
        "validation": validation_obj,
        "is_valid": len(validation_errors) == 0,
        "validation_errors": validation_errors,
        "validation_warnings": validation_warnings,
        "preview": preview_rows,
        "preview_rows": preview_rows,
    }


@router.post("/activate")
def activate_uploaded_dataset(req: ActivateDatasetRequest):
    """
    Applies column mappings to the inspected file and activates it into the service.
    """
    file_token = req.file_token or req.token
    if not file_token:
        raise HTTPException(status_code=400, detail="Missing file token for dataset activation.")

    worksheet = req.worksheet or req.sheet_name

    # Search for matching file token in temp uploads
    matching_files = [f for f in os.listdir(TEMP_UPLOAD_DIR) if f.startswith(file_token)]
    if not matching_files:
        raise HTTPException(status_code=404, detail="Uploaded file session expired or not found. Please upload again.")

    stored_path = os.path.join(TEMP_UPLOAD_DIR, matching_files[0])
    ext = os.path.splitext(stored_path)[1].lower()

    try:
        if ext in [".xlsx", ".xls"]:
            df_raw = pd.read_excel(stored_path, sheet_name=worksheet or 0)
        else:
            df_raw = pd.read_csv(stored_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")

    mapping = req.column_mapping or {}

    ts_col = mapping.get("timestamp", "timestamp")
    m_col = mapping.get("methane_pct", "methane_pct")

    if ts_col not in df_raw.columns:
        raise HTTPException(status_code=400, detail=f"Timestamp column '{ts_col}' not found in file.")
    if m_col not in df_raw.columns:
        raise HTTPException(status_code=400, detail=f"Methane column '{m_col}' not found in file.")

    # Standardize DataFrame into canonical schema
    df_clean = pd.DataFrame()
    df_clean["timestamp"] = pd.to_datetime(df_raw[ts_col], errors="coerce")
    df_clean = df_clean.dropna(subset=["timestamp"])

    df_clean["methane_pct"] = pd.to_numeric(df_raw[m_col], errors="coerce").fillna(0.0)

    # Optional fields
    af_col = mapping.get("airflow")
    if af_col and af_col in df_raw.columns:
        df_clean["airflow"] = pd.to_numeric(df_raw[af_col], errors="coerce").fillna(15.0)
    else:
        df_clean["airflow"] = 15.0

    z_col = mapping.get("zone_id")
    if z_col and z_col in df_raw.columns:
        df_clean["zone_id"] = df_raw[z_col].astype(str)
    else:
        df_clean["zone_id"] = "ZONE-01-PRIMARY"

    temp_col = mapping.get("temperature_c")
    df_clean["temperature_c"] = pd.to_numeric(df_raw[temp_col], errors="coerce").fillna(24.0) if temp_col and temp_col in df_raw.columns else 24.0

    hum_col = mapping.get("humidity_pct")
    df_clean["humidity_pct"] = pd.to_numeric(df_raw[hum_col], errors="coerce").fillna(75.0) if hum_col and hum_col in df_raw.columns else 75.0

    pr_col = mapping.get("pressure_kpa")
    df_clean["pressure_kpa"] = pd.to_numeric(df_raw[pr_col], errors="coerce").fillna(101.3) if pr_col and pr_col in df_raw.columns else 101.3

    act_col = mapping.get("machine_activity")
    df_clean["machine_activity"] = pd.to_numeric(df_raw[act_col], errors="coerce").fillna(1).astype(int) if act_col and act_col in df_raw.columns else 1

    vent_col = mapping.get("ventilation_state")
    df_clean["ventilation_state"] = df_raw[vent_col].astype(str) if vent_col and vent_col in df_raw.columns else "NORMAL"

    df_clean["scenario_type"] = "HISTORICAL_IMPORTED"
    df_clean["episode_id"] = "EP-IMPORTED-0001"

    # Sort chronologically
    df_clean = df_clean.sort_values(by=["timestamp", "zone_id"]).reset_index(drop=True)

    # Activate in service
    dataset_name = req.dataset_name or matching_files[0]
    srv = get_service()
    srv.activate_dataframe(
        df=df_clean,
        dataset_name=dataset_name,
        dataset_type="IMPORTED_FILE",
        file_path=stored_path,
        worksheet=req.worksheet,
    )

    return {
        "status": "ACTIVATED",
        "dataset_name": dataset_name,
        "total_rows": len(df_clean),
        "total_records": len(df_clean),
        "time_range": {
            "start": str(df_clean["timestamp"].min()),
            "end": str(df_clean["timestamp"].max()),
        },
        "zones": sorted(df_clean["zone_id"].unique().tolist()),
        "total_events": len(srv.cached_events) if srv.cached_events else 0,
        "message": f"Successfully activated dataset '{dataset_name}' with {len(df_clean):,} validated rows.",
    }


@router.post("/upload")
async def upload_dataset_csv(file: UploadFile = File(...)):
    """Legacy/direct upload endpoint verifying required columns."""
    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=422, detail={"error": "PARSE_ERROR", "message": str(e)})

    missing = [c for c in ["timestamp", "methane_pct", "airflow", "zone_id"] if c not in df.columns]
    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "SCHEMA_VALIDATION_FAILED",
                "missing_columns": missing,
                "required_columns": ["timestamp", "methane_pct", "airflow", "zone_id"],
            },
        )

    srv = get_service()
    srv.activate_dataframe(df, file.filename or "uploaded.csv", "IMPORTED_CSV")
    return {"status": "SUCCESS", "total_rows": len(df)}


@router.post("/load-demo")
def load_demo_dataset_endpoint():
    """Activates the curated demonstration dataset."""
    srv = get_service()
    srv.load_demo_dataset()
    meta = srv.get_metadata()
    return {
        "status": "LOADED_DEMO",
        "dataset_name": meta["active_dataset_name"],
        "total_rows": meta["total_rows"],
        "total_records": meta["total_rows"],
        "time_range": meta["time_range"],
        "zones": meta["zones"],
        "total_events": meta["total_events"],
        "message": "Curated demonstration dataset successfully activated.",
    }


@router.get("/preview")
def get_dataset_preview(
    page: int = 1,
    page_size: int = 50,
    zone_id: Optional[str] = None,
    scenario_type: Optional[str] = None,
    min_methane: Optional[float] = None,
):
    srv = get_service()
    if srv.df is None or len(srv.df) == 0:
        raise HTTPException(status_code=503, detail="Dataset not loaded.")

    df = srv.df
    if zone_id and zone_id != "ALL" and "zone_id" in df.columns:
        df = df[df["zone_id"] == zone_id]
    if scenario_type and scenario_type != "ALL" and "scenario_type" in df.columns:
        df = df[df["scenario_type"] == scenario_type]
    if min_methane is not None:
        df = df[df["methane_pct"] >= min_methane]

    total_filtered = len(df)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size

    slice_df = df.iloc[start_idx:end_idx].copy()
    rows = slice_df.to_dict(orient="records")
    for r in rows:
        r["timestamp"] = str(r["timestamp"])

    return {
        "page": page,
        "page_size": page_size,
        "total_rows": total_filtered,
        "total_records": total_filtered,
        "total_pages": int(np.ceil(total_filtered / page_size)),
        "rows": rows,
    }


@router.get("/download")
def download_active_dataset():
    srv = get_service()
    if srv.df is None or len(srv.df) == 0:
        raise HTTPException(status_code=503, detail="Dataset not loaded.")

    stream = io.StringIO()
    srv.df.to_csv(stream, index=False)
    stream.seek(0)

    filename = srv.active_dataset_name if srv.active_dataset_name.endswith(".csv") else f"{srv.active_dataset_name}.csv"
    return StreamingResponse(
        iter([stream.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
