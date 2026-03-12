import React, { useState } from 'react';
import UploadZone from './components/UploadZone';
import Dashboard from './components/Dashboard';
import PrimaryNotes from './components/PrimaryNotes';
import Preview from './components/CAM/Preview';
import DownloadButton from './components/CAM/DownloadButton';
import ExplainTrail from './components/ExplainTrail';
import NewCase from './components/Registration/NewCase';
import { useCreditAPI } from './hooks/useCreditAPI';
import type { Application } from './types/credit';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'upload' | 'dashboard' | 'notes' | 'cam' | 'explain'>('upload');
  const [appId, setAppId] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState<string>('');
  const [analysisData, setAnalysisData] = useState<Application | null>(null);
  const { createApplication, getAnalysis, updatePrimaryNotes, getCamUrl } = useCreditAPI();

  const handleRegister = async (name: string) => {
    const res = await createApplication(name);
    setAppId(res.app_id);
    setCompanyName(name);
    setActiveTab('upload');
  };

  const refreshAnalysis = async () => {
    if (appId) {
      const data = await getAnalysis(appId);
      setAnalysisData(data);
      if (data.status === 'Analyzed') {
        setActiveTab('dashboard');
      }
    }
  };

  const handleNotesUpdate = async (capacity: number, notes: string) => {
    if (appId) {
      await updatePrimaryNotes(appId, capacity, notes);
      await refreshAnalysis();
    }
  };

  const resetApp = () => {
    setAppId(null);
    setCompanyName('');
    setAnalysisData(null);
    setActiveTab('upload');
  };

  if (!appId) {
    return (
      <div className="min-h-screen bg-premium-light px-4 py-12">
        <NewCase onRegister={handleRegister} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="flex justify-between items-center mb-12">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl">I</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">
            Intelli<span className="text-blue-600">Credit</span>
          </h1>
        </div>
        <div className="flex items-center space-x-6">
          <div className="text-right">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Active Appraisal</div>
            <div className="text-lg font-bold text-blue-700 leading-none">{companyName}</div>
          </div>
          <button
            onClick={resetApp}
            className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
            title="Register New Case"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex space-x-1 bg-slate-200/50 p-1 rounded-2xl mb-12 w-fit mx-auto">
        {(['upload', 'dashboard', 'notes', 'cam', 'explain'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-8 py-2.5 rounded-xl font-semibold text-sm transition-all ${activeTab === tab
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
              }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="animate-fade-in">
        {activeTab === 'upload' && (
          <UploadZone appId={appId} onUploadComplete={refreshAnalysis} />
        )}

        {activeTab === 'dashboard' && analysisData && (
          <Dashboard data={analysisData} />
        )}
        {activeTab === 'dashboard' && !analysisData && (
          <div className="text-center py-20 text-slate-400">Please upload documents first</div>
        )}

        {activeTab === 'notes' && (
          <PrimaryNotes onUpdate={handleNotesUpdate} />
        )}

        {activeTab === 'cam' && appId && (
          <div>
            <Preview appId={appId} />
            <div className="mt-8 flex justify-center">
              <DownloadButton appId={appId} url={getCamUrl(appId)} />
            </div>
          </div>
        )}

        {activeTab === 'explain' && (
          <ExplainTrail />
        )}
      </main>

      <footer className="mt-20 pt-8 border-t border-slate-200 text-center text-slate-400 text-xs uppercase tracking-widest">
        Intelli-Credit Infrastructure © 2026 • Hackathon Winning Repository Ready
      </footer>
    </div>
  );
};

export default App;
