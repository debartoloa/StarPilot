/**
 * CosmoPilot / StarWay - Astronomy Service
 * Precise celestial mechanics, ephemerides and visibility calculations based on Astronomy Engine.
 */

class AstronomyService {
  constructor() {
    this.observerLat = 45.4642; // Default Milan/Turin latitude
    this.observerLon = 9.1900;
    this.observerElevation = 150; // meters
    this.visibilityThreshold = 10.0; // 10° altitude threshold as per user manual page 16

    // Try to load saved location
    const saved = localStorage.getItem('cosmopilot_observer_location');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.observerLat = parsed.lat;
        this.observerLon = parsed.lon;
      } catch (e) {}
    }
  }

  setObserverLocation(lat, lon, elevation = 150) {
    this.observerLat = lat;
    this.observerLon = lon;
    this.observerElevation = elevation;
    localStorage.setItem('cosmopilot_observer_location', JSON.stringify({ lat, lon, elevation }));
  }

  getObserver(lat = this.observerLat, lon = this.observerLon, el = this.observerElevation) {
    if (typeof Astronomy !== 'undefined' && Astronomy.MakeObserver) {
      return Astronomy.MakeObserver(lat, lon, el);
    }
    return { latitude: lat, longitude: lon, height: el };
  }

  /**
   * Convert RA (hours decimal or HMS) & DEC (degrees decimal or DMS) to Alt/Az for a specific date
   */
  calculateAltAz(raHours, decDeg, date = new Date(), lat = this.observerLat, lon = this.observerLon) {
    if (typeof Astronomy === 'undefined') {
      // Fallback simple geometric approximation
      return this.approximateAltAz(raHours, decDeg, date, lat, lon);
    }

    try {
      const observer = this.getObserver(lat, lon);
      const astroTime = Astronomy.MakeTime(date);
      
      // Calculate horizontal coordinates from equatorial
      const hor = Astronomy.Horizon(astroTime, observer, raHours, decDeg, 'normal');
      
      return {
        altitude: hor.altitude,
        azimuth: hor.azimuth,
        ra: raHours,
        dec: decDeg,
        isVisible: hor.altitude >= this.visibilityThreshold
      };
    } catch (err) {
      console.error('Astronomy calculation error:', err);
      return this.approximateAltAz(raHours, decDeg, date, lat, lon);
    }
  }

  /**
   * Calculate live position and Alt/Az for Solar System planet or Moon
   */
  calculateSolarBodyAltAz(bodyName, date = new Date(), lat = this.observerLat, lon = this.observerLon) {
    if (typeof Astronomy === 'undefined') {
      return { altitude: 30, azimuth: 180, ra: 12, dec: 0, isVisible: true };
    }

    try {
      const observer = this.getObserver(lat, lon);
      const astroTime = Astronomy.MakeTime(date);
      
      const equ = Astronomy.Equator(bodyName, astroTime, observer, false, true);
      const hor = Astronomy.Horizon(astroTime, observer, equ.ra, equ.dec, 'normal');
      
      return {
        altitude: hor.altitude,
        azimuth: hor.azimuth,
        ra: equ.ra,
        dec: equ.dec,
        dist: equ.dist,
        isVisible: hor.altitude >= this.visibilityThreshold
      };
    } catch (err) {
      console.warn(`Could not compute position for ${bodyName}:`, err);
      return { altitude: 0, azimuth: 0, ra: 0, dec: 0, isVisible: false };
    }
  }

  /**
   * Determine whether an object is visible during a planned observing session
   * @param {number} raHours 
   * @param {number} decDeg 
   * @param {Date} startDate 
   * @param {number} durationHours (e.g. 0.5 to 6.0)
   * @returns {{ status: 'whole'|'part'|'none', startAlt: number, peakAlt: number, endAlt: number }}
   */
  evaluateTourVisibility(raHours, decDeg, startDate, durationHours, lat = this.observerLat, lon = this.observerLon) {
    const steps = Math.max(3, Math.round(durationHours * 2) + 1); // Sample every 30 mins
    let visibleCount = 0;
    let peakAlt = -90;
    let startAlt = 0;
    let endAlt = 0;

    for (let i = 0; i < steps; i++) {
      const offsetMs = (i / (steps - 1)) * (durationHours * 3600 * 1000);
      const sampleDate = new Date(startDate.getTime() + offsetMs);
      const coords = this.calculateAltAz(raHours, decDeg, sampleDate, lat, lon);

      if (i === 0) startAlt = coords.altitude;
      if (i === steps - 1) endAlt = coords.altitude;
      if (coords.altitude > peakAlt) peakAlt = coords.altitude;

      if (coords.isVisible) {
        visibleCount++;
      }
    }

    if (visibleCount === steps) {
      return { status: 'whole', startAlt, peakAlt, endAlt, label: 'Whole session' };
    } else if (visibleCount > 0) {
      return { status: 'part', startAlt, peakAlt, endAlt, label: 'Part of session' };
    } else {
      return { status: 'none', startAlt, peakAlt, endAlt, label: 'Not visible' };
    }
  }

  /**
   * Convert decimal RA hours to HMS object
   */
  decimalRaToHms(ra) {
    let normalized = ra % 24;
    if (normalized < 0) normalized += 24;
    const h = Math.floor(normalized);
    const m = Math.floor((normalized - h) * 60);
    const s = Math.round(((normalized - h) * 60 - m) * 60);
    return { h, m, s: s === 60 ? 59 : s };
  }

  /**
   * Convert HMS to decimal RA hours
   */
  hmsToDecimalRa(h, m, s) {
    return (h || 0) + (m || 0) / 60 + (s || 0) / 3600;
  }

  /**
   * Convert decimal DEC degrees to DMS object
   */
  decimalDecToDms(dec) {
    const sign = dec < 0 ? -1 : 1;
    const absDec = Math.abs(dec);
    const d = Math.floor(absDec);
    const m = Math.floor((absDec - d) * 60);
    const s = Math.round(((absDec - d) * 60 - m) * 60);
    return {
      sign,
      d: d * sign,
      m,
      s: s === 60 ? 59 : s
    };
  }

  /**
   * Convert DMS to decimal DEC degrees
   */
  dmsToDecimalDec(d, m, s) {
    const sign = d < 0 || Object.is(d, -0) ? -1 : 1;
    return d + sign * ((m || 0) / 60 + (s || 0) / 3600);
  }

  /**
   * Format RA string
   */
  formatRa(raHours) {
    const { h, m, s } = this.decimalRaToHms(raHours);
    return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  }

  /**
   * Format DEC string
   */
  formatDec(decDeg) {
    const { d, m, s } = this.decimalDecToDms(decDeg);
    const signStr = d >= 0 ? '+' : '';
    return `${signStr}${d}° ${m.toString().padStart(2, '0')}' ${s.toString().padStart(2, '0')}"`;
  }

  /**
   * Simple geometric fallback for Alt/Az if astronomy-engine is unavailable
   */
  approximateAltAz(raHours, decDeg, date, lat, lon) {
    // Julian Day
    const t = date.getTime();
    const jd = (t / 86400000) + 2440587.5;
    const d = jd - 2451545.0;
    // Greenwich Mean Sidereal Time (degrees)
    let gmst = (280.46061837 + 360.98564736629 * d) % 360;
    if (gmst < 0) gmst += 360;
    // Local Sidereal Time (degrees)
    let lst = (gmst + lon) % 360;
    if (lst < 0) lst += 360;

    const raDeg = raHours * 15;
    let ha = (lst - raDeg) % 360;
    if (ha < 0) ha += 360;

    const deg2rad = Math.PI / 180;
    const rad2deg = 180 / Math.PI;

    const latRad = lat * deg2rad;
    const decRad = decDeg * deg2rad;
    const haRad = ha * deg2rad;

    const sinAlt = Math.sin(decRad) * Math.sin(latRad) + Math.cos(decRad) * Math.cos(latRad) * Math.cos(haRad);
    const altRad = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    const alt = altRad * rad2deg;

    const cosAz = (Math.sin(decRad) - Math.sin(altRad) * Math.sin(latRad)) / (Math.cos(altRad) * Math.cos(latRad));
    let az = Math.acos(Math.max(-1, Math.min(1, cosAz))) * rad2deg;
    if (Math.sin(haRad) > 0) {
      az = 360 - az;
    }

    return {
      altitude: alt,
      azimuth: az,
      ra: raHours,
      dec: decDeg,
      isVisible: alt >= this.visibilityThreshold
    };
  }
}

window.AstronomyService = AstronomyService;
window.astronomyService = new AstronomyService();
