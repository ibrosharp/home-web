// AURA Hardware Dashboard — Full API Integration
// Integrates all endpoints from the ESP32 SmartWebServer

const DEVICE_IP = '';

function getApiUrl(path) {
  return DEVICE_IP + path;
}

let pollingInterval = null;
let cachedLoads = []; // Keep load list for the load-attach modal
let cachedHistory = null;

// ======================== Toast Notification System ========================

function showToast(type, title, message, duration = 3500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || 'ℹ'}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="dismissToast(this.parentElement)">×</button>
  `;

  container.appendChild(toast);

  // Auto dismiss
  setTimeout(() => dismissToast(toast), duration);
}

function dismissToast(toastEl) {
  if (!toastEl || toastEl.classList.contains('removing')) return;
  toastEl.classList.add('removing');
  setTimeout(() => toastEl.remove(), 300);
}

// ======================== DOM Ready ========================

document.addEventListener('DOMContentLoaded', () => {
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingMessage = document.getElementById('loading-message');
  const mainDashboard = document.getElementById('main-dashboard');
  const wifiBadge = document.getElementById('wifi-badge');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  const sensorsContainer = document.getElementById('sensors-container');
  const switchesContainer = document.getElementById('switches-container');
  const loadsContainer = document.getElementById('loads-container');
  const irContainer = document.getElementById('ir-container');
  const settingsContainer = document.getElementById('settings-container');
  const switchCountBadge = document.getElementById('switch-count-badge');
  const loadCountBadge = document.getElementById('load-count-badge');
  const settingsStatusBadge = document.getElementById('settings-status-badge');

  const scenesContainer = document.getElementById('scenes-container');
  const btnAddScene = document.getElementById('btn-add-scene');
  const sceneModal = document.getElementById('scene-modal');
  const closeSceneModalBtn = document.getElementById('btn-close-scene-modal');
  const sceneForm = document.getElementById('scene-form');
  const inputSceneName = document.getElementById('input-scene-name');
  const sceneLoadsContainer = document.getElementById('scene-loads-container');

  const btnOpenRemote = document.getElementById('btn-open-remote');
  const vrModal = document.getElementById('virtual-remote-modal');
  const closeVrModalBtn = document.getElementById('btn-close-virtual-remote');
  const vrDeviceSelect = document.getElementById('virtual-remote-device-select');
  const btnAddVrDevice = document.getElementById('btn-add-virtual-device');
  const vrGrid = document.getElementById('virtual-remote-grid');
  let currentSelectedVrDevice = '';
  let globalIrCommands = [];

  if (btnOpenRemote) {
    btnOpenRemote.addEventListener('click', () => {
      vrModal.classList.add('active');
      renderVirtualRemote();
    });
  }

  if (closeVrModalBtn) {
    closeVrModalBtn.addEventListener('click', () => {
      vrModal.classList.remove('active');
    });
  }

  if (vrDeviceSelect) {
    vrDeviceSelect.addEventListener('change', (e) => {
      currentSelectedVrDevice = e.target.value;
      renderVirtualRemote();
    });
  }

    if (btnAddVrDevice) {
    btnAddVrDevice.addEventListener('click', async () => {
      const newName = prompt('Enter a name for the new Device (e.g., AC, TV):');
      if (!newName || newName.trim() === '') return;
      
      try {
        const res = await fetch(getApiUrl(`/api/ir/devices?name=${encodeURIComponent(newName.trim())}`), { method: 'POST' });
        const data = await res.json();
        
        if (res.ok) {
           showToast('success', 'Device Created', 'Device added successfully.');
           currentSelectedVrDevice = String(data.deviceId);
           pollDeviceData(); // Will trigger re-render
        } else {
           showToast('error', 'Limit Reached', data.error || 'Cannot create device.');
        }
      } catch(err) {
         showToast('error', 'Network Error', 'Could not reach the device.');
      }
    });
  }

  const configBtn = document.getElementById('btn-config');
  const configModal = document.getElementById('config-modal');
  const closeConfigBtn = document.getElementById('btn-close-modal');
  const configForm = document.getElementById('config-form');

  const btnAddIr = document.getElementById('btn-add-ir');
  const irModal = document.getElementById('ir-modal');
  const closeIrModalBtn = document.getElementById('btn-close-ir-modal');
  const irForm = document.getElementById('ir-form');
  const inputIrSlot = document.getElementById('input-ir-slot');
  const inputIrDevice = document.getElementById('input-ir-device');
  const inputIrName = document.getElementById('input-ir-name');
  const irModalTitle = document.getElementById('ir-modal-title');

  const loadModal = document.getElementById('load-modal');
  const closeLoadModalBtn = document.getElementById('btn-close-load-modal');
  const loadForm = document.getElementById('load-form');
  const inputLoadSwitchPin = document.getElementById('input-load-switch-pin');
  const inputLoadPin = document.getElementById('input-load-pin');

  // ======================== Initial Health Check ========================

  async function initialHealthCheck() {
    loadingMessage.textContent = 'Checking device status...';
    try {
      const res = await fetch(getApiUrl('/api/status'), { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error('Status check failed');
      const data = await res.json();

      if (data.status === 'operational') {
        loadingMessage.textContent = 'Device online. Loading dashboard...';
        // Transition to dashboard
        await fetchDeviceData();
        await fetchSettings();
      } else {
        loadingMessage.textContent = 'Device in provisioning mode. Opening config...';
        showDashboard();
        configModal.classList.add('active');
      }
    } catch (err) {
      console.warn('Health check failed, trying direct room fetch...', err);
      loadingMessage.textContent = 'Retrying connection...';
      // Fall back to fetching room data directly
      try {
        await fetchDeviceData();
        await fetchSettings();
        await fetchAutomations();
      } catch (err2) {
        loadingMessage.innerHTML = '<span style="color:#ff5e62">Device Offline.</span><br><span style="color:#9ea4bb;font-size:12px">Check that ' + DEVICE_IP + ' is reachable</span>';
        // Retry every 5 seconds
        setTimeout(initialHealthCheck, 5000);
      }
    }
  }

  function showDashboard() {
    loadingOverlay.style.display = 'none';
    mainDashboard.style.display = 'flex';
  }

  // ======================== Room Data Fetching ========================

  async function fetchDeviceData() {
    const res = await fetch(getApiUrl('/api/room'));
    if (!res.ok) throw new Error('Room fetch failed');
    const data = await res.json();

    // On first successful load, show the dashboard and start polling
    if (loadingOverlay.style.display !== 'none') {
      showDashboard();
      startPolling();
      fetchHistory(); // initial fetch
      setInterval(fetchHistory, 60000); // refresh history every 60s
    }

    // Update connection status
    wifiBadge.textContent = 'Node Online';
    wifiBadge.classList.remove('offline');
    statusDot.className = 'status-dot online';
    statusText.textContent = 'Connected — polling every 3s';

    renderSensors(data.sensors);
    renderSwitches(data.switches);
    renderLoads(data.loads);
    if (data.controllers && data.controllers.ir) {
      renderIRCommands(data.controllers.ir);
    }
    
    // Scenes
    if (data.scenes) {
      renderScenes(data.scenes);
    }

    // Cache loads for the load-attach modal
    cachedLoads = data.loads || [];
    
    // Also re-render the automation checkboxes if we haven't already
    // but preserve their checked state if they are currently rendered
    const container = document.getElementById('auto-light-loads');
    if (container && container.innerHTML.trim() === '') {
      fetchAutomations(); // Will render them properly with selected state
    }

    return data;
  }

  async function fetchHistory() {
    try {
      const res = await fetch(getApiUrl('/api/history'));
      if (res.ok) {
        cachedHistory = await res.json();
        // Force re-render of sensors to show new charts if we have cached sensors
        // We will just wait for the next poll to pick it up to avoid double rendering
      }
    } catch (err) {
      console.warn('History fetch failed', err);
    }
  }

  async function pollDeviceData() {
    try {
      await fetchDeviceData();
    } catch (err) {
      console.warn('Poll failed:', err);
      wifiBadge.textContent = 'Offline';
      wifiBadge.classList.add('offline');
      statusDot.className = 'status-dot offline';
      statusText.textContent = 'Connection lost — retrying...';
    }
  }

  function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(pollDeviceData, 3000);
  }

  // ======================== Settings API ========================

  async function fetchSettings() {
    try {
      const res = await fetch(getApiUrl('/api/settings'));
      if (!res.ok) throw new Error('Settings fetch failed');
      const data = await res.json();
      renderSettings(data);
      settingsStatusBadge.textContent = 'Loaded';

      // Pre-fill WiFi config modal with current SSID
      const ssidInput = document.getElementById('input-ssid');
      if (data.wifiSSID && ssidInput) {
        ssidInput.value = data.wifiSSID;
      }
    } catch (err) {
      console.warn('Settings fetch failed:', err);
      settingsStatusBadge.textContent = 'Unavailable';
      renderSettingsFallback();
    }
  }

  async function updateSetting(params) {
    try {
      const queryString = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');

      const res = await fetch(getApiUrl(`/api/settings?${queryString}`), { method: 'POST' });
      if (!res.ok) throw new Error('Settings update failed');
      const data = await res.json();

      if (data.success) {
        showToast('success', 'Settings Updated', data.message || 'Changes saved to device.');
        // Re-fetch settings to ensure UI is in sync
        await fetchSettings();
      } else {
        showToast('error', 'Update Failed', data.error || 'Unknown error.');
      }
    } catch (err) {
      console.error('Settings update error:', err);
      showToast('error', 'Network Error', 'Could not reach the device.');
    }
  }

  // ======================== Automations API ========================

  async function fetchAutomations() {
    try {
      const res = await fetch(getApiUrl('/api/automation/light'));
      if (!res.ok) throw new Error('Automation fetch failed');
      const data = await res.json();
      
      document.getElementById('auto-light-enabled').checked = data.enabled;
      document.getElementById('auto-light-threshold').value = data.threshold;
      
      const autoOffToggle = document.getElementById('auto-off-enabled');
      if (autoOffToggle) autoOffToggle.checked = data.autoOffEnabled || false;
      
      const autoOffTimeout = document.getElementById('auto-off-timeout');
      if (autoOffTimeout) autoOffTimeout.value = data.autoOffTimeoutSeconds || 300;
      
      // We need to render the loads checkboxes dynamically based on cachedLoads
      renderAutomationLoads(data.loadPins || []);
    } catch (err) {
      console.warn('Failed to fetch automations', err);
    }
  }

  async function fetchClimateAutomation() {
    try {
      const res = await fetch(getApiUrl('/api/automation/climate'));
      if (!res.ok) throw new Error('Climate automation fetch failed');
      const data = await res.json();
      
      document.getElementById('auto-climate-enabled').checked = data.enabled;
      document.getElementById('auto-climate-target').value = data.targetTemp;
      
      const onSelect = document.getElementById('auto-climate-on-slot');
      if (onSelect && Array.from(onSelect.options).some(o => o.value == data.irSlotPowerOn)) {
        onSelect.value = data.irSlotPowerOn;
      }
      
      const offSelect = document.getElementById('auto-climate-off-slot');
      if (offSelect && Array.from(offSelect.options).some(o => o.value == data.irSlotPowerOff)) {
        offSelect.value = data.irSlotPowerOff;
      }
    } catch (err) {
      console.warn('Failed to fetch climate automation', err);
    }
  }

  function renderAutomationLoads(selectedPins) {
    const container = document.getElementById('auto-light-loads');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!cachedLoads || cachedLoads.length === 0) {
      container.innerHTML = '<span style="font-size:12px; color:var(--text-secondary);">No loads available</span>';
      return;
    }
    
    cachedLoads.forEach((load, index) => {
      const isChecked = selectedPins.includes(load.pin) ? 'checked' : '';
      container.innerHTML += `
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 0;">
          <input type="checkbox" class="auto-load-checkbox" value="${load.pin}" ${isChecked}>
          <span style="font-size:14px; color:var(--text-primary);">Load ${index + 1}</span>
        </label>
      `;
    });
  }

  document.getElementById('btn-save-auto-light')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-auto-light');
    btn.textContent = 'Saving...';
    
    const enabled = document.getElementById('auto-light-enabled').checked;
    const threshold = document.getElementById('auto-light-threshold').value;
    
    const autoOffEnabled = document.getElementById('auto-off-enabled') ? document.getElementById('auto-off-enabled').checked : false;
    const autoOffTimeout = document.getElementById('auto-off-timeout') ? document.getElementById('auto-off-timeout').value : 300;
    
    const checkboxes = document.querySelectorAll('.auto-load-checkbox:checked');
    const selectedPins = Array.from(checkboxes).map(cb => cb.value).join(',');
    
    const formData = new URLSearchParams();
    formData.append('enabled', enabled);
    formData.append('threshold', threshold);
    formData.append('autoOffEnabled', autoOffEnabled);
    formData.append('autoOffTimeoutSeconds', autoOffTimeout);
    formData.append('loadPins', selectedPins);
    
    try {
      const res = await fetch(getApiUrl('/api/automation/light'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      });
      
      if (res.ok) {
        showToast('success', 'Automation Saved', 'Light automation settings applied.');
      } else {
        showToast('error', 'Save Failed', 'Device returned an error.');
      }
    } catch (err) {
      console.error('Automation save failed', err);
      showToast('error', 'Network Error', 'Could not reach the device.');
    }
    
    setTimeout(() => btn.textContent = 'Save Automation', 1000);
  });

  document.getElementById('btn-save-auto-climate')?.addEventListener('click', async (e) => {
    const btn = e.target;
    btn.textContent = 'Saving...';
    
    const enabled = document.getElementById('auto-climate-enabled').checked;
    const targetTemp = document.getElementById('auto-climate-target').value;
    const irSlotPowerOn = document.getElementById('auto-climate-on-slot').value;
    const irSlotPowerOff = document.getElementById('auto-climate-off-slot').value;

    const params = new URLSearchParams();
    params.append('enabled', enabled);
    params.append('targetTemp', targetTemp);
    params.append('irSlotPowerOn', irSlotPowerOn);
    params.append('irSlotPowerOff', irSlotPowerOff);

    try {
      const res = await fetch(getApiUrl('/api/automation/climate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      
      if (res.ok) {
        showToast('success', 'Thermostat Saved', 'Climate automation settings applied.');
      } else {
        showToast('error', 'Save Failed', 'Device returned an error.');
      }
    } catch (err) {
      console.error('Automation save failed', err);
      showToast('error', 'Network Error', 'Could not reach the device.');
    }
    
    setTimeout(() => btn.textContent = 'Save Thermostat', 1000);
  });

  // ======================== Rendering Components ========================

  function createSparkline(dataArr, color) {
    if (!dataArr || dataArr.length < 2) return '';
    const min = Math.min(...dataArr) * 0.9;
    const max = Math.max(...dataArr) * 1.1;
    const range = max - min || 1;
    const width = 100;
    const height = 30;
    
    let path = `M 0 ${height - ((dataArr[0] - min) / range) * height}`;
    for (let i = 1; i < dataArr.length; i++) {
      const x = (i / (dataArr.length - 1)) * width;
      const y = height - ((dataArr[i] - min) / range) * height;
      path += ` L ${x} ${y}`;
    }
    
    return `<svg width="100%" height="30" viewBox="0 0 100 30" preserveAspectRatio="none" style="margin-top:8px;">
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    </svg>`;
  }

  function renderSensors(sensors) {
    if (!sensors) return;

    let html = '';

    // Extract history arrays
    let tempHist = [], humHist = [], lightHist = [];
    if (cachedHistory && cachedHistory.points) {
      tempHist = cachedHistory.points.map(p => p.t);
      humHist = cachedHistory.points.map(p => p.h);
      lightHist = cachedHistory.points.map(p => p.l);
    }

    // Climate
    if (sensors.climate) {
      const tempColor = sensors.climate.temperature > 30 ? '#ff5e62' : sensors.climate.temperature > 25 ? '#ff9966' : '#38ef7d';
      html += `
        <div class="sensor-card">
          <span class="sensor-icon">🌡️</span>
          <span class="sensor-label">Temperature</span>
          <span class="sensor-value" style="color: ${tempColor}">${sensors.climate.temperature.toFixed(1)}°C</span>
          ${createSparkline(tempHist, tempColor)}
        </div>
        <div class="sensor-card">
          <span class="sensor-icon">💧</span>
          <span class="sensor-label">Humidity</span>
          <span class="sensor-value">${sensors.climate.humidity.toFixed(1)}%</span>
          ${createSparkline(humHist, '#64b5f6')}
        </div>
      `;
    }
    // Light
    if (sensors.light) {
      const lightIcon = sensors.light.percentage > 50 ? '☀️' : '🌙';
      html += `
        <div class="sensor-card">
          <span class="sensor-icon">${lightIcon}</span>
          <span class="sensor-label">Ambient Light</span>
          <span class="sensor-value">${sensors.light.percentage.toFixed(1)}%</span>
          ${createSparkline(lightHist, '#ffd54f')}
        </div>
      `;
    }
    // Presence
    if (sensors.presence) {
      const motionText = sensors.presence.motion ? 'Detected' : 'Clear';
      const color = sensors.presence.motion ? '#38ef7d' : '#9ea4bb';
      const icon = sensors.presence.motion ? '🚶' : '🔒';
      html += `
        <div class="sensor-card">
          <span class="sensor-icon">${icon}</span>
          <span class="sensor-label">Presence</span>
          <span class="sensor-value" style="color: ${color}">${motionText}</span>
        </div>
      `;
    }

    sensorsContainer.innerHTML = html;
  }

  function renderSwitches(switches) {
    if (!switches) return;
    switchCountBadge.textContent = `${switches.length} Configured`;

    // Only rebuild DOM if the number of switches changed to avoid focus loss
    if (switchesContainer.children.length !== switches.length) {
      switchesContainer.innerHTML = '';
      switches.forEach((sw, index) => {
        const loadState = sw.hasLoad && sw.load ? sw.load.state : false;
        const isActive = sw.hasLoad ? loadState : (sw.state === 1);

        const div = document.createElement('div');
        div.className = `switch-card ${isActive ? 'active' : ''}`;
        div.id = `card-switch-${sw.pin}`;

        const loadIdx = sw.hasLoad && sw.load && cachedLoads ? cachedLoads.findIndex(l => l.pin === sw.load.pin) : -1;
        const loadName = loadIdx >= 0 ? `Load ${loadIdx + 1}` : '?';
        const loadBadge = sw.hasLoad
          ? `<span class="load-badge">⚡ ${loadName}</span>`
          : `<span class="load-badge" style="opacity:0.4">No Load</span>`;

        const displayName = sw.name || `Switch ${index + 1}`;
        div.innerHTML = `
          <div class="switch-header">
            <h3 style="display: flex; align-items: center; gap: 8px;">
              ${displayName}
              <button class="icon-btn edit-name-btn" data-type="switch" data-pin="${sw.pin}" data-name="${sw.name || ''}" title="Rename switch" style="padding: 2px;">✎</button>
            </h3>
            ${loadBadge}
          </div>
          <div class="switch-actions">
            <button class="action-btn trigger-btn" data-pin="${sw.pin}" data-isactive="${isActive}">Toggle</button>
            <button class="action-btn small load-attach-btn btn-secondary" data-pin="${sw.pin}" data-index="${index + 1}" data-has-load="${sw.hasLoad}" data-load-pin="${sw.hasLoad && sw.load ? sw.load.pin : -1}" title="Manage load">${sw.hasLoad ? 'Manage Load' : 'Assign Load'}</button>
          </div>
        `;
        switchesContainer.appendChild(div);
      });

      // Bind rename events
      document.querySelectorAll('.edit-name-btn').forEach(el => {
        el.addEventListener('click', async (e) => {
          const type = e.currentTarget.dataset.type;
          const pin = e.currentTarget.dataset.pin;
          const currentName = e.currentTarget.dataset.name;
          const newName = prompt(`Enter a new name for this ${type}:`, currentName);
          if (newName !== null && newName.trim() !== '') {
            try {
              const formData = new URLSearchParams();
              formData.append('type', type);
              formData.append('pin', pin);
              formData.append('name', newName.trim());
              const res = await fetch(getApiUrl('/api/hardware/rename'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString()
              });
              if (res.ok) {
                showToast('success', 'Renamed successfully', `${type} renamed to ${newName.trim()}`);
                switchesContainer.innerHTML = ''; // force rebuild
                pollDeviceData();
              } else {
                showToast('error', 'Rename Failed', 'Device error.');
              }
            } catch (err) {
              showToast('error', 'Network Error', 'Could not reach device.');
            }
          }
        });
      });

      // Bind toggle events
      document.querySelectorAll('.trigger-btn').forEach(el => {
        el.addEventListener('click', async (e) => {
          const pin = e.target.dataset.pin;
          e.target.textContent = '...';

          try {
            const res = await fetch(getApiUrl(`/api/switch/state?pin=${pin}`), { method: 'POST' });
            if (res.ok) {
              showToast('success', 'Switch Toggled', `Switch pin ${pin} state changed.`);
            } else {
              showToast('error', 'Toggle Failed', 'Device returned an error.');
            }
            setTimeout(() => { if (e.target) e.target.textContent = 'Toggle'; }, 400);
            pollDeviceData(); // force fast update
          } catch (err) {
            console.error('Toggle failed', err);
            if (e.target) e.target.textContent = 'Toggle';
            showToast('error', 'Network Error', 'Could not reach the device.');
          }
        });
      });

      // Bind load-attach events
      document.querySelectorAll('.load-attach-btn').forEach(el => {
        el.addEventListener('click', (e) => {
          const pin = e.currentTarget.dataset.pin;
          const index = e.currentTarget.dataset.index;
          const currentLoadPin = parseInt(e.currentTarget.dataset.loadPin);
          openLoadModal(pin, `Switch ${index}`, currentLoadPin);
        });
      });
    } else {
      // Just update states smoothly without rebuilding DOM
      switches.forEach((sw, index) => {
        const card = document.getElementById(`card-switch-${sw.pin}`);
        if (card) {
          const loadState = sw.hasLoad && sw.load ? sw.load.state : (sw.state === 1);
          if (loadState) card.classList.add('active');
          else card.classList.remove('active');

          const h3 = card.querySelector('h3');
          if (h3) {
             const displayName = sw.name || `Switch ${index + 1}`;
             h3.childNodes[0].textContent = displayName + " ";
          }

          const btn = card.querySelector('.trigger-btn');
          if (btn) {
            const isActive = sw.hasLoad && sw.load ? sw.load.state : (sw.state === 1);
            btn.dataset.isactive = isActive;
          }

          // Update load badge
          const loadBadgeEl = card.querySelector('.load-badge');
          if (loadBadgeEl) {
            if (sw.hasLoad && sw.load) {
              const loadIdx = cachedLoads ? cachedLoads.findIndex(l => l.pin === sw.load.pin) : -1;
              const loadName = loadIdx >= 0 ? `Load ${loadIdx + 1}` : '?';
              loadBadgeEl.textContent = `⚡ ${loadName}`;
              loadBadgeEl.style.opacity = '1';
            } else {
              loadBadgeEl.textContent = 'No Load';
              loadBadgeEl.style.opacity = '0.4';
            }
          }

          // Update load-attach button data
          const attachBtn = card.querySelector('.load-attach-btn');
          if (attachBtn) {
            attachBtn.dataset.hasLoad = sw.hasLoad;
            attachBtn.dataset.loadPin = sw.hasLoad && sw.load ? sw.load.pin : -1;
            attachBtn.textContent = sw.hasLoad ? 'Manage Load' : 'Assign Load';
          }
        }
      });
    }
  }

  function renderLoads(loads) {
    if (!loads || loads.length === 0) {
      loadCountBadge.textContent = '0 Registered';
      loadsContainer.innerHTML = '<div class="ir-empty-state">No loads registered on this node.</div>';
      return;
    }

    loadCountBadge.textContent = `${loads.length} Registered`;

    // Check if data changed to avoid rebuilding
    const loadsJson = JSON.stringify(loads);
    if (loadsContainer.dataset.lastJson === loadsJson) return;
    loadsContainer.dataset.lastJson = loadsJson;

    loadsContainer.innerHTML = '';
    loads.forEach((load, index) => {
      const isOn = load.state === true;
      const div = document.createElement('div');
      div.className = `load-card ${isOn ? 'active' : ''}`;
      div.id = `card-load-${load.pin}`;

      const displayName = load.name || `Load ${index + 1}`;
      div.innerHTML = `
        <div class="load-header">
          <h3 style="display: flex; align-items: center; gap: 8px;">
             ${displayName}
             <button class="icon-btn edit-name-btn" data-type="load" data-pin="${load.pin}" data-name="${load.name || ''}" title="Rename load" style="padding: 2px;">✎</button>
          </h3>
          <div style="display:flex; gap:10px; align-items:center;">
            <div class="load-state-dot ${isOn ? 'on' : 'off'}"></div>
            <button class="action-btn load-trigger-btn" data-pin="${load.pin}">Toggle</button>
          </div>
        </div>
        <div class="load-meta">
          <span class="load-meta-item" style="color: ${load.activeLow ? '#ff9966' : 'var(--text-muted)'}">
            ${load.activeLow ? '⚡ Active-Low' : 'Active-High'}
          </span>
          <span class="load-meta-item" style="color: ${isOn ? 'var(--accent-primary)' : 'var(--text-muted)'}">
            ${isOn ? '● ON' : '○ OFF'}
          </span>
        </div>
      `;

      loadsContainer.appendChild(div);
    });

    // Bind rename events
    document.querySelectorAll('#loads-container .edit-name-btn').forEach(el => {
      el.addEventListener('click', async (e) => {
        const type = e.currentTarget.dataset.type;
        const pin = e.currentTarget.dataset.pin;
        const currentName = e.currentTarget.dataset.name;
        const newName = prompt(`Enter a new name for this ${type}:`, currentName);
        if (newName !== null && newName.trim() !== '') {
          try {
            const formData = new URLSearchParams();
            formData.append('type', type);
            formData.append('pin', pin);
            formData.append('name', newName.trim());
            const res = await fetch(getApiUrl('/api/hardware/rename'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: formData.toString()
            });
            if (res.ok) {
              showToast('success', 'Renamed successfully', `${type} renamed to ${newName.trim()}`);
              loadsContainer.dataset.lastJson = ''; // force rebuild
              pollDeviceData();
            } else {
              showToast('error', 'Rename Failed', 'Device error.');
            }
          } catch (err) {
            showToast('error', 'Network Error', 'Could not reach device.');
          }
        }
      });
    });

    document.querySelectorAll('.load-trigger-btn').forEach(el => {
      el.addEventListener('click', async (e) => {
        const pin = e.target.dataset.pin;
        e.target.textContent = '...';

        try {
          const res = await fetch(getApiUrl(`/api/load/toggle?pin=${pin}`), { method: 'POST' });
          if (res.ok) {
            showToast('success', 'Load Toggled', `Load pin ${pin} toggled.`);
          } else {
            showToast('error', 'Toggle Failed', 'Device returned an error.');
          }
          setTimeout(() => { if (e.target) e.target.textContent = 'Toggle'; }, 400);
          pollDeviceData(); // force fast update
        } catch (err) {
          console.error('Toggle failed', err);
          if (e.target) e.target.textContent = 'Toggle';
          showToast('error', 'Network Error', 'Could not reach the device.');
        }
      });
    });
  }

  function renderScenes(scenes) {
    if (!scenes || scenes.length === 0) {
      scenesContainer.innerHTML = '<div class="ir-empty-state">No scenes created yet.</div>';
      return;
    }

    const scenesJson = JSON.stringify(scenes);
    if (scenesContainer.dataset.lastJson === scenesJson) return;
    scenesContainer.dataset.lastJson = scenesJson;

    scenesContainer.innerHTML = '';
    scenes.forEach(scene => {
      const div = document.createElement('div');
      div.className = 'scene-card';
      
      let actionsSummary = '';
      if (scene.actions.length === 0) {
        actionsSummary = 'No loads configured';
      } else {
        const onCount = scene.actions.filter(a => a.state).length;
        const offCount = scene.actions.filter(a => !a.state).length;
        if (onCount > 0) actionsSummary += `${onCount} ON`;
        if (onCount > 0 && offCount > 0) actionsSummary += ', ';
        if (offCount > 0) actionsSummary += `${offCount} OFF`;
      }

      div.innerHTML = `
        <div class="scene-header">
          <h3>${scene.name}</h3>
          <span class="scene-id">ID: ${scene.id}</span>
        </div>
        <div class="scene-meta">
          <span class="scene-summary">${actionsSummary}</span>
        </div>
        <div class="scene-actions" style="display:flex; gap:10px; margin-top:16px;">
          <button class="btn btn-primary scene-exec-btn" data-id="${scene.id}" style="flex:1;">▶ Execute</button>
          <button class="btn btn-danger scene-del-btn" data-id="${scene.id}" style="padding:8px; display:flex; align-items:center; justify-content:center;" title="Delete Scene">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      `;

      scenesContainer.appendChild(div);
    });

    document.querySelectorAll('.scene-exec-btn').forEach(el => {
      el.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        const btn = e.target;
        btn.textContent = '...';

        try {
          const res = await fetch(getApiUrl(`/api/scenes/execute?id=${id}`), { method: 'POST' });
          if (res.ok) {
            showToast('success', 'Scene Executed', `Fired scene ID ${id}.`);
          } else {
            showToast('error', 'Execution Failed', 'Device returned an error.');
          }
          setTimeout(() => { if (e.target) e.target.textContent = '▶ Execute'; }, 400);
          pollDeviceData();
        } catch (err) {
          console.error('Scene execution failed', err);
          if (e.target) e.target.textContent = '▶ Execute';
          showToast('error', 'Network Error', 'Could not reach the device.');
        }
      });
    });

    document.querySelectorAll('.scene-del-btn').forEach(el => {
      el.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        if (!confirm(`Are you sure you want to delete Scene ID ${id}?`)) return;

        try {
          const res = await fetch(getApiUrl(`/api/scenes?id=${id}`), { method: 'DELETE' });
          if (res.ok) {
            showToast('success', 'Scene Deleted', `Removed scene ID ${id}.`);
            pollDeviceData();
          } else {
            showToast('error', 'Deletion Failed', 'Device returned an error.');
          }
        } catch (err) {
          console.error('Scene deletion failed', err);
          showToast('error', 'Network Error', 'Could not reach the device.');
        }
      });
    });
  }

  function renderVirtualRemote() {
    if (!currentSelectedVrDevice || currentSelectedVrDevice === '-1') {
      vrGrid.innerHTML = '<div style="grid-column: span 3; text-align:center; color:var(--text-muted); padding: 20px;">Please select or add a device</div>';
      return;
    }



    const deviceIdInt = parseInt(currentSelectedVrDevice);
    const device = globalIrDevices.find(d => d.id === deviceIdInt);
    
    if (!device) {
       vrGrid.innerHTML = '<div style="grid-column: span 3; text-align:center; color:var(--text-muted); padding: 20px;">Device not found</div>';
       return;
    }

    vrGrid.innerHTML = '';

    const startSlot = deviceIdInt * 15;

    // Render exactly 15 buttons per device
    for (let i = 0; i < 15; i++) {
      const btn = document.createElement('div');
      const slotIndex = startSlot + i;
      const cmd = globalIrCommands.find(c => parseInt(c.slot) === slotIndex);
      
      if (cmd && cmd.name) {
        btn.className = 'vr-btn';
        btn.innerHTML = `
          <span>${cmd.name}</span>
          <div class="vr-edit-icon" data-slot="${slotIndex}" data-device="${device.name}" data-name="${cmd.name}" title="Edit/Re-record">✎</div>
        `;
        
        btn.addEventListener('click', async (e) => {
          if (e.target.classList.contains('vr-edit-icon')) return; 
          
          btn.style.opacity = '0.5';
          try {
            const res = await fetch(getApiUrl(`/api/ir/emit?slot=${slotIndex}`), { method: 'POST' });
            if (res.ok) showToast('success', 'IR Emitted', `Sent ${cmd.name}`);
            else showToast('error', 'Emit Failed', 'Device error');
          } catch (err) {
            showToast('error', 'Network Error', 'Could not reach device');
          }
          setTimeout(() => btn.style.opacity = '1', 200);
        });

      } else {
        btn.className = 'vr-btn vr-empty';
        btn.innerHTML = 'Empty';
        btn.addEventListener('click', () => {
          irModalTitle.textContent = 'Record Command';
          inputIrSlot.value = slotIndex;
          inputIrDevice.value = device.name;
          inputIrName.value = '';
          irModal.classList.add('active');
        });
      }
      
      vrGrid.appendChild(btn);
    }

    // Add a delete button for the device
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-danger';
    delBtn.style.gridColumn = 'span 3';
    delBtn.style.marginTop = '16px';
    delBtn.textContent = 'Delete Device';
    delBtn.addEventListener('click', async () => {
       if(!confirm(`Delete device ${device.name} and all its commands?`)) return;
       try {
           const res = await fetch(getApiUrl(`/api/ir/devices?id=${deviceIdInt}`), { method: 'DELETE' });
           if (res.ok) {
              showToast('success', 'Device Deleted', 'Device removed.');
              currentSelectedVrDevice = '-1';
              pollDeviceData();
           }
       } catch(err) {
           showToast('error', 'Network Error', 'Could not delete device.');
       }
    });
    vrGrid.appendChild(delBtn);

    vrGrid.querySelectorAll('.vr-edit-icon').forEach(icon => {
      icon.addEventListener('click', (e) => {
        e.stopPropagation();
        irModalTitle.textContent = 'Edit Command';
        inputIrSlot.value = icon.dataset.slot;
        inputIrDevice.value = icon.dataset.device;
        inputIrName.value = icon.dataset.name;
        irModal.classList.add('active');
      });
    });
  }

  function renderIRCommands(irData) {
    globalIrCommands = irData.commands || [];
    globalIrDevices = irData.devices || [];

    if (vrDeviceSelect) {
      const oldVal = vrDeviceSelect.value;
      let optionsHtml = '<option value="-1">-- Select Device --</option>';
      globalIrDevices.forEach(dev => {
        optionsHtml += `<option value="${dev.id}">${dev.name}</option>`;
      });
      vrDeviceSelect.innerHTML = optionsHtml;
      
      if (globalIrDevices.find(d => String(d.id) === oldVal)) {
        vrDeviceSelect.value = oldVal;
        currentSelectedVrDevice = oldVal;
      } else if (globalIrDevices.length > 0 && (!currentSelectedVrDevice || currentSelectedVrDevice === '-1')) {
        const first = String(globalIrDevices[0].id);
        vrDeviceSelect.value = first;
        currentSelectedVrDevice = first;
      } else {
        currentSelectedVrDevice = vrDeviceSelect.value;
      }
    }

    if (vrModal && vrModal.classList.contains('active')) {
      renderVirtualRemote();
    }

    const datalist = document.getElementById('ir-device-list');
    if (datalist) {
      datalist.innerHTML = globalIrDevices
        .map(dev => `<option value="${dev.id}">${dev.name}</option>`)
        .join('');
    }

    const onSelect = document.getElementById('auto-climate-on-slot');
    const offSelect = document.getElementById('auto-climate-off-slot');
    
    if (onSelect && offSelect) {
      const onVal = onSelect.value;
      const offVal = offSelect.value;
      
      const optionsHtml = '<option value="-1">-- None --</option>' + 
        globalIrCommands.map(cmd => `<option value="${cmd.slot}">${cmd.deviceId} - ${cmd.name} (Slot ${cmd.slot})</option>`).join('');
      
      onSelect.innerHTML = optionsHtml;
      offSelect.innerHTML = optionsHtml;
      
      if (Array.from(onSelect.options).some(o => o.value == onVal)) onSelect.value = onVal;
      if (Array.from(offSelect.options).some(o => o.value == offVal)) offSelect.value = offVal;
      
      if (!onSelect.dataset.fetched) {
         onSelect.dataset.fetched = "true";
         fetchClimateAutomation();
      }
    }
  }

  function renderSettings(settings) {
    if (!settings) return;

    settingsContainer.innerHTML = `
      <!-- WiFi SSID -->
      <div class="setting-card">
        <span class="setting-label">WiFi Network</span>
        <div class="setting-card-header">
          <span class="setting-value mono" id="display-wifi-ssid">${settings.wifiSSID || '—'}</span>
        </div>
        <div class="setting-actions">
          <button class="action-btn small" id="btn-open-wifi-config" title="Change WiFi credentials">Change</button>
        </div>
      </div>

      <!-- Target Temperature -->
      <div class="setting-card">
        <span class="setting-label">Target Temperature</span>
        <div class="setting-card-header">
          <input type="number" class="setting-inline-input" id="input-target-temp" value="${settings.defaultTargetTemp || 24}" step="0.5" min="16" max="35">
          <span style="font-size: 14px; color: var(--text-secondary);">°C</span>
        </div>
        <div class="setting-actions">
          <button class="action-btn small" id="btn-save-temp">Save</button>
        </div>
      </div>

      <!-- LED Feedback -->
      <div class="setting-card">
        <span class="setting-label">LED Feedback</span>
        <div class="setting-card-header">
          <span class="setting-value" id="display-led-state">${settings.ledFeedbackEnabled ? 'Enabled' : 'Disabled'}</span>
          <label class="toggle-switch">
            <input type="checkbox" id="input-led-toggle" ${settings.ledFeedbackEnabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <!-- Namespace -->
      <div class="setting-card">
        <span class="setting-label">Storage Namespace</span>
        <div class="setting-card-header">
          <span class="setting-value mono">${settings.namespace || '—'}</span>
        </div>
      </div>
    `;

    // Bind settings interactions
    document.getElementById('btn-open-wifi-config')?.addEventListener('click', () => {
      configModal.classList.add('active');
    });

    document.getElementById('btn-save-temp')?.addEventListener('click', () => {
      const temp = document.getElementById('input-target-temp').value;
      updateSetting({ temp });
    });

    document.getElementById('input-led-toggle')?.addEventListener('change', (e) => {
      const led = e.target.checked ? 'true' : 'false';
      updateSetting({ led });
      // Optimistic UI update
      const display = document.getElementById('display-led-state');
      if (display) display.textContent = e.target.checked ? 'Enabled' : 'Disabled';
    });
  }

  function renderSettingsFallback() {
    settingsContainer.innerHTML = `
      <div class="setting-card" style="grid-column: 1 / -1;">
        <span class="setting-label" style="color: var(--text-muted);">Settings endpoint not available</span>
        <span class="setting-value" style="font-size: 13px; color: var(--text-secondary);">
          The /api/settings endpoint is not responding. Settings may not be configured on this device.
        </span>
      </div>
    `;
  }

  // ======================== Load Attach Modal ========================

  function openLoadModal(switchPin, switchName, currentLoadPin) {
    // We store the pin in a data attribute to use for the API call, but show the friendly name
    inputLoadSwitchPin.dataset.pin = switchPin;
    inputLoadSwitchPin.value = switchName;

    // Populate load dropdown from cached loads
    inputLoadPin.innerHTML = '<option value="-1">— Detach (No Load) —</option>';
    cachedLoads.forEach((load, index) => {
      const selected = load.pin === currentLoadPin ? 'selected' : '';
      inputLoadPin.innerHTML += `<option value="${load.pin}" ${selected}>Load ${index + 1} (${load.state ? 'ON' : 'OFF'})</option>`;
    });

    loadModal.classList.add('active');
  }

  // ======================== Modal Events ========================

  // IR Modal
  closeIrModalBtn.addEventListener('click', () => {
    irModal.classList.remove('active');
  });

  irForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const slot = inputIrSlot.value;
    const deviceId = inputIrDevice.value;
    const name = inputIrName.value;

    const submitBtn = document.getElementById('btn-submit-ir');
    submitBtn.textContent = 'Recording...';
    submitBtn.disabled = true;

    try {
      const res = await fetch(getApiUrl(`/api/ir/record?slot=${slot}&name=${encodeURIComponent(name)}`), { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast('success', 'IR Recorded', data.message || `Command "${name}" saved to slot ${slot}.`);
        irModal.classList.remove('active');
        pollDeviceData(); // Refresh UI
      } else {
        showToast('error', 'Record Failed', data.error || 'Device returned an error.');
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Network Error', 'Could not reach the device while recording.');
    } finally {
      submitBtn.textContent = 'Start Recording';
      submitBtn.disabled = false;
    }
  });

  // Config Modal (WiFi Save)
  configBtn.addEventListener('click', () => {
    configModal.classList.add('active');
  });

  closeConfigBtn.addEventListener('click', () => {
    configModal.classList.remove('active');
  });

  configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ssid = document.getElementById('input-ssid').value;
    const pass = document.getElementById('input-pass').value;

    const saveBtn = document.getElementById('btn-save-wifi');
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    try {
      const res = await fetch(getApiUrl(`/api/save?ssid=${encodeURIComponent(ssid)}&pass=${encodeURIComponent(pass)}`), {
        method: 'POST'
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast('success', 'WiFi Saved', data.message || 'Credentials saved. Device will reboot.');
        configModal.classList.remove('active');
        // Device will reboot — show reconnecting state
        wifiBadge.textContent = 'Rebooting...';
        statusDot.className = 'status-dot connecting';
        statusText.textContent = 'Device is rebooting with new credentials...';
      } else {
        showToast('error', 'Save Failed', data.error || 'Device returned an error.');
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Network Error', 'Could not reach the device.');
    } finally {
      saveBtn.textContent = 'Save to Node';
      saveBtn.disabled = false;
    }
  });

  // Load Modal
  closeLoadModalBtn.addEventListener('click', () => {
    loadModal.classList.remove('active');
  });

  loadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const switchPin = inputLoadSwitchPin.dataset.pin;
    const loadPin = inputLoadPin.value;

    const submitBtn = document.getElementById('btn-submit-load');
    submitBtn.textContent = 'Applying...';
    submitBtn.disabled = true;

    try {
      const res = await fetch(getApiUrl(`/api/switch/load?pin=${switchPin}&loadPin=${loadPin}`), {
        method: 'POST'
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const action = parseInt(loadPin) < 0 ? 'detached from' : `attached to`;
        showToast('success', 'Load Updated', `Load ${action} switch pin ${switchPin}.`);
        loadModal.classList.remove('active');
        pollDeviceData(); // Refresh
      } else {
        showToast('error', 'Load Update Failed', data.error || 'Device returned an error.');
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Network Error', 'Could not reach the device.');
    } finally {
      submitBtn.textContent = 'Apply';
      submitBtn.disabled = false;
    }
  });

  // Scene Modal
  btnAddScene?.addEventListener('click', () => {
    inputSceneName.value = '';
    
    if (!cachedLoads || cachedLoads.length === 0) {
      sceneLoadsContainer.innerHTML = '<span style="font-size:12px; color:var(--text-secondary);">No loads available to control.</span>';
    } else {
      let html = '';
      cachedLoads.forEach((load, i) => {
        html += `
          <div class="scene-load-item">
            <span style="font-size:13px; font-weight:600;">Load ${i+1} <span style="font-size:10px; color:var(--text-secondary); font-weight:normal;">(Pin ${load.pin})</span></span>
            <select class="scene-load-select" data-pin="${load.pin}">
              <option value="ignore" selected>Ignore</option>
              <option value="1">Turn ON</option>
              <option value="0">Turn OFF</option>
            </select>
          </div>
        `;
      });
      sceneLoadsContainer.innerHTML = html;
    }
    
    sceneModal.classList.add('active');
  });

  closeSceneModalBtn?.addEventListener('click', () => {
    sceneModal.classList.remove('active');
  });

  sceneForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = inputSceneName.value.trim();
    
    // Gather actions
    const selects = sceneLoadsContainer.querySelectorAll('.scene-load-select');
    const actions = [];
    selects.forEach(sel => {
      if (sel.value !== 'ignore') {
        actions.push(`${sel.dataset.pin}:${sel.value}`);
      }
    });
    
    const actionsStr = actions.join(',');
    
    const submitBtn = document.getElementById('btn-submit-scene');
    submitBtn.textContent = 'Saving...';
    submitBtn.disabled = true;

    try {
      const res = await fetch(getApiUrl(`/api/scenes?name=${encodeURIComponent(name)}&actions=${encodeURIComponent(actionsStr)}`), {
        method: 'POST'
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast('success', 'Scene Created', data.message || 'Scene saved.');
        sceneModal.classList.remove('active');
        pollDeviceData(); // Refresh UI
      } else {
        showToast('error', 'Save Failed', data.error || 'Server error');
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Network Error', 'Could not save scene.');
    } finally {
      submitBtn.textContent = 'Save Scene';
      submitBtn.disabled = false;
    }
  });

  // Close modals on overlay click
  [configModal, irModal, loadModal, sceneModal].forEach(modal => {
    if (!modal) return;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  });

  // Close modals on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      configModal?.classList.remove('active');
      irModal?.classList.remove('active');
      loadModal?.classList.remove('active');
      sceneModal?.classList.remove('active');
    }
  });

  // ======================== OTA Update ========================

  const inputOtaFile = document.getElementById('input-ota-file');
  const btnSelectOta = document.getElementById('btn-select-ota');
  const btnUploadOta = document.getElementById('btn-upload-ota');
  const otaFileName = document.getElementById('ota-file-name');

  btnSelectOta?.addEventListener('click', () => {
    inputOtaFile.click();
  });

  inputOtaFile?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      otaFileName.textContent = file.name;
      btnUploadOta.disabled = false;
    } else {
      otaFileName.textContent = '';
      btnUploadOta.disabled = true;
    }
  });

  btnUploadOta?.addEventListener('click', async () => {
    const file = inputOtaFile.files[0];
    if (!file) return;

    btnUploadOta.textContent = 'Uploading...';
    btnUploadOta.disabled = true;
    btnSelectOta.disabled = true;

    const formData = new FormData();
    formData.append('update', file);

    try {
      showToast('info', 'Uploading Firmware', 'Please wait. Do not close this page.', 5000);
      
      const res = await fetch(getApiUrl('/update'), {
        method: 'POST',
        body: formData
      });
      
      const data = await res.json().catch(() => ({}));
      
      if (res.ok) {
        showToast('success', 'Update Successful', data.message || 'Device is rebooting. It will be back online shortly.', 10000);
        
        // Show rebooting state
        wifiBadge.textContent = 'Rebooting...';
        statusDot.className = 'status-dot connecting';
        statusText.textContent = 'Device is flashing and rebooting...';
        
        // Reset form
        inputOtaFile.value = '';
        otaFileName.textContent = '';
        btnUploadOta.textContent = 'Upload & Flash';
        btnSelectOta.disabled = false;
        
      } else {
        showToast('error', 'Update Failed', data.error || 'Server returned an error.');
        btnUploadOta.textContent = 'Upload & Flash';
        btnUploadOta.disabled = false;
        btnSelectOta.disabled = false;
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Network Error', 'Connection lost. The device might be rebooting.');
      wifiBadge.textContent = 'Rebooting...';
      statusDot.className = 'status-dot connecting';
      statusText.textContent = 'Device might be rebooting...';
      btnUploadOta.textContent = 'Upload & Flash';
      btnUploadOta.disabled = false;
      btnSelectOta.disabled = false;
    }
  });

  // START THE APPLICATION
  initialHealthCheck();
});