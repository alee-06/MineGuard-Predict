import React, { useEffect, useState } from 'react';
import {
  fetchDatasetSummary,
  fetchDatasetPreview,
  regenerateDataset,
  uploadDatasetCSV,
} from '../api';
import {
  Database,
  Download,
  Upload,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Filter,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react';

const ZONE_LABELS: Record<string, string> = {
  ALL: 'All Mine Areas',
  'ZONE-01-TAILGATE': 'Tailgate Return (Bleeder Junction)',
  'ZONE-02-LONGWALL-FACE': 'Longwall Working Face',
  'ZONE-03-MAINGATE': 'Maingate Fresh Intake',
  'ZONE-04-BLEEDER-SEAL': 'Goaf / Bleeder Seal Area',
  'ZONE-05-DEVELOPMENT-HEADING': 'Rapid Development Heading',
  'ZONE-06-RETURN-AIRWAY': 'Main Return Airway',
};

const SCENARIO_LABELS: Record<string, string> = {
  ALL: 'All Operating Conditions',
  GRADUAL_GAS_BUILDUP: 'Gradual Gas Buildup',
  SUDDEN_OUTBURST_SURGE: 'Sudden Gas Surge',
  DEGRADED_VENTILATION: 'Degraded Ventilation',
  NORMAL_BASELINE: 'Normal Safe Operation',
  VENTILATION_RECOVERY: 'Ventilation Restored',
  MACHINE_ACTIVITY_SURGE: 'High Machine Activity',
  SENSOR_ANOMALY: 'Sensor Irregularity',
};

export const DatasetLab: React.FC = () => {
  const [summary, setSummary] = useState<any | null>(null);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedZone, setSelectedZone] = useState<string>('ALL');
  const [selectedScenario, setSelectedScenario] = useState<string>('ALL');

  // Generator form
  const [genRows, setGenRows] = useState<number>(150000);
  const [genSeed, setGenSeed] = useState<number>(42);
  const [generating, setGenerating] = useState(false);

  // Upload state
  const [uploadError, setUploadError] = useState<any | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadSummary();
    loadPreview(1);
  }, []);

  const loadSummary = async () => {
    try {
      const res = await fetchDatasetSummary();
      setSummary(res);
    } catch (e) {
      console.error(e);
    }
  };

  const loadPreview = async (p: number) => {
    try {
      setLoading(true);
      const res = await fetchDatasetPreview(p, 20, selectedZone, selectedScenario);
      setPreviewRows(res.rows);
      setPage(res.page);
      setTotalPages(res.total_pages);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    setPage(1);
    loadPreview(1);
  };

  const handleRegenerate = async () => {
    setGenerating(true);
    try {
      await regenerateDataset(genRows, genSeed);
      await loadSummary();
      await loadPreview(1);
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const res = await uploadDatasetCSV(file);
      setUploadSuccess(`Successfully validated and imported ${res.total_rows.toLocaleString()} sensor readings!`);
      await loadSummary();
      await loadPreview(1);
    } catch (err: any) {
      setUploadError(err.message || 'File schema validation failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-2 sm:p-4 space-y-6 max-w-7xl mx-auto">
        {/* Top Advisory Banner */}
        <div className="p-4 bg-[#E8EEF8] border border-[#405189]/20 rounded-md flex items-start gap-3 text-xs text-[#405189]">
          <Info size={18} className="shrink-0 text-[#405189] mt-0.5" />
          <div>
            <strong className="font-semibold">Sensor Data Explorer:</strong> Inspect the simulated minute-by-minute underground sensor readings used to train and test the early-warning models. Programmatically generated via physics-informed differential gas-dispersion differential equations.
          </div>
        </div>

        {/* Dataset KPI Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="mg-card p-4">
              <span className="text-xs text-[#878A99] font-medium block">Total Simulated Sensor Readings</span>
              <div className="mt-2 text-2xl font-bold font-mono text-[#343A40]">
                {summary.total_records.toLocaleString()}
              </div>
              <span className="text-[11px] text-[#878A99] mt-1 block">1-minute interval records</span>
            </div>

            <div className="mg-card p-4">
              <span className="text-xs text-[#878A99] font-medium block">Monitored Mine Areas</span>
              <div className="mt-2 text-2xl font-bold font-mono text-[#405189]">
                {summary.zones.length} Areas
              </div>
              <span className="text-[11px] text-[#878A99] mt-1 block">Longwall panels and returns</span>
            </div>

            <div className="mg-card p-4">
              <span className="text-xs text-[#878A99] font-medium block">Simulated Operational Runs</span>
              <div className="mt-2 text-2xl font-bold font-mono text-[#343A40]">
                {summary.total_episodes} Shifts
              </div>
              <span className="text-[11px] text-[#878A99] mt-1 block">12-hour independent shifts</span>
            </div>

            <div className="mg-card p-4">
              <span className="text-xs text-[#878A99] font-medium block">Time at Warning Level (≥ 1.0%)</span>
              <div className="mt-2 text-2xl font-bold font-mono text-[#F7B84B]">
                {summary.target_balance ? summary.target_balance.positive_pct.toFixed(2) : '3.50'}%
              </div>
              <span className="text-[11px] text-[#878A99] mt-1 block">Simulated warning rate</span>
            </div>
          </div>
        )}

        {/* Filter and Action Bar */}
        <div className="mg-card">
          <div className="mg-card-body space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <Filter size={14} className="text-[#405189]" />
                  <span className="text-[#495057] font-semibold">Mine Area:</span>
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

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[#495057] font-semibold">Condition:</span>
                  <select
                    value={selectedScenario}
                    onChange={(e) => setSelectedScenario(e.target.value)}
                    className="bg-white border border-[#E9EBEC] text-[#343A40] text-xs rounded px-3 py-1.5 focus:outline-none focus:border-[#405189] font-medium shadow-sm"
                  >
                    {Object.entries(SCENARIO_LABELS).map(([scKey, scLabel]) => (
                      <option key={scKey} value={scKey}>
                        {scLabel}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleApplyFilters}
                  className="px-3 py-1.5 bg-[#405189] hover:bg-[#364473] text-white text-xs font-semibold rounded shadow-sm transition-all"
                >
                  Apply Filter
                </button>
              </div>

              <div className="flex items-center gap-3">
                <a
                  href="/api/dataset/download"
                  download
                  className="px-3.5 py-1.5 bg-white hover:bg-[#F3F6F9] text-[#495057] text-xs font-semibold rounded flex items-center gap-1.5 transition-all border border-[#E9EBEC] shadow-sm"
                >
                  <Download size={13} /> Export CSV
                </a>
              </div>
            </div>

            {uploadSuccess && (
              <div className="bg-[#E6F8F5] border border-[#0AB39C]/40 p-3 rounded text-[#0AB39C] text-xs flex items-center gap-2 font-medium">
                <CheckCircle2 size={15} />
                <span>{uploadSuccess}</span>
              </div>
            )}

            {uploadError && (
              <div className="bg-[#FDEEEB] border border-[#F06548]/40 p-3 rounded text-[#F06548] text-xs flex items-center gap-2 font-medium">
                <AlertCircle size={15} />
                <span>{uploadError}</span>
              </div>
            )}
          </div>
        </div>

        {/* Sensor Readings Data Table */}
        <div className="mg-card">
          <div className="mg-card-header">
            <div>
              <h3 className="mg-card-title flex items-center gap-2">
                <FileSpreadsheet size={15} className="text-[#405189]" />
                Simulated Sensor Reading Log
              </h3>
              <p className="mg-card-sub">
                Minute-by-minute underground environmental and machinery readings.
              </p>
            </div>
            <span className="text-[11px] text-[#878A99] font-medium">
              Page {page} of {totalPages}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E9EBEC] text-[#878A99] font-semibold bg-[#F3F6F9]">
                  <th className="py-2.5 px-3">Date & Time</th>
                  <th className="py-2.5 px-3">Mine Area</th>
                  <th className="py-2.5 px-3 text-right">Methane Reading</th>
                  <th className="py-2.5 px-3 text-right">Ventilation Airflow</th>
                  <th className="py-2.5 px-3 text-right">Air Temp</th>
                  <th className="py-2.5 px-3 text-right">Barometric Press.</th>
                  <th className="py-2.5 px-3 text-right">Machine Activity</th>
                  <th className="py-2.5 px-3">Ventilation State</th>
                  <th className="py-2.5 px-3">Operating Condition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9EBEC] font-sans">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-[#878A99]">
                      Loading sensor records...
                    </td>
                  </tr>
                ) : previewRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-[#878A99]">
                      No records found matching filters.
                    </td>
                  </tr>
                ) : (
                  previewRows.map((row, idx) => {
                    const isHigh = row.methane_pct >= 1.0;
                    const zoneName = ZONE_LABELS[row.zone_id] || row.zone_id;
                    const scName = SCENARIO_LABELS[row.scenario_type] || row.scenario_type.replace(/_/g, ' ');

                    return (
                      <tr key={idx} className="hover:bg-[#F3F6F9] transition-colors">
                        <td className="py-2.5 px-3 font-mono text-[#878A99]">{row.timestamp}</td>
                        <td className="py-2.5 px-3 text-[#343A40]">
                          <div className="font-medium">{zoneName}</div>
                          <div className="text-[10px] text-[#878A99] font-mono">{row.zone_id}</div>
                        </td>
                        <td className={`py-2.5 px-3 text-right font-bold font-mono ${isHigh ? 'text-[#F06548]' : 'text-[#343A40]'}`}>
                          {row.methane_pct.toFixed(3)}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#343A40]">
                          {row.airflow.toFixed(1)} m³/s
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#878A99]">
                          {row.temperature_c.toFixed(1)}°C
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#878A99]">
                          {row.pressure_kpa.toFixed(2)} kPa
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#F7B84B] font-semibold">
                          Level {row.machine_activity}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              row.ventilation_state === 'DEGRADED'
                                ? 'bg-[#FDEEEB] text-[#F06548] border border-[#F06548]/30'
                                : 'bg-[#E6F8F5] text-[#0AB39C] border border-[#0AB39C]/30'
                            }`}
                          >
                            {row.ventilation_state === 'DEGRADED' ? 'DEGRADED' : 'NORMAL'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[#878A99] text-[11px] truncate max-w-[140px]" title={scName}>
                          {scName}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          <div className="p-4 border-t border-[#E9EBEC] flex items-center justify-between text-xs">
            <button
              onClick={() => {
                if (page > 1) {
                  setPage(page - 1);
                  loadPreview(page - 1);
                }
              }}
              disabled={page <= 1}
              className="px-3 py-1.5 bg-white hover:bg-[#F3F6F9] border border-[#E9EBEC] disabled:opacity-40 text-[#495057] rounded flex items-center gap-1 font-semibold transition-colors"
            >
              <ChevronLeft size={14} /> Previous Page
            </button>

            <span className="text-[#878A99] font-mono">
              Page {page} / {totalPages}
            </span>

            <button
              onClick={() => {
                if (page < totalPages) {
                  setPage(page + 1);
                  loadPreview(page + 1);
                }
              }}
              disabled={page >= totalPages}
              className="px-3 py-1.5 bg-white hover:bg-[#F3F6F9] border border-[#E9EBEC] disabled:opacity-40 text-[#495057] rounded flex items-center gap-1 font-semibold transition-colors"
            >
              Next Page <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
