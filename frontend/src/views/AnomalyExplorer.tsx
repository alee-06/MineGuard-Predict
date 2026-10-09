import React, { useEffect, useState } from 'react';
import { fetchAnomalyEvents, fetchEventInspection } from '../api';
import { AnomalyEventItem, PredictionResponse } from '../types';
import {
  AlertTriangle,
  Wind,
  Activity,
  Flame,
  Search,
  ArrowRight,
  Clock,
  Gauge,
  X,
  ExternalLink,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';

const ZONE_LABELS: Record<string, string> = {
  'ZONE-01-TAILGATE': 'Tailgate Return (Bleeder Junction)',
  'ZONE-02-LONGWALL-FACE': 'Longwall Working Face',
  'ZONE-03-MAINGATE': 'Maingate Fresh Intake',
  'ZONE-04-BLEEDER-SEAL': 'Goaf / Bleeder Seal Area',
  'ZONE-05-DEVELOPMENT-HEADING': 'Rapid Development Heading',
  'ZONE-06-RETURN-AIRWAY': 'Main Return Airway',
};

const CATEGORY_LABELS: Record<string, string> = {
  ALL: 'All Flagged Events',
  SUDDEN_GAS_SURGE: 'Sudden Gas Surge',
  ABRUPT_AIRFLOW_DROP: 'Sudden Airflow Drop',
  HIGH_ACTIVITY_REDUCED_VENT: 'High Activity with Reduced Airflow',
  IRREGULAR_SENSOR_READINGS: 'Unusual Sensor Readings',
  EXTENDED_ELEVATED_METHANE: 'Prolonged Elevated Methane',
};

export const AnomalyExplorer: React.FC = () => {
  const [events, setEvents] = useState<AnomalyEventItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);

  // Inspector modal state
  const [inspectEvent, setInspectEvent] = useState<AnomalyEventItem | null>(null);
  const [inspectData, setInspectData] = useState<{
    series: any[];
    forecast_at_trigger: PredictionResponse | null;
  } | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  useEffect(() => {
    loadEvents();
  }, [selectedCategory]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const res = await fetchAnomalyEvents(selectedCategory);
      setEvents(res.events);
      setCategories(res.categories);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenInspector = async (evt: AnomalyEventItem) => {
    setInspectEvent(evt);
    setInspectLoading(true);
    try {
      const res = await fetchEventInspection(evt.episode_id, evt.step_index);
      setInspectData({
        series: res.series,
        forecast_at_trigger: res.forecast_at_trigger,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setInspectLoading(false);
    }
  };

  const handleCloseInspector = () => {
    setInspectEvent(null);
    setInspectData(null);
  };

  return (
    <div className="space-y-6">
      <div className="p-2 sm:p-4 space-y-6 max-w-7xl mx-auto">
        {/* Category Pills & Stats Bar */}
        <div className="mg-card">
          <div className="mg-card-body flex flex-wrap items-center justify-between gap-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {categories.map((cat) => {
                const label = CATEGORY_LABELS[cat] || cat.replace(/_/g, ' ');
                const isActive = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-[#405189] text-white shadow-sm'
                        : 'bg-[#F3F6F9] text-[#495057] hover:bg-[#E9EBEC] border border-[#E9EBEC]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="text-xs text-[#878A99]">
              Flagged Incidents: <strong className="text-[#343A40] font-mono">{events.length}</strong>
            </div>
          </div>
        </div>

        {/* Events List Table */}
        <div className="mg-card">
          <div className="mg-card-header">
            <div>
              <h2 className="mg-card-title">Flagged Atmospheric Irregularities Log</h2>
              <p className="mg-card-sub">
                Rule-based and heuristic detections of rapid methane surges, ventilation drops, and anomalous sensor patterns.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E9EBEC] text-[#878A99] font-semibold bg-[#F3F6F9]">
                  <th className="py-2.5 px-3">Event ID</th>
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">Mine Area</th>
                  <th className="py-2.5 px-3">Simulated Date & Time</th>
                  <th className="py-2.5 px-3 text-right">Rate of Increase</th>
                  <th className="py-2.5 px-3 text-right">Peak Value</th>
                  <th className="py-2.5 px-3 text-right">Duration</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9EBEC] font-sans">
                {events.map((evt) => {
                  const isSurge = evt.category === 'SUDDEN_GAS_SURGE';
                  const isAirflow = evt.category === 'ABRUPT_AIRFLOW_DROP';
                  const friendlyCat = CATEGORY_LABELS[evt.category] || evt.category.replace(/_/g, ' ');
                  const zoneName = ZONE_LABELS[evt.zone_id] || evt.zone_id;

                  return (
                    <tr key={evt.event_id} className="hover:bg-[#F3F6F9] transition-colors">
                      <td className="py-3 px-3 font-semibold text-[#405189] font-mono">{evt.event_id}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            isSurge
                              ? 'bg-[#FDEEEB] text-[#F06548] border border-[#F06548]/30'
                              : isAirflow
                              ? 'bg-[#FEF8ED] text-[#F7B84B] border border-[#F7B84B]/30'
                              : 'bg-[#E8EEF8] text-[#405189] border border-[#405189]/20'
                          }`}
                        >
                          {friendlyCat}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[#343A40]">
                        <div className="font-medium">{zoneName}</div>
                        <div className="text-[10px] text-[#878A99] font-mono">{evt.zone_id}</div>
                      </td>
                      <td className="py-3 px-3 text-[#878A99] font-mono">{evt.timestamp}</td>
                      <td className="py-3 px-3 text-right text-[#343A40] font-mono">
                        +{evt.rate_of_increase_pct_min.toFixed(3)}%/min
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-[#343A40] font-mono">
                        {evt.peak_value.toFixed(2)}
                        {isAirflow ? ' m³/s' : '%'}
                      </td>
                      <td className="py-3 px-3 text-right text-[#878A99] font-mono">{evt.duration_minutes} min</td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleOpenInspector(evt)}
                          className="px-2.5 py-1 bg-white hover:bg-[#F3F6F9] border border-[#E9EBEC] text-[#405189] rounded text-[11px] font-semibold inline-flex items-center gap-1 transition-all shadow-sm"
                        >
                          Inspect <ExternalLink size={11} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Interactive Event Inspector Modal */}
        {inspectEvent && (
          <div className="fixed inset-0 bg-[#000000]/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-[#E9EBEC] rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#E9EBEC] pb-4">
                <div>
                  <span className="text-[10px] text-[#405189] font-semibold uppercase tracking-wider block">
                    {CATEGORY_LABELS[inspectEvent.category] || inspectEvent.category} &bull; {inspectEvent.episode_id}
                  </span>
                  <h3 className="text-base font-bold text-[#343A40] tracking-tight flex items-center gap-2">
                    Event Investigation: {inspectEvent.event_id}
                  </h3>
                </div>
                <button
                  onClick={handleCloseInspector}
                  className="w-8 h-8 rounded bg-[#F3F6F9] hover:bg-[#E9EBEC] text-[#878A99] hover:text-[#343A40] flex items-center justify-center transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="text-xs text-[#495057] bg-[#F3F6F9] p-3.5 rounded border border-[#E9EBEC] leading-relaxed">
                {inspectEvent.description}
              </div>

              {inspectLoading || !inspectData ? (
                <div className="py-16 text-center text-xs text-[#878A99]">Loading sensor timeline...</div>
              ) : (
                <>
                  {/* Window Line Chart */}
                  <div className="bg-white p-4 rounded border border-[#E9EBEC]">
                    <div className="flex justify-between items-center mb-2 text-xs">
                      <span className="font-bold text-[#343A40]">Sensor Readings Around Event (&plusmn;40 Minutes)</span>
                      <span className="text-[#878A99]">Red vertical line: Event trigger moment</span>
                    </div>
                    <div className="h-60 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={inspectData.series.map((s) => ({
                            time: s.timestamp.split(' ')[1] || s.timestamp,
                            methane_pct: s.methane_pct,
                            airflow: s.airflow,
                          }))}
                          margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#E9EBEC" />
                          <XAxis dataKey="time" stroke="#878A99" fontSize={10} tickLine={false} />
                          <YAxis stroke="#878A99" fontSize={10} domain={[0, 'auto']} tickLine={false} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#FFFFFF',
                              borderColor: '#E9EBEC',
                              borderRadius: '6px',
                              fontSize: '11px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            }}
                          />
                          <ReferenceLine
                            x={inspectEvent.timestamp.split(' ')[1] || inspectEvent.timestamp}
                            stroke="#F06548"
                            strokeDasharray="3 3"
                            label={{ value: 'Trigger', fill: '#F06548', fontSize: 10, position: 'top' }}
                          />
                          <ReferenceLine
                            y={1.0}
                            stroke="#F06548"
                            strokeDasharray="4 4"
                            strokeOpacity={0.6}
                          />
                          <Line
                            type="monotone"
                            dataKey="methane_pct"
                            name="Methane (%)"
                            stroke="#405189"
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="airflow"
                            name="Airflow (m³/s)"
                            stroke="#176B87"
                            strokeWidth={1.5}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Model Forecast at Trigger Point */}
                  {inspectData.forecast_at_trigger && (
                    <div className="bg-[#F3F6F9] p-4 rounded border border-[#E9EBEC] space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#343A40] flex items-center gap-1.5">
                          <Gauge size={14} className="text-[#405189]" />
                          Model Forecast at Moment of Event Trigger
                        </span>
                        <span className="text-[10px] text-[#878A99]">Evaluated at time t</span>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        {[5, 15, 30].map((h) => {
                          const p = inspectData.forecast_at_trigger!.horizons[`${h}m` as '5m' | '15m' | '30m'];
                          const isHigh = p.probability >= 0.70;
                          const isMed = p.probability >= 0.30;
                          return (
                            <div key={h} className="bg-white p-3 rounded border border-[#E9EBEC]">
                              <div className="text-[10px] text-[#878A99] font-medium">{h}m Ahead</div>
                              <div className={`text-lg font-bold font-mono mt-0.5 ${
                                isHigh ? 'text-[#F06548]' : isMed ? 'text-[#F7B84B]' : 'text-[#0AB39C]'
                              }`}>
                                {(p.probability * 100).toFixed(0)}%
                              </div>
                              <div className="text-[10px] text-[#878A99] mt-0.5">
                                Peak: <span className="text-[#343A40] font-mono">{p.predicted_peak_methane_pct.toFixed(2)}%</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="text-[11px] text-[#495057] bg-white p-2.5 rounded border border-[#E9EBEC]">
                        <strong>Model Diagnostic:</strong>{' '}
                        {inspectData.forecast_at_trigger.explanation.narrative_explanation}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
