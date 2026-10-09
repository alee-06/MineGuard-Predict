import React, { useEffect, useState } from 'react';
import { fetchZones } from '../api';
import { ZoneItem } from '../types';
import {
  Layers,
  Wind,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  MapPin,
  ShieldCheck,
  Activity,
  ArrowRight,
  Sliders,
} from 'lucide-react';
import { ViewKey } from '../components/Sidebar';

interface MultiZoneExplorerProps {
  selectedHorizon: number;
  onNavigate?: (view: ViewKey, zoneId?: string) => void;
}

const ZONE_LABELS: Record<string, string> = {
  'ZONE-01-TAILGATE': 'Tailgate Return (Bleeder Junction)',
  'ZONE-02-LONGWALL-FACE': 'Longwall Working Face',
  'ZONE-03-MAINGATE': 'Maingate Fresh Intake',
  'ZONE-04-BLEEDER-SEAL': 'Goaf / Bleeder Seal Area',
  'ZONE-05-DEVELOPMENT-HEADING': 'Rapid Development Heading',
  'ZONE-06-RETURN-AIRWAY': 'Main Return Airway',
};

const FEATURE_FRIENDLY_NAMES: Record<string, string> = {
  methane_slope_5: 'Speed of methane rise (last 5 min)',
  methane_diff_15: 'Change in methane level (last 15 min)',
  airflow_roll_mean_15: 'Average airflow (last 15 min)',
  airflow: 'Current ventilation airflow',
  machine_activity: 'Mining machinery activity level',
  ventilation_is_degraded: 'Ventilation system performance degraded',
  pressure_kpa: 'Barometric atmospheric pressure',
  methane_roll_std_15: 'Methane reading fluctuations',
  temperature_c: 'Ambient mine temperature',
  humidity_pct: 'Relative humidity',
};

export const MultiZoneExplorer: React.FC<MultiZoneExplorerProps> = ({
  selectedHorizon,
  onNavigate,
}) => {
  const [zones, setZones] = useState<ZoneItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  useEffect(() => {
    loadZones();
  }, []);

  const loadZones = async () => {
    try {
      setLoading(true);
      const res = await fetchZones();
      setZones(res.zones);
      if (res.zones.length > 0) {
        setSelectedZoneId(res.zones[0].zone_id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading || zones.length === 0) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-[#878A99] text-xs">
          <div className="w-8 h-8 border-2 border-[#405189] border-t-transparent rounded-full animate-spin" />
          <span>Loading monitored mine areas and airflow circuits...</span>
        </div>
      </div>
    );
  }

  const activeZone = zones.find((z) => z.zone_id === selectedZoneId) || zones[0];
  const activeZoneName = ZONE_LABELS[activeZone.zone_id] || activeZone.zone_id;

  return (
    <div className="space-y-6">
      <div className="p-2 sm:p-4 space-y-6 max-w-7xl mx-auto">
        {/* Schematic Mine Ventilation Layout */}
        <div className="mg-card">
          <div className="mg-card-header">
            <div>
              <h2 className="mg-card-title flex items-center gap-2">
                <MapPin size={16} className="text-[#405189]" />
                Simulated Ventilation Network & Monitored Mine Areas
              </h2>
              <p className="mg-card-sub">
                Conceptual underground longwall ventilation circuit. Click any mine area card to inspect its telemetry and advance predictions.
              </p>
            </div>
            <span className="text-[11px] text-[#405189] bg-[#E8EEF8] px-3 py-1 rounded font-medium border border-[#405189]/20">
              Interactive Network View
            </span>
          </div>

          <div className="mg-card-body space-y-4">
            {/* Airflow directional banner */}
            <div className="flex items-center justify-between p-3 bg-[#F3F6F9] rounded-md border border-[#E9EBEC] text-xs font-medium">
              <span className="text-[#176B87] flex items-center gap-1.5 font-semibold">
                <Wind size={15} /> Fresh Air Intake (Maingate / Bleeder Seals)
              </span>
              <div className="flex items-center gap-2 text-[#878A99] text-[11px] font-mono">
                &rarr; Intake Airflow &rarr; Longwall Face &rarr; Return Airway &rarr;
              </div>
              <span className="text-[#F06548] flex items-center gap-1.5 font-semibold">
                Return Airway & Bleeder Seals (High Susceptibility) <Wind size={15} />
              </span>
            </div>

            {/* Interactive Zone Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {zones.map((z) => {
                const isSelected = z.zone_id === activeZone.zone_id;
                const isCrit = z.risk_category === 'CRITICAL';
                const isElev = z.risk_category === 'ELEVATED';
                const friendlyName = ZONE_LABELS[z.zone_id] || z.zone_id;
                const horizonProb = ((z.predictions[`${selectedHorizon}m`]?.probability ?? 0) * 100).toFixed(0);

                return (
                  <div
                    key={z.zone_id}
                    onClick={() => setSelectedZoneId(z.zone_id)}
                    className={`cursor-pointer rounded-md p-4 border transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-white border-[#405189] shadow-md ring-2 ring-[#405189]/20'
                        : 'bg-white border-[#E9EBEC] hover:border-[#CED4DA] hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-semibold text-xs text-[#343A40] block">
                          {friendlyName}
                        </span>
                        <span className="text-[10px] text-[#878A99] font-mono">
                          {z.zone_id}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                          isCrit
                            ? 'bg-[#FDEEEB] text-[#F06548] border border-[#F06548]/30'
                            : isElev
                            ? 'bg-[#FEF8ED] text-[#F7B84B] border border-[#F7B84B]/30'
                            : 'bg-[#E6F8F5] text-[#0AB39C] border border-[#0AB39C]/30'
                        }`}
                      >
                        {z.risk_category}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between mt-4 pt-3 border-t border-[#E9EBEC]">
                      <div>
                        <span className="text-[10px] text-[#878A99] block font-medium">Current Methane</span>
                        <span className="text-base font-bold text-[#343A40] font-mono">
                          {z.current_methane_pct.toFixed(3)}%
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-[#878A99] block font-medium">{selectedHorizon}m Warning Risk</span>
                        <span className={`text-base font-bold font-mono ${isCrit ? 'text-[#F06548]' : isElev ? 'text-[#F7B84B]' : 'text-[#0AB39C]'}`}>
                          {horizonProb}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selected Area Deep Dive Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Active Zone Snapshot */}
          <div className="lg:col-span-1 mg-card flex flex-col justify-between">
            <div>
              <div className="mg-card-header">
                <div>
                  <span className="text-[10px] text-[#405189] font-semibold uppercase tracking-wider block">
                    Selected Mine Area Details
                  </span>
                  <h3 className="mg-card-title text-sm">{activeZoneName}</h3>
                  <div className="text-[10px] text-[#878A99] font-mono">{activeZone.zone_id}</div>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    activeZone.risk_category === 'CRITICAL'
                      ? 'bg-[#FDEEEB] text-[#F06548] border border-[#F06548]/30'
                      : activeZone.risk_category === 'ELEVATED'
                      ? 'bg-[#FEF8ED] text-[#F7B84B] border border-[#F7B84B]/30'
                      : 'bg-[#E6F8F5] text-[#0AB39C] border border-[#0AB39C]/30'
                  }`}
                >
                  {activeZone.risk_category} RISK
                </span>
              </div>

              <div className="mg-card-body space-y-2.5 text-xs">
                <div className="flex justify-between py-1.5 border-b border-[#E9EBEC]">
                  <span className="text-[#878A99]">Current Methane Reading:</span>
                  <span className="text-[#343A40] font-bold font-mono">{activeZone.current_methane_pct.toFixed(3)}%</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#E9EBEC]">
                  <span className="text-[#878A99]">Ventilation Airflow:</span>
                  <span className="text-[#343A40] font-semibold font-mono">{activeZone.current_airflow.toFixed(1)} m³/s</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#E9EBEC]">
                  <span className="text-[#878A99]">Recent 15-Minute Trend:</span>
                  <span className="text-[#343A40] flex items-center gap-1 font-medium">
                    {activeZone.recent_trend === 'RISING' ? (
                      <ArrowUpRight size={13} className="text-[#F06548]" />
                    ) : activeZone.recent_trend === 'FALLING' ? (
                      <ArrowDownRight size={13} className="text-[#0AB39C]" />
                    ) : (
                      <Minus size={13} className="text-[#878A99]" />
                    )}
                    {activeZone.recent_trend}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#E9EBEC]">
                  <span className="text-[#878A99]">Ventilation System State:</span>
                  <span className={activeZone.ventilation_state === 'DEGRADED' ? 'text-[#F06548] font-bold' : 'text-[#0AB39C] font-bold'}>
                    {activeZone.ventilation_state === 'DEGRADED' ? 'DEGRADED / REDUCED' : 'NORMAL FULL'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#E9EBEC]">
                  <span className="text-[#878A99]">Machine Cutting Level:</span>
                  <span className="text-[#343A40] font-mono font-medium">Level {activeZone.machine_activity}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-[#878A99]">Historical Warning Crossings:</span>
                  <span className="text-[#343A40] font-bold font-mono">{activeZone.historical_events_count} events</span>
                </div>
              </div>
            </div>

            {onNavigate && (
              <div className="p-4 border-t border-[#E9EBEC] bg-[#F3F6F9]">
                <button
                  onClick={() => onNavigate('forecast', activeZone.zone_id)}
                  className="w-full py-2 bg-[#405189] hover:bg-[#364473] text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm"
                >
                  Inspect in Single-Area Console <ArrowRight size={13} />
                </button>
              </div>
            )}
          </div>

          {/* Right: Multi-Horizon Risk & Primary Factors */}
          <div className="lg:col-span-2 mg-card flex flex-col justify-between">
            <div className="mg-card-header">
              <div>
                <h3 className="mg-card-title">
                  Advance Warning Forecasts for {activeZoneName}
                </h3>
                <p className="mg-card-sub">
                  Comparing predicted likelihood across 5, 15, and 30 minute horizons.
                </p>
              </div>
            </div>

            <div className="mg-card-body space-y-5">
              <div className="grid grid-cols-3 gap-3">
                {[5, 15, 30].map((h) => {
                  const p = activeZone.predictions[`${h}m`];
                  const prob = p ? p.probability : 0.05;
                  const peak = p ? p.predicted_peak_methane_pct : activeZone.current_methane_pct;
                  const isHigh = prob >= 0.70;
                  const isMed = prob >= 0.30;
                  return (
                    <div key={h} className="bg-[#F3F6F9] p-3.5 rounded-md border border-[#E9EBEC]">
                      <div className="text-[11px] text-[#878A99] font-medium">Predict {h} Min Ahead</div>
                      <div className={`text-xl font-bold font-mono mt-1 ${isHigh ? 'text-[#F06548]' : isMed ? 'text-[#F7B84B]' : 'text-[#0AB39C]'}`}>
                        {(prob * 100).toFixed(0)}% chance
                      </div>
                      <div className="text-[10px] text-[#878A99] mt-1">
                        Est. Peak: <span className="text-[#343A40] font-mono font-semibold">{peak.toFixed(3)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <h4 className="text-xs font-bold text-[#343A40] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-[#405189]" />
                  Primary Safety Factors for {activeZoneName}
                </h4>
                <div className="space-y-2">
                  {activeZone.contributing_drivers.map((drv, i) => {
                    const isPositive = drv.relative_contribution > 0;
                    const friendlyName = FEATURE_FRIENDLY_NAMES[drv.feature] || drv.feature.replace(/_/g, ' ');
                    return (
                      <div
                        key={i}
                        className="bg-white p-3 rounded-md border border-[#E9EBEC] flex items-center justify-between text-xs hover:border-[#CED4DA] transition-colors"
                      >
                        <div>
                          <span className="font-semibold text-[#343A40]">{friendlyName}</span>
                          <div className="text-[11px] text-[#878A99] mt-0.5">
                            Current value: <strong className="text-[#343A40] font-mono">{drv.value}</strong> &bull; Baseline average: <span className="font-mono">{drv.baseline_mean}</span>
                          </div>
                        </div>
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded ${
                            isPositive ? 'bg-[#FEF8ED] text-[#F7B84B] border border-[#F7B84B]/30' : 'bg-[#E8EEF8] text-[#405189] border border-[#405189]/20'
                          }`}
                        >
                          {isPositive ? '↑ Raising risk' : '↓ Keeping stable'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mg-card-footer">
              <span className="text-[11px] text-[#878A99]">
                Dynamic SHAP-style linear and tree contributions grounded in current atmospheric telemetry.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
