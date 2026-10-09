import React, { useEffect, useState } from 'react';
import { Sidebar, WorkspaceKey } from './components/Sidebar';
import { Header } from './components/Header';
import { fetchHealth, fetchLiveStatus } from './api';

import { LiveMonitoringWorkspace } from './views/LiveMonitoringWorkspace';
import { HistoricalRiskWorkspace } from './views/HistoricalRiskWorkspace';

export const App: React.FC = () => {
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceKey>('live');
  const [selectedHorizon, setSelectedHorizon] = useState<number>(15);
  const [thresholdPct, setThresholdPct] = useState<number>(1.0);
  const [datasetRows, setDatasetRows] = useState<number>(17280);
  const [modelReady, setModelReady] = useState<boolean>(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  useEffect(() => {
    checkHealth();
  }, []);

  const checkHealth = async () => {
    try {
      const [hRes, lRes] = await Promise.all([fetchHealth(), fetchLiveStatus()]);
      setDatasetRows(hRes.total_records);
      setModelReady(hRes.models_loaded);
      setIsLiveConnected(lRes.is_hardware_connected);
      setIsDemoMode(lRes.is_demo_mode);
      if (lRes.threshold_pct) {
        setThresholdPct(lRes.threshold_pct);
      }
    } catch (e) {
      console.warn('Backend not yet reachable on /api/health:', e);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F3F9] text-[#495057] font-sans antialiased flex">
      {/* Fixed Sidebar Navigation with EXACTLY TWO primary workspaces */}
      <Sidebar
        currentWorkspace={currentWorkspace}
        onSelectWorkspace={setCurrentWorkspace}
        datasetRows={datasetRows}
        modelReady={modelReady}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isLiveConnected={isLiveConnected}
        isDemoMode={isDemoMode}
      />

      {/* Main Layout Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${
          isSidebarCollapsed ? 'ml-[70px]' : 'ml-[260px]'
        }`}
      >
        <Header
          currentWorkspace={currentWorkspace}
          thresholdPct={thresholdPct}
          onRefresh={checkHealth}
          onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        <main className="flex-1 p-6 pb-12">
          {currentWorkspace === 'live' && (
            <LiveMonitoringWorkspace
              onNavigateToHistorical={() => setCurrentWorkspace('historical')}
            />
          )}

          {currentWorkspace === 'historical' && <HistoricalRiskWorkspace />}
        </main>

        {/* Global Footer (from OldProj) */}
        <footer className="px-6 py-4 bg-white border-t border-[#E9EBEC] text-xs text-[#878A99] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#405189]">MineGuard Predict</span>
            <span>&bull;</span>
            <span>AI Mine Gas-Risk Intelligence Platform</span>
            <span>&bull;</span>
            <span className="font-mono text-[11px]">v1.0.1</span>
          </div>
          <div className="text-[11px] text-[#878A99]">
            Industrial Operational Console &bull; Causal ML Inference (5m, 15m, 30m) &bull; CSV/Excel Analytics
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;
