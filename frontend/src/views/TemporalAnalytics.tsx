import React, { useEffect, useState } from 'react';
import { fetchTemporalAnalytics } from '../api';
import { TemporalAnalyticsData } from '../types';
import {
  CalendarClock,
  Layers,
  BarChart3,
  Clock,
  Activity,
  Filter,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from 'recharts';

const ZONE_LABELS: Record<string, string> = {
  ALL: 'All Mine Areas (Combined Network)',
  'ZONE-01-TAILGATE': 'Tailgate Return (Bleeder Junction)',
  'ZONE-02-LONGWALL-FACE': 'Longwall Working Face',
  'ZONE-03-MAINGATE': 'Maingate Fresh Intake',
  'ZONE-04-BLEEDER-SEAL': 'Goaf / Bleeder Seal Area',
  'ZONE-05-DEVELOPMENT-HEADING': 'Rapid Development Heading',
  'ZONE-06-RETURN-AIRWAY': 'Main Return Airway',
};

const SCENARIO_LABELS: Record<string, string> = {
  GRADUAL_GAS_BUILDUP: 'Gradual Gas Buildup',
  SUDDEN_OUTBURST_SURGE: 'Sudden Gas Surge',
  DEGRADED_VENTILATION: 'Degraded Ventilation',
  NORMAL_BASELINE: 'Normal Safe Operation',
  VENTILATION_RECOVERY: 'Ventilation Restored',
  MACHINE_ACTIVITY_SURGE: 'High Machine Activity',
  SENSOR_ANOMALY: 'Sensor Irregularity',
};

export const TemporalAnalytics: React.FC = () => {
  const [data, setData] = useState<TemporalAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedZone, setSelectedZone] = useState<string>('ALL');

  useEffect(() => {
    loadAnalytics();
  }, [selectedZone]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const res = await fetchTemporalAnalytics(selectedZone);
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-[#878A99] text-xs">
          <div className="w-8 h-8 border-2 border-[#405189] border-t-transparent rounded-full animate-spin" />
          <span>Analyzing historical shifts and recurring gas patterns...</span>
        </div>
      </div>
    );
  }

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const getCell = (dIdx: number, h: number) => {
    return data.heatmap.find((c) => c.day_idx === dIdx && c.hour === h);
  };

  return (
    <div className="space-y-6">
      <div className="p-2 sm:p-4 space-y-6 max-w-7xl mx-auto">
        {/* Historical Advisory Banner */}
        <div className="p-4 bg-[#E8EEF8] border border-[#405189]/20 rounded-md flex items-start gap-3 text-xs text-[#405189]">
          <Info size={18} className="text-[#405189] shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold">Shift Planning Insight:</strong> These charts illustrate historical sensor trends and shift-level accumulation patterns across the simulated dataset. Past patterns are useful for maintenance planning, but do not replace real-time predictive monitoring.
          </div>
        </div>

        {/* Filters Bar */}
        <div className="mg-card">
          <div className="mg-card-body flex flex-wrap items-center justify-between gap-4 py-3">
            <div className="flex items-center gap-3 text-xs">
              <Filter size={15} className="text-[#405189]" />
              <span className="text-[#495057] font-semibold">Filter by Mine Area:</span>
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="bg-white border border-[#E9EBEC] text-[#343A40] text-xs rounded px-3 py-1.5 focus:outline-none focus:border-[#405189] font-medium shadow-sm"
              >
                {Object.entries(ZONE_LABELS).map(([zid, label]) => (
                  <option key={zid} value={zid}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-xs text-[#878A99]">
              Simulated Records Analyzed: <strong className="text-[#343A40] font-mono">{data.total_analyzed_records.toLocaleString()}</strong>
            </div>
          </div>
        </div>

        {/* Shift & Hour-of-Day Risk Heatmap */}
        <div className="mg-card">
          <div className="mg-card-header">
            <div>
              <h2 className="mg-card-title flex items-center gap-2">
                <CalendarClock size={16} className="text-[#405189]" />
                Warning Level Frequency by Shift & Hour of Day
              </h2>
              <p className="mg-card-sub">
                Percentage of time that methane was at or above the 1.0% warning level during each hour of the week.
              </p>
            </div>
          </div>

          <div className="mg-card-body space-y-4">
            {/* Heatmap Grid */}
            <div className="overflow-x-auto pb-2">
              <div className="min-w-[720px]">
                {/* Hour header */}
                <div className="grid grid-cols-[88px_repeat(24,1fr)] gap-1 text-[10px] text-[#878A99] font-mono text-center mb-1.5">
                  <span className="text-left font-sans font-semibold text-[#495057]">Shift Day</span>
                  {hours.map((h) => (
                    <span key={h}>{h < 10 ? `0${h}` : h}h</span>
                  ))}
                </div>

                {/* Day rows */}
                {days.map((dayName, dIdx) => (
                  <div key={dayName} className="grid grid-cols-[88px_repeat(24,1fr)] gap-1 items-center mb-1 text-xs">
                    <span className="font-semibold text-[#495057] text-[11px] truncate">{dayName}</span>
                    {hours.map((h) => {
                      const cell = getCell(dIdx, h);
                      const rate = cell?.event_rate || 0;
                      let bg = 'bg-[#F3F6F9] text-[#878A99] border border-[#E9EBEC]';
                      if (rate > 10) {
                        bg = 'bg-[#F06548] text-white font-bold border border-[#F06548]';
                      } else if (rate > 5) {
                        bg = 'bg-[#FDEEEB] text-[#F06548] font-semibold border border-[#F06548]/30';
                      } else if (rate > 2) {
                        bg = 'bg-[#FEF8ED] text-[#F7B84B] font-medium border border-[#F7B84B]/30';
                      } else if (rate > 0.5) {
                        bg = 'bg-[#FEF8ED]/70 text-[#F7B84B] border border-[#F7B84B]/20';
                      } else if (rate > 0) {
                        bg = 'bg-[#E8EEF8] text-[#405189] border border-[#405189]/20';
                      }

                      return (
                        <div
                          key={h}
                          title={`${dayName} at ${h}:00 — Warning rate: ${rate.toFixed(1)}% of time (Avg Methane: ${cell?.avg_methane}%)`}
                          className={`h-7 rounded flex items-center justify-center text-[9px] font-mono transition-transform hover:scale-105 cursor-pointer ${bg}`}
                        >
                          {rate > 0 ? `${rate.toFixed(0)}%` : '·'}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Heatmap Legend */}
            <div className="flex items-center justify-end gap-3 text-[11px] text-[#878A99] pt-3 border-t border-[#E9EBEC]">
              <span>Time at or above 1.0% warning level:</span>
              <div className="flex items-center gap-1.5 font-medium">
                <span className="w-3 h-3 rounded bg-[#F3F6F9] inline-block border border-[#E9EBEC]" />
                <span>0%</span>
                <span className="w-3 h-3 rounded bg-[#E8EEF8] inline-block border border-[#405189]/20 ml-1.5" />
                <span>0-0.5%</span>
                <span className="w-3 h-3 rounded bg-[#FEF8ED] inline-block border border-[#F7B84B]/30 ml-1.5" />
                <span>0.5-5%</span>
                <span className="w-3 h-3 rounded bg-[#FDEEEB] inline-block border border-[#F06548]/30 ml-1.5" />
                <span>5-10%</span>
                <span className="w-3 h-3 rounded bg-[#F06548] inline-block ml-1.5" />
                <span className="text-[#F06548] font-bold">&gt;10%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Grid: Concentration Distribution & Duration Profile */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Methane Concentration Distribution */}
          <div className="mg-card">
            <div className="mg-card-header">
              <div>
                <h3 className="mg-card-title flex items-center gap-2">
                  <BarChart3 size={15} className="text-[#405189]" />
                  How Methane Readings Are Distributed
                </h3>
                <p className="mg-card-sub">
                  Most mine air readings remain safely below 0.5%, with occasional elevated levels above 1.0%.
                </p>
              </div>
            </div>

            <div className="mg-card-body">
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.concentration_distribution} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E9EBEC" />
                    <XAxis dataKey="bin" stroke="#878A99" fontSize={10} tickLine={false} />
                    <YAxis stroke="#878A99" fontSize={10} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E9EBEC',
                        borderRadius: '6px',
                        fontSize: '11px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      }}
                    />
                    <Bar dataKey="count" name="Sensor Readings" radius={[4, 4, 0, 0]}>
                      {data.concentration_distribution.map((entry, index) => {
                        const isHazard = entry.bin.includes('1.') || entry.bin.includes('>2');
                        return (
                          <Cell
                            key={`cell-${index}`}
                            fill={isHazard ? '#F06548' : '#405189'}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Event Duration Distribution */}
          <div className="mg-card">
            <div className="mg-card-header">
              <div>
                <h3 className="mg-card-title flex items-center gap-2">
                  <Clock size={15} className="text-[#F7B84B]" />
                  How Long Do High-Gas Conditions Last?
                </h3>
                <p className="mg-card-sub">
                  Continuous duration (minutes) methane remained above 1.0% before ventilation cleared the buildup.
                </p>
              </div>
            </div>

            <div className="mg-card-body">
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.duration_distribution} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E9EBEC" />
                    <XAxis dataKey="duration_range" stroke="#878A99" fontSize={10} tickLine={false} />
                    <YAxis stroke="#878A99" fontSize={10} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E9EBEC',
                        borderRadius: '6px',
                        fontSize: '11px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      }}
                    />
                    <Bar dataKey="count" name="Occurrences" fill="#176B87" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
