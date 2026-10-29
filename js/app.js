/**
 * CosmoPilot / StarWay - Main Application Controller
 * Handles routing, UI state, hardware events, gestures, and operational workflows.
 */

class AppRouter {
  constructor() {
    this.history = [];
    this.currentScreenId = 'screen-home';
    this.screenTitles = {
      'screen-home': 'COSMOPILOT',
      'screen-goto-catalog': 'objectCatalog',
      'screen-goto-manual': 'manualRA_DEC',
      'screen-goto-random': 'randomTarget',
      'screen-goto-tours': 'observingTours',
      'screen-goto-plan-tour': 'planTour',
      'screen-goto-observe-tour': 'observingTours',
      'screen-goto-game': 'game',
      'screen-calib-menu': 'menuCalib',
      'screen-calib-calendar': 'calendar',
      'screen-calib-1star': 'oneStarAlign',
      'screen-calib-2star': 'twoStarAlign',
      'screen-free-menu': 'menuFree',
      'screen-free-app': 'freeAppTitle',
      'screen-free-analog': 'freeAnalogTitle',
      'screen-free-hand': 'freeHandTitle',
      'screen-config-menu': 'menuConfig',
      'screen-config-bluetooth': 'bluetoothSetup',
      'screen-config-gear-ratios': 'gearRatio',
      'screen-config-direction-setup': 'directionSetup',
      'screen-config-gear-check': 'gearRatioCheck',
      'screen-config-backlash': 'backlash',
      'screen-config-joystick-calib': 'joystickCalib',
      'screen-config-factory-reset': 'factoryReset',
      'screen-config-other': 'otherSettings',
      'screen-config-show-settings': 'showSettings',
      'screen-config-preferences': 'appPreferences',
      'screen-about-menu': 'menuAbout'
    };

    this.backBtn = document.getElementById('btn-header-back');
    this.homeBtn = document.getElementById('btn-header-home');
    this.titleEl = document.getElementById('header-title');

    this.backBtn.addEventListener('click', () => this.back());
    this.homeBtn.addEventListener('click', () => this.navigateHome());
  }

  navigate(screenId, pushHistory = true) {
    if (!screenId.startsWith('screen-')) {
      screenId = 'screen-' + screenId;
    }

    const targetEl = document.getElementById(screenId);
    if (!targetEl) {
      console.warn('Schermata non trovata:', screenId);
      return;
    }

    // Leave current screen hook
    this.onLeaveScreen(this.currentScreenId, screenId);

    if (pushHistory && this.currentScreenId !== screenId) {
      this.history.push(this.currentScreenId);
    }

    document.querySelectorAll('.view-screen').forEach(el => el.classList.remove('active'));
    targetEl.classList.add('active');
    this.currentScreenId = screenId;

    this.updateHeader();

    // Enter screen hook
    this.onEnterScreen(screenId);
  }

  back() {
    if (this.history.length > 0) {
      const prev = this.history.pop();
      this.navigate(prev, false);
    } else {
      this.navigateHome();
    }
  }

  navigateHome() {
    this.history = [];
    this.navigate('screen-home', false);
  }

  updateHeader() {
    const isHome = this.currentScreenId === 'screen-home';
    this.backBtn.style.display = isHome ? 'none' : 'inline-flex';
    this.homeBtn.style.display = isHome ? 'none' : 'inline-flex';

    const titleKey = this.screenTitles[this.currentScreenId];
    if (titleKey) {
      const translated = window.I18N ? window.I18N.t(titleKey) : titleKey;
      this.titleEl.textContent = isHome ? 'COSMOPILOT' : translated;
    } else {
      this.titleEl.textContent = 'COSMOPILOT';
    }
  }

  onEnterScreen(screenId) {
    window.feedbackManager.playTap();

    if (screenId === 'screen-goto-catalog') {
      catalogWorkflow.renderCurrentTab();
    } else if (screenId === 'screen-goto-random') {
      catalogWorkflow.generateRandomTarget();
    } else if (screenId === 'screen-goto-tours') {
      toursWorkflow.renderSavedToursList();
    } else if (screenId === 'screen-free-app') {
      window.bleController.startAppJoystick();
    } else if (screenId === 'screen-config-bluetooth') {
      configWorkflow.updateBleStatusCard();
    }
  }

  onLeaveScreen(leavingScreenId, targetScreenId) {
    if (leavingScreenId === 'screen-free-app' && targetScreenId !== 'screen-free-app') {
      window.bleController.stopAppJoystick();
    }
  }
}

// Global Modal Manager
const appModals = {
  open(modalId) {
    const el = document.getElementById(modalId);
    if (el) {
      el.classList.add('active');
      window.feedbackManager.playTap();
    }
  },
  close(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('active');
  }
};

// ==========================================================================
// CATALOG WORKFLOW
// ==========================================================================
const catalogWorkflow = {
  currentCategory: 'messier',
  selectedTarget: null,

  init() {
    // Tabs
    document.querySelectorAll('.catalog-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.catalog-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentCategory = btn.getAttribute('data-cat');
        this.renderCurrentTab();
      });
    });

    // Search input
    const searchInput = document.getElementById('catalog-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => this.renderCurrentTab());
    }

    // Solar system dedicated visibility check button
    const btnSolarCheck = document.getElementById('btn-solar-check-vis');
    if (btnSolarCheck) {
      btnSolarCheck.addEventListener('click', async () => {
        window.feedbackManager.playTap();
        await window.bleController.sendCommand('SOLAR_OBJ_STATUS');
      });
    }

    // Custom Target Add button
    const btnAddCustom = document.getElementById('btn-add-custom-target');
    if (btnAddCustom) {
      btnAddCustom.addEventListener('click', () => {
        appModals.open('modal-custom-target');
      });
    }

    // Save Custom Target
    const btnSaveCustom = document.getElementById('btn-save-custom-target');
    if (btnSaveCustom) {
      btnSaveCustom.addEventListener('click', () => {
        const name = document.getElementById('cust-name').value;
        const raH = parseInt(document.getElementById('cust-ra-h').value, 10) || 0;
        const raM = parseInt(document.getElementById('cust-ra-m').value, 10) || 0;
        const raS = parseInt(document.getElementById('cust-ra-s').value, 10) || 0;
        const decD = parseInt(document.getElementById('cust-dec-d').value, 10) || 0;
        const decM = parseInt(document.getElementById('cust-dec-m').value, 10) || 0;
        const decS = parseInt(document.getElementById('cust-dec-s').value, 10) || 0;
        const mag = parseFloat(document.getElementById('cust-mag').value) || 8.0;

        if (!name.trim()) {
          alert('Inserisci un nome valido.');
          return;
        }

        const raHours = window.astronomyService.hmsToDecimalRa(raH, raM, raS);
        const decDeg = window.astronomyService.dmsToDecimalDec(decD, decM, decS);

        window.catalogService.addCustomTarget({
          name,
          raHours,
          decDeg,
          mag
        });

        appModals.close('modal-custom-target');
        this.renderCurrentTab();
        window.feedbackManager.playSuccessChime();
      });
    }

    // Modal Send GoTo Action
    const btnSendGoto = document.getElementById('btn-modal-send-goto');
    if (btnSendGoto) {
      btnSendGoto.addEventListener('click', () => {
        if (!this.selectedTarget) return;
        this.executeGoTo(this.selectedTarget);
        appModals.close('modal-target-detail');
      });
    }

    // Stop GoTo Button in Popup
    const btnStopGoto = document.getElementById('btn-stop-goto-action');
    if (btnStopGoto) {
      btnStopGoto.addEventListener('click', async () => {
        window.feedbackManager.playTap();
        await window.bleController.stopGoto();
        appModals.close('modal-stop-goto');
      });
    }

    // Filters Button
    const btnFilters = document.getElementById('btn-open-filters');
    if (btnFilters) {
      btnFilters.addEventListener('click', () => {
        appModals.open('modal-filters');
      });
    }

    // Confirm Filters
    const btnConfirmFilters = document.getElementById('btn-filter-confirm');
    if (btnConfirmFilters) {
      btnConfirmFilters.addEventListener('click', () => {
        const mag = parseFloat(document.getElementById('filter-mag-slider').value);
        const visOnly = document.getElementById('chk-filter-visible').checked;
        window.catalogService.filterMaxMag = mag;
        window.catalogService.filterVisibleOnly = visOnly;

        appModals.close('modal-filters');
        this.renderCurrentTab();
        window.feedbackManager.playTap();
      });
    }

    // Filter Mag Slider text update
    const filterMagSlider = document.getElementById('filter-mag-slider');
    if (filterMagSlider) {
      filterMagSlider.addEventListener('input', (e) => {
        document.getElementById('filter-mag-val').textContent = parseFloat(e.target.value).toFixed(1);
      });
    }

    // Filter Time Slider (30-min steps)
    const filterTimeSlider = document.getElementById('filter-time-slider');
    if (filterTimeSlider) {
      filterTimeSlider.addEventListener('input', (e) => {
        const step = parseInt(e.target.value, 10);
        const totalMinutes = step * 30;
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        document.getElementById('filter-time-val').textContent = 
          `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      });
    }

    // Manual RA/DEC Send
    const btnSendManual = document.getElementById('btn-send-manual-goto');
    if (btnSendManual) {
      btnSendManual.addEventListener('click', async () => {
        const raH = parseInt(document.getElementById('manual-ra-h').value, 10) || 0;
        const raM = parseInt(document.getElementById('manual-ra-m').value, 10) || 0;
        const raS = parseInt(document.getElementById('manual-ra-s').value, 10) || 0;
        const decD = parseInt(document.getElementById('manual-dec-d').value, 10) || 0;
        const decM = parseInt(document.getElementById('manual-dec-m').value, 10) || 0;
        const decS = parseInt(document.getElementById('manual-dec-s').value, 10) || 0;

        window.feedbackManager.playTap();
        await window.bleController.gotoCoordinates(raH, raM, raS, decD, decM, decS);

        if (window.settingsService.enableStopGoto) {
          document.getElementById('stop-goto-target-text').textContent = 
            `Manual: RA ${raH}h ${raM}m ${raS}s | DEC ${decD}° ${decM}' ${decS}"`;
          appModals.open('modal-stop-goto');
        }
      });
    }

    // Random Target Next & Send
    const btnNextRandom = document.getElementById('btn-next-random');
    if (btnNextRandom) {
      btnNextRandom.addEventListener('click', () => this.generateRandomTarget());
    }
    const btnSendRandom = document.getElementById('btn-send-random');
    if (btnSendRandom) {
      btnSendRandom.addEventListener('click', () => {
        if (this.currentRandomTarget) {
          this.executeGoTo(this.currentRandomTarget);
        }
      });
    }
  },

  renderCurrentTab() {
    const listEl = document.getElementById('catalog-list-container');
    const solarBanner = document.getElementById('solar-visibility-banner');
    const customBanner = document.getElementById('custom-add-banner');
    const searchInput = document.getElementById('catalog-search-input');
    const query = searchInput ? searchInput.value.trim() : '';

    solarBanner.style.display = this.currentCategory === 'solar' ? 'block' : 'none';
    customBanner.style.display = this.currentCategory === 'custom' ? 'block' : 'none';

    const items = window.catalogService.getCatalogItems(this.currentCategory, query);

    listEl.innerHTML = '';
    if (items.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">Nessun oggetto trovato per i filtri selezionati.</div>`;
      return;
    }

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'catalog-item-card';

      const isVis = item.coords && item.coords.isVisible;
      const badgeClass = isVis ? 'visible' : 'hidden';
      const badgeText = isVis ? (window.I18N ? window.I18N.t('visibleBadge') : 'Visibile') : (window.I18N ? window.I18N.t('hiddenBadge') : 'Sotto Orizzonte');
      const magDisplay = item.mag !== undefined && item.mag < 90 ? `Mag: ${item.mag}` : '';

      card.innerHTML = `
        <div class="item-main-info">
          <div class="item-title">${item.name}</div>
          <div class="item-subtitle">${item.designation || item.type} • ${item.constellation}</div>
        </div>
        <div class="item-meta">
          <span class="badge-vis ${badgeClass}">${badgeText}</span>
          <span class="item-mag">${magDisplay}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        this.openTargetDetail(item);
      });

      listEl.appendChild(card);
    });
  },

  openTargetDetail(item) {
    this.selectedTarget = item;
    const titleEl = document.getElementById('modal-target-title');
    const bodyEl = document.getElementById('modal-target-body');

    titleEl.textContent = item.name;

    const raStr = window.astronomyService.formatRa(item.raHours || (item.coords ? item.coords.ra : 0));
    const decStr = window.astronomyService.formatDec(item.decDeg || (item.coords ? item.coords.dec : 0));
    const altStr = item.coords ? `${item.coords.altitude.toFixed(1)}°` : '---';
    const azStr = item.coords ? `${item.coords.azimuth.toFixed(1)}°` : '---';
    const isVis = item.coords && item.coords.isVisible;

    let warningHtml = '';
    if (item.isSunWarning) {
      warningHtml = `
        <div style="background: rgba(239, 68, 68, 0.25); border: 1px solid var(--color-red); border-radius: 8px; padding: 10px; margin-bottom: 12px; color: #fca5a5;">
          ${window.I18N ? window.I18N.t('solarWarningText') : 'ATTENZIONE: Usare solo filtro solare certificato a tutta apertura!'}
        </div>
      `;
    }

    bodyEl.innerHTML = `
      ${warningHtml}
      <div style="margin-bottom: 10px; color: var(--text-muted);">${item.description || ''}</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background: rgba(0,0,0,0.4); padding: 10px; border-radius: 8px; font-family: monospace;">
        <div>RA: <strong style="color: var(--gold-light);">${raStr}</strong></div>
        <div>DEC: <strong style="color: var(--gold-light);">${decStr}</strong></div>
        <div>Altitudine: <strong>${altStr}</strong></div>
        <div>Azimut: <strong>${azStr}</strong></div>
      </div>
      <div style="margin-top: 10px; text-align: center;">
        <span class="badge-vis ${isVis ? 'visible' : 'hidden'}">
          ${isVis ? 'Attualmente Visibile (>10°)' : 'Sotto Orizzonte'}
        </span>
      </div>
    `;

    appModals.open('modal-target-detail');
  },

  async executeGoTo(item) {
    window.feedbackManager.playTap();
    if (item.isSolarSystem) {
      await window.bleController.gotoSolarBody(item.body);
    } else {
      const hms = window.astronomyService.decimalRaToHms(item.raHours);
      const dms = window.astronomyService.decimalDecToDms(item.decDeg);
      await window.bleController.gotoCoordinates(hms.h, hms.m, hms.s, dms.d, dms.m, dms.s);
    }

    if (window.settingsService.enableStopGoto) {
      document.getElementById('stop-goto-target-text').textContent = item.name;
      appModals.open('modal-stop-goto');
    }
  },

  generateRandomTarget() {
    this.currentRandomTarget = window.catalogService.getRandomVisibleTarget();
    if (!this.currentRandomTarget) return;

    document.getElementById('random-target-name').textContent = this.currentRandomTarget.name;
    document.getElementById('random-target-sub').textContent = 
      `${this.currentRandomTarget.type} • ${this.currentRandomTarget.constellation} • Mag: ${this.currentRandomTarget.mag}`;
    
    const raStr = window.astronomyService.formatRa(this.currentRandomTarget.raHours);
    const decStr = window.astronomyService.formatDec(this.currentRandomTarget.decDeg);
    document.getElementById('random-target-coords').textContent = `RA: ${raStr} | DEC: ${decStr}`;

    window.feedbackManager.playTap();
  }
};

// ==========================================================================
// OBSERVING TOURS WORKFLOW (Pages 19-20)
// ==========================================================================
const toursWorkflow = {
  currentPlanStep: 1,
  selectedObjects: [],

  init() {
    // Slider duration label
    const durSlider = document.getElementById('plan-duration');
    if (durSlider) {
      durSlider.addEventListener('input', (e) => {
        document.getElementById('plan-duration-val').textContent = `${parseFloat(e.target.value).toFixed(1)} ore`;
      });
    }

    // Observe Tour Buttons (Prev, Next, GoTo)
    const btnPrev = document.getElementById('btn-observe-prev');
    const btnNext = document.getElementById('btn-observe-next');
    const btnGoTo = document.getElementById('btn-observe-goto');

    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        window.toursService.prevTarget();
        this.renderActiveTourTarget();
      });
    }
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        window.toursService.nextTarget();
        this.renderActiveTourTarget();
      });
    }
    if (btnGoTo) {
      btnGoTo.addEventListener('click', () => {
        const target = window.toursService.getCurrentTarget();
        if (target) {
          catalogWorkflow.openTargetDetail(target);
        }
      });
    }
  },

  renderSavedToursList() {
    const listEl = document.getElementById('saved-tours-list');
    listEl.innerHTML = '';
    const tours = window.toursService.savedTours;

    if (tours.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">Nessun tour salvato. Crea il tuo primo tour osservativo!</div>`;
      return;
    }

    tours.forEach(tour => {
      const card = document.createElement('div');
      card.className = 'glass-card';
      card.style.display = 'flex';
      card.style.justifyContent = 'space-between';
      card.style.alignItems = 'center';

      card.innerHTML = `
        <div>
          <div style="font-size: 15px; font-weight: 700; color: var(--gold-light);">${tour.name}</div>
          <div style="font-size: 12px; color: var(--text-muted);">${tour.objects.length} oggetti • Durata ${tour.session.durationHours}h</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn-gold" style="width: auto; height: 36px; padding: 0 14px; font-size: 13px;" onclick="toursWorkflow.startTour('${tour.id}')">
            Avvia
          </button>
          <button class="btn-outline btn-danger" style="width: auto; height: 36px; padding: 0 10px; font-size: 12px;" onclick="toursWorkflow.deleteTour('${tour.id}')">
            🗑
          </button>
        </div>
      `;

      listEl.appendChild(card);
    });
  },

  startTour(id) {
    const tour = window.toursService.getTour(id);
    if (!tour) return;

    // Condition check (Page 20)
    const cond = window.toursService.checkTourConditions(tour);
    if (cond.isMismatch) {
      const proceed = confirm('Attenzione: La data, ora o posizione attuale differiscono da quelle pianificate per questo tour. Avviare comunque?');
      if (!proceed) return;
    }

    window.toursService.startTour(id);
    window.appRouter.navigate('goto-observe-tour');
    this.renderActiveTourTarget();
  },

  renderActiveTourTarget() {
    const target = window.toursService.getCurrentTarget();
    if (!target) return;

    document.getElementById('observe-tour-title').textContent = window.toursService.activeTour.name;
    document.getElementById('observe-object-name').textContent = target.name;
    document.getElementById('observe-object-cat').textContent = `${target.catalog} • Mag: ${target.mag}`;
    
    const raStr = window.astronomyService.formatRa(target.raHours);
    const decStr = window.astronomyService.formatDec(target.decDeg);
    document.getElementById('observe-object-coords').textContent = `RA: ${raStr} | DEC: ${decStr}`;

    document.getElementById('observe-step-indicator').textContent = `Oggetto ${target.index + 1} di ${target.total}`;

    const visBadge = document.getElementById('observe-object-vis');
    const isVis = target.coords && target.coords.isVisible;
    visBadge.className = `badge-vis ${isVis ? 'visible' : 'hidden'}`;
    visBadge.textContent = isVis ? 'Attualmente Visibile' : 'Sotto Orizzonte';

    window.feedbackManager.playTap();
  },

  endActiveTour() {
    window.toursService.endTour();
    window.appRouter.navigate('goto-tours');
  },

  deleteTour(id) {
    if (confirm('Sei sicuro di voler eliminare questo tour?')) {
      window.toursService.deleteTour(id);
      this.renderSavedToursList();
      window.feedbackManager.playTap();
    }
  },

  goToStep(step) {
    this.currentPlanStep = step;
    document.getElementById('plan-step-1').style.display = step === 1 ? 'block' : 'none';
    document.getElementById('plan-step-2').style.display = step === 2 ? 'block' : 'none';
    document.getElementById('plan-step-3').style.display = step === 3 ? 'block' : 'none';

    if (step === 2) {
      this.renderPlanObjectsPicker();
    } else if (step === 3) {
      this.renderPlanReview();
    }
    window.feedbackManager.playTap();
  },

  renderPlanObjectsPicker() {
    const container = document.getElementById('plan-objects-list');
    container.innerHTML = '';
    const pool = [...window.catalogService.messierCatalog, ...window.catalogService.starsCatalog];

    const durHours = parseFloat(document.getElementById('plan-duration').value) || 2.0;
    const planDateStr = document.getElementById('plan-date').value || '2026-10-29';
    const planTimeStr = document.getElementById('plan-time').value || '20:30';
    const startDate = new Date(`${planDateStr}T${planTimeStr}`);

    pool.slice(0, 35).forEach(obj => {
      const visEval = window.astronomyService.evaluateTourVisibility(obj.raHours, obj.decDeg, startDate, durHours);
      const isChecked = this.selectedObjects.some(o => o.id === obj.id);

      const row = document.createElement('label');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.background = 'rgba(255,255,255,0.05)';
      row.style.padding = '8px 12px';
      row.style.borderRadius = '8px';

      const visBadgeColor = visEval.status === 'whole' ? 'color: #10b981;' : (visEval.status === 'part' ? 'color: #f59e0b;' : 'color: #9ca3af;');

      row.innerHTML = `
        <div style="flex: 1;">
          <div style="font-weight: 700; font-size: 14px;">${obj.name}</div>
          <div style="font-size: 11px; ${visBadgeColor}">Visibilità: ${visEval.label}</div>
        </div>
        <input type="checkbox" style="width: 20px; height: 20px;" ${isChecked ? 'checked' : ''}>
      `;

      const chk = row.querySelector('input');
      chk.addEventListener('change', (e) => {
        if (e.target.checked) {
          if (this.selectedObjects.length >= 30) {
            alert('Puoi selezionare al massimo 30 oggetti.');
            e.target.checked = false;
            return;
          }
          this.selectedObjects.push(obj);
        } else {
          this.selectedObjects = this.selectedObjects.filter(o => o.id !== obj.id);
        }
        document.getElementById('plan-selected-count').textContent = this.selectedObjects.length;
      });

      container.appendChild(row);
    });
  },

  renderPlanReview() {
    const container = document.getElementById('plan-review-list');
    container.innerHTML = '';

    this.selectedObjects.forEach((obj, idx) => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.justifyContent = 'space-between';
      item.style.background = 'rgba(255,255,255,0.06)';
      item.style.padding = '8px 12px';
      item.style.borderRadius = '8px';

      item.innerHTML = `
        <span style="font-size: 14px; font-weight: 600;">${idx + 1}. ${obj.name}</span>
        <div style="display: flex; gap: 4px;">
          <button class="btn-outline" style="width: 32px; height: 32px; padding: 0;">▲</button>
          <button class="btn-outline" style="width: 32px; height: 32px; padding: 0;">▼</button>
          <button class="btn-outline btn-danger" style="width: 32px; height: 32px; padding: 0;">✕</button>
        </div>
      `;

      const btns = item.querySelectorAll('button');
      // Up
      btns[0].addEventListener('click', () => {
        if (idx > 0) {
          const temp = this.selectedObjects[idx];
          this.selectedObjects[idx] = this.selectedObjects[idx - 1];
          this.selectedObjects[idx - 1] = temp;
          this.renderPlanReview();
        }
      });
      // Down
      btns[1].addEventListener('click', () => {
        if (idx < this.selectedObjects.length - 1) {
          const temp = this.selectedObjects[idx];
          this.selectedObjects[idx] = this.selectedObjects[idx + 1];
          this.selectedObjects[idx + 1] = temp;
          this.renderPlanReview();
        }
      });
      // Delete
      btns[2].addEventListener('click', () => {
        this.selectedObjects.splice(idx, 1);
        this.renderPlanReview();
      });

      container.appendChild(item);
    });
  },

  saveTour() {
    const name = document.getElementById('plan-tour-name').value;
    const durHours = parseFloat(document.getElementById('plan-duration').value) || 2.0;
    const planDateStr = document.getElementById('plan-date').value || '2026-10-29';
    const planTimeStr = document.getElementById('plan-time').value || '20:30';

    try {
      window.toursService.saveTour(name, {
        dateStr: planDateStr,
        timeStr: planTimeStr,
        durationHours: durHours,
        location: { name: 'GPS', lat: window.astronomyService.observerLat, lon: window.astronomyService.observerLon }
      }, this.selectedObjects);

      window.feedbackManager.playSuccessChime();
      alert('Tour salvato con successo!');
      this.selectedObjects = [];
      window.appRouter.navigate('goto-tours');
    } catch (e) {
      alert(e.message);
    }
  }
};

// ==========================================================================
// GAME WORKFLOW (Page 21)
// ==========================================================================
const gameWorkflow = {
  init() {
    // End game button
  },

  start() {
    window.gameService.startGame(5.0);
    this.renderRound();
    window.appRouter.navigate('goto-game');
  },

  renderRound() {
    const round = window.gameService.nextRound();
    if (!round) return;

    document.getElementById('game-score-display').textContent = round.score;
    document.getElementById('game-streak-display').textContent = `🔥 ${round.streak}`;
    document.getElementById('label-game-5050').textContent = `50/50 (${round.lifelines5050})`;
    document.getElementById('label-game-skip').textContent = `Salta (${round.lifelinesSkip})`;
    document.getElementById('btn-game-5050').disabled = round.lifelines5050 <= 0;
    document.getElementById('btn-game-skip').disabled = round.lifelinesSkip <= 0;

    const container = document.getElementById('game-options-container');
    container.innerHTML = '';

    round.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = `game-opt-btn ${opt.eliminated ? 'eliminated' : ''}`;
      btn.textContent = opt.name;
      btn.addEventListener('click', () => this.selectAnswer(opt.id, btn));
      container.appendChild(btn);
    });
  },

  selectAnswer(optionId, buttonEl) {
    const result = window.gameService.submitAnswer(optionId);
    if (!result) return;

    if (result.isCorrect) {
      buttonEl.classList.add('correct');
      window.feedbackManager.playSuccessChime();
    } else {
      buttonEl.classList.add('wrong');
      window.feedbackManager.playErrorTone();
      // Highlight correct button
      const allBtns = document.querySelectorAll('.game-opt-btn');
      allBtns.forEach(b => {
        if (b.textContent === result.correctName) {
          b.classList.add('correct');
        }
      });
    }

    document.getElementById('game-score-display').textContent = result.score;
    document.getElementById('game-streak-display').textContent = `🔥 ${result.streak}`;

    if (result.isGameOver) {
      setTimeout(() => {
        alert(`Partita terminata! Punteggio finale: ${result.score}. Record: ${result.highScore}`);
        this.endGame();
      }, 1500);
    } else {
      setTimeout(() => {
        this.renderRound();
      }, 1600);
    }
  },

  use5050() {
    const used = window.gameService.use5050();
    if (used) {
      window.feedbackManager.playTap();
      // Re-render options to strike through eliminated
      const container = document.getElementById('game-options-container');
      const btns = container.querySelectorAll('.game-opt-btn');
      window.gameService.options.forEach((opt, i) => {
        if (opt.eliminated && btns[i]) {
          btns[i].classList.add('eliminated');
        }
      });
      document.getElementById('label-game-5050').textContent = `50/50 (${window.gameService.lifelines5050})`;
      if (window.gameService.lifelines5050 <= 0) {
        document.getElementById('btn-game-5050').disabled = true;
      }
    }
  },

  useShowMag() {
    const mag = window.gameService.useShowMag();
    if (mag !== null) {
      window.feedbackManager.playTap();
      document.getElementById('label-game-mag').textContent = `Mag: ${mag}`;
    }
  },

  useSkip() {
    const skipped = window.gameService.useSkip();
    if (skipped) {
      window.feedbackManager.playTap();
      this.renderRound();
    }
  },

  reCenter() {
    window.gameService.reCenterTarget();
    window.feedbackManager.playTap();
  },

  endGame() {
    const final = window.gameService.endGame();
    window.appRouter.navigate('goto-catalog');
  }
};

// ==========================================================================
// CALIBRATION WORKFLOW
// ==========================================================================
const calibWorkflow = {
  init() {
    // Auto Sync
    const btnAutoSync = document.getElementById('btn-auto-sync');
    if (btnAutoSync) {
      btnAutoSync.addEventListener('click', async () => {
        window.feedbackManager.playTap();
        btnAutoSync.disabled = true;
        btnAutoSync.textContent = 'Sincronizzazione in corso...';

        try {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(async (pos) => {
              const lat = pos.coords.latitude;
              const lon = pos.coords.longitude;
              window.astronomyService.setObserverLocation(lat, lon);
              await window.bleController.autoSync(lat, lon, new Date());
              btnAutoSync.disabled = false;
              btnAutoSync.textContent = 'Auto Sync Completato ✓';
              window.feedbackManager.playSuccessChime();
            }, async (err) => {
              // Fallback to saved observer location
              await window.bleController.autoSync(window.astronomyService.observerLat, window.astronomyService.observerLon, new Date());
              btnAutoSync.disabled = false;
              btnAutoSync.textContent = 'Auto Sync Completato ✓';
              window.feedbackManager.playSuccessChime();
            }, { timeout: 6000 });
          } else {
            await window.bleController.autoSync(window.astronomyService.observerLat, window.astronomyService.observerLon, new Date());
            btnAutoSync.disabled = false;
            btnAutoSync.textContent = 'Auto Sync Completato ✓';
            window.feedbackManager.playSuccessChime();
          }
        } catch (e) {
          alert('Errore Auto Sync: ' + e.message);
          btnAutoSync.disabled = false;
          btnAutoSync.textContent = 'Esegui Auto Sync';
        }
      });
    }

    // 1-Star Calibration
    const btn1StarStart = document.getElementById('btn-1star-start');
    if (btn1StarStart) {
      btn1StarStart.addEventListener('click', async () => {
        window.feedbackManager.playTap();
        await window.bleController.startCalibration();
        document.getElementById('align-1star-step-1').style.display = 'none';
        document.getElementById('align-1star-step-2').style.display = 'block';
        this.render1StarList();
      });
    }

    const btn1StarFinish = document.getElementById('btn-1star-finish');
    if (btn1StarFinish) {
      btn1StarFinish.addEventListener('click', async () => {
        if (!this.selected1Star) return;
        window.feedbackManager.playTap();
        const hms = window.astronomyService.decimalRaToHms(this.selected1Star.raHours);
        const dms = window.astronomyService.decimalDecToDms(this.selected1Star.decDeg);
        await window.bleController.sendStar1Calibration(hms.h, hms.m, hms.s, dms.d, dms.m, dms.s);
        window.feedbackManager.playSuccessChime();
        alert('Allineamento ad 1 Stella completato con successo!');
        window.appRouter.navigate('calib-menu');
      });
    }

    // 2-Star Calibration
    const btn2StarStart = document.getElementById('btn-2star-start');
    if (btn2StarStart) {
      btn2StarStart.addEventListener('click', async () => {
        window.feedbackManager.playTap();
        await window.bleController.startCalibration();
        this.startTwoStarWizard();
      });
    }
  },

  render1StarList() {
    const listEl = document.getElementById('align-1star-list');
    listEl.innerHTML = '';
    const stars = window.catalogService.getAlignmentStars();

    stars.forEach(star => {
      const card = document.createElement('div');
      card.className = 'catalog-item-card';
      card.innerHTML = `
        <div>
          <div style="font-weight: 700; color: var(--gold-light);">${star.name}</div>
          <div style="font-size: 12px; color: var(--text-muted);">${star.constellation} • Mag: ${star.mag}</div>
        </div>
        <span class="badge-vis ${star.coords.isVisible ? 'visible' : 'hidden'}">
          ${star.coords.isVisible ? 'Visibile' : 'Basso'}
        </span>
      `;
      card.addEventListener('click', () => {
        this.selected1Star = star;
        document.getElementById('align-1star-step-2').style.display = 'none';
        document.getElementById('align-1star-step-3').style.display = 'block';
        document.getElementById('align-1star-target-name').textContent = star.name;
        const raStr = window.astronomyService.formatRa(star.raHours);
        const decStr = window.astronomyService.formatDec(star.decDeg);
        document.getElementById('align-1star-target-coords').textContent = `RA: ${raStr} | DEC: ${decStr}`;
        window.feedbackManager.playTap();
      });
      listEl.appendChild(card);
    });
  },

  startTwoStarWizard() {
    const container = document.getElementById('align-2star-stage-container');
    container.innerHTML = `
      <div style="font-size: 14px; font-weight: 700; color: var(--gold-light); margin-bottom: 8px;">
        Seleziona la PRIMA stella di riferimento:
      </div>
      <div id="align-2star-stars-list" style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;"></div>
    `;

    const listEl = container.querySelector('#align-2star-stars-list');
    const stars = window.catalogService.getAlignmentStars();

    stars.forEach(star => {
      const card = document.createElement('div');
      card.className = 'catalog-item-card';
      card.innerHTML = `
        <div>
          <div style="font-weight: 700; color: var(--gold-light);">${star.name}</div>
          <div style="font-size: 12px; color: var(--text-muted);">${star.constellation} • Mag: ${star.mag}</div>
        </div>
        <span class="badge-vis ${star.coords.isVisible ? 'visible' : 'hidden'}">
          ${star.coords.isVisible ? 'Visibile' : 'Basso'}
        </span>
      `;

      card.addEventListener('click', () => {
        this.firstStar = star;
        this.showTwoStarStep2(star);
      });
      listEl.appendChild(card);
    });
  },

  showTwoStarStep2(star) {
    const container = document.getElementById('align-2star-stage-container');
    container.innerHTML = `
      <div style="text-align: center; margin: 10px 0;">
        <div style="font-size: 16px; font-weight: 700; color: var(--gold-light); margin-bottom: 6px;">Centra: ${star.name}</div>
        <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px;">
          Punta e centra la prima stella nell'oculare usando Scope o App joystick.
        </div>
        <div style="display: flex; gap: 8px; margin-bottom: 16px;">
          <button class="btn-outline flex-1" onclick="appRouter.navigate('free-analog')">Scope</button>
          <button class="btn-outline flex-1" onclick="appRouter.navigate('free-app')">App</button>
        </div>
        <button id="btn-2star-finish-1" class="btn-gold">Finish First Star</button>
      </div>
    `;

    container.querySelector('#btn-2star-finish-1').addEventListener('click', async () => {
      window.feedbackManager.playTap();
      const hms = window.astronomyService.decimalRaToHms(star.raHours);
      const dms = window.astronomyService.decimalDecToDms(star.decDeg);
      await window.bleController.sendStar1Calibration(hms.h, hms.m, hms.s, dms.d, dms.m, dms.s);
      this.showTwoStarStep3();
    });
  },

  showTwoStarStep3() {
    const container = document.getElementById('align-2star-stage-container');
    container.innerHTML = `
      <div style="font-size: 14px; font-weight: 700; color: var(--gold-light); margin-bottom: 8px;">
        Seleziona la SECONDA stella di riferimento:
      </div>
      <div id="align-2star-stars-list-2" style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;"></div>
    `;

    const listEl = container.querySelector('#align-2star-stars-list-2');
    const stars = window.catalogService.getAlignmentStars().filter(s => s.id !== this.firstStar.id);

    stars.forEach(star => {
      const card = document.createElement('div');
      card.className = 'catalog-item-card';
      card.innerHTML = `
        <div>
          <div style="font-weight: 700; color: var(--gold-light);">${star.name}</div>
          <div style="font-size: 12px; color: var(--text-muted);">${star.constellation} • Mag: ${star.mag}</div>
        </div>
        <span class="badge-vis ${star.coords.isVisible ? 'visible' : 'hidden'}">
          ${star.coords.isVisible ? 'Visibile' : 'Basso'}
        </span>
      `;

      card.addEventListener('click', async () => {
        this.secondStar = star;
        window.feedbackManager.playTap();
        const hms = window.astronomyService.decimalRaToHms(star.raHours);
        const dms = window.astronomyService.decimalDecToDms(star.decDeg);
        // Slews automatically to second star
        await window.bleController.sendStar2Calibration(hms.h, hms.m, hms.s, dms.d, dms.m, dms.s);
        this.showTwoStarStep4(star);
      });
      listEl.appendChild(card);
    });
  },

  showTwoStarStep4(star) {
    const container = document.getElementById('align-2star-stage-container');
    container.innerHTML = `
      <div style="text-align: center; margin: 10px 0;">
        <div style="font-size: 16px; font-weight: 700; color: var(--gold-light); margin-bottom: 6px;">Centraggio Fine: ${star.name}</div>
        <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px;">
          Il telescopio ha completato il puntamento verso la seconda stella. Perfeziona il centraggio nell'oculare.
        </div>
        <div style="display: flex; gap: 8px; margin-bottom: 16px;">
          <button class="btn-outline flex-1" onclick="appRouter.navigate('free-analog')">Scope</button>
          <button class="btn-outline flex-1" onclick="appRouter.navigate('free-app')">App</button>
        </div>
        <button id="btn-2star-finish-all" class="btn-gold">Finish Calibration</button>
      </div>
    `;

    container.querySelector('#btn-2star-finish-all').addEventListener('click', async () => {
      window.feedbackManager.playTap();
      await window.bleController.finishTwoStarCalibration();
      window.feedbackManager.playSuccessChime();
      alert('Allineamento a 2 Stelle completato con successo!');
      window.appRouter.navigate('calib-menu');
    });
  }
};

// ==========================================================================
// FREE MODE JOYSTICK & HAND MOVE WORKFLOW
// ==========================================================================
const freeWorkflow = {
  isLocked: false,

  init() {
    // Speed slider
    const speedSlider = document.getElementById('joy-speed-slider');
    if (speedSlider) {
      speedSlider.addEventListener('change', async (e) => {
        const val = parseInt(e.target.value, 10);
        document.getElementById('joy-speed-label').textContent = `Livello: ${val}`;
        await window.bleController.setAppSpeed(val);
      });
      speedSlider.addEventListener('input', (e) => {
        document.getElementById('joy-speed-label').textContent = `Livello: ${e.target.value}`;
      });
    }

    // Invert switches
    const chkInvUd = document.getElementById('chk-invert-ud');
    if (chkInvUd) {
      chkInvUd.addEventListener('change', async () => {
        await window.bleController.toggleAppAxis(1);
      });
    }
    const chkInvRl = document.getElementById('chk-invert-rl');
    if (chkInvRl) {
      chkInvRl.addEventListener('change', async () => {
        await window.bleController.toggleAppAxis(2);
      });
    }

    // Tracking toggle
    const btnTracking = document.getElementById('btn-joy-tracking');
    if (btnTracking) {
      btnTracking.addEventListener('click', async () => {
        window.feedbackManager.playTap();
        if (window.bleController.status.tracking) {
          await window.bleController.stopTracking();
        } else {
          await window.bleController.startTracking();
        }
      });
    }

    // SkyBox Assist
    const btnSkyBox = document.getElementById('btn-joy-skybox');
    if (btnSkyBox) {
      btnSkyBox.addEventListener('click', async () => {
        window.feedbackManager.playTap();
        await window.bleController.startSkyBoxAssist();
      });
    }

    // Direction buttons (touch & pointer events)
    document.querySelectorAll('.dpad-btn').forEach(btn => {
      const dir = btn.getAttribute('data-dir');

      const onStart = (e) => {
        e.preventDefault();
        if (this.isLocked) return;
        btn.classList.add('pressed');
        window.feedbackManager.vibrate(20);
        window.bleController.sendAppDirection(dir);
      };

      const onEnd = (e) => {
        e.preventDefault();
        btn.classList.remove('pressed');
        window.bleController.sendAppDirection('STOP');
      };

      btn.addEventListener('pointerdown', onStart);
      btn.addEventListener('pointerup', onEnd);
      btn.addEventListener('pointercancel', onEnd);
    });

    // Center Lock Gesture (Swipe Up on lock icon)
    const lockEl = document.getElementById('dpad-center-lock');
    if (lockEl) {
      let startY = 0;
      lockEl.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
      }, { passive: true });

      lockEl.addEventListener('touchend', (e) => {
        const endY = e.changedTouches[0].clientY;
        if (startY - endY > 30) { // Swipe up
          this.toggleLock();
        }
      });

      lockEl.addEventListener('click', () => {
        // Toggle on click as desktop fallback
        this.toggleLock();
      });
    }

    // Steppers Disable/Enable (Hand Move)
    const btnSteppers = document.getElementById('btn-toggle-steppers');
    if (btnSteppers) {
      btnSteppers.addEventListener('click', async () => {
        window.feedbackManager.playTap();
        await window.bleController.releaseSteppers();
        const released = window.bleController.simulator.steppersReleased;
        btnSteppers.textContent = released ? 'Premi per Riattivare i Motori' : 'Premi per Rilasciare i Motori';
      });
    }
  },

  toggleLock() {
    this.isLocked = !this.isLocked;
    const lockEl = document.getElementById('dpad-center-lock');
    const lockIcon = document.getElementById('lock-icon');
    if (this.isLocked) {
      lockEl.classList.add('locked');
      lockIcon.textContent = '🔒';
    } else {
      lockEl.classList.remove('locked');
      lockIcon.textContent = '🔓';
    }
    window.feedbackManager.playTap();
  }
};

// ==========================================================================
// CONFIGURATION WORKFLOW
// ==========================================================================
const configWorkflow = {
  init() {
    // Bluetooth Scan
    const btnScan = document.getElementById('btn-ble-scan');
    if (btnScan) {
      btnScan.addEventListener('click', async () => {
        window.feedbackManager.playTap();
        try {
          await window.bleController.connect(false);
          this.updateBleStatusCard();
        } catch (e) {
          // If native bluetooth fails or user cancelled, offer simulator
          if (!window.bleController.isSupported()) {
            window.bleController.connect(true);
            this.updateBleStatusCard();
          }
        }
      });
    }

    // Bluetooth Disconnect
    const btnDisconnect = document.getElementById('btn-ble-disconnect');
    if (btnDisconnect) {
      btnDisconnect.addEventListener('click', async () => {
        window.feedbackManager.playTap();
        await window.bleController.disconnect();
        this.updateBleStatusCard();
      });
    }

    // Toggle Simulator Mode
    const btnToggleSim = document.getElementById('btn-toggle-sim');
    if (btnToggleSim) {
      btnToggleSim.addEventListener('click', async () => {
        window.feedbackManager.playTap();
        if (window.bleController.useSimulator) {
          await window.bleController.disconnect();
          btnToggleSim.textContent = 'Attiva Simulatore Controller';
        } else {
          await window.bleController.connect(true);
          btnToggleSim.textContent = 'Disattiva Simulatore Controller';
        }
        this.updateBleStatusCard();
      });
    }

    // Send Gear Ratios
    const btnSendGear = document.getElementById('btn-send-gear-ratios');
    if (btnSendGear) {
      btnSendGear.addEventListener('click', async () => {
        const az = parseFloat(document.getElementById('input-gear-az').value);
        const alt = parseFloat(document.getElementById('input-gear-alt').value);
        window.feedbackManager.playTap();
        await window.bleController.setGearRatios(az, alt);
        window.feedbackManager.playSuccessChime();
        alert('Rapporti di riduzione inviati con successo!');
      });
    }

    // Direction Setup Wizard
    const btnDirStart = document.getElementById('btn-dir-start');
    if (btnDirStart) {
      btnDirStart.addEventListener('click', async () => {
        window.feedbackManager.playTap();
        await window.bleController.startDirectionSetup();
        document.getElementById('dir-step-1-ui').style.display = 'none';
        document.getElementById('dir-step-up-ui').style.display = 'block';
      });
    }

    const btnDirMoveUp = document.getElementById('btn-dir-move-up');
    if (btnDirMoveUp) {
      btnDirMoveUp.addEventListener('click', () => {
        window.feedbackManager.playTap();
        btnDirMoveUp.disabled = true;
        document.getElementById('dir-up-question').style.display = 'block';
      });
    }

    const btnDirMoveRight = document.getElementById('btn-dir-move-right');
    if (btnDirMoveRight) {
      btnDirMoveRight.addEventListener('click', async () => {
        window.feedbackManager.playTap();
        btnDirMoveRight.disabled = true;
        await window.bleController.sendNext();
        document.getElementById('dir-right-question').style.display = 'block';
      });
    }

    // Gear Ratio Check Stopwatch & Calculation
    this.initGearRatioCheck();

    // Send Backlash
    const btnSendBacklash = document.getElementById('btn-send-backlash');
    if (btnSendBacklash) {
      btnSendBacklash.addEventListener('click', async () => {
        const az = parseInt(document.getElementById('input-backlash-az').value, 10) || 0;
        const alt = parseInt(document.getElementById('input-backlash-alt').value, 10) || 0;
        window.feedbackManager.playTap();
        await window.bleController.setBacklash(az, alt);
        window.feedbackManager.playSuccessChime();
        alert('Compensazione backlash inviata!');
      });
    }

    // Joystick Calibration (Idle & Max)
    const btnJoyIdle = document.getElementById('btn-calib-joy-idle');
    if (btnJoyIdle) {
      btnJoyIdle.addEventListener('click', async () => {
        window.feedbackManager.playTap();
        btnJoyIdle.disabled = true;
        await window.bleController.calibrateJoystickIdle();
        document.getElementById('joy-idle-success').style.display = 'block';
        document.getElementById('btn-calib-joy-max').disabled = false;
        window.feedbackManager.playSuccessChime();
      });
    }

    const btnJoyMax = document.getElementById('btn-calib-joy-max');
    if (btnJoyMax) {
      btnJoyMax.addEventListener('click', async () => {
        window.feedbackManager.playTap();
        btnJoyMax.disabled = true;
        await window.bleController.calibrateJoystickMax();
        
        let secondsLeft = 10;
        const timerEl = document.getElementById('joy-max-timer');
        timerEl.textContent = `Muovi la levetta: ${secondsLeft}s`;

        const countdown = setInterval(() => {
          secondsLeft--;
          if (secondsLeft <= 0) {
            clearInterval(countdown);
            timerEl.textContent = '✓ Calibrazione joystick completata!';
            timerEl.style.color = 'var(--color-green)';
            window.feedbackManager.playSuccessChime();
          } else {
            timerEl.textContent = `Muovi la levetta: ${secondsLeft}s`;
          }
        }, 1000);
      });
    }

    // Factory Reset Long Press (3 seconds)
    const btnResetHold = document.getElementById('btn-factory-reset-hold');
    if (btnResetHold) {
      let resetTimer = null;
      let holdSeconds = 0;

      const startHold = () => {
        holdSeconds = 0;
        document.getElementById('factory-reset-progress').textContent = 'Tieni premuto... 3s';
        resetTimer = setInterval(async () => {
          holdSeconds++;
          if (holdSeconds >= 3) {
            clearInterval(resetTimer);
            document.getElementById('factory-reset-progress').textContent = 'Resetting controller...';
            await window.bleController.factoryReset();
            window.feedbackManager.playErrorTone();
            alert('Factory Reset completato con successo!');
            document.getElementById('factory-reset-progress').textContent = '';
          } else {
            document.getElementById('factory-reset-progress').textContent = `Tieni premuto... ${3 - holdSeconds}s`;
          }
        }, 1000);
      };

      const cancelHold = () => {
        if (resetTimer) {
          clearInterval(resetTimer);
          resetTimer = null;
        }
        document.getElementById('factory-reset-progress').textContent = '';
      };

      btnResetHold.addEventListener('pointerdown', startHold);
      btnResetHold.addEventListener('pointerup', cancelHold);
      btnResetHold.addEventListener('pointerleave', cancelHold);
    }

    // Other Settings Send
    const btnSendOther = document.getElementById('btn-send-other-settings');
    if (btnSendOther) {
      btnSendOther.addEventListener('click', async () => {
        const updateDisplay = document.getElementById('chk-sec-display').checked;
        const displayOn = document.getElementById('sel-display-enable').value === '1';

        const updateSkybox = document.getElementById('chk-sec-skybox').checked;
        const skyboxMag = document.getElementById('sel-skybox-mag').value;
        const skyboxSpeed = document.getElementById('sel-skybox-speed').value;

        const updateStandalone = document.getElementById('chk-sec-standalone').checked;
        const standaloneOn = document.getElementById('sel-standalone-mode').value === '1';

        const updateMaxSpeed = document.getElementById('chk-sec-speed').checked;
        const maxSpeed = parseFloat(document.getElementById('input-max-speed').value) || 4.0;

        const updateRefresh = document.getElementById('chk-sec-tracking').checked;
        const trackingRefresh = parseFloat(document.getElementById('sel-tracking-refresh').value) || 3.0;

        window.feedbackManager.playTap();
        await window.bleController.sendOtherSettings({
          updateDisplay,
          displayOn,
          updateSkybox,
          skyboxMag,
          skyboxSpeed,
          updateStandalone,
          standaloneOn,
          updateMaxSpeed,
          maxSpeed,
          updateRefresh,
          trackingRefresh
        });

        window.feedbackManager.playSuccessChime();
        alert('Impostazioni controller inviate con successo!');
      });
    }

    // Get Telescope Settings (Show Settings)
    const btnFetchSettings = document.getElementById('btn-fetch-telescope-settings');
    if (btnFetchSettings) {
      btnFetchSettings.addEventListener('click', async () => {
        window.feedbackManager.playTap();
        await window.bleController.sendCommand('SHOW_SETTINGS');
      });
    }

    // App Preferences Bindings
    this.initPreferences();
  },

  updateBleStatusCard() {
    const card = document.getElementById('ble-device-info-card');
    const btnDisconnect = document.getElementById('btn-ble-disconnect');
    const btnScan = document.getElementById('btn-ble-scan');

    if (window.bleController.isConnected) {
      card.style.display = 'block';
      btnDisconnect.style.display = 'block';
      btnScan.style.display = 'none';
      document.getElementById('ble-connected-name').textContent = 
        window.bleController.useSimulator ? 'CosmoPilot Simulator (ESP32)' : 'CosmoPilot Telescope';
    } else {
      card.style.display = 'none';
      btnDisconnect.style.display = 'none';
      btnScan.style.display = 'block';
    }
  },

  async answerDir(axis, isPositive) {
    window.feedbackManager.playTap();
    await window.bleController.sendDirectionResult(!isPositive);

    if (axis === 'up') {
      document.getElementById('dir-step-up-ui').style.display = 'none';
      document.getElementById('dir-step-right-ui').style.display = 'block';
    } else if (axis === 'right') {
      document.getElementById('dir-step-right-ui').style.display = 'none';
      document.getElementById('dir-step-complete').style.display = 'block';
      window.feedbackManager.playSuccessChime();
    }
  },

  initGearRatioCheck() {
    const btnSendSpeed = document.getElementById('btn-send-test-speed');
    if (btnSendSpeed) {
      btnSendSpeed.addEventListener('click', async () => {
        window.feedbackManager.playTap();
        await window.bleController.sendOtherSettings({ updateMaxSpeed: true, maxSpeed: 4.0 });
        alert('Velocità di test (4.0°/s) impostata.');
      });
    }

    const btnHold = document.getElementById('btn-hold-motion');
    const timerDisplay = document.getElementById('gear-check-timer');
    const resultBox = document.getElementById('gear-check-result');
    const calcVal = document.getElementById('gear-check-calc-val');

    let startTime = 0;
    let timerId = null;

    if (btnHold) {
      const startMeasure = (e) => {
        e.preventDefault();
        startTime = performance.now();
        window.bleController.sendAppDirection('UP');
        resultBox.style.display = 'none';

        timerId = setInterval(() => {
          const elapsed = (performance.now() - startTime) / 1000;
          timerDisplay.textContent = `Tempo: ${elapsed.toFixed(2)}s`;
        }, 30);
      };

      const endMeasure = (e) => {
        e.preventDefault();
        if (timerId) {
          clearInterval(timerId);
          timerId = null;
        }
        window.bleController.sendAppDirection('STOP');
        const elapsed = (performance.now() - startTime) / 1000;
        timerDisplay.textContent = `Tempo: ${elapsed.toFixed(2)}s`;

        // At 4.0°/s, 90° takes 22.5s.
        // Ratio estimate = configuredRatio * (elapsed / 22.5)
        const enteredRatio = window.bleController.settings.gearRatioAlt || 50.0;
        const estimatedRatio = enteredRatio * (elapsed / 22.5);
        const low = (estimatedRatio * 0.95).toFixed(1);
        const high = (estimatedRatio * 1.05).toFixed(1);

        resultBox.style.display = 'block';
        calcVal.textContent = `${estimatedRatio.toFixed(1)} (Intervallo: ${low} .. ${high})`;
        window.feedbackManager.playSuccessChime();
      };

      btnHold.addEventListener('pointerdown', startMeasure);
      btnHold.addEventListener('pointerup', endMeasure);
      btnHold.addEventListener('pointercancel', endMeasure);
    }
  },

  initPreferences() {
    // Language
    const selLang = document.getElementById('pref-language');
    if (selLang) {
      selLang.value = window.I18N.currentLang;
      selLang.addEventListener('change', (e) => {
        window.I18N.setLanguage(e.target.value);
      });
    }

    // Background select
    const selBg = document.getElementById('pref-background-select');
    if (selBg) {
      selBg.value = window.settingsService.currentBg;
      selBg.addEventListener('change', (e) => {
        window.settingsService.setBackground(e.target.value);
      });
    }

    // Import photo
    const fileInput = document.getElementById('input-import-bg');
    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0]) {
          try {
            await window.settingsService.importCustomBackground(e.target.files[0]);
            selBg.value = 'custom';
            document.getElementById('btn-remove-custom-bg').style.display = 'block';
            alert('Sfondo personalizzato applicato!');
          } catch (err) {
            alert(err.message);
          }
        }
      });
    }

    // Remove custom bg
    const btnRemoveCustomBg = document.getElementById('btn-remove-custom-bg');
    if (btnRemoveCustomBg) {
      if (window.settingsService.currentBg === 'custom') {
        btnRemoveCustomBg.style.display = 'block';
      }
      btnRemoveCustomBg.addEventListener('click', () => {
        window.settingsService.removeCustomBackground();
        selBg.value = 'gold_nebula';
        btnRemoveCustomBg.style.display = 'none';
      });
    }

    // Fullscreen Preview
    const btnPreviewBg = document.getElementById('btn-preview-bg');
    if (btnPreviewBg) {
      btnPreviewBg.addEventListener('click', () => {
        settingsWorkflow.openPreview();
      });
    }

    // Night Mode Checkbox
    const chkNight = document.getElementById('chk-night-mode');
    if (chkNight) {
      chkNight.checked = window.settingsService.nightModeActive;
      chkNight.addEventListener('change', (e) => {
        window.settingsService.toggleNightMode(e.target.checked);
      });
    }

    // Night Mode Intensity Slider
    const sliderIntensity = document.getElementById('slider-night-intensity');
    if (sliderIntensity) {
      sliderIntensity.value = window.settingsService.nightIntensity;
      sliderIntensity.addEventListener('input', (e) => {
        const val = e.target.value;
        document.getElementById('label-night-intensity').textContent = `Livello ${val} (${val === '1' ? 'Luminoso' : 'Profondo'})`;
        window.settingsService.setNightIntensity(val);
      });
    }

    // Auto reconnect
    const chkAutoRec = document.getElementById('chk-pref-autoreconnect');
    if (chkAutoRec) {
      chkAutoRec.checked = window.settingsService.autoReconnect;
      chkAutoRec.addEventListener('change', (e) => {
        window.settingsService.setPreference('autoReconnect', e.target.checked);
        window.bleController.autoReconnect = e.target.checked;
      });
    }

    // Stop GoTo Popup
    const chkStopGoto = document.getElementById('chk-pref-stopgoto');
    if (chkStopGoto) {
      chkStopGoto.checked = window.settingsService.enableStopGoto;
      chkStopGoto.addEventListener('change', (e) => {
        window.settingsService.setPreference('enableStopGoto', e.target.checked);
      });
    }

    // Extended ratios (up to 200)
    const chkExtRatios = document.getElementById('chk-pref-extendedratios');
    if (chkExtRatios) {
      chkExtRatios.checked = window.settingsService.allowExtendedRatios;
      chkExtRatios.addEventListener('change', (e) => {
        window.settingsService.setPreference('allowExtendedRatios', e.target.checked);
        const maxLimit = e.target.checked ? '200.0' : '100.0';
        document.getElementById('gear-az-limit-hint').textContent = `Intervallo valido: 1.0 - ${maxLimit}`;
        document.getElementById('gear-alt-limit-hint').textContent = `Intervallo valido: 1.0 - ${maxLimit}`;
      });
    }
  }
};

const settingsWorkflow = {
  openPreview() {
    const previewEl = document.getElementById('wallpaper-preview-full');
    const rootEl = document.getElementById('app-root');
    previewEl.className = 'wallpaper-preview-full active ' + rootEl.className;
    if (rootEl.style.backgroundImage) {
      previewEl.style.backgroundImage = rootEl.style.backgroundImage;
    }
    previewEl.addEventListener('click', this.closePreview, { once: true });
  },

  closePreview() {
    const previewEl = document.getElementById('wallpaper-preview-full');
    previewEl.classList.remove('active');
  }
};

// ==========================================================================
// TELEMETRY & HARDWARE EVENT BINDINGS
// ==========================================================================
function setupHardwareBindings() {
  const segBt = document.getElementById('status-seg-bt');
  const segSync = document.getElementById('status-seg-sync');
  const segAlign = document.getElementById('status-seg-align');
  const busyBanner = document.getElementById('busy-banner');
  const homeBtLabel = document.getElementById('home-bt-label');
  const btnHomeBt = document.getElementById('btn-home-bt');

  // Connection changes
  window.bleController.on('connected', (data) => {
    segBt.classList.add('active-bt');
    btnHomeBt.classList.add('is-connected');
    homeBtLabel.textContent = data.deviceName || 'Connesso';
    window.feedbackManager.playSuccessChime();
  });

  window.bleController.on('disconnected', () => {
    segBt.classList.remove('active-bt');
    segSync.classList.remove('active-sync');
    segAlign.classList.remove('active-align');
    btnHomeBt.classList.remove('is-connected');
    homeBtLabel.textContent = 'Bluetooth Disconnesso';
  });

  // Busy & Ready state
  window.bleController.on('busy', () => {
    busyBanner.style.display = 'block';
  });

  window.bleController.on('ready', () => {
    busyBanner.style.display = 'none';
    appModals.close('modal-stop-goto');
  });

  // Status byte notifications
  window.bleController.on('statusUpdate', (st) => {
    // Bluetooth
    if (window.bleController.isConnected) {
      segBt.classList.add('active-bt');
    }

    // Sync: if all 3 (loc, date, time) synced, value is 7
    if (st.locationSynced && st.dateSynced && st.timeSynced) {
      segSync.classList.add('active-sync');
    } else {
      segSync.classList.remove('active-sync');
    }

    // Alignment
    if (st.aligned) {
      segAlign.classList.add('active-align');
    } else {
      segAlign.classList.remove('active-align');
    }

    // Tracking button label
    const joyTrackLabel = document.getElementById('label-joy-tracking');
    if (joyTrackLabel) {
      joyTrackLabel.textContent = st.tracking ? 'Ferma Inseguimento' : 'Avvia Inseguimento';
    }
  });

  // Real-time RA/DEC position update from controller
  window.bleController.on('positionUpdate', (pos) => {
    const raStr = `${pos.raHours.toString().padStart(2, '0')}h ${pos.raMinutes.toString().padStart(2, '0')}m ${pos.raSeconds.toString().padStart(2, '0')}s`;
    const decSign = pos.decDegrees >= 0 ? '+' : '';
    const decStr = `${decSign}${pos.decDegrees}° ${pos.decMinutes.toString().padStart(2, '0')}' ${pos.decSeconds.toString().padStart(2, '0')}"`;

    const joyRa = document.getElementById('joy-ra-display');
    const joyDec = document.getElementById('joy-dec-display');
    if (joyRa) joyRa.textContent = raStr;
    if (joyDec) joyDec.textContent = decStr;

    const anaRa = document.getElementById('analog-ra-display');
    const anaDec = document.getElementById('analog-dec-display');
    if (anaRa) anaRa.textContent = raStr;
    if (anaDec) anaDec.textContent = decStr;
  });

  // Settings update from SHOW_SETTINGS
  window.bleController.on('settingsUpdate', (settings) => {
    const fw = document.getElementById('readout-fw');
    if (fw) fw.textContent = settings.firmwareVersion.toFixed(1);

    const gearAz = document.getElementById('readout-gear-az');
    if (gearAz) gearAz.textContent = settings.gearRatioAz.toFixed(4);

    const gearAlt = document.getElementById('readout-gear-alt');
    if (gearAlt) gearAlt.textContent = settings.gearRatioAlt.toFixed(4);

    const d = document.getElementById('readout-date');
    if (d) d.textContent = `${settings.date[0]}-${settings.date[1]}-${settings.date[2]}`;

    const t = document.getElementById('readout-time');
    if (t) t.textContent = `${settings.time[0]}:${settings.time[1]}:${settings.time[2]}`;

    const loc = document.getElementById('readout-loc');
    if (loc) loc.textContent = `${settings.location[0].toFixed(4)}, ${settings.location[1].toFixed(4)}`;

    const bl = document.getElementById('readout-backlash');
    if (bl) bl.textContent = `${settings.backlash[0]}" / ${settings.backlash[1]}"`;

    const spd = document.getElementById('readout-maxspeed');
    if (spd) spd.textContent = `${settings.maxSpeed.toFixed(1)}°/s`;

    const refr = document.getElementById('readout-refresh');
    if (refr) refr.textContent = `${settings.trackingRefresh.toFixed(1)}s`;
  });
}

// ==========================================================================
// APPLICATION INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('Inizializzazione CosmoPilot PWA...');

  window.I18N.init();
  window.appRouter = new AppRouter();

  setupHardwareBindings();

  catalogWorkflow.init();
  toursWorkflow.init();
  gameWorkflow.init();
  calibWorkflow.init();
  freeWorkflow.init();
  configWorkflow.init();

  // Register PWA Service Worker for 100% offline functionality
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registrato con successo:', reg.scope))
      .catch(err => console.warn('Errore registrazione Service Worker:', err));
  }
});
