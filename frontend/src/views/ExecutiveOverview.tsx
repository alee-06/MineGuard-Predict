import React, { useEffect, useState } from 'react';
import { fetchOverview, fetchZones } from '../api';
import { OverviewData, ZoneItem, LocalExplanationDriver } from '../types';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  Layers,
  ArrowRight,
  Flame,
  Wind,
  Gauge,
  Clock,
  ShieldCheck,
  Info,
  CheckSquare,
  Activity,
  Sliders,
  ChevronRight,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { ViewKey } from '../components/Sidebar';

interface ExecutiveOverviewProps {
  onNavigate: (view: ViewKey, zoneId?: string) => void;
  selectedHorizon: number;
  onSelectHorizon: (h: number) => void;
}

const ZONE_NAMES: Record<string, string> = {
  'ZONE-01-TAILGATE': 'Tailgate Return (Bleeder Junction)',
  'ZONE-02-LONGWALL-FACE': 'Longwall Working Face',
  'ZONE-03-MAINGATE': 'Maingate Fresh Intake',
  'ZONE-04-BLEEDER-SEAL': 'Goaf / Bleeder Seal Area',
  'ZONE-05-DEVELOPMENT-HEADING': 'Rapid Development Heading',
  'ZONE-06-RETURN-AIRWAY': 'Main Return Airway',
};

const DRIVER_DESCRIPTIONS: Record<string, string> = {
  methane_slope_5: 'Rapid gas rise rate over last 5 minutes',
  methane_diff_15: 'Significant methane increase over last 15 minutes',
  airflow: 'Reduced dilution intake airflow',
  airflow_roll_mean_15: 'Depressed 15-minute average airflow',
  airflow_diff_15: 'Declining ventilation volume',
  machine_activity: 'High coal extraction machinery activity',
  pressure_kpa: 'Falling barometric pressure encouraging gas release',
  ventilation_is_boosted: 'Auxiliary ventilation fan boost active',
  temperature_c: 'Elevated ambient airway temperature',
};

export const ExecutiveOverview: React.FC<ExecutiveOverviewProps> = ({
  onNavigate,
  selectedHorizon,
  onSelectHorizon,
}) => {
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [zones, setZones] = useState<ZoneItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'risk' | 'methane' | 'trend'>('risk');

  useEffect(() => {
    loadOperationalData();
  }, [selectedHorizon]);

  const loadOperationalData = async () => {
    try {
      setLoading(true);
      const [overviewRes, zonesRes] = await Promise.all([
        fetchOverview(selectedHorizon),
        fetchZones(),
      ]);
      setOverviewData(overviewRes);
      setZones(zonesRes.zones);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load operational safety data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-[#878A99] text-xs">
          <div className="w-8 h-8 border-2 border-[#405189] border-t-transparent rounded-full animate-spin" />
          <span>Polling underground mine sensors and computing multi-horizon risk forecasts...</span>
        </div>
      </div>
    );
  }

  if (error || !overviewData) {
    return (
      <div className="p-8">
        <div className="mg-banner mg-banner-danger">
          <AlertTriangle className="mg-banner-icon" />
          <div className="mg-banner-body">
            <div className="mg-banner-title">Operational Data Unavailable</div>
            <div className="mg-banner-text">{error || 'Could not communicate with prediction service.'}</div>
          </div>
        </div>
      </div>
    );
  }

  // Sort zones based on selected user preference
  const sortedZones = [...zones].sort((a, b) => {
    const horizonKey = `${selectedHorizon}m`;
    const probA = a.predictions[horizonKey]?.probability ?? 0;
    const probB = b.predictions[horizonKey]?.probability ?? 0;

    if (sortBy === 'risk') {
      return probB - probA;
    }
    if (sortBy === 'methane') {
      return b.current_methane_pct - a.current_methane_pct;
    }
    if (sortBy === 'trend') {
      return b.slope_15m - a.slope_15m;
    }
    return 0;
  });

  // Identify highest priority area requiring attention
  const priorityZone = sortedZones[0] || null;
  const priorityHorizonKey = `${selectedHorizon}m`;
  const priorityPred = priorityZone ? priorityZone.predictions[priorityHorizonKey] : null;
  const priorityProbPct = priorityPred ? Math.round(priorityPred.probability * 100) : 0;
  const priorityRiskTier = priorityPred ? priorityPred.risk_tier : 'NORMAL';

  // Overall mine status based on highest active risk tier
  const elevatedZonesCount = zones.filter((z) => {
    const prob = z.predictions[priorityHorizonKey]?.probability ?? 0;
    return prob >= 0.30;
  }).length;

  const criticalZonesCount = zones.filter((z) => {
    const prob = z.predictions[priorityHorizonKey]?.probability ?? 0;
    return prob >= 0.70;
  }).length;

  const highestMethaneZone = [...zones].sort((a, b) => b.current_methane_pct - a.current_methane_pct)[0];

  let overallStatus = 'NORMAL';
  let bannerClass = 'mg-banner-success';
  let bannerTitle = 'Atmospheric Safety Status: All Monitored Areas Normal';
  let bannerDesc = `All ${zones.length} underground mine areas currently report gas levels and predicted risks within safe operating limits for the next ${selectedHorizon} minutes.`;

  if (criticalZonesCount > 0) {
    overallStatus = 'CRITICAL';
    bannerClass = 'mg-banner-danger';
    bannerTitle = `Imminent Hazard Warning: Critical Risk Forecast in ${priorityZone?.zone_id}`;
    bannerDesc = `The predictive model indicates a ${priorityProbPct}% statistical likelihood of crossing the 1.0% CH₄ threshold within ${selectedHorizon} minutes in ${priorityZone?.zone_id}. Immediate review recommended.`;
  } else if (elevatedZonesCount > 0) {
    overallStatus = 'ELEVATED';
    bannerClass = 'mg-banner-warning';
    bannerTitle = `Advance Notice: Elevated Gas Risk Predicted in ${priorityZone?.zone_id}`;
    bannerDesc = `Rising methane trends and ventilation fluctuations indicate increased probability (${priorityProbPct}%) of reaching warning levels within ${selectedHorizon} minutes.`;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* 1. Global Operational Status Alert Banner (from OldProj) */}
      <div className={`mg-banner ${bannerClass}`} role="alert">
        {overallStatus === 'CRITICAL' ? (
          <ShieldAlert className="mg-banner-icon animate-pulse" />
        ) : overallStatus === 'ELEVATED' ? (
          <AlertTriangle className="mg-banner-icon" />
        ) : (
          <CheckCircle2 className="mg-banner-icon" />
        )}
        <div className="mg-banner-body">
          <div className="mg-banner-title">{bannerTitle}</div>
          <div className="mg-banner-text">{bannerDesc}</div>
        </div>
        {priorityZone && (overallStatus === 'CRITICAL' || overallStatus === 'ELEVATED') && (
          <button
            onClick={() => onNavigate('forecast', priorityZone.zone_id)}
            className="mg-btn mg-btn-primary mg-btn-sm"
          >
            Inspect {priorityZone.zone_id} Forecast <ArrowRight size={13} />
          </button>
        )}
      </div>

      {/* 2. Priority Alert Panel: The Area Needing Attention First */}
      {priorityZone && (
        <div className="mg-card border-l-4 border-l-[#405189]">
          <div className="mg-card-header bg-[#F8F9FA]/70">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F06548] animate-ping" />
              <div>
                <span className="text-[11px] font-bold tracking-wider uppercase text-[#878A99] block">
                  Priority Action Recommendation • Advance Safety Decision
                </span>
                <h2 className="text-base font-bold text-[#343A40] flex items-center gap-2">
                  Area Requiring Attention First: {ZONE_NAMES[priorityZone.zone_id] || priorityZone.zone_id}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`mg-badge ${
                  priorityRiskTier === 'CRITICAL'
                    ? 'mg-badge-solid-danger animate-pulse'
                    : priorityRiskTier === 'ELEVATED'
                    ? 'mg-badge-warning'
                    : 'mg-badge-success'
                }`}
              >
                {priorityRiskTier} RISK FORECAST ({selectedHorizon}M)
              </span>
              <button
                onClick={() => onNavigate('forecast', priorityZone.zone_id)}
                className="mg-btn mg-btn-primary mg-btn-sm"
              >
                Open Area Forecast Console <ArrowRight size={12} />
              </button>
            </div>
          </div>

          <div className="mg-card-body grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column 1: Current Sensor Telemetry */}
            <div className="space-y-3 lg:border-r lg:border-[#E9EBEC] lg:pr-6">
              <div className="text-[11px] font-semibold text-[#878A99] uppercase tracking-wider flex items-center gap-1.5">
                <Flame size={14} className="text-[#F06548]" />
                1. Current Gas Readings
              </div>
              <div className="bg-[#F8F9FA] rounded-md p-3.5 border border-[#E9EBEC] space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-[#878A99]">Current Methane:</span>
                  <span className="text-2xl font-bold font-mono text-[#343A40]">
                    {priorityZone.current_methane_pct.toFixed(3)}%
                    <span className="text-xs font-normal text-[#878A99] ml-1">CH₄</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-[#E9EBEC]">
                  <span className="text-[#878A99]">Recent Direction:</span>
                  <span
                    className={`font-semibold flex items-center gap-1 ${
                      priorityZone.recent_trend === 'RISING'
                        ? 'text-[#F06548]'
                        : priorityZone.recent_trend === 'FALLING'
                        ? 'text-[#0AB39C]'
                        : 'text-[#495057]'
                    }`}
                  >
                    {priorityZone.recent_trend === 'RISING' && <TrendingUp size={13} />}
                    {priorityZone.recent_trend === 'FALLING' && <TrendingDown size={13} />}
                    {priorityZone.recent_trend === 'STABLE' && <Minus size={13} />}
                    {priorityZone.recent_trend} ({priorityZone.slope_15m > 0 ? '+' : ''}
                    {(priorityZone.slope_15m * 100).toFixed(2)}%/15m)
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-[#E9EBEC]">
                  <span className="text-[#878A99]">Statutory Warning Level:</span>
                  <span className="font-mono font-semibold text-[#495057]">1.000% CH₄</span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-[#E9EBEC]">
                  <span className="text-[#878A99]">Safety Margin:</span>
                  <span
                    className={`font-mono font-bold ${
                      1.0 - priorityZone.current_methane_pct < 0.2 ? 'text-[#F06548]' : 'text-[#0AB39C]'
                    }`}
                  >
                    {(1.0 - priorityZone.current_methane_pct).toFixed(3)}% remaining
                  </span>
                </div>
              </div>
            </div>

            {/* Column 2: What the Model Predicts & Drivers */}
            <div className="space-y-3 lg:border-r lg:border-[#E9EBEC] lg:pr-6">
              <div className="text-[11px] font-semibold text-[#878A99] uppercase tracking-wider flex items-center gap-1.5">
                <Gauge size={14} className="text-[#405189]" />
                2. Model Forecast & Driving Factors
              </div>
              <div className="bg-[#F8F9FA] rounded-md p-3.5 border border-[#E9EBEC] space-y-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-[#878A99]">Warning Crossing Risk:</span>
                  <span className="text-2xl font-bold font-mono text-[#405189]">
                    {priorityProbPct}%
                    <span className="text-xs font-normal text-[#878A99] ml-1">chance</span>
                  </span>
                </div>
                <div className="text-[11px] text-[#495057] leading-relaxed">
                  The model estimates an <strong>{priorityRiskTier.toLowerCase()}</strong> likelihood of crossing the 1.0% warning level within <strong>{selectedHorizon} minutes</strong>.
                </div>
                <div className="pt-2 border-t border-[#E9EBEC] space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#878A99] block">
                    Top Contributing Signals:
                  </span>
                  {priorityZone.contributing_drivers && priorityZone.contributing_drivers.length > 0 ? (
                    priorityZone.contributing_drivers.map((drv, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-[#495057]">
                        <span className="text-[#405189] font-bold">•</span>
                        <span>{DRIVER_DESCRIPTIONS[drv.feature] || drv.feature}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-[#878A99]">Gradual methane rate of change</div>
                  )}
                </div>
              </div>
            </div>

            {/* Column 3: Suggested Preparation & Checks */}
            <div className="space-y-3">
              <div className="text-[11px] font-semibold text-[#878A99] uppercase tracking-wider flex items-center gap-1.5">
                <CheckSquare size={14} className="text-[#0AB39C]" />
                3. Suggested Preparation & Checks
              </div>
              <div className="bg-[#EAF5FB] border border-[#C1E2F5] rounded-md p-3.5 space-y-2">
                <div className="text-xs font-semibold text-[#176B87]">
                  Operational Decision Support:
                </div>
                <ul className="text-xs text-[#343A40] space-y-1.5 list-none pl-0">
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#176B87] mt-1.5 shrink-0" />
                    <span><strong>Check Airflow:</strong> Confirm intake airflow ({priorityZone.current_airflow.toFixed(1)} m³/s) is maintaining dilution velocity.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#176B87] mt-1.5 shrink-0" />
                    <span><strong>Inspect Bleeder Seals:</strong> Review goaf seal pressure differential for potential gas migration.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#176B87] mt-1.5 shrink-0" />
                    <span><strong>Prepare Auxiliary Fan:</strong> Verify ventilation booster readiness if gas continues to rise toward 1.0%.</span>
                  </li>
                </ul>
                <div className="text-[10px] text-[#6C7B88] pt-1 border-t border-[#C1E2F5] italic">
                  Decision support only. Does not trigger equipment or replace certified physical inspections.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Operational Summary KPI Cards Row (from OldProj) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* KPI 1: Monitored Mine Areas */}
        <div className="mg-card">
          <div className="mg-kpi">
            <div className="mg-kpi-top">
              <span className="mg-kpi-label">Monitored Mine Areas</span>
              <span className="mg-badge mg-badge-success">{zones.length} Online</span>
            </div>
            <div className="mg-kpi-main">
              <div>
                <div className="mg-kpi-value mg-num">
                  {zones.length}
                  <span className="mg-kpi-unit">Sectors</span>
                </div>
                <div className="mg-kpi-note">Continuous atmospheric telemetry</div>
              </div>
              <div className="mg-icon-chip mg-chip-primary">
                <Layers className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>

        {/* KPI 2: Priority Areas Requiring Attention */}
        <div className="mg-card">
          <div className="mg-kpi">
            <div className="mg-kpi-top">
              <span className="mg-kpi-label">Areas Requiring Attention</span>
              <span
                className={`mg-badge ${
                  criticalZonesCount > 0
                    ? 'mg-badge-solid-danger'
                    : elevatedZonesCount > 0
                    ? 'mg-badge-warning'
                    : 'mg-badge-success'
                }`}
              >
                {elevatedZonesCount} Flagged
              </span>
            </div>
            <div className="mg-kpi-main">
              <div>
                <div className="mg-kpi-value mg-num">
                  {elevatedZonesCount}
                  <span className="mg-kpi-unit">of {zones.length}</span>
                </div>
                <div className="mg-kpi-note">
                  {criticalZonesCount > 0
                    ? `${criticalZonesCount} critical risk forecast`
                    : elevatedZonesCount > 0
                    ? `${elevatedZonesCount} elevated risk forecast`
                    : 'All sectors currently normal'}
                </div>
              </div>
              <div
                className={`mg-icon-chip ${
                  criticalZonesCount > 0
                    ? 'mg-chip-danger'
                    : elevatedZonesCount > 0
                    ? 'mg-chip-warning'
                    : 'mg-chip-success'
                }`}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>

        {/* KPI 3: Highest Active Gas Reading */}
        <div className="mg-card">
          <div className="mg-kpi">
            <div className="mg-kpi-top">
              <span className="mg-kpi-label">Highest Active Methane</span>
              <span className="mg-badge mg-badge-info font-mono">1.0% Cutoff</span>
            </div>
            <div className="mg-kpi-main">
              <div>
                <div className="mg-kpi-value mg-num">
                  {highestMethaneZone ? highestMethaneZone.current_methane_pct.toFixed(3) : '0.000'}%
                  <span className="mg-kpi-unit">CH₄</span>
                </div>
                <div className="mg-kpi-note truncate max-w-[170px]" title={highestMethaneZone?.zone_id}>
                  {highestMethaneZone ? ZONE_NAMES[highestMethaneZone.zone_id] || highestMethaneZone.zone_id : 'N/A'}
                </div>
              </div>
              <div className="mg-icon-chip mg-chip-warning">
                <Flame className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>

        {/* KPI 4: Prediction Model Status */}
        <div className="mg-card">
          <div className="mg-kpi">
            <div className="mg-kpi-top">
              <span className="mg-kpi-label">Forecast Engine</span>
              <span className="mg-badge mg-badge-success">Ready</span>
            </div>
            <div className="mg-kpi-main">
              <div>
                <div className="mg-kpi-value text-base font-semibold text-[#343A40]">
                  HistGradientBoosting
                </div>
                <div className="mg-kpi-note flex items-center gap-1.5 mt-0.5">
                  <button
                    onClick={() => onNavigate('benchmark')}
                    className="text-[#405189] hover:underline font-semibold text-xs flex items-center gap-0.5"
                  >
                    Model Performance & Audit <ChevronRight size={11} />
                  </button>
                </div>
              </div>
              <div className="mg-icon-chip mg-chip-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Primary Interactive Panel: Mine Areas Requiring Attention */}
      <div className="mg-card">
        <div className="mg-card-header">
          <div>
            <h2 className="mg-card-title flex items-center gap-2">
              <Layers size={16} className="text-[#405189]" />
              Mine Areas Requiring Attention
            </h2>
            <p className="mg-card-sub">
              Operational gas telemetry and model risk estimates across all underground monitoring sectors.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-[#878A99] font-medium">Sort by:</span>
            <div className="mg-segment">
              <button
                onClick={() => setSortBy('risk')}
                className={sortBy === 'risk' ? 'is-active' : ''}
              >
                Predicted Risk
              </button>
              <button
                onClick={() => setSortBy('methane')}
                className={sortBy === 'methane' ? 'is-active' : ''}
              >
                Gas Level
              </button>
              <button
                onClick={() => setSortBy('trend')}
                className={sortBy === 'trend' ? 'is-active' : ''}
              >
                Rise Rate
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#F3F6F9] text-[#495057] font-semibold border-b border-[#E9EBEC]">
                <th className="py-3 px-4">Mine Area & Sector</th>
                <th className="py-3 px-3 text-right">Latest Reading</th>
                <th className="py-3 px-3">Recent Gas Trend</th>
                <th className="py-3 px-3 text-right">
                  Predicted Risk ({selectedHorizon}m ahead)
                </th>
                <th className="py-3 px-3">Risk Trajectory</th>
                <th className="py-3 px-4">Primary Contributing Factor</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9EBEC] text-[#495057]">
              {sortedZones.map((zone) => {
                const pred5 = zone.predictions['5m']?.probability ?? 0;
                const pred15 = zone.predictions['15m']?.probability ?? 0;
                const pred30 = zone.predictions['30m']?.probability ?? 0;
                const currentPredVal = zone.predictions[`${selectedHorizon}m`]?.probability ?? 0;
                const currentTier = zone.predictions[`${selectedHorizon}m`]?.risk_tier ?? 'NORMAL';
                const mainDriver = zone.contributing_drivers?.[0]?.feature;

                // Trajectory between 5m and 30m
                const trajectory = pred30 > pred5 + 0.05 ? 'RISING' : pred30 < pred5 - 0.05 ? 'FALLING' : 'STABLE';

                return (
                  <tr
                    key={zone.zone_id}
                    className="hover:bg-[#F8F9FA] transition-colors cursor-pointer"
                    onClick={() => onNavigate('forecast', zone.zone_id)}
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-[#343A40]">
                        {ZONE_NAMES[zone.zone_id] || zone.zone_id}
                      </div>
                      <div className="text-[10px] text-[#878A99] font-mono">
                        {zone.zone_id} • Flow: {zone.current_airflow.toFixed(1)} m³/s
                      </div>
                    </td>

                    <td className="py-3.5 px-3 text-right">
                      <span
                        className={`font-mono font-bold text-sm ${
                          zone.current_methane_pct >= 1.0
                            ? 'text-[#F06548]'
                            : zone.current_methane_pct >= 0.7
                            ? 'text-[#F7B84B]'
                            : 'text-[#343A40]'
                        }`}
                      >
                        {zone.current_methane_pct.toFixed(3)}%
                      </span>
                      <span className="text-[10px] text-[#878A99] block">CH₄ in air</span>
                    </td>

                    <td className="py-3.5 px-3">
                      <div
                        className={`inline-flex items-center gap-1 font-semibold text-xs ${
                          zone.recent_trend === 'RISING'
                            ? 'text-[#F06548]'
                            : zone.recent_trend === 'FALLING'
                            ? 'text-[#0AB39C]'
                            : 'text-[#495057]'
                        }`}
                      >
                        {zone.recent_trend === 'RISING' && <TrendingUp size={13} />}
                        {zone.recent_trend === 'FALLING' && <TrendingDown size={13} />}
                        {zone.recent_trend === 'STABLE' && <Minus size={13} />}
                        <span>{zone.recent_trend}</span>
                      </div>
                      <span className="text-[10px] text-[#878A99] block font-mono">
                        {zone.slope_15m > 0 ? '+' : ''}{(zone.slope_15m * 100).toFixed(2)}%/15m
                      </span>
                    </td>

                    <td className="py-3.5 px-3 text-right">
                      <span
                        className={`mg-badge ${
                          currentTier === 'CRITICAL'
                            ? 'mg-badge-solid-danger'
                            : currentTier === 'ELEVATED'
                            ? 'mg-badge-warning'
                            : 'mg-badge-success'
                        }`}
                      >
                        {Math.round(currentPredVal * 100)}% RISK
                      </span>
                      <span className="text-[10px] text-[#878A99] block font-mono mt-0.5">
                        {currentTier} TIER
                      </span>
                    </td>

                    <td className="py-3.5 px-3">
                      <span
                        className={`text-xs font-semibold ${
                          trajectory === 'RISING'
                            ? 'text-[#F06548]'
                            : trajectory === 'FALLING'
                            ? 'text-[#0AB39C]'
                            : 'text-[#878A99]'
                        }`}
                      >
                        {trajectory === 'RISING' ? 'Risk Increasing' : trajectory === 'FALLING' ? 'Risk Decreasing' : 'Risk Stable'}
                      </span>
                      <div className="flex items-center gap-1 text-[10px] text-[#878A99] font-mono mt-0.5">
                        <span>5m: {Math.round(pred5 * 100)}%</span>
                        <span>&rarr;</span>
                        <span>30m: {Math.round(pred30 * 100)}%</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="text-xs text-[#495057]">
                        {DRIVER_DESCRIPTIONS[mainDriver || ''] || mainDriver || 'Normal dilution airflow'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate('forecast', zone.zone_id);
                        }}
                        className="mg-btn mg-btn-soft mg-btn-sm"
                      >
                        Inspect Forecast <ArrowRight size={11} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Upcoming Risk Timeline Comparison Matrix */}
      <div className="mg-card">
        <div className="mg-card-header">
          <div>
            <h2 className="mg-card-title flex items-center gap-2">
              <Clock size={16} className="text-[#405189]" />
              Upcoming Risk Timeline (5m vs 15m vs 30m Comparison)
            </h2>
            <p className="mg-card-sub">
              Compare how model-estimated threshold crossing risk develops over time to prepare before physical alarms trigger.
            </p>
          </div>
          <span className="text-[11px] text-[#878A99] bg-[#F3F3F9] px-2.5 py-1 rounded border border-[#E9EBEC]">
            Reference Level: 1.0% CH₄
          </span>
        </div>

        <div className="mg-card-body">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {zones.map((zone) => {
              const p5 = Math.round((zone.predictions['5m']?.probability ?? 0) * 100);
              const p15 = Math.round((zone.predictions['15m']?.probability ?? 0) * 100);
              const p30 = Math.round((zone.predictions['30m']?.probability ?? 0) * 100);

              const maxRisk = Math.max(p5, p15, p30);
              const isFlagged = maxRisk >= 30;

              return (
                <div
                  key={zone.zone_id}
                  onClick={() => onNavigate('forecast', zone.zone_id)}
                  className={`p-3.5 rounded-md border transition-all cursor-pointer ${
                    isFlagged
                      ? 'bg-[#FEF8ED]/40 border-[#FDE8BE] hover:border-[#F7B84B]'
                      : 'bg-[#F8F9FA] border-[#E9EBEC] hover:border-[#CBD5E1]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-xs text-[#343A40] truncate max-w-[180px]" title={ZONE_NAMES[zone.zone_id]}>
                      {ZONE_NAMES[zone.zone_id] || zone.zone_id}
                    </span>
                    <span className="text-[10px] font-mono text-[#878A99]">
                      {zone.current_methane_pct.toFixed(2)}% CH₄
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="bg-white p-2 rounded border border-[#E9EBEC]">
                      <span className="text-[10px] text-[#878A99] block">5 min</span>
                      <span
                        className={`text-sm font-bold font-mono ${
                          p5 >= 70 ? 'text-[#F06548]' : p5 >= 30 ? 'text-[#F7B84B]' : 'text-[#0AB39C]'
                        }`}
                      >
                        {p5}%
                      </span>
                    </div>

                    <div className="bg-white p-2 rounded border border-[#E9EBEC]">
                      <span className="text-[10px] text-[#878A99] block">15 min</span>
                      <span
                        className={`text-sm font-bold font-mono ${
                          p15 >= 70 ? 'text-[#F06548]' : p15 >= 30 ? 'text-[#F7B84B]' : 'text-[#0AB39C]'
                        }`}
                      >
                        {p15}%
                      </span>
                    </div>

                    <div className="bg-white p-2 rounded border border-[#E9EBEC]">
                      <span className="text-[10px] text-[#878A99] block">30 min</span>
                      <span
                        className={`text-sm font-bold font-mono ${
                          p30 >= 70 ? 'text-[#F06548]' : p30 >= 30 ? 'text-[#F7B84B]' : 'text-[#0AB39C]'
                        }`}
                      >
                        {p30}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-[#E9EBEC] flex items-center justify-between text-[11px] text-[#878A99]">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#0AB39C]" /> Normal Risk (&lt; 30%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#F7B84B]" /> Elevated Warning (30% - 70%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#F06548]" /> Critical Hazard (≥ 70%)
              </span>
            </div>
            <span className="italic">
              Sensor readings reflect simulated time t. Forecasts indicate future window threshold probability.
            </span>
          </div>
        </div>
      </div>

      {/* 6. Suggested Preparation and Checks Panel (Rule-Based Decision Support) */}
      <div className="mg-card">
        <div className="mg-card-header">
          <div>
            <h2 className="mg-card-title flex items-center gap-2">
              <CheckSquare size={16} className="text-[#0AB39C]" />
              Operational Preparation & Safety Checklists
            </h2>
            <p className="mg-card-sub">
              Recommended administrative checks based on current sensor patterns and model indicators.
            </p>
          </div>
        </div>

        <div className="mg-card-body grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#F8F9FA] p-4 rounded-md border border-[#E9EBEC] space-y-2">
            <span className="text-xs font-bold text-[#F06548] flex items-center gap-1.5">
              <TrendingUp size={14} /> Pattern A: Rising Methane
            </span>
            <p className="text-xs text-[#495057] leading-relaxed">
              When gas reading slopes exceed +0.01%/min:
            </p>
            <ul className="text-xs text-[#495057] space-y-1 pl-4 list-disc">
              <li>Inspect working face shearer extraction rate.</li>
              <li>Verify tailgate bleeder junction airflow.</li>
              <li>Confirm return airway sensors are reading consistently.</li>
            </ul>
          </div>

          <div className="bg-[#F8F9FA] p-4 rounded-md border border-[#E9EBEC] space-y-2">
            <span className="text-xs font-bold text-[#F7B84B] flex items-center gap-1.5">
              <Wind size={14} /> Pattern B: Falling Ventilation
            </span>
            <p className="text-xs text-[#495057] leading-relaxed">
              When airway volume drops below 20 m³/s:
            </p>
            <ul className="text-xs text-[#495057] space-y-1 pl-4 list-disc">
              <li>Inspect intake regulator doors for blockages.</li>
              <li>Check auxiliary fan motor status and circuit.</li>
              <li>Verify brattice curtains in rapid development heading.</li>
            </ul>
          </div>

          <div className="bg-[#F8F9FA] p-4 rounded-md border border-[#E9EBEC] space-y-2">
            <span className="text-xs font-bold text-[#176B87] flex items-center gap-1.5">
              <AlertCircle size={14} /> Pattern C: Early Model Pre-Warning
            </span>
            <p className="text-xs text-[#495057] leading-relaxed">
              When current gas is safe but 15m/30m forecast is elevated:
            </p>
            <ul className="text-xs text-[#495057] space-y-1 pl-4 list-disc">
              <li>Model detects atmospheric pressure and slope precursors.</li>
              <li>Notify sector safety supervisor for advance sweep.</li>
              <li>Prepare auxiliary ventilation before gas reaches 1.0%.</li>
            </ul>
          </div>

          <div className="bg-[#F8F9FA] p-4 rounded-md border border-[#E9EBEC] space-y-2">
            <span className="text-xs font-bold text-[#0AB39C] flex items-center gap-1.5">
              <ShieldCheck size={14} /> Pattern D: Normal Safe Operations
            </span>
            <p className="text-xs text-[#495057] leading-relaxed">
              When readings are stable and forecast risks are &lt; 30%:
            </p>
            <ul className="text-xs text-[#495057] space-y-1 pl-4 list-disc">
              <li>Maintain standard shift ventilation monitoring.</li>
              <li>Log scheduled shift environmental checks.</li>
              <li>Keep automated gas intelligence polling active.</li>
            </ul>
          </div>
        </div>

        <div className="mg-card-footer bg-[#F8F9FA]/50 text-[11px] text-[#878A99]">
          <span>
            <strong>Administrative Notice:</strong> These checklists represent decision-support guidance for advance preparation. They do not substitute for certified statutory equipment.
          </span>
          <span className="font-mono">MineGuard Decision Protocol v1.0</span>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveOverview;
