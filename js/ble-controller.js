/**
 * CosmoPilot / StarWay - Web Bluetooth Controller & Hardware Protocol
 * Implements ESP32 BLE GATT architecture from CosmoPilot_Firmware.
 */

const BLE_CONFIG = {
  DEVICE_NAME: 'CosmoPilot Telescope',
  // Service UUIDs (16-bit 0x00FF and 128-bit variants)
  SERVICE_UUID_16: 0x00FF,
  SERVICE_UUID_128: '000000ff-0000-1000-8000-00805f9b34fb',
  SERVICE_UUID_ADV: 'b2e27f67-ffe7-4763-88a8-cc2b2133010e',
  
  // Characteristic UUIDs (16-bit 0xFF01 and 128-bit)
  CHAR_UUID_16: 0xFF01,
  CHAR_UUID_128: '0000ff01-0000-1000-8000-00805f9b34fb',
  
  COMMAND_PREFIX: 'CMD ',
  STATUS_TAG: 0x53 // ASCII 'S'
};

class BleController {
  constructor() {
    this.device = null;
    this.server = null;
    this.service = null;
    this.characteristic = null;
    
    this.isConnected = false;
    this.isConnecting = false;
    this.isBusy = false;
    this.useSimulator = false;
    
    // Controller state parsed from firmware notifications
    this.status = {
      tracking: false,
      aligned: false,
      locationSynced: false,
      dateSynced: false,
      timeSynced: false,
      syncValue: 0 // 0-7
    };
    
    // Live coordinates from telescope
    this.currentPosition = {
      raHours: 0,
      raMinutes: 0,
      raSeconds: 0,
      decDegrees: 0,
      decMinutes: 0,
      decSeconds: 0
    };
    
    // Cached firmware settings from SHOW_SETTINGS
    this.settings = {
      firmwareVersion: 1.0,
      gearRatioAz: 50.0,
      gearRatioAlt: 50.0,
      idleAdc: [0, 0, 0, 0, 0, 0],
      inverted: [0, 0],
      date: [2026, 10, 29],
      time: [12, 0, 0],
      location: [45.4642, 9.1900],
      backlash: [0, 0],
      maxSpeed: 4.0,
      trackingRefresh: 3.0
    };

    // Solar system visibility reported by ESP32 (Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Moon, Sun)
    this.solarSystemVisibility = [false, false, false, false, false, false, false, false, false];

    // Event listeners
    this.listeners = new Map();
    
    // Auto-reconnect setting
    this.autoReconnect = localStorage.getItem('cosmopilot_auto_reconnect') === 'true';

    // Watchdog keepalive timer for App Joystick mode
    this.keepAliveInterval = null;

    // Simulated hardware instance
    this.simulator = new CosmoPilotSimulator(this);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => {
        try { cb(data); } catch (e) { console.error('BLE listener error:', e); }
      });
    }
  }

  isSupported() {
    return !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
  }

  async connect(preferSimulator = false) {
    if (preferSimulator || !this.isSupported()) {
      console.log('Attivazione modalità simulatore controller CosmoPilot');
      this.useSimulator = true;
      return this.simulator.start();
    }

    try {
      this.isConnecting = true;
      this.emit('connecting');

      const options = {
        filters: [
          { name: BLE_CONFIG.DEVICE_NAME },
          { namePrefix: 'CosmoPilot' }
        ],
        optionalServices: [
          BLE_CONFIG.SERVICE_UUID_16,
          BLE_CONFIG.SERVICE_UUID_128,
          BLE_CONFIG.SERVICE_UUID_ADV
        ]
      };

      this.device = await navigator.bluetooth.requestDevice(options);
      
      this.device.addEventListener('gattserverdisconnected', () => {
        this.handleDisconnect();
      });

      this.server = await this.device.gatt.connect();

      // Find service
      let service = null;
      try {
        service = await this.server.getPrimaryService(BLE_CONFIG.SERVICE_UUID_16);
      } catch (e) {
        try {
          service = await this.server.getPrimaryService(BLE_CONFIG.SERVICE_UUID_128);
        } catch (e2) {
          service = await this.server.getPrimaryService(BLE_CONFIG.SERVICE_UUID_ADV);
        }
      }
      this.service = service;

      // Find characteristic
      let characteristic = null;
      try {
        characteristic = await this.service.getCharacteristic(BLE_CONFIG.CHAR_UUID_16);
      } catch (e) {
        characteristic = await this.service.getCharacteristic(BLE_CONFIG.CHAR_UUID_128);
      }
      this.characteristic = characteristic;

      // Start notifications
      await this.characteristic.startNotifications();
      this.characteristic.addEventListener('characteristicvaluechanged', (evt) => {
        this.handleNotification(evt.target.value);
      });

      this.isConnected = true;
      this.isConnecting = false;
      this.useSimulator = false;

      // Store device ID for auto-reconnect
      if (this.device.id) {
        localStorage.setItem('cosmopilot_last_device_id', this.device.id);
      }

      this.emit('connected', { deviceName: this.device.name || BLE_CONFIG.DEVICE_NAME });
      
      // Request initial settings from ESP32
      await this.sendCommand('SHOW_SETTINGS');
      return true;

    } catch (err) {
      console.warn('Connessione Web Bluetooth fallita o annullata dall\'utente:', err);
      this.isConnecting = false;
      this.emit('error', err);
      throw err;
    }
  }

  async disconnect() {
    this.stopKeepAlive();
    if (this.useSimulator) {
      this.simulator.stop();
      this.handleDisconnect();
      return;
    }
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.handleDisconnect();
  }

  handleDisconnect() {
    this.isConnected = false;
    this.isConnecting = false;
    this.isBusy = false;
    this.stopKeepAlive();
    this.emit('disconnected');

    if (this.autoReconnect && !this.useSimulator) {
      console.log('Tentativo di riconnessione automatica in corso...');
      setTimeout(() => {
        if (!this.isConnected) {
          // Note: Web Bluetooth requires user gesture for requestDevice, but some browsers support getDevices()
          this.attemptAutoReconnect();
        }
      }, 3000);
    }
  }

  async attemptAutoReconnect() {
    if (navigator.bluetooth && navigator.bluetooth.getDevices) {
      try {
        const devices = await navigator.bluetooth.getDevices();
        const lastId = localStorage.getItem('cosmopilot_last_device_id');
        const target = devices.find(d => d.id === lastId || d.name?.includes('CosmoPilot'));
        if (target && target.gatt) {
          this.device = target;
          await this.server.connect();
          this.isConnected = true;
          this.emit('connected', { deviceName: this.device.name });
        }
      } catch (e) {
        console.log('Auto-reconnect non riuscito:', e);
      }
    }
  }

  /**
   * Send a formatted command to the ESP32
   * Prepends "CMD " if not already present.
   */
  async sendCommand(commandString) {
    let fullCommand = commandString;
    if (!fullCommand.startsWith(BLE_CONFIG.COMMAND_PREFIX) && 
        !fullCommand.startsWith('DIR_CALIB_RESULT') &&
        !fullCommand.startsWith('NEXT')) {
      fullCommand = BLE_CONFIG.COMMAND_PREFIX + commandString;
    }

    if (this.useSimulator) {
      return this.simulator.receiveCommand(fullCommand);
    }

    if (!this.isConnected || !this.characteristic) {
      console.warn('Impossibile inviare comando: Bluetooth non connesso.');
      return false;
    }

    try {
      const encoder = new TextEncoder();
      const payload = encoder.encode(fullCommand);
      await this.characteristic.writeValue(payload);
      this.emit('commandSent', fullCommand);
      return true;
    } catch (err) {
      console.error('Errore durante la trasmissione del comando BLE:', err);
      this.emit('error', err);
      return false;
    }
  }

  /**
   * Handle incoming BLE notifications from ESP32
   */
  handleNotification(dataView) {
    if (!dataView || dataView.byteLength === 0) return;

    // Check if it's a binary status packet: [ 'S' (0x53), packedByte ]
    if (dataView.getUint8(0) === BLE_CONFIG.STATUS_TAG && dataView.byteLength >= 2) {
      const packed = dataView.getUint8(1);
      this.parseBinaryStatus(packed);
      return;
    }

    // Otherwise, decode as text string
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(dataView).trim();
    this.parseTextNotification(text);
  }

  parseBinaryStatus(statusByte) {
    // Bit 0: Tracking active
    this.status.tracking = (statusByte & (1 << 0)) !== 0;
    // Bit 1: Telescope aligned
    this.status.aligned = (statusByte & (1 << 1)) !== 0;
    // Bits 2-4: Date/Time/Location sync status
    const syncMask = (statusByte >> 2) & 0b111;
    this.status.syncValue = syncMask;
    this.status.locationSynced = (syncMask & 0b001) !== 0;
    this.status.dateSynced = (syncMask & 0b010) !== 0;
    this.status.timeSynced = (syncMask & 0b100) !== 0;

    this.emit('statusUpdate', this.status);
  }

  parseTextNotification(text) {
    if (!text) return;

    // READY status
    if (text === 'READY') {
      this.isBusy = false;
      this.emit('ready');
      return;
    }

    // BUSY status
    if (text === 'BUSY') {
      this.isBusy = true;
      this.emit('busy');
      return;
    }

    // RADEC format: "RADEC %d %d %d %d %d %d "
    if (text.startsWith('RADEC')) {
      const parts = text.split(/\s+/).filter(Boolean);
      if (parts.length >= 7) {
        this.currentPosition = {
          raHours: parseInt(parts[1], 10),
          raMinutes: parseInt(parts[2], 10),
          raSeconds: parseInt(parts[3], 10),
          decDegrees: parseInt(parts[4], 10),
          decMinutes: parseInt(parts[5], 10),
          decSeconds: parseInt(parts[6], 10)
        };
        this.emit('positionUpdate', this.currentPosition);
      }
      return;
    }

    // SOLAR_OBJ_STATUS %d %d %d %d %d %d %d %d %d
    if (text.startsWith('SOLAR_OBJ_STATUS')) {
      const parts = text.split(/\s+/).filter(Boolean);
      if (parts.length >= 10) {
        this.solarSystemVisibility = parts.slice(1, 10).map(v => v === '1');
        this.emit('solarVisibilityUpdate', this.solarSystemVisibility);
      }
      return;
    }

    // SHOW_SETTINGS parsing
    if (text.startsWith('SHOW_SETTINGS')) {
      const parts = text.split(/\s+/).filter(Boolean);
      const sub = parts[1];
      if (sub === 'FIRMWARE_VERSION' && parts[2]) {
        this.settings.firmwareVersion = parseFloat(parts[2]);
      } else if (sub === 'GEAR' && parts[3]) {
        this.settings.gearRatioAz = parseFloat(parts[2]);
        this.settings.gearRatioAlt = parseFloat(parts[3]);
      } else if (sub === 'IDLE' && parts.length >= 8) {
        this.settings.idleAdc = parts.slice(2, 8).map(v => parseInt(v, 10));
      } else if (sub === 'INV' && parts[3]) {
        this.settings.inverted = [parseInt(parts[2], 10), parseInt(parts[3], 10)];
      } else if (sub === 'DATE' && parts[4]) {
        this.settings.date = [parseInt(parts[2], 10), parseInt(parts[3], 10), parseInt(parts[4], 10)];
      } else if (sub === 'TIME' && parts[4]) {
        this.settings.time = [parseInt(parts[2], 10), parseInt(parts[3], 10), parseInt(parts[4], 10)];
      } else if (sub === 'LOC' && parts[3]) {
        this.settings.location = [parseFloat(parts[2]), parseFloat(parts[3])];
      } else if (sub === 'BACKLASH' && parts[3]) {
        this.settings.backlash = [parseInt(parts[2], 10), parseInt(parts[3], 10)];
      } else if (sub === 'MAX_SPEED' && parts[2]) {
        this.settings.maxSpeed = parseFloat(parts[2]);
      } else if (sub === 'TRAC_REFR' && parts[2]) {
        this.settings.trackingRefresh = parseFloat(parts[2]);
      }
      this.emit('settingsUpdate', this.settings);
      return;
    }

    // Generic response
    this.emit('rawMessage', text);
  }

  // --- Specific Protocol Helpers ---

  /**
   * Slew telescope to celestial coordinates
   */
  async gotoCoordinates(raH, raM, raS, decD, decM, decS) {
    this.isBusy = true;
    this.emit('busy');
    const cmd = `GOTO_ANY_OBJECT ${raH} ${raM} ${raS} ${decD} ${decM} ${decS}`;
    return this.sendCommand(cmd);
  }

  /**
   * Slew telescope to Solar System body
   */
  async gotoSolarBody(bodyName) {
    this.isBusy = true;
    this.emit('busy');
    const cmd = `GOTO_SOLAR_SYSTEM ${bodyName}`;
    return this.sendCommand(cmd);
  }

  /**
   * Stop GoTo slew in progress
   */
  async stopGoto() {
    return this.sendCommand('STOP GOTO');
  }

  /**
   * Auto Sync: Sync phone clock (UTC) and phone GPS coordinates
   */
  async autoSync(lat, lon, date = new Date()) {
    // Send time (UTC 24-hr)
    const h = date.getUTCHours();
    const m = date.getUTCMinutes();
    const s = date.getUTCSeconds();
    await this.sendCommand(`SET_TIME ${h} ${m} ${s}`);

    // Pacing delay (100ms)
    await new Promise(r => setTimeout(r, 100));

    // Send date (UTC yyyy mm dd)
    const y = date.getUTCFullYear();
    const mo = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    await this.sendCommand(`SET_DATE ${y} ${mo} ${d}`);

    await new Promise(r => setTimeout(r, 100));

    // Send location (lat lon decimal)
    await this.sendCommand(`SET_LOCATION ${lat.toFixed(6)} ${lon.toFixed(6)}`);
    return true;
  }

  /**
   * Start 1-star or 2-star alignment session
   */
  async startCalibration() {
    return this.sendCommand('CALIB_START');
  }

  /**
   * Send 1st calibration star
   */
  async sendStar1Calibration(raH, raM, raS, decD, decM, decS) {
    return this.sendCommand(`STAR_1_CALIB ${raH} ${raM} ${raS} ${decD} ${decM} ${decS}`);
  }

  /**
   * Send 2nd calibration star
   */
  async sendStar2Calibration(raH, raM, raS, decD, decM, decS) {
    return this.sendCommand(`STAR_2_CALIB ${raH} ${raM} ${raS} ${decD} ${decM} ${decS}`);
  }

  /**
   * Finish 2-star alignment
   */
  async finishTwoStarCalibration() {
    return this.sendCommand('FINISH_2_STAR_CALIB');
  }

  /**
   * Start Direction Setup wizard
   */
  async startDirectionSetup() {
    return this.sendCommand('DIRECTION_SETUP START');
  }

  /**
   * Send direction calibration answer (0 = did move correctly/no reversal, 1 = reversed)
   */
  async sendDirectionResult(reversed) {
    return this.sendCommand(`DIR_CALIB_RESULT ${reversed ? '1' : '0'}`);
  }

  /**
   * Advance to next direction calibration step
   */
  async sendNext() {
    return this.sendCommand('NEXT');
  }

  /**
   * Start App Joystick mode
   */
  async startAppJoystick() {
    await this.sendCommand('APP_JOYSTICK START');
    this.startKeepAlive();
  }

  /**
   * Stop App Joystick mode
   */
  async stopAppJoystick() {
    this.stopKeepAlive();
    return this.sendCommand('NONE');
  }

  /**
   * Send directional jog command
   * @param {string} dir UP, DOWN, LEFT, RIGHT, ULEFT, URIGHT, DLEFT, DRIGHT, or STOP
   */
  async sendAppDirection(dir) {
    return this.sendCommand(`APP DIR ${dir}`);
  }

  /**
   * Set App Joystick motor speed (1-10)
   */
  async setAppSpeed(speed) {
    return this.sendCommand(`APP SPEED ${speed}`);
  }

  /**
   * Toggle axis inversion (1 = U/D, 2 = R/L)
   */
  async toggleAppAxis(axis) {
    return this.sendCommand(`APP TOGGLE ${axis}`);
  }

  /**
   * Start / Stop tracking from app
   */
  async startTracking() {
    return this.sendCommand('APP START TRACKING');
  }

  async stopTracking() {
    return this.sendCommand('APP DIR STOP');
  }

  /**
   * Start / Stop SkyBox Assist spiral search
   */
  async startSkyBoxAssist() {
    return this.sendCommand('APP SKY_BOX_ASSIST START');
  }

  async stopSkyBoxAssist() {
    return this.sendCommand('APP SKY_BOX_ASSIST STOP');
  }

  /**
   * Release or re-engage stepper motors (Hand Move mode)
   */
  async releaseSteppers() {
    return this.sendCommand('RELEASE_STEPPERS');
  }

  /**
   * Set telescope gear ratios
   */
  async setGearRatios(az, alt) {
    return this.sendCommand(`SET_GEAR_RATIO ${az.toFixed(4)} ${alt.toFixed(4)}`);
  }

  /**
   * Set backlash compensation in arcseconds (0 - 4000)
   */
  async setBacklash(azArcsec, altArcsec) {
    return this.sendCommand(`BACKLASH_CALIB ${Math.round(azArcsec)} ${Math.round(altArcsec)}`);
  }

  /**
   * Calibrate physical joystick idle position
   */
  async calibrateJoystickIdle() {
    return this.sendCommand('JOYSTICK_CALIB IDLE');
  }

  /**
   * Calibrate physical joystick max movement
   */
  async calibrateJoystickMax() {
    return this.sendCommand('JOYSTICK_CALIB MAX');
  }

  /**
   * Factory reset controller
   */
  async factoryReset() {
    return this.sendCommand('FACTORY_RESET');
  }

  /**
   * Send 18-integer OTHER_SETTINGS packet
   */
  async sendOtherSettings(opts = {}) {
    const fields = new Array(18).fill(0);
    // Fields:
    // 0: UPDATE_DISPLAY
    // 1: UPDATE_SKYBOX
    // 2: UPDATE_STANDALONE
    // 3: UPDATE_MAX_SPEED
    // 4: UPDATE_REFRESH
    // 5: UNUSED
    // 6: DISPLAY_ON
    // 7: DISPLAY_OFF
    // 8: MAG_LOW
    // 9: MAG_MEDIUM
    // 10: MAG_HIGH
    // 11: SPEED_SLOW
    // 12: SPEED_NORMAL
    // 13: SPEED_FAST
    // 14: STANDALONE_ON
    // 15: STANDALONE_OFF
    // 16: MAX_SPEED_TENTHS
    // 17: REFRESH_HUNDREDTHS

    if (opts.updateDisplay) {
      fields[0] = 1;
      fields[6] = opts.displayOn ? 1 : 0;
      fields[7] = opts.displayOn ? 0 : 1;
    }
    if (opts.updateSkybox) {
      fields[1] = 1;
      fields[8] = opts.skyboxMag === 'low' ? 1 : 0;
      fields[9] = opts.skyboxMag === 'medium' ? 1 : 0;
      fields[10] = opts.skyboxMag === 'high' ? 1 : 0;
      fields[11] = opts.skyboxSpeed === 'slow' ? 1 : 0;
      fields[12] = opts.skyboxSpeed === 'normal' ? 1 : 0;
      fields[13] = opts.skyboxSpeed === 'fast' ? 1 : 0;
    }
    if (opts.updateStandalone) {
      fields[2] = 1;
      fields[14] = opts.standaloneOn ? 1 : 0;
      fields[15] = opts.standaloneOn ? 0 : 1;
    }
    if (opts.updateMaxSpeed) {
      fields[3] = 1;
      fields[16] = Math.round(opts.maxSpeed * 10);
    }
    if (opts.updateRefresh) {
      fields[4] = 1;
      fields[17] = Math.round(opts.trackingRefresh * 100);
    }

    return this.sendCommand(`OTHER_SETTINGS ${fields.join(' ')}`);
  }

  startKeepAlive() {
    this.stopKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      if (this.isConnected) {
        this.sendCommand('APP KEEPALIVE');
      }
    }, 1800);
  }

  stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }
}

/**
 * High-fidelity CosmoPilot ESP32 Hardware Simulator
 * Allows complete app functionality, test flights, and verification in any browser.
 */
class CosmoPilotSimulator {
  constructor(controller) {
    this.controller = controller;
    this.running = false;
    this.timer = null;
    
    // Internal state
    this.currentRA = { h: 2, m: 31, s: 49 };
    this.currentDEC = { d: 89, m: 15, s: 51 };
    this.targetRA = null;
    this.targetDEC = null;
    this.isSlewing = false;
    this.isTracking = false;
    this.steppersReleased = false;

    this.syncMask = 0b111; // Location, date, time synced
    this.aligned = false;
  }

  start() {
    this.running = true;
    this.controller.isConnected = true;
    this.controller.isConnecting = false;
    this.controller.useSimulator = true;
    
    // Emulate initial connection status byte: aligned=false, tracking=false, sync=0b111
    this.emitStatus();

    // Start 1Hz position broadcast timer
    this.timer = setInterval(() => {
      this.updateLoop();
    }, 1000);

    this.controller.emit('connected', { deviceName: 'CosmoPilot Simulator (ESP32)' });
    return true;
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  emitStatus() {
    let byte = 0;
    if (this.isTracking) byte |= (1 << 0);
    if (this.aligned) byte |= (1 << 1);
    byte |= (this.syncMask & 0b111) << 2;

    const buffer = new Uint8Array([BLE_CONFIG.STATUS_TAG, byte]);
    this.controller.handleNotification(new DataView(buffer.buffer));
  }

  updateLoop() {
    if (!this.running) return;

    if (this.isSlewing && this.targetRA && this.targetDEC) {
      // Step towards target
      const raDiff = (this.targetRA.h * 3600 + this.targetRA.m * 60 + this.targetRA.s) -
                     (this.currentRA.h * 3600 + this.currentRA.m * 60 + this.currentRA.s);
      const decDiff = (this.targetDEC.d * 3600 + this.targetDEC.m * 60 + this.targetDEC.s) -
                      (this.currentDEC.d * 3600 + this.currentDEC.m * 60 + this.currentDEC.s);

      if (Math.abs(raDiff) < 15 && Math.abs(decDiff) < 15) {
        this.currentRA = { ...this.targetRA };
        this.currentDEC = { ...this.targetDEC };
        this.isSlewing = false;
        this.targetRA = null;
        this.targetDEC = null;
        
        // Slew completed
        this.notifyText('READY');
      } else {
        const stepRa = Math.sign(raDiff) * Math.min(Math.abs(raDiff), 45);
        const stepDec = Math.sign(decDiff) * Math.min(Math.abs(decDiff), 45);

        let totalRaSec = (this.currentRA.h * 3600 + this.currentRA.m * 60 + this.currentRA.s) + stepRa;
        let totalDecSec = (this.currentDEC.d * 3600 + this.currentDEC.m * 60 + this.currentDEC.s) + stepDec;

        this.currentRA = {
          h: Math.floor(totalRaSec / 3600) % 24,
          m: Math.floor((totalRaSec % 3600) / 60),
          s: Math.floor(totalRaSec % 60)
        };
        this.currentDEC = {
          d: Math.floor(totalDecSec / 3600),
          m: Math.floor(Math.abs(totalDecSec % 3600) / 60),
          s: Math.floor(Math.abs(totalDecSec % 60))
        };
      }
    }

    // Broadcast RADEC
    const radecStr = `RADEC ${this.currentRA.h} ${this.currentRA.m} ${this.currentRA.s} ${this.currentDEC.d} ${this.currentDEC.m} ${this.currentDEC.s} `;
    this.notifyText(radecStr);
  }

  notifyText(str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    this.controller.handleNotification(new DataView(bytes.buffer));
  }

  async receiveCommand(cmd) {
    // Drop CMD prefix
    const bare = cmd.startsWith('CMD ') ? cmd.substring(4) : cmd;
    console.log('[ESP32 Simulator Received]:', cmd);

    if (bare.startsWith('SHOW_SETTINGS')) {
      setTimeout(() => {
        this.notifyText('SHOW_SETTINGS FIRMWARE_VERSION 2.4');
        this.notifyText('SHOW_SETTINGS GEAR 50.000000 50.000000');
        this.notifyText('SHOW_SETTINGS IDLE 1850 1850 1850 1850 1850 1850');
        this.notifyText('SHOW_SETTINGS INV 0 0');
        this.notifyText('SHOW_SETTINGS DATE 2026 10 29');
        this.notifyText('SHOW_SETTINGS TIME 20 30 0');
        this.notifyText('SHOW_SETTINGS LOC 45.464200 9.190000');
        this.notifyText('SHOW_SETTINGS BACKLASH 120 120');
        this.notifyText('SHOW_SETTINGS MAX_SPEED 4.000000');
        this.notifyText('SHOW_SETTINGS TRAC_REFR 3.000000');
        this.notifyText('READY');
      }, 50);
      return true;
    }

    if (bare.startsWith('GOTO_ANY_OBJECT')) {
      const parts = bare.split(/\s+/).slice(1).map(Number);
      if (parts.length >= 6) {
        this.targetRA = { h: parts[0], m: parts[1], s: parts[2] };
        this.targetDEC = { d: parts[3], m: parts[4], s: parts[5] };
        this.isSlewing = true;
        this.notifyText('BUSY');
      }
      return true;
    }

    if (bare.startsWith('GOTO_SOLAR_SYSTEM')) {
      this.targetRA = { h: 10, m: 24, s: 0 };
      this.targetDEC = { d: 12, m: 0, s: 0 };
      this.isSlewing = true;
      this.notifyText('BUSY');
      return true;
    }

    if (bare === 'STOP GOTO') {
      this.isSlewing = false;
      this.targetRA = null;
      this.targetDEC = null;
      this.notifyText('READY');
      return true;
    }

    if (bare === 'CALIB_START') {
      this.aligned = false;
      this.emitStatus();
      this.notifyText('READY');
      return true;
    }

    if (bare.startsWith('STAR_1_CALIB')) {
      const parts = bare.split(/\s+/).slice(1).map(Number);
      if (parts.length >= 6) {
        this.currentRA = { h: parts[0], m: parts[1], s: parts[2] };
        this.currentDEC = { d: parts[3], m: parts[4], s: parts[5] };
      }
      this.aligned = true;
      this.emitStatus();
      this.notifyText('READY');
      return true;
    }

    if (bare.startsWith('STAR_2_CALIB')) {
      // Simulate automatic slew to 2nd star
      this.notifyText('BUSY');
      setTimeout(() => {
        this.notifyText('READY');
      }, 1500);
      return true;
    }

    if (bare === 'FINISH_2_STAR_CALIB') {
      this.aligned = true;
      this.emitStatus();
      this.notifyText('READY');
      return true;
    }

    if (bare.startsWith('SET_TIME')) {
      this.syncMask |= 0b100;
      this.emitStatus();
      this.notifyText('READY');
      return true;
    }

    if (bare.startsWith('SET_DATE')) {
      this.syncMask |= 0b010;
      this.emitStatus();
      this.notifyText('READY');
      return true;
    }

    if (bare.startsWith('SET_LOCATION')) {
      this.syncMask |= 0b001;
      this.emitStatus();
      this.notifyText('READY');
      return true;
    }

    if (bare.startsWith('APP DIR')) {
      const dir = bare.split(' ')[2];
      if (dir === 'UP') this.currentDEC.d += 1;
      if (dir === 'DOWN') this.currentDEC.d -= 1;
      if (dir === 'LEFT') this.currentRA.m -= 1;
      if (dir === 'RIGHT') this.currentRA.m += 1;
      return true;
    }

    if (bare === 'APP START TRACKING') {
      this.isTracking = true;
      this.emitStatus();
      return true;
    }

    if (bare === 'APP DIR STOP' || bare === 'APP STOP TRACKING' || bare === 'NONE') {
      this.isTracking = false;
      this.emitStatus();
      this.notifyText('READY');
      return true;
    }

    if (bare === 'RELEASE_STEPPERS') {
      this.steppersReleased = !this.steppersReleased;
      this.aligned = false;
      this.emitStatus();
      this.notifyText('READY');
      return true;
    }

    if (bare.startsWith('DIRECTION_SETUP START')) {
      this.notifyText('BUSY');
      setTimeout(() => {
        this.notifyText('READY');
      }, 1200);
      return true;
    }

    if (bare === 'NEXT') {
      this.notifyText('BUSY');
      setTimeout(() => {
        this.notifyText('READY');
      }, 1500);
      return true;
    }

    if (bare.startsWith('DIR_CALIB_RESULT')) {
      this.notifyText('READY');
      return true;
    }

    if (bare === 'JOYSTICK_CALIB IDLE') {
      this.notifyText('BUSY');
      setTimeout(() => {
        this.notifyText('READY');
      }, 1000);
      return true;
    }

    if (bare === 'JOYSTICK_CALIB MAX') {
      this.notifyText('BUSY');
      setTimeout(() => {
        this.notifyText('READY');
      }, 10000);
      return true;
    }

    if (bare === 'SOLAR_OBJ_STATUS') {
      this.notifyText('SOLAR_OBJ_STATUS 1 1 1 1 1 0 0 1 1');
      return true;
    }

    // Default reply
    setTimeout(() => {
      this.notifyText('READY');
    }, 50);
    return true;
  }
}

window.BleController = BleController;
window.bleController = new BleController();
