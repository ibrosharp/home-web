import re
import os

filepath = r'c:\Users\abdul\OneDrive\Documents\Arduino\remote\data\app.js'

with open(filepath, 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Remove toggle button from switch card
js = js.replace('<button class="action-btn trigger-btn" data-pin="${sw.pin}" data-isactive="${isActive}">Toggle</button>', '')

# 2. Add id and toggle button to load card
old_load_html = "const isOn = load.state === true; const div = document.createElement('div'); div.className = `load-card ${isOn ? 'active' : ''}`; div.innerHTML = ` <div class=\"load-header\"> <h3>Load ${load.pin}</h3> <div class=\"load-state-dot ${isOn ? 'on' : 'off'}\"></div> </div>"

new_load_html = "const isOn = load.state === true; const div = document.createElement('div'); div.className = `load-card ${isOn ? 'active' : ''}`; div.id = `card-load-${load.pin}`; div.innerHTML = ` <div class=\"load-header\"> <h3>Load ${load.pin}</h3> <div style=\"display:flex;gap:10px;align-items:center;\"><div class=\"load-state-dot ${isOn ? 'on' : 'off'}\"></div><button class=\"action-btn load-trigger-btn\" data-pin=\"${load.pin}\">Toggle</button></div> </div>"

js = js.replace(old_load_html, new_load_html)

# 3. Add event listeners for load toggle
old_load_append = "loadsContainer.appendChild(div); }); }"

new_load_append = "loadsContainer.appendChild(div); }); document.querySelectorAll('.load-trigger-btn').forEach(el => { el.addEventListener('click', async (e) => { const pin = e.target.dataset.pin; e.target.textContent = '...'; try { const res = await fetch(getApiUrl(`/api/load/toggle?pin=${pin}`), { method: 'POST' }); if (res.ok) { showToast('success', 'Load Toggled', `Load pin ${pin} state changed.`); } else { showToast('error', 'Toggle Failed', 'Device returned an error.'); } setTimeout(() => { if (e.target) e.target.textContent = 'Toggle'; }, 400); pollDeviceData(); } catch (err) { console.error('Toggle failed', err); if (e.target) e.target.textContent = 'Toggle'; showToast('error', 'Network Error', 'Could not reach the device.'); } }); }); }"

js = js.replace(old_load_append, new_load_append)

# 4. Remove the trigger-btn event listeners from switches
js = re.sub(r'document\.querySelectorAll\(\'\.trigger-btn\'\)\.forEach\(el\s*=>\s*\{.*?pollDeviceData\(\);\s*\}\s*catch\s*\(err\)\s*\{.*?\s*\}\s*\}\);\s*\}\);', '', js)


with open(filepath, 'w', encoding='utf-8') as f:
    f.write(js)

print('app.js successfully patched!')
