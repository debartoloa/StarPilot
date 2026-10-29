/**
 * CosmoPilot / StarWay - Settings & Personalization Service
 * Handles 7 built-in space wallpapers, custom wallpaper import (up to 5MB),
 * Night Mode (multi-level red filter), and app preferences.
 */

class SettingsService {
  constructor() {
    this.bgScenes = [
      { id: 'gold_nebula', name: 'Gold nebula', className: 'bg-gold-nebula', isDefault: true },
      { id: 'lunar_horizon', name: 'Lunar horizon', className: 'bg-lunar-horizon' },
      { id: 'aurora_veil', name: 'Aurora veil', className: 'bg-aurora-veil' },
      { id: 'midnight_blue', name: 'Midnight blue', className: 'bg-midnight-blue' },
      { id: 'silent_rings', name: 'Silent rings', className: 'bg-silent-rings' },
      { id: 'original', name: 'Original', className: 'bg-original' },
      { id: 'stellar_dust', name: 'Stellar dust', className: 'bg-stellar-dust' }
    ];

    this.currentBg = localStorage.getItem('cosmopilot_bg') || 'gold_nebula';
    this.customBgData = localStorage.getItem('cosmopilot_custom_bg') || null;

    // Night mode: starts OFF on fresh app launch as mandated by manual page 22.
    this.nightModeActive = false;
    this.nightIntensity = parseInt(localStorage.getItem('cosmopilot_night_intensity') || '1', 10);

    // Other preferences
    this.autoReconnect = localStorage.getItem('cosmopilot_auto_reconnect') === 'true';
    this.enableStopGoto = localStorage.getItem('cosmopilot_enable_stop_goto') !== 'false'; // default true
    this.controlLockEnabled = localStorage.getItem('cosmopilot_control_lock_enabled') === 'true';
    this.hideSystemBars = localStorage.getItem('cosmopilot_hide_system_bars') === 'true';
    this.allowExtendedRatios = localStorage.getItem('cosmopilot_allow_extended_ratios') === 'true';
    this.androidNotification = localStorage.getItem('cosmopilot_android_notification') === 'true';

    this.applyBackground();
    this.applyNightMode();
  }

  setBackground(bgId) {
    this.currentBg = bgId;
    localStorage.setItem('cosmopilot_bg', bgId);
    this.applyBackground();
  }

  async importCustomBackground(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('L\'immagine non può superare i 5 MB.');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          this.customBgData = e.target.result;
          localStorage.setItem('cosmopilot_custom_bg', this.customBgData);
          this.currentBg = 'custom';
          localStorage.setItem('cosmopilot_bg', 'custom');
          this.applyBackground();
          resolve(true);
        } catch (err) {
          reject(new Error('Memoria browser insufficiente per salvare l\'immagine.'));
        }
      };
      reader.onerror = () => reject(new Error('Errore durante la lettura del file.'));
      reader.readAsDataURL(file);
    });
  }

  removeCustomBackground() {
    this.customBgData = null;
    localStorage.removeItem('cosmopilot_custom_bg');
    if (this.currentBg === 'custom') {
      this.setBackground('gold_nebula');
    }
  }

  applyBackground() {
    const root = document.getElementById('app-root') || document.body;
    // Remove all previous background classes
    this.bgScenes.forEach(s => root.classList.remove(s.className));
    root.classList.remove('bg-custom-image');
    root.style.backgroundImage = '';

    if (this.currentBg === 'custom' && this.customBgData) {
      root.classList.add('bg-custom-image');
      root.style.backgroundImage = `url(${this.customBgData})`;
    } else {
      const scene = this.bgScenes.find(s => s.id === this.currentBg) || this.bgScenes[0];
      root.classList.add(scene.className);
    }
  }

  toggleNightMode(forceState = null) {
    this.nightModeActive = forceState !== null ? forceState : !this.nightModeActive;
    this.applyNightMode();
    if (this.nightModeActive && this.hideSystemBars) {
      this.requestFullscreen();
    }
    return this.nightModeActive;
  }

  setNightIntensity(level) {
    this.nightIntensity = Math.max(1, Math.min(5, parseInt(level, 10) || 1));
    localStorage.setItem('cosmopilot_night_intensity', this.nightIntensity.toString());
    this.applyNightMode();
  }

  applyNightMode() {
    const root = document.documentElement;
    const overlay = document.getElementById('night-mode-overlay');

    if (this.nightModeActive) {
      document.body.classList.add('night-mode-enabled');
      if (overlay) {
        overlay.style.display = 'block';
        // Level 1 = brightest red, Level 5 = darkest deep red
        const opacities = [0.85, 0.90, 0.93, 0.96, 0.98];
        const darkness = [0, 0.15, 0.30, 0.45, 0.60];
        const idx = this.nightIntensity - 1;
        overlay.style.backgroundColor = `rgba(180, 0, 0, ${opacities[idx]})`;
        document.body.style.filter = `brightness(${1 - darkness[idx]})`;
      }
    } else {
      document.body.classList.remove('night-mode-enabled');
      if (overlay) {
        overlay.style.display = 'none';
      }
      document.body.style.filter = 'none';
    }
  }

  setPreference(key, value) {
    this[key] = value;
    localStorage.setItem(`cosmopilot_${key}`, value.toString());
    
    if (key === 'hideSystemBars' && value) {
      this.requestFullscreen();
    }
  }

  requestFullscreen() {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  exitFullscreen() {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }
}

window.SettingsService = SettingsService;
window.settingsService = new SettingsService();
