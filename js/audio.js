/**
 * CosmoPilot / StarWay - Acoustic & Haptic Feedback Manager
 * 100% offline synthesized Web Audio API sounds and haptic vibration patterns.
 */

class FeedbackManager {
  constructor() {
    this.audioCtx = null;
    this.isMuted = false;
    this.isUnlocked = false;

    this.init();
  }

  init() {
    const savedMute = localStorage.getItem('cosmopilot_muted');
    this.isMuted = savedMute === 'true';

    // Unlock AudioContext on first user interaction (browser policy)
    const unlockAudio = () => {
      this.ensureAudioContext();
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      this.isUnlocked = true;
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('click', unlockAudio);
    };

    document.addEventListener('touchstart', unlockAudio, { passive: true, once: true });
    document.addEventListener('click', unlockAudio, { once: true });
  }

  ensureAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    localStorage.setItem('cosmopilot_muted', this.isMuted.toString());
    return this.isMuted;
  }

  vibrate(pattern = 30) {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {}
    }
  }

  playTap() {
    if (this.isMuted) return;
    this.playTone(880, 0.03, 0.05);
    this.vibrate(15);
  }

  playBeep(frequency = 587.33, duration = 0.08, volume = 0.12) {
    if (this.isMuted) return;
    this.playTone(frequency, duration, volume);
  }

  playTone(frequency, duration, volume = 0.1) {
    this.ensureAudioContext();
    if (!this.audioCtx || this.audioCtx.state !== 'running') return;

    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {}
  }

  /**
   * Harmonious major chord on alignment or success
   */
  playSuccessChime() {
    if (this.isMuted) return;
    this.ensureAudioContext();
    if (!this.audioCtx || this.audioCtx.state !== 'running') return;

    try {
      const now = this.audioCtx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6

      notes.forEach((freq, idx) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);

        gain.gain.setValueAtTime(0.001, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.06 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.06 + 0.5);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.5);
      });

      this.vibrate([40, 60, 100]);
    } catch (e) {}
  }

  /**
   * Minor tone on error or game wrong answer
   */
  playErrorTone() {
    if (this.isMuted) return;
    this.playTone(220, 0.25, 0.15);
    this.vibrate([60, 40, 60]);
  }
}

window.FeedbackManager = FeedbackManager;
window.feedbackManager = new FeedbackManager();
