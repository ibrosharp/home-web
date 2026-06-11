// AURA Hardware Dashboard API Integration

const DEVICE_IP = 'http://192.168.1.150';

function getApiUrl(path) {
  return `proxy.php?url=${encodeURIComponent(DEVICE_IP + path)}`;
}

let pollingInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  const loadingOverlay = document.getElementById('loading-overlay');
  const mainDashboard = document.getElementById('main-dashboard');
  const wifiBadge = document.getElementById('wifi-badge');
  
  const sensorsContainer = document.getElementById('sensors-container');
  const switchesContainer = document.getElementById('switches-container');
  const irContainer = document.getElementById('ir-container');
  const switchCountBadge = document.getElementById('switch-count-badge');
  
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

  // --- API Fetching ---
  
  async function fetchDeviceData() {
    try {
      const res = await fetch(getApiUrl('/api/room'));
      if (!res.ok) throw new Error('Network response was not ok');
      const data = await res.json();
      
      // On first load, hide overlay
      if (loadingOverlay.style.display !== 'none') {
        loadingOverlay.style.display = 'none';
        mainDashboard.style.display = 'flex';
        startPolling();
      }
      
      wifiBadge.textContent = "Node Online";
      wifiBadge.classList.remove('offline');
      
      renderSensors(data.sensors);
      renderSwitches(data.switches);
      if (data.controllers && data.controllers.ir) {
        renderIRCommands(data.controllers.ir.commands);
      }
    } catch (err) {
      console.warn("Failed to connect to Home Controller:", err);
      wifiBadge.textContent = "Offline";
      wifiBadge.classList.add('offline');
      // If we haven't loaded yet, keep loading spinner or show error
      if (loadingOverlay.style.display !== 'none') {
        loadingOverlay.innerHTML = '<p style="color:#ff5e62">Device Offline. Please check 192.168.1.150.</p>';
      }
    }
  }

  function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(fetchDeviceData, 3000);
  }

  // --- UI Rendering ---

  function renderSensors(sensors) {
    if (!sensors) return;
    
    let html = '';
    
    // Climate
    if (sensors.climate) {
      html += `
        <div class="sensor-card">
          <span class="sensor-label">Temperature</span>
          <span class="sensor-value">${sensors.climate.temperature.toFixed(1)}°C</span>
        </div>
        <div class="sensor-card">
          <span class="sensor-label">Humidity</span>
          <span class="sensor-value">${sensors.climate.humidity.toFixed(1)}%</span>
        </div>
      `;
    }
    // Light
    if (sensors.light) {
      html += `
        <div class="sensor-card">
          <span class="sensor-label">Ambient Light</span>
          <span class="sensor-value">${sensors.light.percentage.toFixed(1)}%</span>
        </div>
      `;
    }
    // Presence
    if (sensors.presence) {
      const motionText = sensors.presence.motion ? 'Detected' : 'Clear';
      const color = sensors.presence.motion ? '#38ef7d' : '#9ea4bb';
      html += `
        <div class="sensor-card">
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
      switches.forEach(sw => {
        const relayState = sw.hasRelay && sw.relay ? sw.relay.state : false;
        const isActive = sw.hasRelay ? relayState : (sw.state === 1);

        const div = document.createElement('div');
        div.className = `switch-card ${isActive ? 'active' : ''}`;
        div.id = `card-switch-${sw.pin}`;
        
        const relayBadge = sw.hasRelay ? `<span class="relay-badge">Relay ${sw.relay ? sw.relay.pin : '?'}</span>` : '';
        
        div.innerHTML = `
          <div class="switch-header">
            <h3>Switch ${sw.pin}</h3>
            ${relayBadge}
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
            <span class="pin-label">PIN: ${sw.pin}</span>
            <button class="action-btn trigger-btn" data-pin="${sw.pin}" data-isactive="${isActive}">Toggle</button>
          </div>
        `;
        switchesContainer.appendChild(div);
      });
      
      // Bind events
      document.querySelectorAll('.trigger-btn').forEach(el => {
        el.addEventListener('click', async (e) => {
          const pin = e.target.dataset.pin;
          const currentIsActive = e.target.dataset.isactive === 'true';
          const newState = !currentIsActive;
          
          e.target.textContent = '...';
          
          try {
            await fetch(getApiUrl(`/api/switch/state?pin=${pin}`), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pin: parseInt(pin), state: newState })
            });
            setTimeout(() => { if(e.target) e.target.textContent = 'Toggle'; }, 500);
            fetchDeviceData(); // force fast update
          } catch (err) {
             console.error('Toggle failed', err);
             if(e.target) e.target.textContent = 'Toggle';
          }
        });
      });
    } else {
      // Just update states smoothly without rebuilding DOM
      switches.forEach(sw => {
        const card = document.getElementById(`card-switch-${sw.pin}`);
        const btn = card ? card.querySelector('.trigger-btn') : null;
        
        if (card) {
          const relayState = sw.hasRelay && sw.relay ? sw.relay.state : (sw.state === 1);
          if (relayState) card.classList.add('active');
          else card.classList.remove('active');
        }
        
        if (btn) {
          const isActive = sw.hasRelay && sw.relay ? sw.relay.state : (sw.state === 1);
          btn.dataset.isactive = isActive;
        }
      });
    }
  }

  function renderIRCommands(commands) {
    if (!commands) return;
    
    // Sort commands by slot to keep predictable ordering
    commands.sort((a, b) => parseInt(a.slot) - parseInt(b.slot));
    
    // Check if the data has actually changed to prevent UI flickering on polling
    const commandsJson = JSON.stringify(commands);
    if (irContainer.dataset.lastJson === commandsJson) {
      return; 
    }
    irContainer.dataset.lastJson = commandsJson;
    
    let maxSlot = 0;
    if (commands.length > 0) {
      maxSlot = Math.max(...commands.map(c => parseInt(c.slot)));
    }
    
    // Update Add button logic to auto-increment slot
    btnAddIr.onclick = () => {
      irModalTitle.textContent = 'Record New Command';
      inputIrSlot.value = maxSlot + 1;
      inputIrDevice.value = commands.length > 0 ? commands[0].deviceId : 'tv';
      inputIrName.value = '';
      irModal.classList.add('active');
    };
    
    // Group commands by deviceId
    const grouped = commands.reduce((acc, cmd) => {
      if (!acc[cmd.deviceId]) acc[cmd.deviceId] = [];
      acc[cmd.deviceId].push(cmd);
      return acc;
    }, {});
    
    irContainer.innerHTML = '';
    
    Object.keys(grouped).forEach(deviceId => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'ir-device-group';
      
      const title = document.createElement('h3');
      title.className = 'ir-device-title';
      title.textContent = deviceId;
      groupDiv.appendChild(title);
      
      const listDiv = document.createElement('div');
      listDiv.className = 'remote-list';
      
      grouped[deviceId].forEach(cmd => {
        const div = document.createElement('div');
        div.className = 'ir-item';
        div.innerHTML = `
          <div class="ir-info">
            <strong>${cmd.name}</strong>
            <span>Slot ${cmd.slot}</span>
          </div>
          <div class="ir-actions">
            <button class="ir-btn-emit" data-slot="${cmd.slot}">Emit</button>
            <button class="ir-btn-edit" data-slot="${cmd.slot}">Edit</button>
          </div>
        `;
        
        // Bind Emit
        div.querySelector('.ir-btn-emit').addEventListener('click', async () => {
          try {
            await fetch(getApiUrl(`/api/ir/emit?slot=${cmd.slot}`), { method: 'POST' });
          } catch (err) {
            console.error('IR emit failed', err);
          }
        });
        
        // Bind Edit
        div.querySelector('.ir-btn-edit').addEventListener('click', () => {
          irModalTitle.textContent = 'Edit/Re-record Command';
          inputIrSlot.value = cmd.slot;
          inputIrDevice.value = cmd.deviceId;
          inputIrName.value = cmd.name;
          irModal.classList.add('active');
        });
        
        listDiv.appendChild(div);
      });
      
      groupDiv.appendChild(listDiv);
      irContainer.appendChild(groupDiv);
    });
  }

  // --- Modal Events ---
  
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
    
    try {
      const res = await fetch(getApiUrl(`/api/ir/record?slot=${slot}&deviceId=${encodeURIComponent(deviceId)}&name=${encodeURIComponent(name)}`), { method: 'POST' });
      if (res.ok) {
        alert("Command recorded successfully!");
        irModal.classList.remove('active');
        fetchDeviceData(); // Refresh UI to show new list
      } else {
        alert("Failed to record command.");
      }
    } catch (err) {
      console.error(err);
      alert("Network error while recording.");
    } finally {
      submitBtn.textContent = 'Start Recording';
    }
  });
  
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
    
    try {
      const res = await fetch(getApiUrl(`/api/save?ssid=${encodeURIComponent(ssid)}&pass=${encodeURIComponent(pass)}`));
      if (res.ok) {
        alert("Credentials saved to device successfully!");
        configModal.classList.remove('active');
      } else {
        alert("Failed to save credentials.");
      }
    } catch (err) {
      console.error(err);
      alert("Network error while saving.");
    }
  });

  // Start initialization
  fetchDeviceData();
});
