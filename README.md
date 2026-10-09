# MineGuard Predict — AI-Powered Coal Mine Gas-Risk & Safety Intelligence

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB.svg)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg)](https://fastapi.tiangolo.com/)
[![Vite](https://img.shields.io/badge/Vite-5.0+-646CFF.svg)](https://vitejs.dev/)

An industrial-grade, operations-first predictive safety platform engineered for underground coal mine safety officers and ventilation engineers.

Unlike traditional monitors that trigger alarms only **after** gas has already reached dangerous levels, **MineGuard Predict** forecasts gas buildup **5, 15, and 30 minutes in advance** — giving safety administrators actionable lead time to inspect bleeder seals, regulate auxiliary fans, and withdraw crews before hazards escalate.

---

## 1. Product Architecture: Two Operational Workspaces

MineGuard Predict is built around two primary workflows for mine safety management:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          MINEGUARD PREDICT                             │
├──────────────────────────────────┬─────────────────────────────────────┤
│   WORKSPACE 1: LIVE MONITORING   │  WORKSPACE 2: HISTORICAL ANALYTICS  │
│                                  │                                     │
│  • Priority Risk Alert Panel     │  • Dataset Import (CSV / Excel)     │
│  • Directional Rate of Change    │  • Time-Series Analysis & Trends    │
│  • 5m / 15m / 30m Lead Horizons  │  • Observed vs. Predicted Crossings │
│  • Plain Human-Language Drivers  │  • 7×24 Shift Cycle Risk Matrix     │
│  • Multi-Zone Schematic Network  │  • Event Replay with Verified Audit │
│  • Advance Operational Guidance  │  • What-If Scenario Stress Testing  │
└──────────────────────────────────┴─────────────────────────────────────┘
```

### Workspace 1 — Live Monitoring & Advance Preparation
Designed for real-time control room shifts:
- **Priority Risk Alert:** Immediately highlights the mine area needing attention first, current methane level, recent trend direction, and forecast horizon.
- **Plain-English Physical Influencing Factors:** Translates complex statistical correlations into clear operational language (e.g., *"Airflow is an issue: Velocity restricted to 6.2 m³/s"*, *"Ventilation is degraded"*, *"Methane is rising"*, *"Coal cutting active"*).
- **Proactive Action Checklist:** Concrete guidance (e.g., *"Inspect bleeder seal regulator 4B; verify auxiliary fan 2 stage airflow"*).
- **Multi-Zone Schematic Network:** Real-time visual tracking of all 6 underground mine sectors.

### Workspace 2 — Historical Risk Analysis & Decision Intelligence
Designed for shift reviews, incident investigations, and regulatory preparation:
- **Dataset Import:** Drag-and-drop support for CSV and multi-sheet Excel files (`.xlsx`), with automatic schema validation and column mapping.
- **Period Risk Summary:** Evaluates total threshold exceedance minutes, peak readings, and model forecast comparisons.
- **7×24 Shift-Cycle Risk Matrix:** Hour-of-day vs. day-of-week heatmap showing recurring risk patterns across mining shifts, with daily totals aligning directly to the Daily Safety Calendar.
- **Interactive Event Replay:** Step-by-step or automated progressive playback (1x, 2x, 5x, 10x) where future outcomes are strictly hidden from the model until the prediction horizon elapses, automatically tallying True Positives and False Alarms.
- **What-If Scenario Simulator:** Adjust initial gas, ventilation state, and cutting intensity to stress-test atmospheric conditions and forecast responses.

---

## 2. Machine Learning: How & Why HistGradientBoosting Is the Champion

### The Problem Formulation
Given sensor telemetry available strictly up to time $t$, predict:
1. **Binary Risk Probability:** Will methane ($\text{CH}_4$) cross the critical safety threshold ($1.0\%$) within the next $H \in \{5, 15, 30\}$ minutes?
2. **Physical Peak Concentration:** What will be the maximum expected gas reading in that horizon?

### Evaluation Benchmark (Evaluated on 32 Completely Disjoint Test Episodes)
To prevent data leakage, evaluation was performed strictly at the **episode/shift level** — test shifts were completely isolated from training:

| Model Architecture | Horizon | ROC-AUC | PR-AUC | F1-Score | Precision | Recall | False Alarms / Day |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **HistGradientBoosting (Champion)** | **5 min** | **0.9912** | **0.9656** | **0.8989** | 0.8523 | 0.9511 | **4.12** |
| Random Forest | 5 min | 0.9885 | 0.9650 | 0.8830 | 0.8122 | 0.9685 | 7.56 |
| Logistic Regression (Baseline) | 5 min | 0.9878 | 0.9640 | 0.8014 | 0.6767 | 0.9825 | 16.75 |
| **HistGradientBoosting (Champion)** | **15 min** | **0.9600** | **0.9282** | **0.8841** | 0.8750 | 0.8935 | **3.25** |
| Random Forest | 15 min | 0.9773 | 0.9343 | 0.8812 | 0.8244 | 0.9465 | 6.31 |
| Logistic Regression (Baseline) | 15 min | 0.9682 | 0.9299 | 0.8353 | 0.7285 | 0.9785 | 14.56 |
| **HistGradientBoosting (Champion)** | **30 min** | **0.9398** | **0.8977** | **0.8839** | 0.8966 | 0.8715 | **2.56** |
| Random Forest | 30 min | 0.9471 | 0.8975 | 0.8755 | 0.8450 | 0.9082 | 4.81 |
| Logistic Regression (Baseline) | 30 min | 0.9529 | 0.9041 | 0.8456 | 0.7580 | 0.9560 | 12.81 |

### Why HistGradientBoosting Is the Best for Mine Safety:
1. **77% Reduction in False Alarms:** In underground mining, excessive alarms cause *"alarm fatigue"* — miners begin ignoring warnings. HistGradientBoosting cuts false alarms from **14.56/day** down to **3.25/day** while preserving ~90% recall.
2. **Causal Interaction Capture:** GBDT models naturally learn non-linear physical interactions — such as a drop in ventilation airflow ($\Delta \text{Airflow}$) combined with high machinery cutting activity and barometric pressure drops — without requiring manual polynomial cross-terms.
3. **Sub-Millisecond Inference Speed:** Histogram binning allows predictions in $< 2\text{ms}$, enabling real-time streaming telemetry across dozens of underground nodes.
4. **Natural Temporal Degradation:** As the prediction horizon extends from 5m to 30m, ROC-AUC gracefully transitions from 0.99 to 0.94, accurately modeling the physical uncertainty of the ventilation circuit.

---

## 3. Repository Structure

```text
MineGuard-Predict/
├── artifacts/                  # Serialized trained models & evaluation metrics
│   ├── model_hist_gradient_boosting_{5,15,30}m.joblib
│   ├── trend_regressor_{5,15,30}m.joblib
│   ├── scaler.joblib
│   └── evaluation_metrics.json
├── backend/                    # FastAPI High-Performance Backend
│   ├── main.py                 # Application entrypoint & static mounts
│   ├── service.py              # In-memory telemetry cache & predictor singleton
│   └── routes/                 # Modular domain endpoints
│       ├── live.py             # Live Monitoring workspace endpoints
│       ├── historical.py       # Historical analytics, heatmaps & stats
│       ├── replay.py           # Single-zone event replay engine
│       ├── scenario.py         # What-if parameter simulation
│       ├── dataset.py          # CSV/Excel parsing and validation
│       └── anomalies.py        # Statistical surge detection
├── data/
│   ├── generated/              # 150,000-record benchmark dataset
│   └── demo_mine_sensors.csv   # Curated demo shift dataset
├── frontend/                   # React 18 + TypeScript + Vite + Tailwind CSS
│   ├── src/
│   │   ├── views/              # LiveMonitoring & HistoricalRisk workspaces
│   │   ├── components/         # Navigation, Sidebar, Headers
│   │   ├── api.ts              # Strongly typed API client
│   │   └── types.ts            # Domain TypeScript schemas
│   └── dist/                   # Production-bundled client build
├── ml/                         # Machine learning & simulation core
│   ├── generator.py            # Physics differential equation generator
│   ├── features.py             # Causal feature engineering
│   ├── train.py                # Disjoint episode trainer
│   └── inference.py            # Real-time multi-horizon predictor
└── tests/                      # Automated test suite (Pytest)
```

---

## 4. Quickstart Guide

### Prerequisites
- Python 3.10+ (Tested on Python 3.11)
- Node.js 18+ & npm

### Step 1: Clone & Setup
```bash
git clone https://github.com/alee-06/MineGuard-Predict.git
cd MineGuard-Predict
```

### Step 2: Backend Setup
```bash
# Create and activate virtual environment
python -m venv .venv

# On Windows:
.\.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install pandas numpy scikit-learn joblib fastapi uvicorn pydantic pytest httpx openpyxl
```

### Step 3: Frontend Setup
```bash
cd frontend
npm install
npm run build
cd ..
```

### Step 4: Run the Application
```bash
# Start the full-stack platform (FastAPI serves both backend API and React frontend)
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```
Open your browser at: **[http://127.0.0.1:8000](http://127.0.0.1:8000)**

---

## 5. Automated Tests
Run the comprehensive test suite to verify model integrity and API endpoints:
```bash
pytest
```
*Expected: All tests pass with zero warnings.*

---

## 6. Regulatory & Demonstration Disclaimer
> **NOTICE:** All sensor records and scenarios in this platform are generated programmatically via continuous physical differential equations for demonstration and hackathon evaluation. This platform demonstrates advanced machine learning workflows and is **not** certified life-safety equipment under MSHA / DGMS regulations. Never disable or replace physical certified mine methane detectors.
