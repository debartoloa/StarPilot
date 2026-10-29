/**
 * CosmoPilot / StarWay - Celestial Catalogs & Target Management
 * Covers Messier (M1-M110), Stars, Galaxies, Nebulae, Solar System, and Custom Targets (up to 200).
 */

class CatalogService {
  constructor(astronomyService) {
    this.astro = astronomyService;
    this.customTargetsKey = 'cosmopilot_custom_targets';
    this.savedLocationsKey = 'cosmopilot_saved_locations';
    
    this.customTargets = this.loadCustomTargets();
    this.savedLocations = this.loadSavedLocations();
    
    // Planning state
    this.planningDate = new Date();
    this.planningLocation = null; // null = use current phone location
    this.filterVisibleOnly = false;
    this.filterMaxMag = null; // null = no limit

    this.initBuiltInCatalogs();
  }

  loadCustomTargets() {
    try {
      const raw = localStorage.getItem(this.customTargetsKey);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  saveCustomTargets() {
    try {
      localStorage.setItem(this.customTargetsKey, JSON.stringify(this.customTargets));
    } catch (e) {
      console.error('Errore nel salvataggio oggetti custom:', e);
    }
  }

  loadSavedLocations() {
    try {
      const raw = localStorage.getItem(this.savedLocationsKey);
      return raw ? JSON.parse(raw) : [
        { name: 'Milano (Centro)', lat: 45.4642, lon: 9.1900 },
        { name: 'Monte Amiata (Cielo Scuro)', lat: 42.8911, lon: 11.6253 },
        { name: 'Alpi Orobie (Rifugio)', lat: 46.0354, lon: 9.9482 }
      ];
    } catch (e) {
      return [];
    }
  }

  saveLocationBookmark(name, lat, lon) {
    if (this.savedLocations.length >= 5) {
      throw new Error('Massimo 5 posizioni salvate consentite.');
    }
    this.savedLocations.push({ name, lat: parseFloat(lat), lon: parseFloat(lon) });
    localStorage.setItem(this.savedLocationsKey, JSON.stringify(this.savedLocations));
  }

  deleteLocationBookmark(index) {
    if (index >= 0 && index < this.savedLocations.length) {
      this.savedLocations.splice(index, 1);
      localStorage.setItem(this.savedLocationsKey, JSON.stringify(this.savedLocations));
    }
  }

  addCustomTarget(target) {
    if (this.customTargets.length >= 200) {
      throw new Error('Limite massimo di 200 oggetti personalizzati raggiunto.');
    }
    const newTarget = {
      id: 'custom_' + Date.now(),
      name: target.name.trim(),
      catalog: 'Custom',
      type: target.type || 'Custom Object',
      constellation: target.constellation || 'Custom',
      raHours: target.raHours,
      decDeg: target.decDeg,
      mag: target.mag !== undefined ? target.mag : 99,
      description: target.description || 'Target custom salvato dall\'utente.'
    };
    this.customTargets.push(newTarget);
    this.saveCustomTargets();
    return newTarget;
  }

  updateCustomTarget(id, updatedData) {
    const idx = this.customTargets.findIndex(t => t.id === id);
    if (idx !== -1) {
      this.customTargets[idx] = {
        ...this.customTargets[idx],
        ...updatedData
      };
      this.saveCustomTargets();
      return this.customTargets[idx];
    }
    return null;
  }

  deleteCustomTarget(id) {
    this.customTargets = this.customTargets.filter(t => t.id !== id);
    this.saveCustomTargets();
  }

  // --- Catalog Queries ---

  getCatalogItems(category, query = '', maxMag = this.filterMaxMag, visibleOnly = this.filterVisibleOnly) {
    let items = [];
    if (category === 'solar') items = this.solarSystemCatalog;
    else if (category === 'stars') items = this.starsCatalog;
    else if (category === 'galaxies') items = this.galaxiesCatalog;
    else if (category === 'nebulae') items = this.nebulaeCatalog;
    else if (category === 'messier') items = this.messierCatalog;
    else if (category === 'custom') items = this.customTargets;
    else items = [...this.starsCatalog, ...this.messierCatalog, ...this.customTargets];

    const evalDate = this.planningDate || new Date();
    const evalLat = this.planningLocation ? this.planningLocation.lat : this.astro.observerLat;
    const evalLon = this.planningLocation ? this.planningLocation.lon : this.astro.observerLon;

    // Calculate real-time coordinates and visibility
    const enriched = items.map(item => {
      let coords;
      if (item.isSolarSystem) {
        coords = this.astro.calculateSolarBodyAltAz(item.body, evalDate, evalLat, evalLon);
      } else {
        coords = this.astro.calculateAltAz(item.raHours, item.decDeg, evalDate, evalLat, evalLon);
      }
      return {
        ...item,
        coords
      };
    });

    // Apply filtering
    return enriched.filter(item => {
      // Search term
      if (query) {
        const q = query.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchId = (item.designation || '').toLowerCase().includes(q);
        const matchConst = (item.constellation || '').toLowerCase().includes(q);
        if (!matchName && !matchId && !matchConst) return false;
      }
      // Max magnitude
      if (maxMag !== null && maxMag !== undefined && item.mag !== undefined && item.mag > maxMag) {
        return false;
      }
      // Visible only
      if (visibleOnly && !item.coords.isVisible) {
        return false;
      }
      return true;
    }).sort((a, b) => {
      // Primary sort: Visible first
      if (a.coords.isVisible && !b.coords.isVisible) return -1;
      if (!a.coords.isVisible && b.coords.isVisible) return 1;
      // Secondary: Brightest magnitude first
      return (a.mag || 99) - (b.mag || 99);
    });
  }

  /**
   * Get reference stars for 1-Star and 2-Star Alignment
   * Max magnitude <= 4.0 as defined in manual page 11.
   */
  getAlignmentStars(query = '') {
    return this.getCatalogItems('stars', query, 4.0, false);
  }

  /**
   * Get a random visible object from fixed catalogs (excludes Solar System and Custom)
   * As specified in user manual page 17.
   */
  getRandomVisibleTarget(maxMag = null) {
    const fixedCatalogs = [...this.starsCatalog, ...this.galaxiesCatalog, ...this.nebulaeCatalog, ...this.messierCatalog];
    const evalDate = new Date();
    const visiblePool = [];

    for (const item of fixedCatalogs) {
      if (maxMag !== null && item.mag > maxMag) continue;
      const coords = this.astro.calculateAltAz(item.raHours, item.decDeg, evalDate);
      if (coords.isVisible) {
        visiblePool.push({ ...item, coords });
      }
    }

    if (visiblePool.length === 0) {
      // Fallback if none visible above threshold
      const item = this.starsCatalog[0];
      return { ...item, coords: this.astro.calculateAltAz(item.raHours, item.decDeg, evalDate) };
    }

    const randomIndex = Math.floor(Math.random() * visiblePool.length);
    return visiblePool[randomIndex];
  }

  initBuiltInCatalogs() {
    // 1. Solar System
    this.solarSystemCatalog = [
      { id: 'moon', name: 'Luna', designation: 'Moon', type: 'Satellite Naturale', constellation: 'Variabile', mag: -12.5, isSolarSystem: true, body: 'Moon', description: 'Satellite naturale della Terra con crateri spettacolari.' },
      { id: 'jupiter', name: 'Giove', designation: 'Jupiter', type: 'Pianeta Gigante', constellation: 'Variabile', mag: -2.4, isSolarSystem: true, body: 'Jupiter', description: 'Il gigante gassoso con bande nuvolose e le 4 lune galileiane.' },
      { id: 'saturn', name: 'Saturno', designation: 'Saturn', type: 'Pianeta Anellato', constellation: 'Variabile', mag: 0.5, isSolarSystem: true, body: 'Saturn', description: 'Spettacolare sistema di anelli e luna Titano.' },
      { id: 'mars', name: 'Marte', designation: 'Mars', type: 'Pianeta Roccioso', constellation: 'Variabile', mag: -0.5, isSolarSystem: true, body: 'Mars', description: 'Il pianeta rosso con calotte polari visibili.' },
      { id: 'venus', name: 'Venere', designation: 'Venus', type: 'Pianeta Interno', constellation: 'Variabile', mag: -4.4, isSolarSystem: true, body: 'Venus', description: 'Pianeta brillante con marcate fasi simili a quelle lunari.' },
      { id: 'mercury', name: 'Mercurio', designation: 'Mercury', type: 'Pianeta Interno', constellation: 'Variabile', mag: 0.1, isSolarSystem: true, body: 'Mercury', description: 'Pianeta più vicino al Sole, osservabile al crepuscolo.' },
      { id: 'uranus', name: 'Urano', designation: 'Uranus', type: 'Gigante Ghiacciato', constellation: 'Variabile', mag: 5.7, isSolarSystem: true, body: 'Uranus', description: 'Dischetto verdastro visibile ad alti ingrandimenti.' },
      { id: 'neptune', name: 'Nettuno', designation: 'Neptune', type: 'Gigante Ghiacciato', constellation: 'Variabile', mag: 7.8, isSolarSystem: true, body: 'Neptune', description: 'Il pianeta più distante, tenue colore bluastro.' },
      { id: 'sun', name: 'Sole', designation: 'Sun', type: 'Stella', constellation: 'Variabile', mag: -26.7, isSolarSystem: true, body: 'Sun', isSunWarning: true, description: '⚠️ ATTENZIONE: Osservare solo con filtro solare certificato a tutta apertura!' }
    ];

    // 2. Stars (Primary calibration and navigational stars with mag <= 4.0)
    this.starsCatalog = [
      { id: 'polaris', name: 'Polaris (Stella Polare)', designation: 'Alpha UMi', type: 'Stella Calibrazione', constellation: 'Orsa Minore', mag: 2.0, raHours: 2.5303, decDeg: 89.2641, description: 'Perno del polo nord celeste, ideale per livellamento e offset.' },
      { id: 'vega', name: 'Vega', designation: 'Alpha Lyr', type: 'Stella Calibrazione', constellation: 'Lira', mag: 0.03, raHours: 18.6156, decDeg: 38.7836, description: 'Bianco-azzurra brillante, vertice del Triangolo Estivo.' },
      { id: 'sirius', name: 'Sirio', designation: 'Alpha CMa', type: 'Stella Calibrazione', constellation: 'Cane Maggiore', mag: -1.46, raHours: 6.7525, decDeg: -16.7161, description: 'La stella più luminosa del cielo notturno terrestre.' },
      { id: 'arcturus', name: 'Arturo', designation: 'Alpha Boo', type: 'Stella Calibrazione', constellation: 'Boote', mag: -0.05, raHours: 14.2611, decDeg: 19.1822, description: 'Gigante arancione luminosissima nell\'emisfero boreale.' },
      { id: 'betelgeuse', name: 'Betelgeuse', designation: 'Alpha Ori', type: 'Supergigante Rossa', constellation: 'Orione', mag: 0.5, raHours: 5.9194, decDeg: 7.4070, description: 'Supergigante rossa al vertice sinistro di Orione.' },
      { id: 'rigel', name: 'Rigel', designation: 'Beta Ori', type: 'Supergigante Blu', constellation: 'Orione', mag: 0.18, raHours: 5.2422, decDeg: -8.2016, description: 'Supergigante bluastra luminosa ai piedi di Orione.' },
      { id: 'capella', name: 'Capella', designation: 'Alpha Aur', type: 'Stella Calibrazione', constellation: 'Auriga', mag: 0.08, raHours: 5.2781, decDeg: 45.9978, description: 'Brillante astro dorato circumpolare alle nostre latitudini.' },
      { id: 'altair', name: 'Altair', designation: 'Alpha Aql', type: 'Stella Calibrazione', constellation: 'Aquila', mag: 0.77, raHours: 19.8464, decDeg: 8.8683, description: 'Stella bianca a rotazione rapida del Triangolo Estivo.' },
      { id: 'deneb', name: 'Deneb', designation: 'Alpha Cyg', type: 'Stella Calibrazione', constellation: 'Cigno', mag: 1.25, raHours: 20.6905, decDeg: 45.2803, description: 'Vertice settentrionale della Croce del Nord.' },
      { id: 'aldebaran', name: 'Aldebaran', designation: 'Alpha Tau', type: 'Gigante Arancione', constellation: 'Toro', mag: 0.85, raHours: 4.5986, decDeg: 16.5094, description: 'L\'occhio rosso ardente della costellazione del Toro.' },
      { id: 'antares', name: 'Antares', designation: 'Alpha Sco', type: 'Supergigante Rossa', constellation: 'Scorpione', mag: 1.06, raHours: 16.4900, decDeg: -26.4319, description: 'Il cuore rubino dello Scorpione.' },
      { id: 'spica', name: 'Spica', designation: 'Alpha Vir', type: 'Stella Calibrazione', constellation: 'Vergine', mag: 0.98, raHours: 13.4199, decDeg: -11.1614, description: 'Azzurra e isolata nella grande costellazione della Vergine.' },
      { id: 'pollux', name: 'Polluce', designation: 'Beta Gem', type: 'Stella Calibrazione', constellation: 'Gemelli', mag: 1.16, raHours: 7.7553, decDeg: 28.0261, description: 'Il fratello gemello arancione di Castore.' },
      { id: 'castor', name: 'Castore', designation: 'Alpha Gem', type: 'Stella Doppia', constellation: 'Gemelli', mag: 1.58, raHours: 7.5767, decDeg: 31.8883, description: 'Celebre sistema multiplo ben sdoppiabile al telescopio.' },
      { id: 'procyon', name: 'Procione', designation: 'Alpha CMi', type: 'Stella Calibrazione', constellation: 'Cane Minore', mag: 0.34, raHours: 7.6550, decDeg: 5.2250, description: 'Bianco-giallastra vicina al nostro sistema solare.' },
      { id: 'regulus', name: 'Regolo', designation: 'Alpha Leo', type: 'Stella Calibrazione', constellation: 'Leone', mag: 1.36, raHours: 10.1394, decDeg: 11.9672, description: 'Il piccolo re, alla base della falce del Leone.' },
      { id: 'dubhe', name: 'Dubhe', designation: 'Alpha UMa', type: 'Stella Calibrazione', constellation: 'Orsa Maggiore', mag: 1.8, raHours: 11.0622, decDeg: 61.7508, description: 'Una delle due stelle puntatrici del Grande Carro verso la Polare.' },
      { id: 'merak', name: 'Merak', designation: 'Beta UMa', type: 'Stella Calibrazione', constellation: 'Orsa Maggiore', mag: 2.37, raHours: 11.0306, decDeg: 56.3825, description: 'Seconda stella puntatrice dell\'Orsa Maggiore verso Polaris.' },
      { id: 'mizar', name: 'Mizar', designation: 'Zeta UMa', type: 'Stella Doppia', constellation: 'Orsa Maggiore', mag: 2.23, raHours: 13.3986, decDeg: 54.9253, description: 'Celebre coppia visuale Mizar e Alcor nella coda del Carro.' },
      { id: 'albireo', name: 'Albireo', designation: 'Beta Cyg', type: 'Stella Doppia Colorata', constellation: 'Cigno', mag: 3.1, raHours: 19.5122, decDeg: 27.9597, description: 'La stella doppia più spettacolare: componente oro e zaffiro.' }
    ];

    // 3. Galaxies
    this.galaxiesCatalog = [
      { id: 'm31', name: 'Galassia di Andromeda', designation: 'M31 / NGC 224', type: 'Galassia a Spirale', constellation: 'Andromeda', mag: 3.4, raHours: 0.7122, decDeg: 41.2689, description: 'La galassia gigante più vicina alla Via Lattea.' },
      { id: 'm32', name: 'Galassia Satellite di Andromeda', designation: 'M32 / NGC 221', type: 'Galassia Ellittica Nana', constellation: 'Andromeda', mag: 8.1, raHours: 0.7119, decDeg: 40.8653, description: 'Compatta compagna ellittica di M31.' },
      { id: 'm33', name: 'Galassia del Triangolo', designation: 'M33 / NGC 598', type: 'Galassia a Spirale', constellation: 'Triangolo', mag: 5.7, raHours: 1.5642, decDeg: 30.6602, description: 'Terza galassia del Gruppo Locale con estesi bracci aperti.' },
      { id: 'm51', name: 'Galassia Vortice', designation: 'M51 / NGC 5194', type: 'Galassia a Spirale con Interazione', constellation: 'Cani da Caccia', mag: 8.4, raHours: 13.4981, decDeg: 47.1953, description: 'Iconica spirale con bracci ben definiti e galassia compagna.' },
      { id: 'm81', name: 'Galassia di Bode', designation: 'M81 / NGC 3031', type: 'Galassia a Spirale', constellation: 'Orsa Maggiore', mag: 6.9, raHours: 9.9261, decDeg: 69.0653, description: 'Nucleo luminoso splendido in coppia con M82.' },
      { id: 'm82', name: 'Galassia Sigaro', designation: 'M82 / NGC 3034', type: 'Galassia Starburst', constellation: 'Orsa Maggiore', mag: 8.4, raHours: 9.9292, decDeg: 69.6797, description: 'Vista di taglio con densi filamenti oscuri di polvere.' },
      { id: 'm101', name: 'Galassia Girandola', designation: 'M101 / NGC 5457', type: 'Galassia a Spirale frontale', constellation: 'Orsa Maggiore', mag: 7.9, raHours: 14.0533, decDeg: 54.3489, description: 'Grande spirale vista frontalmente.' },
      { id: 'm104', name: 'Galassia Sombrero', designation: 'M104 / NGC 4594', type: 'Galassia a Spirale / Ellittica', constellation: 'Vergine', mag: 8.0, raHours: 12.6664, decDeg: -11.6231, description: 'Bulbo prominente attraversato da una marcata banda di polveri.' },
      { id: 'ngc253', name: 'Galassia dello Scultore', designation: 'NGC 253', type: 'Galassia Starburst', constellation: 'Scultore', mag: 7.2, raHours: 0.7933, decDeg: -25.2881, description: 'Grande galassia molto polverosa e ricca di dettagli.' },
      { id: 'ngc4565', name: 'Galassia Ago', designation: 'NGC 4565', type: 'Galassia Spirale di Taglio', constellation: 'Chioma di Berenice', mag: 9.6, raHours: 12.6067, decDeg: 25.9875, description: 'La più bella galassia vista perfettamente di taglio nel cielo.' }
    ];

    // 4. Nebulae
    this.nebulaeCatalog = [
      { id: 'm42', name: 'Grande Nebulosa di Orione', designation: 'M42 / NGC 1976', type: 'Nebulosa a Emissione/Riflessione', constellation: 'Orione', mag: 4.0, raHours: 5.5906, decDeg: -5.3911, description: 'La culla stellare più celebre, con l\'ammasso del Trapezio al centro.' },
      { id: 'm43', name: 'Nebulosa di De Mairan', designation: 'M43 / NGC 1982', type: 'Nebulosa a Emissione', constellation: 'Orione', mag: 9.0, raHours: 5.5925, decDeg: -5.2744, description: 'Porzione settentrionale separata da una corsia oscura da M42.' },
      { id: 'm57', name: 'Nebulosa Anello', designation: 'M57 / NGC 6720', type: 'Nebulosa Planetaria', constellation: 'Lira', mag: 8.8, raHours: 18.8933, decDeg: 33.0292, description: 'Bolla gassosa anulare espulsa da una nana bianca centrale.' },
      { id: 'm27', name: 'Nebulosa Manubrio (Dumbbell)', designation: 'M27 / NGC 6853', type: 'Nebulosa Planetaria', constellation: 'Volpetta', mag: 7.4, raHours: 19.9939, decDeg: 22.7211, description: 'Grande ed evidente sagoma a clessidra o manubrio.' },
      { id: 'm8', name: 'Nebulosa Laguna', designation: 'M8 / NGC 6523', type: 'Nebulosa a Emissione', constellation: 'Sagittario', mag: 6.0, raHours: 18.0603, decDeg: -24.3867, description: 'Vasta nube stellare solcata da un canale scuro.' },
      { id: 'm20', name: 'Nebulosa Trifida', designation: 'M20 / NGC 6514', type: 'Nebulosa a Emissione/Riflessione', constellation: 'Sagittario', mag: 6.3, raHours: 18.0436, decDeg: -23.0311, description: 'Divisa in tre lobi da dense corsie di polvere opaca.' },
      { id: 'm16', name: 'Nebulosa Aquila (Pilastri della Creazione)', designation: 'M16 / NGC 6611', type: 'Ammasso + Nebulosa', constellation: 'Serpente', mag: 6.0, raHours: 18.3133, decDeg: -13.7917, description: 'Sede dei famosi Pilastri della Creazione immortalati da Hubble.' },
      { id: 'm17', name: 'Nebulosa Omega / Cigno', designation: 'M17 / NGC 6618', type: 'Nebulosa a Emissione', constellation: 'Sagittario', mag: 6.0, raHours: 18.3467, decDeg: -16.1750, description: 'Forma inconfondibile di cigno che galleggia sulla volta celeste.' },
      { id: 'm1', name: 'Nebulosa Granchio', designation: 'M1 / NGC 1952', type: 'Resto di Supernova', constellation: 'Toro', mag: 8.4, raHours: 5.5756, decDeg: 22.0144, description: 'Relitto dell\'esplosione di supernova osservata nel 1054 d.C.' },
      { id: 'ngc7000', name: 'Nebulosa Nord America', designation: 'NGC 7000', type: 'Nebulosa a Emissione', constellation: 'Cigno', mag: 4.0, raHours: 20.9833, decDeg: 44.5333, description: 'Forma somigliante al continente nordamericano vicino a Deneb.' },
      { id: 'ngc6960', name: 'Nebulosa Velo (Ovest)', designation: 'NGC 6960', type: 'Resto di Supernova', constellation: 'Cigno', mag: 7.0, raHours: 20.7617, decDeg: 30.7167, description: 'La Scopa della Strega, filamento incandescente attraversato da 52 Cygni.' }
    ];

    // 5. Complete Messier Catalog (M1-M110)
    this.messierCatalog = this.generateMessierCatalog();
  }

  generateMessierCatalog() {
    const rawMessier = [
      { m: 1, name: 'Nebulosa Granchio', type: 'Resto di Supernova', const: 'Toro', mag: 8.4, ra: 5.5756, dec: 22.0144 },
      { m: 2, name: 'Ammasso Globulare M2', type: 'Ammasso Globulare', const: 'Acquario', mag: 6.3, ra: 21.5583, dec: -0.8233 },
      { m: 3, name: 'Ammasso Globulare M3', type: 'Ammasso Globulare', const: 'Cani da Caccia', mag: 6.2, ra: 13.7033, dec: 28.3767 },
      { m: 4, name: 'Ammasso Globulare M4', type: 'Ammasso Globulare', const: 'Scorpione', mag: 5.6, ra: 16.3933, dec: -26.5267 },
      { m: 5, name: 'Ammasso Globulare M5', type: 'Ammasso Globulare', const: 'Serpente', mag: 5.6, ra: 15.3100, dec: 2.0817 },
      { m: 6, name: 'Ammasso Farfalla', type: 'Ammasso Aperto', const: 'Scorpione', mag: 4.2, ra: 17.6683, dec: -32.2533 },
      { m: 7, name: 'Ammasso di Tolomeo', type: 'Ammasso Aperto', const: 'Scorpione', mag: 3.3, ra: 17.8983, dec: -34.8233 },
      { m: 8, name: 'Nebulosa Laguna', type: 'Nebulosa a Emissione', const: 'Sagittario', mag: 6.0, ra: 18.0603, dec: -24.3867 },
      { m: 9, name: 'Ammasso Globulare M9', type: 'Ammasso Globulare', const: 'Ofiuco', mag: 7.7, ra: 17.3200, dec: -18.5167 },
      { m: 10, name: 'Ammasso Globulare M10', type: 'Ammasso Globulare', const: 'Ofiuco', mag: 6.4, ra: 16.9517, dec: -4.1000 },
      { m: 11, name: 'Ammasso dell\'Anatra Selvatica', type: 'Ammasso Aperto', const: 'Scudo', mag: 6.3, ra: 18.8517, dec: -6.2700 },
      { m: 12, name: 'Ammasso Globulare M12', type: 'Ammasso Globulare', const: 'Ofiuco', mag: 7.7, ra: 16.7867, dec: -1.9483 },
      { m: 13, name: 'Grande Ammasso Globulare di Ercole', type: 'Ammasso Globulare', const: 'Ercole', mag: 5.8, ra: 16.6950, dec: 36.4600 },
      { m: 14, name: 'Ammasso Globulare M14', type: 'Ammasso Globulare', const: 'Ofiuco', mag: 7.6, ra: 17.6267, dec: -3.2467 },
      { m: 15, name: 'Ammasso di Pegaso', type: 'Ammasso Globulare', const: 'Pegaso', mag: 6.2, ra: 21.5000, dec: 12.1667 },
      { m: 16, name: 'Nebulosa Aquila', type: 'Nebulosa a Emissione', const: 'Serpente', mag: 6.0, ra: 18.3133, dec: -13.7917 },
      { m: 17, name: 'Nebulosa Omega (Cigno)', type: 'Nebulosa a Emissione', const: 'Sagittario', mag: 6.0, ra: 18.3467, dec: -16.1750 },
      { m: 18, name: 'Ammasso Aperto M18', type: 'Ammasso Aperto', const: 'Sagittario', mag: 7.5, ra: 18.3317, dec: -17.1400 },
      { m: 19, name: 'Ammasso Globulare M19', type: 'Ammasso Globulare', const: 'Ofiuco', mag: 6.8, ra: 17.0433, dec: -26.2683 },
      { m: 20, name: 'Nebulosa Trifida', type: 'Nebulosa a Emissione', const: 'Sagittario', mag: 6.3, ra: 18.0436, dec: -23.0311 },
      { m: 21, name: 'Ammasso Aperto M21', type: 'Ammasso Aperto', const: 'Sagittario', mag: 6.5, ra: 18.0767, dec: -22.5000 },
      { m: 22, name: 'Ammasso di Sagittario', type: 'Ammasso Globulare', const: 'Sagittario', mag: 5.1, ra: 18.6067, dec: -23.9033 },
      { m: 23, name: 'Ammasso Aperto M23', type: 'Ammasso Aperto', const: 'Sagittario', mag: 5.5, ra: 17.9483, dec: -19.0183 },
      { m: 24, name: 'Nube Stellare del Sagittario', type: 'Nube Stellare', const: 'Sagittario', mag: 4.6, ra: 18.2833, dec: -18.4333 },
      { m: 25, name: 'Ammasso Aperto M25', type: 'Ammasso Aperto', const: 'Sagittario', mag: 4.6, ra: 18.5267, dec: -19.1167 },
      { m: 26, name: 'Ammasso Aperto M26', type: 'Ammasso Aperto', const: 'Scudo', mag: 8.0, ra: 18.7533, dec: -9.3833 },
      { m: 27, name: 'Nebulosa Manubrio (Dumbbell)', type: 'Nebulosa Planetaria', const: 'Volpetta', mag: 7.4, ra: 19.9939, dec: 22.7211 },
      { m: 28, name: 'Ammasso Globulare M28', type: 'Ammasso Globulare', const: 'Sagittario', mag: 6.8, ra: 18.4083, dec: -24.8700 },
      { m: 29, name: 'Ammasso Aperto M29', type: 'Ammasso Aperto', const: 'Cigno', mag: 7.1, ra: 20.3983, dec: 38.5233 },
      { m: 30, name: 'Ammasso Globulare M30', type: 'Ammasso Globulare', const: 'Capricorno', mag: 7.2, ra: 21.6733, dec: -23.1817 },
      { m: 31, name: 'Galassia di Andromeda', type: 'Galassia a Spirale', const: 'Andromeda', mag: 3.4, ra: 0.7122, dec: 41.2689 },
      { m: 32, name: 'Galassia Ellittica M32', type: 'Galassia Ellittica', const: 'Andromeda', mag: 8.1, ra: 0.7119, dec: 40.8653 },
      { m: 33, name: 'Galassia del Triangolo', type: 'Galassia a Spirale', const: 'Triangolo', mag: 5.7, ra: 1.5642, dec: 30.6602 },
      { m: 34, name: 'Ammasso Aperto M34', type: 'Ammasso Aperto', const: 'Perseo', mag: 5.5, ra: 2.7017, dec: 42.7833 },
      { m: 35, name: 'Ammasso Aperto M35', type: 'Ammasso Aperto', const: 'Gemelli', mag: 5.3, ra: 6.1483, dec: 24.3333 },
      { m: 36, name: 'Ammasso Aperto M36', type: 'Ammasso Aperto', const: 'Auriga', mag: 6.3, ra: 5.6017, dec: 34.1400 },
      { m: 37, name: 'Ammasso Aperto M37', type: 'Ammasso Aperto', const: 'Auriga', mag: 6.2, ra: 5.8733, dec: 32.5500 },
      { m: 38, name: 'Ammasso Stella Marina M38', type: 'Ammasso Aperto', const: 'Auriga', mag: 7.4, ra: 5.4783, dec: 35.8500 },
      { m: 39, name: 'Ammasso Aperto M39', type: 'Ammasso Aperto', const: 'Cigno', mag: 4.6, ra: 21.5367, dec: 48.4333 },
      { m: 40, name: 'Stella Doppia Winnecke 4', type: 'Stella Doppia', const: 'Orsa Maggiore', mag: 9.7, ra: 12.3700, dec: 58.0833 },
      { m: 41, name: 'Ammasso Aperto M41', type: 'Ammasso Aperto', const: 'Cane Maggiore', mag: 4.5, ra: 6.7833, dec: -20.7333 },
      { m: 42, name: 'Grande Nebulosa di Orione', type: 'Nebulosa Diffusa', const: 'Orione', mag: 4.0, ra: 5.5906, dec: -5.3911 },
      { m: 43, name: 'Nebulosa di De Mairan', type: 'Nebulosa a Emissione', const: 'Orione', mag: 9.0, ra: 5.5925, dec: -5.2744 },
      { m: 44, name: 'Presepe (Alveare)', type: 'Ammasso Aperto', const: 'Cancro', mag: 3.7, ra: 8.6683, dec: 19.6667 },
      { m: 45, name: 'Pleiadi (Sette Sorelle)', type: 'Ammasso con Nebulosità', const: 'Toro', mag: 1.6, ra: 3.7833, dec: 24.1167 },
      { m: 46, name: 'Ammasso Aperto M46', type: 'Ammasso Aperto', const: 'Poppa', mag: 6.0, ra: 7.6967, dec: -14.8167 },
      { m: 47, name: 'Ammasso Aperto M47', type: 'Ammasso Aperto', const: 'Poppa', mag: 4.2, ra: 7.6100, dec: -14.5000 },
      { m: 48, name: 'Ammasso Aperto M48', type: 'Ammasso Aperto', const: 'Idra', mag: 5.5, ra: 8.2300, dec: -5.8000 },
      { m: 49, name: 'Galassia Ellittica M49', type: 'Galassia Ellittica', const: 'Vergine', mag: 8.4, ra: 12.4967, dec: 8.0000 },
      { m: 50, name: 'Ammasso Aperto M50', type: 'Ammasso Aperto', const: 'Unicorno', mag: 5.9, ra: 7.0533, dec: -8.3333 },
      { m: 51, name: 'Galassia Vortice', type: 'Galassia a Spirale', const: 'Cani da Caccia', mag: 8.4, ra: 13.4981, dec: 47.1953 },
      { m: 52, name: 'Ammasso Aperto M52', type: 'Ammasso Aperto', const: 'Cassiopea', mag: 7.3, ra: 23.4033, dec: 61.5933 },
      { m: 53, name: 'Ammasso Globulare M53', type: 'Ammasso Globulare', const: 'Chioma di Berenice', mag: 7.6, ra: 13.2150, dec: 18.1683 },
      { m: 54, name: 'Ammasso Globulare M54', type: 'Ammasso Globulare', const: 'Sagittario', mag: 7.6, ra: 18.9183, dec: -30.4783 },
      { m: 55, name: 'Ammasso Globulare M55', type: 'Ammasso Globulare', const: 'Sagittario', mag: 6.3, ra: 19.6667, dec: -30.9633 },
      { m: 56, name: 'Ammasso Globulare M56', type: 'Ammasso Globulare', const: 'Lira', mag: 8.3, ra: 19.2767, dec: 30.1833 },
      { m: 57, name: 'Nebulosa Anello', type: 'Nebulosa Planetaria', const: 'Lira', mag: 8.8, ra: 18.8933, dec: 33.0292 },
      { m: 58, name: 'Galassia a Spirale M58', type: 'Galassia a Spirale', const: 'Vergine', mag: 9.7, ra: 12.6283, dec: 11.8183 },
      { m: 59, name: 'Galassia Ellittica M59', type: 'Galassia Ellittica', const: 'Vergine', mag: 9.6, ra: 12.7000, dec: 11.6467 },
      { m: 60, name: 'Galassia Ellittica M60', type: 'Galassia Ellittica', const: 'Vergine', mag: 8.8, ra: 12.7283, dec: 11.5517 },
      { m: 61, name: 'Galassia a Spirale M61', type: 'Galassia a Spirale', const: 'Vergine', mag: 9.7, ra: 12.3650, dec: 4.4733 },
      { m: 62, name: 'Ammasso Globulare M62', type: 'Ammasso Globulare', const: 'Ofiuco', mag: 6.5, ra: 17.0200, dec: -30.1117 },
      { m: 63, name: 'Galassia Girasole', type: 'Galassia a Spirale', const: 'Cani da Caccia', mag: 8.6, ra: 13.2633, dec: 42.0292 },
      { m: 64, name: 'Galassia Occhio Nero', type: 'Galassia a Spirale', const: 'Chioma di Berenice', mag: 8.5, ra: 12.9450, dec: 21.6817 },
      { m: 65, name: 'Galassia a Spirale M65', type: 'Galassia a Spirale', const: 'Leone', mag: 9.3, ra: 11.3150, dec: 13.0917 },
      { m: 66, name: 'Galassia a Spirale M66', type: 'Galassia a Spirale', const: 'Leone', mag: 8.9, ra: 11.3367, dec: 12.9900 },
      { m: 67, name: 'Ammasso Aperto M67', type: 'Ammasso Aperto', const: 'Cancro', mag: 6.1, ra: 8.8400, dec: 11.8167 },
      { m: 68, name: 'Ammasso Globulare M68', type: 'Ammasso Globulare', const: 'Idra', mag: 7.8, ra: 12.6583, dec: -26.7483 },
      { m: 69, name: 'Ammasso Globulare M69', type: 'Ammasso Globulare', const: 'Sagittario', mag: 7.6, ra: 18.5233, dec: -32.3483 },
      { m: 70, name: 'Ammasso Globulare M70', type: 'Ammasso Globulare', const: 'Sagittario', mag: 7.9, ra: 18.7200, dec: -32.2917 },
      { m: 71, name: 'Ammasso Globulare M71', type: 'Ammasso Globulare', const: 'Freccia', mag: 8.2, ra: 19.8967, dec: 18.7800 },
      { m: 72, name: 'Ammasso Globulare M72', type: 'Ammasso Globulare', const: 'Acquario', mag: 9.3, ra: 20.8917, dec: -12.5367 },
      { m: 73, name: 'Asterismo M73', type: 'Asterismo 4 Stelle', const: 'Acquario', mag: 9.0, ra: 20.9817, dec: -12.6333 },
      { m: 74, name: 'Galassia Fantasma', type: 'Galassia a Spirale', const: 'Pesci', mag: 9.4, ra: 1.6117, dec: 15.7833 },
      { m: 75, name: 'Ammasso Globulare M75', type: 'Ammasso Globulare', const: 'Sagittario', mag: 8.5, ra: 20.1017, dec: -21.9217 },
      { m: 76, name: 'Piccola Dumbbell', type: 'Nebulosa Planetaria', const: 'Perseo', mag: 10.1, ra: 1.7050, dec: 51.5750 },
      { m: 77, name: 'Galassia di Seyfert M77', type: 'Galassia Attiva', const: 'Balena', mag: 8.9, ra: 2.7117, dec: -0.0117 },
      { m: 78, name: 'Nebulosa a Riflessione M78', type: 'Nebulosa Diffusa', const: 'Orione', mag: 8.3, ra: 5.7783, dec: 0.0500 },
      { m: 79, name: 'Ammasso Globulare M79', type: 'Ammasso Globulare', const: 'Lepre', mag: 7.7, ra: 5.4050, dec: -24.5233 },
      { m: 80, name: 'Ammasso Globulare M80', type: 'Ammasso Globulare', const: 'Scorpione', mag: 7.3, ra: 16.2833, dec: -22.9717 },
      { m: 81, name: 'Galassia di Bode', type: 'Galassia a Spirale', const: 'Orsa Maggiore', mag: 6.9, ra: 9.9261, dec: 69.0653 },
      { m: 82, name: 'Galassia Sigaro', type: 'Galassia Starburst', const: 'Orsa Maggiore', mag: 8.4, ra: 9.9292, dec: 69.6797 },
      { m: 83, name: 'Girandola del Sud', type: 'Galassia a Spirale', const: 'Idra', mag: 7.5, ra: 13.6167, dec: -29.8650 },
      { m: 84, name: 'Galassia Lenticolare M84', type: 'Galassia Lenticolare', const: 'Vergine', mag: 9.1, ra: 12.4183, dec: 12.8867 },
      { m: 85, name: 'Galassia Lenticolare M85', type: 'Galassia Lenticolare', const: 'Chioma di Berenice', mag: 9.1, ra: 12.4233, dec: 18.1900 },
      { m: 86, name: 'Galassia Lenticolare M86', type: 'Galassia Lenticolare', const: 'Vergine', mag: 8.9, ra: 12.4350, dec: 12.9467 },
      { m: 87, name: 'Galassia Gigante M87', type: 'Galassia Ellittica Gigante', const: 'Vergine', mag: 8.6, ra: 12.5133, dec: 12.3917 },
      { m: 88, name: 'Galassia a Spirale M88', type: 'Galassia a Spirale', const: 'Chioma di Berenice', mag: 9.6, ra: 12.5333, dec: 14.4183 },
      { m: 89, name: 'Galassia Ellittica M89', type: 'Galassia Ellittica', const: 'Vergine', mag: 9.8, ra: 12.5933, dec: 12.5567 },
      { m: 90, name: 'Galassia a Spirale M90', type: 'Galassia a Spirale', const: 'Vergine', mag: 9.5, ra: 12.6133, dec: 13.1617 },
      { m: 91, name: 'Galassia Spirale Barrata M91', type: 'Galassia Spirale Barrata', const: 'Chioma di Berenice', mag: 10.2, ra: 12.5900, dec: 14.4967 },
      { m: 92, name: 'Ammasso Globulare M92', type: 'Ammasso Globulare', const: 'Ercole', mag: 6.4, ra: 17.2850, dec: 43.1350 },
      { m: 93, name: 'Ammasso Aperto M93', type: 'Ammasso Aperto', const: 'Poppa', mag: 6.0, ra: 7.7417, dec: -23.8533 },
      { m: 94, name: 'Galassia Occhio di Coccodrillo', type: 'Galassia a Spirale', const: 'Cani da Caccia', mag: 8.2, ra: 12.8467, dec: 41.1200 },
      { m: 95, name: 'Galassia Spirale Barrata M95', type: 'Galassia Spirale Barrata', const: 'Leone', mag: 9.7, ra: 10.7317, dec: 11.7033 },
      { m: 96, name: 'Galassia a Spirale M96', type: 'Galassia a Spirale', const: 'Leone', mag: 9.2, ra: 10.7783, dec: 11.8183 },
      { m: 97, name: 'Nebulosa Gufo', type: 'Nebulosa Planetaria', const: 'Orsa Maggiore', mag: 9.9, ra: 11.2467, dec: 55.0183 },
      { m: 98, name: 'Galassia a Spirale M98', type: 'Galassia a Spirale', const: 'Chioma di Berenice', mag: 10.1, ra: 12.2300, dec: 14.9000 },
      { m: 99, name: 'Galassia Girandola di Chioma', type: 'Galassia a Spirale', const: 'Chioma di Berenice', mag: 9.9, ra: 12.3133, dec: 14.4167 },
      { m: 100, name: 'Galassia a Spirale M100', type: 'Galassia a Spirale', const: 'Chioma di Berenice', mag: 9.3, ra: 12.3817, dec: 15.8217 },
      { m: 101, name: 'Galassia Girandola', type: 'Galassia a Spirale', const: 'Orsa Maggiore', mag: 7.9, ra: 14.0533, dec: 54.3489 },
      { m: 102, name: 'Galassia Fuso (NGC 5866)', type: 'Galassia Lenticolare', const: 'Dragone', mag: 9.9, ra: 15.1100, dec: 55.7600 },
      { m: 103, name: 'Ammasso Aperto M103', type: 'Ammasso Aperto', const: 'Cassiopea', mag: 7.4, ra: 1.5533, dec: 60.7000 },
      { m: 104, name: 'Galassia Sombrero', type: 'Galassia a Spirale', const: 'Vergine', mag: 8.0, ra: 12.6664, dec: -11.6231 },
      { m: 105, name: 'Galassia Ellittica M105', type: 'Galassia Ellittica', const: 'Leone', mag: 9.3, ra: 10.7967, dec: 12.5817 },
      { m: 106, name: 'Galassia a Spirale M106', type: 'Galassia a Spirale', const: 'Cani da Caccia', mag: 8.4, ra: 12.3167, dec: 47.3033 },
      { m: 107, name: 'Ammasso Globulare M107', type: 'Ammasso Globulare', const: 'Ofiuco', mag: 7.9, ra: 16.5417, dec: -13.0533 },
      { m: 108, name: 'Galassia Tavola da Surf', type: 'Galassia a Spirale', const: 'Orsa Maggiore', mag: 10.0, ra: 11.1917, dec: 55.6733 },
      { m: 109, name: 'Galassia Spirale Barrata M109', type: 'Galassia Spirale Barrata', const: 'Orsa Maggiore', mag: 9.8, ra: 11.9600, dec: 53.3733 },
      { m: 110, name: 'Galassia Satellite M110', type: 'Galassia Nana Ellittica', const: 'Andromeda', mag: 8.1, ra: 0.6733, dec: 41.6833 }
    ];

    return rawMessier.map(item => ({
      id: `m${item.m}`,
      name: `${item.name} (M${item.m})`,
      designation: `M${item.m}`,
      catalog: 'Messier',
      type: item.type,
      constellation: item.const,
      mag: item.mag,
      raHours: item.ra,
      decDeg: item.dec,
      description: `Oggetto Messier ${item.m}: ${item.type} nella costellazione ${item.const}.`
    }));
  }
}

window.CatalogService = CatalogService;
window.catalogService = new CatalogService(window.astronomyService);
