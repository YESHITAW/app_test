// Web Audio API engine for telephone sounds, tape effects, beeps, and microphone recording

class AudioEngine {
  private ctx: AudioContext | null = null;
  private tapeHissNode: AudioNode | null = null;
  private ringOsc1: OscillatorNode | null = null;
  private ringOsc2: OscillatorNode | null = null;
  private ringGain: GainNode | null = null;
  private isRinging = false;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private mediaStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;

  private initContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // Play button click / tape mechanical relay sound
  playMechanicalClick(type: 'click' | 'clunk' | 'eject' = 'click') {
    try {
      const ctx = this.initContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === 'click') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.04);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
      } else if (type === 'clunk') {
        // Heavy solenoid / relay engagement
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      }
    } catch (e) {
      // AudioContext might be blocked until user gesture
    }
  }

  // Answering machine beep after greeting finishes
  playBeep(beepType: string = 'classic-1000hz'): Promise<void> {
    return new Promise((resolve) => {
      try {
        const ctx = this.initContext();
        const now = ctx.currentTime;
        const gain = ctx.createGain();
        gain.connect(ctx.destination);

        if (beepType === 'double-tone') {
          // Double beep
          const osc1 = ctx.createOscillator();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(880, now);
          osc1.connect(gain);
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.setValueAtTime(0.001, now + 0.12);
          osc1.start(now);
          osc1.stop(now + 0.13);

          setTimeout(() => {
            const osc2 = ctx.createOscillator();
            const now2 = ctx.currentTime;
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1200, now2);
            osc2.connect(gain);
            gain.gain.setValueAtTime(0.3, now2);
            gain.gain.exponentialRampToValueAtTime(0.001, now2 + 0.2);
            osc2.start(now2);
            osc2.stop(now2 + 0.22);
            setTimeout(resolve, 250);
          }, 140);
        } else if (beepType === 'high-chirp') {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1600, now);
          osc.frequency.exponentialRampToValueAtTime(900, now + 0.28);
          gain.gain.setValueAtTime(0.35, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
          osc.connect(gain);
          osc.start(now);
          osc.stop(now + 0.32);
          setTimeout(resolve, 350);
        } else if (beepType === 'retro-80s') {
          // Buzzier 750Hz vintage beep
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(750, now);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.setValueAtTime(0.2, now + 0.45);
          gain.gain.linearRampToValueAtTime(0.001, now + 0.5);
          osc.connect(gain);
          osc.start(now);
          osc.stop(now + 0.52);
          setTimeout(resolve, 550);
        } else if (beepType === 'soft-chime') {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          osc1.type = 'sine';
          osc2.type = 'sine';
          osc1.frequency.setValueAtTime(523.25, now); // C5
          osc2.frequency.setValueAtTime(659.25, now); // E5
          gain.gain.setValueAtTime(0.25, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
          osc1.connect(gain);
          osc2.connect(gain);
          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.62);
          osc2.stop(now + 0.62);
          setTimeout(resolve, 650);
        } else {
          // Classic 1000Hz Phone Beep
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1000, now);
          gain.gain.setValueAtTime(0.35, now);
          gain.gain.setValueAtTime(0.35, now + 0.4);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
          osc.connect(gain);
          osc.start(now);
          osc.stop(now + 0.5);
          setTimeout(resolve, 520);
        }
      } catch (err) {
        resolve();
      }
    });
  }

  // Start continuous telephone ringing (Standard US Ring: 440Hz + 480Hz dual tone, 2s on / 4s off)
  startTelephoneRing(): void {
    if (this.isRinging) return;
    try {
      const ctx = this.initContext();
      this.isRinging = true;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const masterGain = ctx.createGain();

      osc1.frequency.setValueAtTime(440, ctx.currentTime);
      osc2.frequency.setValueAtTime(480, ctx.currentTime);

      osc1.type = 'sine';
      osc2.type = 'sine';

      masterGain.gain.setValueAtTime(0.001, ctx.currentTime);

      osc1.connect(masterGain);
      osc2.connect(masterGain);
      masterGain.connect(ctx.destination);

      osc1.start();
      osc2.start();

      this.ringOsc1 = osc1;
      this.ringOsc2 = osc2;
      this.ringGain = masterGain;

      // Cycle ring: 1.8s ring, 2.2s silence
      const cycleRing = () => {
        if (!this.isRinging || !this.ringGain || !this.ctx) return;
        const now = this.ctx.currentTime;
        this.ringGain.gain.cancelScheduledValues(now);
        this.ringGain.gain.setValueAtTime(0.28, now);
        this.ringGain.gain.setValueAtTime(0.28, now + 1.8);
        this.ringGain.gain.linearRampToValueAtTime(0.001, now + 1.85);

        setTimeout(() => {
          if (this.isRinging) {
            cycleRing();
          }
        }, 4000);
      };

      cycleRing();
    } catch (e) {
      console.warn('Could not start telephone ring:', e);
    }
  }

  // Stop telephone ringing
  stopTelephoneRing(): void {
    this.isRinging = false;
    try {
      if (this.ringOsc1) {
        this.ringOsc1.stop();
        this.ringOsc1.disconnect();
        this.ringOsc1 = null;
      }
      if (this.ringOsc2) {
        this.ringOsc2.stop();
        this.ringOsc2.disconnect();
        this.ringOsc2 = null;
      }
      if (this.ringGain) {
        this.ringGain.disconnect();
        this.ringGain = null;
      }
    } catch (e) {
      // ignore
    }
  }

  // Start microphone recording with waveform visualizer callback
  async startMicrophoneRecording(onVisualizerData?: (volume: number, freqData: Uint8Array) => void): Promise<void> {
    const ctx = this.initContext();
    this.recordedChunks = [];

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
      },
    });
    this.mediaStream = stream;

    // Hook up analyser for real-time waveform & VU meter
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    this.analyser = analyser;

    if (onVisualizerData) {
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateData = () => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);

        // compute average volume (0-1)
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength / 255;
        onVisualizerData(avg, dataArray);

        this.animFrameId = requestAnimationFrame(updateData);
      };
      updateData();
    }

    // Supported mime type detection
    const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    let selectedMime = '';
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        selectedMime = type;
        break;
      }
    }

    const options = selectedMime ? { mimeType: selectedMime } : undefined;
    const recorder = new MediaRecorder(stream, options);

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    recorder.start(100); // 100ms chunks
    this.mediaRecorder = recorder;
  }

  // Stop microphone recording and return the recorded Blob + duration
  stopMicrophoneRecording(): Promise<{ blob: Blob; mimeType: string }> {
    return new Promise((resolve, reject) => {
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }
      this.analyser = null;

      if (!this.mediaRecorder) {
        return reject(new Error('Recorder not started'));
      }

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.recordedChunks, { type: mimeType });

        // Clean up tracks
        if (this.mediaStream) {
          this.mediaStream.getTracks().forEach((track) => track.stop());
          this.mediaStream = null;
        }
        this.mediaRecorder = null;
        this.recordedChunks = [];
        resolve({ blob, mimeType });
      };

      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    });
  }

  // Create an Audio element with optional POTS Telephone Bandpass filter for authentic answering machine sound
  createTelephoneAudio(audioSrc: string, applyFilter = true): { audio: HTMLAudioElement; setVolume: (v: number) => void } {
    const audio = new Audio(audioSrc);
    let gainNode: GainNode | null = null;

    if (applyFilter) {
      try {
        const ctx = this.initContext();
        const source = ctx.createMediaElementSource(audio);

        // Standard 300Hz - 3400Hz telephone bandpass
        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.setValueAtTime(320, ctx.currentTime);

        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(3400, ctx.currentTime);

        // Subtle presence boost at 1.8kHz like vintage speaker cones
        const peaking = ctx.createBiquadFilter();
        peaking.type = 'peaking';
        peaking.frequency.setValueAtTime(1800, ctx.currentTime);
        peaking.gain.setValueAtTime(3.5, ctx.currentTime);
        peaking.Q.setValueAtTime(1.2, ctx.currentTime);

        gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(1.0, ctx.currentTime);

        source.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(peaking);
        peaking.connect(gainNode);
        gainNode.connect(ctx.destination);
      } catch (e) {
        // Fallback to standard audio element if already connected or blocked
      }
    }

    return {
      audio,
      setVolume: (v: number) => {
        audio.volume = Math.max(0, Math.min(1, v));
        if (gainNode && this.ctx) {
          gainNode.gain.setValueAtTime(v, this.ctx.currentTime);
        }
      },
    };
  }

  // Web Speech API client-side TTS fallback (100% offline support)
  speakTextOffline(text: string, voiceName?: string): Promise<void> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        return resolve();
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      if (voiceName && voices.length > 0) {
        const matched = voices.find((v) => v.name.toLowerCase().includes(voiceName.toLowerCase()));
        if (matched) {
          utterance.voice = matched;
        }
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    });
  }

  stopAllSpeech(): void {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}

export const audioEngine = new AudioEngine();
