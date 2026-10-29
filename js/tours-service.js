/**
 * CosmoPilot / StarWay - Observing Tours Service
 * Plan, customize, save (up to 10), and observe guided telescope tours.
 */

class ToursService {
  constructor(astronomyService, catalogService, bleController) {
    this.astro = astronomyService;
    this.catalog = catalogService;
    this.ble = bleController;
    this.storageKey = 'cosmopilot_saved_tours';

    this.savedTours = this.loadTours();
    this.activeTour = null;
    this.activeTargetIndex = 0;
  }

  loadTours() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) return JSON.parse(raw);
    } catch (e) {}

    // Default sample tour
    return [
      {
        id: 'tour_default_autumn',
        name: 'Autumn Highlights',
        createdAt: '2026-10-29T20:30:00Z',
        session: {
          dateStr: '2026-10-29',
          timeStr: '20:30',
          durationHours: 2.0,
          location: { name: 'Current GPS', lat: 45.4642, lon: 9.1900 }
        },
        objects: [
          { id: 'm31', name: 'Galassia di Andromeda (M31)', catalog: 'Messier', mag: 3.4, raHours: 0.7122, decDeg: 41.2689 },
          { id: 'm32', name: 'Galassia Satellite (M32)', catalog: 'Messier', mag: 8.1, raHours: 0.7119, decDeg: 40.8653 },
          { id: 'm33', name: 'Galassia del Triangolo (M33)', catalog: 'Messier', mag: 5.7, raHours: 1.5642, decDeg: 30.6602 },
          { id: 'm57', name: 'Nebulosa Anello (M57)', catalog: 'Messier', mag: 8.8, raHours: 18.8933, decDeg: 33.0292 },
          { id: 'albireo', name: 'Albireo (Doppia Colorata)', catalog: 'Stars', mag: 3.1, raHours: 19.5122, decDeg: 27.9597 }
        ]
      }
    ];
  }

  saveTours() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.savedTours));
    } catch (e) {
      console.error('Errore nel salvataggio dei tour:', e);
    }
  }

  saveTour(name, session, objects) {
    if (this.savedTours.length >= 10) {
      throw new Error('Limite massimo di 10 tour salvati raggiunto.');
    }
    if (!name || !name.trim()) {
      throw new Error('Inserire un nome valido per il tour.');
    }
    if (!objects || objects.length === 0) {
      throw new Error('Selezionare almeno un oggetto per il tour.');
    }
    if (objects.length > 30) {
      throw new Error('Un tour può contenere al massimo 30 oggetti.');
    }

    const newTour = {
      id: 'tour_' + Date.now(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      session,
      objects: objects.map(o => ({
        id: o.id,
        name: o.name,
        catalog: o.catalog,
        mag: o.mag,
        raHours: o.raHours,
        decDeg: o.decDeg
      }))
    };

    this.savedTours.push(newTour);
    this.saveTours();
    return newTour;
  }

  updateTour(id, name, session, objects) {
    const idx = this.savedTours.findIndex(t => t.id === id);
    if (idx !== -1) {
      this.savedTours[idx] = {
        ...this.savedTours[idx],
        name: name.trim(),
        session,
        objects: objects.map(o => ({
          id: o.id,
          name: o.name,
          catalog: o.catalog,
          mag: o.mag,
          raHours: o.raHours,
          decDeg: o.decDeg
        }))
      };
      this.saveTours();
      return this.savedTours[idx];
    }
    return null;
  }

  deleteTour(id) {
    this.savedTours = this.savedTours.filter(t => t.id !== id);
    this.saveTours();
  }

  getTour(id) {
    return this.savedTours.find(t => t.id === id);
  }

  // --- Tour Execution Flow ---

  startTour(id) {
    const tour = this.getTour(id);
    if (!tour) throw new Error('Tour non trovato');
    this.activeTour = tour;
    this.activeTargetIndex = 0;
    return this.activeTour;
  }

  getCurrentTarget() {
    if (!this.activeTour || !this.activeTour.objects) return null;
    const target = this.activeTour.objects[this.activeTargetIndex];
    if (!target) return null;

    // Refresh live visibility for current target
    const coords = this.astro.calculateAltAz(target.raHours, target.decDeg, new Date());
    return {
      ...target,
      index: this.activeTargetIndex,
      total: this.activeTour.objects.length,
      coords
    };
  }

  nextTarget() {
    if (!this.activeTour) return null;
    if (this.activeTargetIndex < this.activeTour.objects.length - 1) {
      this.activeTargetIndex++;
    }
    return this.getCurrentTarget();
  }

  prevTarget() {
    if (!this.activeTour) return null;
    if (this.activeTargetIndex > 0) {
      this.activeTargetIndex--;
    }
    return this.getCurrentTarget();
  }

  endTour() {
    this.activeTour = null;
    this.activeTargetIndex = 0;
  }

  /**
   * Pre-flight condition check before starting tour
   */
  checkTourConditions(tour) {
    const now = new Date();
    const plannedDateStr = tour.session.dateStr;
    const plannedTimeStr = tour.session.timeStr;
    const plannedDateTime = new Date(`${plannedDateStr}T${plannedTimeStr}`);

    const diffMinutes = Math.abs((now - plannedDateTime) / (1000 * 60));
    const isTimeMismatch = diffMinutes > 120; // More than 2 hours difference

    let isLocationMismatch = false;
    if (tour.session.location && tour.session.location.lat !== undefined) {
      const distLat = Math.abs(tour.session.location.lat - this.astro.observerLat);
      const distLon = Math.abs(tour.session.location.lon - this.astro.observerLon);
      isLocationMismatch = (distLat > 0.5 || distLon > 0.5);
    }

    return {
      isMismatch: isTimeMismatch || isLocationMismatch,
      timeMismatch: isTimeMismatch,
      locationMismatch: isLocationMismatch,
      plannedDateTime,
      currentDateTime: now
    };
  }
}

window.ToursService = ToursService;
window.toursService = new ToursService(window.astronomyService, window.catalogService, window.bleController);
