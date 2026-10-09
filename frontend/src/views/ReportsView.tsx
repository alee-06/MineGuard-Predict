import React, { useEffect, useState } from 'react';
import { fetchReportSummary } from '../api';
import {
  FileText,
  Download,
  Printer,
  ShieldCheck,
  AlertTriangle,
  Info,
  CheckCircle2,
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    try {
      setLoading(true);
      const res = await fetchReportSummary();
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
          <span>Compiling mine safety intelligence report...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-2 sm:p-4 space-y-6 max-w-7xl mx-auto">
        {/* Top Action Card */}
        <div className="mg-card">
          <div className="mg-card-body flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-[#343A40] tracking-tight flex items-center gap-2">
                <FileText size={18} className="text-[#405189]" />
                Mine Safety Intelligence & Model Audit Report
              </h2>
              <p className="text-xs text-[#878A99] mt-0.5">
                Generated on {data.generated_at} &bull; Validated against 32 independent held-out test shifts.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <a
                href="/api/reports/export/csv"
                download
                className="px-3.5 py-2 bg-white hover:bg-[#F3F6F9] text-[#495057] text-xs font-semibold rounded flex items-center gap-2 transition-all border border-[#E9EBEC] shadow-sm"
              >
                <Download size={14} /> Download Metrics CSV
              </a>

              <a
                href="/api/reports/export/html"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-[#405189] hover:bg-[#364473] text-white text-xs font-bold rounded flex items-center gap-2 transition-all shadow-sm"
              >
                <Printer size={14} /> Printable HTML Report
              </a>
            </div>
          </div>
        </div>

        {/* Operational Disclaimer Banner */}
        <div className="p-4 bg-[#FDEEEB] border border-[#F06548]/30 rounded-md text-xs text-[#F06548] space-y-1">
          <div className="font-bold flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
            <AlertTriangle size={15} /> Statutory Safety Advisory Notice
          </div>
          <p className="leading-relaxed text-[11px] text-[#495057]">
            Predictive machine learning forecasts are advisory intelligence tools designed to provide advance warning of gas accumulation. They must NEVER supersede certified catalytic or optical infrared gas detectors, intrinsically safe hardware interlocks, or statutory mine evacuation protocols.
          </p>
        </div>

        {/* Report Summary Sections */}
        <div className="mg-card">
          <div className="mg-card-body space-y-6">
            <div>
              <h3 className="text-xs font-bold text-[#343A40] uppercase tracking-wider mb-3">
                1. Simulation Scope & Data Coverage
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-sans">
                <div className="bg-[#F3F6F9] p-3.5 rounded border border-[#E9EBEC]">
                  <span className="text-[10px] text-[#878A99] block font-medium">Sensor Readings</span>
                  <span className="text-[#343A40] font-bold font-mono text-base block mt-0.5">{data.dataset_rows.toLocaleString()}</span>
                  <span className="text-[10px] text-[#878A99] block mt-0.5">Minute-by-minute records</span>
                </div>
                <div className="bg-[#F3F6F9] p-3.5 rounded border border-[#E9EBEC]">
                  <span className="text-[10px] text-[#878A99] block font-medium">Operating Shifts</span>
                  <span className="text-[#343A40] font-bold font-mono text-base block mt-0.5">{data.total_episodes || data.dataset_episodes || 209} Shifts</span>
                  <span className="text-[10px] text-[#878A99] block mt-0.5">12-hour independent shifts</span>
                </div>
                <div className="bg-[#F3F6F9] p-3.5 rounded border border-[#E9EBEC]">
                  <span className="text-[10px] text-[#878A99] block font-medium">Mine Areas Monitored</span>
                  <span className="text-[#405189] font-bold font-mono text-base block mt-0.5">6 Underground Areas</span>
                  <span className="text-[10px] text-[#878A99] block mt-0.5">Intake, face, return</span>
                </div>
                <div className="bg-[#F3F6F9] p-3.5 rounded border border-[#E9EBEC]">
                  <span className="text-[10px] text-[#878A99] block font-medium">Methane Warning Level</span>
                  <span className="text-[#F7B84B] font-bold font-mono text-base block mt-0.5">1.0% Methane</span>
                  <span className="text-[10px] text-[#878A99] block mt-0.5">Simulation threshold</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[#E9EBEC]">
              <h3 className="text-xs font-bold text-[#343A40] uppercase tracking-wider mb-3">
                2. Advance Early Warning Performance Summary
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {((data.metrics || []).filter((m: any) => m.model_name === 'hist_gradient_boosting')).map((h: any) => (
                  <div
                    key={h.horizon_minutes}
                    className="bg-[#F3F6F9] border border-[#E9EBEC] rounded p-4 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-[#343A40]">
                        Predict {h.horizon_minutes} Minutes Ahead
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#E8EEF8] text-[#405189] border border-[#405189]/20">
                        HistGradientBoosting
                      </span>
                    </div>

                    <div className="space-y-1.5 pt-1 text-[#495057]">
                      <div className="flex justify-between py-1 border-b border-[#E9EBEC]">
                        <span className="text-[#878A99]">Warning Quality (ROC-AUC):</span>
                        <span className="font-mono text-[#0AB39C] font-bold">
                          {(h.roc_auc * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-[#E9EBEC]">
                        <span className="text-[#878A99]">Event Detection Rate (Recall):</span>
                        <span className="font-mono text-[#343A40] font-bold">
                          {(h.recall * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-[#E9EBEC]">
                        <span className="text-[#878A99]">Warning Accuracy (Precision):</span>
                        <span className="font-mono text-[#343A40] font-bold">
                          {(h.precision * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-[#878A99]">Unnecessary Alerts:</span>
                        <span className="font-mono text-[#F7B84B] font-bold">
                          {h.false_alarms_per_day.toFixed(2)} / day
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
