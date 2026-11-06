import { Voicemail, Greeting, MachineSettings, StorageStats } from '../types';

const DB_NAME = 'EchoTapeDB';
const DB_VERSION = 1;

const STORES = {
  VOICEMAILS: 'voicemails',
  GREETINGS: 'greetings',
  SETTINGS: 'settings',
};

// Initial default settings
export const DEFAULT_SETTINGS: MachineSettings = {
  ringsBeforeAnswer: 2,
  maxRecordingSeconds: 60,
  beepType: 'classic-1000hz',
  speakerMonitorVolume: 0.8,
  tapeFilterEffect: true,
  activeGreetingId: 'greeting-default-1',
  callScreeningEnabled: true,
  autoTranscribe: true,
  offlineModeOnly: false,
  autoDeleteAfterPlayback: false,
};

// Open database with upgrade handler
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORES.VOICEMAILS)) {
        const vmStore = db.createObjectStore(STORES.VOICEMAILS, { keyPath: 'id' });
        vmStore.createIndex('timestamp', 'timestamp', { unique: false });
        vmStore.createIndex('status', 'status', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.GREETINGS)) {
        const grStore = db.createObjectStore(STORES.GREETINGS, { keyPath: 'id' });
        grStore.createIndex('category', 'category', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Convert Blob to Base64
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Convert Base64 data URI to Blob
export function base64ToBlob(base64: string, mimeType = 'audio/webm'): Blob {
  const parts = base64.split(';base64,');
  const contentType = parts.length > 1 ? parts[0].replace('data:', '') : mimeType;
  const raw = atob(parts.length > 1 ? parts[1] : parts[0]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);

  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }

  return new Blob([uInt8Array], { type: contentType });
}

// Voicemails Storage
export async function getVoicemails(): Promise<Voicemail[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.VOICEMAILS, 'readonly');
    const store = tx.objectStore(STORES.VOICEMAILS);
    const request = store.getAll();

    request.onsuccess = () => {
      const results: Voicemail[] = request.result || [];
      // Re-create object URLs for any stored audioBlobs
      results.forEach((vm) => {
        if (vm.audioBlob && !vm.audioUrl) {
          vm.audioUrl = URL.createObjectURL(vm.audioBlob);
        }
      });
      // Sort newest first
      results.sort((a, b) => b.timestamp - a.timestamp);
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveVoicemail(voicemail: Voicemail): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.VOICEMAILS, 'readwrite');
    const store = tx.objectStore(STORES.VOICEMAILS);

    // If audioUrl is a base64 string and audioBlob is not set, synthesize blob
    const toSave = { ...voicemail };
    if (!toSave.audioBlob && toSave.audioUrl && toSave.audioUrl.startsWith('data:')) {
      toSave.audioBlob = base64ToBlob(toSave.audioUrl);
    }
    // Clean temporary blob URLs before storing into IndexedDB
    if (toSave.audioUrl && toSave.audioUrl.startsWith('blob:')) {
      delete toSave.audioUrl;
    }

    const request = store.put(toSave);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updateVoicemail(id: string, updates: Partial<Voicemail>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.VOICEMAILS, 'readwrite');
    const store = tx.objectStore(STORES.VOICEMAILS);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      if (!getReq.result) {
        return resolve();
      }
      const updated = { ...getReq.result, ...updates };
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function deleteVoicemail(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.VOICEMAILS, 'readwrite');
    const store = tx.objectStore(STORES.VOICEMAILS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Greetings Storage
export async function getGreetings(): Promise<Greeting[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.GREETINGS, 'readonly');
    const store = tx.objectStore(STORES.GREETINGS);
    const request = store.getAll();

    request.onsuccess = () => {
      const results: Greeting[] = request.result || [];
      results.forEach((g) => {
        if (g.audioBlob && !g.audioUrl) {
          g.audioUrl = URL.createObjectURL(g.audioBlob);
        }
      });
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveGreeting(greeting: Greeting): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.GREETINGS, 'readwrite');
    const store = tx.objectStore(STORES.GREETINGS);

    const toSave = { ...greeting };
    if (!toSave.audioBlob && toSave.audioUrl && toSave.audioUrl.startsWith('data:')) {
      toSave.audioBlob = base64ToBlob(toSave.audioUrl);
    }
    if (toSave.audioUrl && toSave.audioUrl.startsWith('blob:')) {
      delete toSave.audioUrl;
    }

    const request = store.put(toSave);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteGreeting(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.GREETINGS, 'readwrite');
    const store = tx.objectStore(STORES.GREETINGS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Settings Storage
export async function getSettings(): Promise<MachineSettings> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORES.SETTINGS, 'readonly');
    const store = tx.objectStore(STORES.SETTINGS);
    const req = store.get('config');

    req.onsuccess = () => {
      if (req.result && req.result.value) {
        resolve({ ...DEFAULT_SETTINGS, ...req.result.value });
      } else {
        resolve(DEFAULT_SETTINGS);
      }
    };
    req.onerror = () => resolve(DEFAULT_SETTINGS);
  });
}

export async function saveSettings(settings: MachineSettings): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SETTINGS, 'readwrite');
    const store = tx.objectStore(STORES.SETTINGS);
    const req = store.put({ key: 'config', value: settings });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Storage Quota & Stats
export async function getStorageStats(): Promise<StorageStats> {
  let usedBytes = 0;
  let totalQuotaBytes = 50 * 1024 * 1024; // fallback 50MB

  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      usedBytes = estimate.usage || 0;
      totalQuotaBytes = estimate.quota || totalQuotaBytes;
    } catch {
      // ignore
    }
  }

  const voicemails = await getVoicemails();
  const greetings = await getGreetings();

  return {
    usedBytes,
    totalQuotaBytes,
    percentageUsed: totalQuotaBytes > 0 ? Math.min(100, (usedBytes / totalQuotaBytes) * 100) : 0,
    messageCount: voicemails.length,
    greetingCount: greetings.length,
  };
}

// Backup & Export (Full offline JSON with base64 audio)
export async function exportAllData(): Promise<string> {
  const voicemails = await getVoicemails();
  const greetings = await getGreetings();
  const settings = await getSettings();

  // Convert all blobs to base64 for portable export
  const exportVoicemails = await Promise.all(
    voicemails.map(async (vm) => {
      let b64 = '';
      if (vm.audioBlob) {
        b64 = await blobToBase64(vm.audioBlob);
      } else if (vm.audioUrl && vm.audioUrl.startsWith('data:')) {
        b64 = vm.audioUrl;
      }
      return {
        ...vm,
        audioBlob: undefined,
        audioUrl: undefined,
        audioBase64: b64,
      };
    })
  );

  const exportGreetings = await Promise.all(
    greetings.map(async (gr) => {
      let b64 = '';
      if (gr.audioBlob) {
        b64 = await blobToBase64(gr.audioBlob);
      } else if (gr.audioUrl && gr.audioUrl.startsWith('data:')) {
        b64 = gr.audioUrl;
      }
      return {
        ...gr,
        audioBlob: undefined,
        audioUrl: undefined,
        audioBase64: b64,
      };
    })
  );

  const payload = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    settings,
    greetings: exportGreetings,
    voicemails: exportVoicemails,
  };

  return JSON.stringify(payload, null, 2);
}

// Import data from backup JSON
export async function importBackupData(jsonString: string): Promise<{ success: boolean; importedCount: number }> {
  try {
    const data = JSON.parse(jsonString);
    if (!data.voicemails && !data.greetings) {
      throw new Error('Invalid backup file format');
    }

    if (data.settings) {
      await saveSettings(data.settings);
    }

    if (Array.isArray(data.greetings)) {
      for (const gr of data.greetings) {
        let blob: Blob | undefined;
        if (gr.audioBase64) {
          blob = base64ToBlob(gr.audioBase64);
        }
        await saveGreeting({
          ...gr,
          audioBlob: blob,
          audioUrl: blob ? URL.createObjectURL(blob) : undefined,
        });
      }
    }

    let count = 0;
    if (Array.isArray(data.voicemails)) {
      for (const vm of data.voicemails) {
        let blob: Blob | undefined;
        if (vm.audioBase64) {
          blob = base64ToBlob(vm.audioBase64);
        }
        await saveVoicemail({
          ...vm,
          audioBlob: blob,
          audioUrl: blob ? URL.createObjectURL(blob) : undefined,
        });
        count++;
      }
    }

    return { success: true, importedCount: count };
  } catch (err: any) {
    console.error('Import error:', err);
    throw err;
  }
}

// Clear all storage
export async function clearAllStorage(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.VOICEMAILS, STORES.GREETINGS], 'readwrite');
    tx.objectStore(STORES.VOICEMAILS).clear();
    tx.objectStore(STORES.GREETINGS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Initial Data Seeding for Greetings and Demo Voicemails
export async function initializeSeedData(): Promise<void> {
  const greetings = await getGreetings();
  if (greetings.length === 0) {
    const defaultGreetings: Greeting[] = [
      {
        id: 'greeting-default-1',
        title: 'Classic Answering Greeting',
        category: 'standard',
        text: "Hello! You have reached our line. We can't come to the phone right now. Please leave your name, number, and a detailed message after the beep, and we'll get right back to you. Thanks!",
        voiceType: 'preset',
        voiceName: 'Kore',
        createdAt: Date.now() - 86400000 * 5,
        isDefault: true,
      },
      {
        id: 'greeting-business-2',
        title: 'After-Hours Professional',
        category: 'business',
        text: 'Thank you for calling. Our offices are currently closed. Normal operating hours are Monday through Friday, 9 AM to 5 PM. Please leave your message and our team will follow up the next business morning.',
        voiceType: 'preset',
        voiceName: 'Fenrir',
        createdAt: Date.now() - 86400000 * 4,
      },
      {
        id: 'greeting-vacation-3',
        title: 'Vacation & Away Mode',
        category: 'vacation',
        text: 'Hi there! We are currently away on vacation with limited phone reception until next Monday. If this is urgent, please send a text or call our emergency line. Otherwise leave a message!',
        voiceType: 'preset',
        voiceName: 'Zephyr',
        createdAt: Date.now() - 86400000 * 3,
      },
      {
        id: 'greeting-retro-4',
        title: 'Vintage 1989 Cassette Greeting',
        category: 'retro',
        text: "Hey! You know what to do. Wait for the tone, speak clearly, and don't hang up without leaving your number!",
        voiceType: 'preset',
        voiceName: 'Puck',
        createdAt: Date.now() - 86400000 * 2,
      },
    ];

    for (const g of defaultGreetings) {
      await saveGreeting(g);
    }
  }

  const voicemails = await getVoicemails();
  if (voicemails.length === 0) {
    const demoMessages: Voicemail[] = [
      {
        id: 'vm-seed-1',
        callerName: 'Dr. Clara Vance (Westside Clinic)',
        callerNumber: '+1 (555) 349-8201',
        callerLocation: 'San Francisco, CA',
        timestamp: Date.now() - 1000 * 60 * 35, // 35 mins ago
        duration: 24,
        status: 'new',
        transcript:
          "Hello! This is Dr. Vance's office calling to confirm your annual cardiology checkup scheduled for Thursday at 2:30 PM. Please bring your latest lab results. Call us back at 555-349-8201 if you need to reschedule. Thank you!",
        summary: 'Confirmation of Thursday 2:30 PM cardiology appointment; bring lab results.',
        sentiment: 'Friendly',
        urgency: 'Normal',
        callerIntent: 'Appointment / Meeting',
        keyPoints: ['Annual cardiology appointment Thursday 2:30 PM', 'Bring latest lab results', 'Reschedule number: 555-349-8201'],
        callbackNumber: '555-349-8201',
        actionRequired: 'Confirm appointment and bring lab results.',
        isFlagged: true,
      },
      {
        id: 'vm-seed-2',
        callerName: 'Express Courier Dispatch',
        callerNumber: '+1 (800) 412-9980',
        callerLocation: 'Distribution Hub',
        timestamp: Date.now() - 1000 * 60 * 180, // 3 hours ago
        duration: 18,
        status: 'new',
        transcript:
          'Hi, this is Marco from Express Couriers. We attempted to deliver your package #EX-8849 today at 11 AM, but a signature is required. We will make a final delivery attempt tomorrow between 10 AM and 1 PM. You can also pick it up at the depot.',
        summary: 'Package #EX-8849 delivery attempted; signature needed. Second attempt tomorrow morning.',
        sentiment: 'Neutral',
        urgency: 'High',
        callerIntent: 'Delivery / Courier',
        keyPoints: ['Package #EX-8849', 'Signature required', 'Next attempt tomorrow 10 AM - 1 PM'],
        callbackNumber: '800-412-9980',
        actionRequired: 'Be present tomorrow 10am-1pm or arrange depot pickup.',
      },
      {
        id: 'vm-seed-3',
        callerName: 'Marcus Cole',
        callerNumber: '+1 (555) 782-4112',
        callerLocation: 'Seattle, WA',
        timestamp: Date.now() - 1000 * 60 * 60 * 26, // yesterday
        duration: 32,
        status: 'listened',
        transcript:
          "Hey mate, Marcus here! Just touching base about Saturday's road trip. We're planning to leave around 7 AM to beat the coastal traffic. Let me know if you want me to swing by and pick you up or if we're taking your car. Give me a buzz back whenever you're free!",
        summary: 'Planning Saturday road trip departure at 7 AM; asking about car arrangements.',
        sentiment: 'Positive',
        urgency: 'Low',
        callerIntent: 'Personal',
        keyPoints: ['Saturday road trip', 'Departing 7 AM', 'Car pooling question'],
        callbackNumber: '555-782-4112',
        actionRequired: 'Call Marcus back regarding Saturday carpool arrangements.',
      },
    ];

    for (const vm of demoMessages) {
      await saveVoicemail(vm);
    }
  }
}
