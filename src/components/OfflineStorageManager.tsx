import React, { useState, useEffect } from 'react';
import {
  Database,
  HardDrive,
  Download,
  Upload,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  WifiOff,
  RefreshCw,
  FileAudio,
} from 'lucide-react';
import { StorageStats, MachineSettings } from '../types';
import {
  getStorageStats,
  exportAllData,
  importBackupData,
  clearAllStorage,
  initializeSeedData,
} from '../services/storage';

interface OfflineStorageManagerProps {
  settings: MachineSettings;
  onRefreshData: () => void;
}

export const OfflineStorageManager: React.FC<OfflineStorageManagerProps> = ({
  settings,
  onRefreshData,
}) => {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    loadStats();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadStats = async () => {
    const s = await getStorageStats();
    setStats(s);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleExportBackup = async () => {
    try {
      setIsExporting(true);
      const jsonStr = await exportAllData();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `EchoTape_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      setImportMessage(null);
      const text = await file.text();
      const res = await importBackupData(text);
      setImportMessage(`Successfully imported ${res.importedCount} voicemails and greetings.`);
      await loadStats();
      onRefreshData();
    } catch (err: any) {
      setImportMessage(`Import error: ${err.message || 'Corrupted file'}`);
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  const handleResetData = async () => {
    if (window.confirm('Reset all answering machine voicemails to demo seed state?')) {
      await clearAllStorage();
      await initializeSeedData();
      await loadStats();
      onRefreshData();
    }
  };

  const handleClearEverything = async () => {
    if (window.confirm('Are you sure you want to delete all saved voicemails and custom greetings?')) {
      await clearAllStorage();
      await loadStats();
      onRefreshData();
    }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6 shadow-xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-4">
        <div>
          <h3 className="text-lg font-bold text-neutral-100 flex items-center gap-2 font-tech">
            <Database className="w-5 h-5 text-amber-500" />
            <span>Offline IndexedDB Storage Engine</span>
          </h3>
          <p className="text-xs text-neutral-400 mt-1">
            EchoTape stores all audio voicemails, custom voice greetings, transcripts, and hardware settings locally in
            your browser's IndexedDB. No external database required.
          </p>
        </div>

        {/* Network status pill */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono-code ${
            isOnline
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
          }`}
        >
          {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span>{isOnline ? 'Online (Gemini Cloud Enabled)' : 'Offline (Local Speech Engine)'}</span>
        </div>
      </div>

      {/* Quota & Usage Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Used Storage */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-mono-code">
            <span className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-amber-400" />
              <span>STORAGE USED</span>
            </span>
            <span className="text-amber-400 font-bold">
              {stats ? formatBytes(stats.usedBytes) : 'Calculating...'}
            </span>
          </div>

          <div className="w-full bg-neutral-900 rounded-full h-2 overflow-hidden">
            <div
              className="bg-amber-500 h-full transition-all duration-300"
              style={{ width: `${Math.max(4, stats?.percentageUsed || 0)}%` }}
            />
          </div>

          <div className="text-[11px] text-neutral-500 font-mono-code flex justify-between">
            <span>Browser Quota:</span>
            <span>{stats ? formatBytes(stats.totalQuotaBytes) : 'Unlimited Local'}</span>
          </div>
        </div>

        {/* Card 2: Voicemail Count */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="text-xs font-mono-code text-neutral-400">SAVED VOICEMAILS</div>
          <div className="font-digital text-4xl text-emerald-400 text-glow-green leading-none my-1">
            {stats?.messageCount || 0}
          </div>
          <div className="text-[11px] font-mono-code text-neutral-500">Audio Blobs + Transcripts</div>
        </div>

        {/* Card 3: Greetings Count */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="text-xs font-mono-code text-neutral-400">SAVED GREETINGS</div>
          <div className="font-digital text-4xl text-amber-400 text-glow-amber leading-none my-1">
            {stats?.greetingCount || 0}
          </div>
          <div className="text-[11px] font-mono-code text-neutral-500">Custom Voice + TTS Personas</div>
        </div>
      </div>

      {importMessage && (
        <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-xs font-mono-code text-amber-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{importMessage}</span>
        </div>
      )}

      {/* Backup & Portability Options */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5 space-y-4">
        <h4 className="text-sm font-semibold text-neutral-200 font-tech uppercase tracking-wider">
          Data Backup & Portability
        </h4>

        <div className="flex flex-wrap items-center gap-3">
          {/* Export JSON Backup */}
          <button
            onClick={handleExportBackup}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-mono-code text-xs font-bold shadow transition-all cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{isExporting ? 'Packaging...' : 'Export Full Machine Backup'}</span>
          </button>

          {/* Import JSON Backup */}
          <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-mono-code text-xs font-semibold border border-neutral-700 transition-all cursor-pointer">
            <Upload className="w-4 h-4 text-cyan-400" />
            <span>{isImporting ? 'Restoring...' : 'Restore from Backup File'}</span>
            <input type="file" accept=".json" onChange={handleFileImport} className="hidden" />
          </label>

          <button
            onClick={loadStats}
            className="p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 border border-neutral-700 cursor-pointer"
            title="Refresh storage stats"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-neutral-400 leading-relaxed">
          The full machine backup is an offline JSON archive that contains all your voicemails, audio data, greetings,
          and settings. You can transfer it between browsers or keep it as an offline archive.
        </p>
      </div>

      {/* Storage Maintenance & Reset */}
      <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-mono-code text-neutral-300 font-semibold">Storage Maintenance</div>
          <div className="text-[11px] text-neutral-500">Reset to demo messages or purge local IndexedDB storage.</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetData}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-mono-code text-xs border border-neutral-700 transition-all cursor-pointer"
          >
            Reload Demo Data
          </button>

          <button
            onClick={handleClearEverything}
            className="px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 font-mono-code text-xs border border-red-800/60 transition-all cursor-pointer"
          >
            Wipe Storage
          </button>
        </div>
      </div>
    </div>
  );
};
