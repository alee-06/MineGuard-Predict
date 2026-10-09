"""
MineGuard Predict - FastAPI Backend Server.
Integrates all domain routers, data services, and provides health checks and CORS.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from backend.routes.anomalies import router as anomalies_router
from backend.routes.benchmark import router as benchmark_router
from backend.routes.dataset import router as dataset_router
from backend.routes.forecast import router as forecast_router
from backend.routes.overview import router as overview_router
from backend.routes.replay import router as replay_router
from backend.routes.reports import router as reports_router
from backend.routes.scenario import router as scenario_router
from backend.routes.temporal import router as temporal_router
from backend.routes.zones import router as zones_router
from backend.routes.historical import router as historical_router
from backend.routes.live import router as live_router
from backend.service import get_service

app = FastAPI(
    title="MineGuard Predict API",
    description="AI-Powered Underground Coal Mine Gas-Risk Intelligence Platform",
    version="1.0.0",
)

# Enable CORS for Vite frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all route modules
app.include_router(live_router)
app.include_router(historical_router)
app.include_router(overview_router)
app.include_router(forecast_router)
app.include_router(replay_router)
app.include_router(temporal_router)
app.include_router(zones_router)
app.include_router(anomalies_router)
app.include_router(benchmark_router)
app.include_router(scenario_router)
app.include_router(dataset_router)
app.include_router(reports_router)


@app.on_event("startup")
def startup_event():
    print("Initializing MineGuard Predict Data and Inference Service...")
    srv = get_service()
    if srv.df is not None:
        print(f"Loaded {len(srv.df)} records across {srv.df['episode_id'].nunique()} episodes.")
    if srv.predictor is not None:
        print("ML Models ready for inference.")


@app.get("/api/health")
def health_check():
    srv = get_service()
    return {
        "status": "HEALTHY",
        "dataset_loaded": srv.df is not None,
        "models_loaded": srv.predictor is not None,
        "total_records": len(srv.df) if srv.df is not None else 0,
        "disclaimer": "SIMULATED / SYNTHETIC DATA ENGINE ONLY",
    }


# Optional: Mount frontend static distribution if built
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
