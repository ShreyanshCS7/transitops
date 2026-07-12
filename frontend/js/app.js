/* ===== TransitOps SPA ===== */
const state = {
  user: null,
  view: 'dashboard',
  cache: {},
};

const ROLE_PERMS = {
  Admin: { vehicles: true, drivers: true, trips: true, maintenance: true, fuel: true, expenses: true },
  FleetManager: { vehicles: true, drivers: true, trips: true, maintenance: true, fuel: true, expenses: true },
  Driver: { vehicles: false, drivers: false, trips: true, maintenance: false, fuel: false, expenses: false },
  SafetyOfficer: { vehicles: false, drivers: true, trips: false, maintenance: false, fuel: false, expenses: false },
  FinancialAnalyst: { vehicles: false, drivers: false, trips: false, maintenance: false, fuel: true, expenses: true },
};

function can(action) {
  if (!state.user) return false;
  const perms = ROLE_PERMS[state.user.role] || {};
  return !!perms[action];
}

function statusClass(s) { return (s || '').replace(/\s+/g, ''); }

function badge(status) {
  return `<span class="badge ${statusClass(status)}"><span class="badge-dot"></span>${status}</span>`;
}

function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—';
  return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(n, dp = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s.includes('T') || s.includes(' ') ? s : s + 'T00:00:00');
  if (isNaN(d)) return s;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ===== CSV export ===== */
function exportCsv(filename, rows) {
  if (!rows || !rows.length) { toast('Nothing to export', 'error'); return; }
  const cols = Object.keys(rows[0]);
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => escape(r[c])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ===== Modal helper ===== */
function openModal({ title, bodyHtml, footerHtml, onMount }) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'active-modal';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">${title}</div>
        <button class="modal-close" id="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  if (onMount) onMount(backdrop);
}
function closeModal() {
  const m = document.getElementById('active-modal');
  if (m) m.remove();
}
function modalError(msg) {
  const body = document.querySelector('#active-modal .modal-body');
  if (!body) return;
  let err = body.querySelector('.modal-error');
  if (!err) {
    err = document.createElement('div');
    err.className = 'modal-error';
    body.prepend(err);
  }
  err.textContent = msg;
}

/* ===== Auth ===== */
async function tryRestoreSession() {
  Api.loadToken();
  if (!Api.token) return showLogin();
  try {
    const { user } = await Api.get('/auth/me');
    state.user = user;
    showApp();
  } catch (e) {
    Api.setToken(null);
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-screen').hidden = false;
  document.getElementById('app').hidden = true;
}

function showApp() {
  document.getElementById('login-screen').hidden = true;
  document.getElementById('app').hidden = false;
  document.getElementById('user-name').textContent = state.user.name;
  document.getElementById('user-role').textContent = state.user.role;
  document.getElementById('user-avatar').textContent = state.user.name.split(' ').map(w => w[0]).slice(0,2).join('');
  buildNav();
  navigateTo('dashboard');
}

function buildNav() {
  const map = { vehicles: 'vehicles', drivers: 'drivers', trips: 'trips', maintenance: 'maintenance', fuel: 'fuel', reports: null };
  document.querySelectorAll('.nav-link').forEach(btn => {
    const view = btn.dataset.view;
    const permKey = map[view];
    if (permKey && !can(permKey) && view !== 'reports' && view !== 'dashboard') {
      btn.style.display = 'none';
    } else {
      btn.style.display = '';
    }
    btn.onclick = () => navigateTo(view);
  });
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errBox = document.getElementById('login-error');
  errBox.hidden = true;
  try {
    const { token, user } = await Api.post('/auth/login', { email, password });
    Api.setToken(token);
    state.user = user;
    showApp();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
  }
});

document.querySelectorAll('.demo-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.getElementById('login-email').value = chip.dataset.email;
    document.getElementById('login-password').value = 'Password123!';
  });
});

document.getElementById('logout-btn').addEventListener('click', () => {
  Api.setToken(null);
  state.user = null;
  showLogin();
});

/* ===== Clock ===== */
function tickClock() {
  const el = document.getElementById('topbar-clock');
  const now = new Date();
  el.textContent = now.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
}
setInterval(tickClock, 1000 * 30);

/* ===== Router ===== */
const VIEW_META = {
  dashboard: { eyebrow: 'Overview', title: 'Dashboard' },
  vehicles: { eyebrow: 'Fleet Assets', title: 'Vehicle Registry' },
  drivers: { eyebrow: 'Workforce', title: 'Driver Management' },
  trips: { eyebrow: 'Dispatch', title: 'Trip Management' },
  maintenance: { eyebrow: 'Service', title: 'Maintenance' },
  fuel: { eyebrow: 'Cost Tracking', title: 'Fuel & Expenses' },
  reports: { eyebrow: 'Analytics', title: 'Reports & Analytics' },
};

async function navigateTo(view) {
  state.view = view;
  document.querySelectorAll('.nav-link').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const meta = VIEW_META[view];
  document.getElementById('view-eyebrow').textContent = meta.eyebrow;
  document.getElementById('view-title').textContent = meta.title;
  const container = document.getElementById('view-container');
  container.innerHTML = '<div class="empty-state">Loading…</div>';
  tickClock();
  try {
    const renderer = { dashboard: renderDashboard, vehicles: renderVehicles, drivers: renderDrivers,
      trips: renderTrips, maintenance: renderMaintenance, fuel: renderFuel, reports: renderReports }[view];
    await renderer(container);
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Failed to load: ${escapeHtml(e.message)}</div>`;
  }
}

/* ===================== DASHBOARD ===================== */
async function renderDashboard(container) {
  const [kpis, filters, vehicles] = await Promise.all([
    Api.get('/dashboard/kpis'), Api.get('/dashboard/filters'), Api.get('/vehicles'),
  ]);

  container.innerHTML = `
    <div class="panel-toolbar" style="margin-bottom:16px;">
      <select class="filter-select" id="f-type"><option value="">All types</option>${filters.types.map(t=>`<option>${t}</option>`).join('')}</select>
      <select class="filter-select" id="f-status"><option value="">All statuses</option>${filters.statuses.map(s=>`<option>${s}</option>`).join('')}</select>
      <select class="filter-select" id="f-region"><option value="">All regions</option>${filters.regions.map(r=>`<option>${r}</option>`).join('')}</select>
    </div>
    <div class="kpi-grid" id="kpi-grid"></div>
    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">Fleet Status Board</div>
          <div class="panel-sub">Live snapshot of every vehicle — pulsing chips are currently dispatched</div>
        </div>
      </div>
      <div class="status-strip" id="status-strip"></div>
    </div>
  `;

  function paintKpis(k) {
    const cards = [
      ['Active Vehicles', k.active_vehicles, ''],
      ['Available Vehicles', k.available_vehicles, 'teal'],
      ['In Maintenance', k.vehicles_in_maintenance, 'danger'],
      ['Active Trips', k.active_trips, 'accent'],
      ['Pending Trips', k.pending_trips, ''],
      ['Drivers On Duty', k.drivers_on_duty, 'teal'],
      ['Fleet Utilization', k.fleet_utilization_percent + '%', 'accent'],
    ];
    document.getElementById('kpi-grid').innerHTML = cards.map(([label, val, cls]) => `
      <div class="kpi-card">
        <div class="kpi-label">${label}</div>
        <div class="kpi-value ${cls}">${val}</div>
      </div>`).join('');
  }
  paintKpis(kpis);

  function paintStrip(vs) {
    const strip = document.getElementById('status-strip');
    if (!vs.length) { strip.innerHTML = '<div class="status-strip-empty">No vehicles match the current filters.</div>'; return; }
    strip.innerHTML = vs.map(v => `
      <div class="route-chip ${v.status === 'On Trip' ? 'dispatched' : ''}" title="${escapeHtml(v.name)} — ${v.status}">
        <span class="route-dot" data-status="${v.status}"></span>
        <span class="plate">${escapeHtml(v.registration_number)}</span>
      </div>`).join('');
  }
  paintStrip(vehicles);

  async function applyFilters() {
    const type = document.getElementById('f-type').value;
    const status = document.getElementById('f-status').value;
    const region = document.getElementById('f-region').value;
    const qs = new URLSearchParams({ ...(type&&{type}), ...(status&&{status}), ...(region&&{region}) }).toString();
    const [k, vs] = await Promise.all([Api.get('/dashboard/kpis' + (qs?`?${qs}`:'')), Api.get('/vehicles' + (qs?`?${qs}`:''))]);
    paintKpis(k); paintStrip(vs);
  }
  ['f-type','f-status','f-region'].forEach(id => document.getElementById(id).addEventListener('change', applyFilters));
}

/* ===================== VEHICLES ===================== */
async function renderVehicles(container) {
  const vehicles = await Api.get('/vehicles');
  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">Vehicle Registry</div>
          <div class="panel-sub">${vehicles.length} vehicles on file</div>
        </div>
        <div class="panel-toolbar">
          <button class="btn btn-ghost btn-sm" id="export-vehicles">Export CSV</button>
          ${can('vehicles') ? '<button class="btn btn-primary btn-sm" id="add-vehicle">+ Register Vehicle</button>' : ''}
        </div>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th>Registration</th><th>Name / Model</th><th>Type</th><th>Max Load</th>
            <th>Odometer</th><th>Acquisition Cost</th><th>Region</th><th>Status</th>${can('vehicles')?'<th></th>':''}
          </tr></thead>
          <tbody id="vehicles-tbody"></tbody>
        </table>
      </div>
    </div>`;

  const tbody = document.getElementById('vehicles-tbody');
  if (!vehicles.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">No vehicles registered yet.</div></td></tr>`;
  } else {
    tbody.innerHTML = vehicles.map(v => `
      <tr>
        <td class="mono">${escapeHtml(v.registration_number)}</td>
        <td>${escapeHtml(v.name)}</td>
        <td class="text-dim">${escapeHtml(v.type)}</td>
        <td class="mono">${fmtNum(v.max_load_capacity)} kg</td>
        <td class="mono">${fmtNum(v.odometer)} km</td>
        <td class="mono">${fmtMoney(v.acquisition_cost)}</td>
        <td class="text-dim">${escapeHtml(v.region)}</td>
        <td>${badge(v.status)}</td>
        ${can('vehicles') ? `<td class="action-row">
          <button class="btn btn-sm btn-ghost" data-edit="${v.id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-del="${v.id}">Delete</button>
        </td>` : ''}
      </tr>`).join('');
  }

  document.getElementById('export-vehicles').addEventListener('click', () => exportCsv('vehicles.csv', vehicles));
  if (can('vehicles')) {
    document.getElementById('add-vehicle').addEventListener('click', () => openVehicleModal());
    tbody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      openVehicleModal(vehicles.find(v => v.id == b.dataset.edit));
    }));
    tbody.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this vehicle? This cannot be undone.')) return;
      try { await Api.del(`/vehicles/${b.dataset.del}`); toast('Vehicle deleted', 'success'); navigateTo('vehicles'); }
      catch (e) { toast(e.message, 'error'); }
    }));
  }
}

function openVehicleModal(vehicle) {
  const isEdit = !!vehicle;
  openModal({
    title: isEdit ? `Edit ${vehicle.registration_number}` : 'Register Vehicle',
    bodyHtml: `
      <div class="field-grid">
        <div class="field"><label>Registration Number</label>
          <input id="v-reg" value="${vehicle ? escapeHtml(vehicle.registration_number) : ''}" ${isEdit?'disabled':''} placeholder="VAN-05" /></div>
        <div class="field"><label>Name / Model</label>
          <input id="v-name" value="${vehicle ? escapeHtml(vehicle.name) : ''}" placeholder="Van-05" /></div>
        <div class="field"><label>Type</label>
          <input id="v-type" value="${vehicle ? escapeHtml(vehicle.type) : ''}" placeholder="Van / Truck / Motorbike" /></div>
        <div class="field"><label>Max Load Capacity (kg)</label>
          <input id="v-load" type="number" min="0" step="1" value="${vehicle ? vehicle.max_load_capacity : ''}" /></div>
        <div class="field"><label>Odometer (km)</label>
          <input id="v-odo" type="number" min="0" step="1" value="${vehicle ? vehicle.odometer : 0}" /></div>
        <div class="field"><label>Acquisition Cost</label>
          <input id="v-cost" type="number" min="0" step="0.01" value="${vehicle ? vehicle.acquisition_cost : ''}" /></div>
        <div class="field"><label>Region</label>
          <input id="v-region" value="${vehicle ? escapeHtml(vehicle.region) : ''}" placeholder="North" /></div>
        ${isEdit ? `<div class="field"><label>Status</label>
          <select id="v-status">
            ${['Available','In Shop','Retired'].map(s=>`<option ${vehicle.status===s?'selected':''}>${s}</option>`).join('')}
          </select></div>` : ''}
      </div>`,
    footerHtml: `<button class="btn btn-ghost" id="v-cancel">Cancel</button><button class="btn btn-primary" id="v-save">${isEdit?'Save Changes':'Register Vehicle'}</button>`,
    onMount: () => {
      document.getElementById('v-cancel').addEventListener('click', closeModal);
      document.getElementById('v-save').addEventListener('click', async () => {
        const payload = {
          name: document.getElementById('v-name').value.trim(),
          type: document.getElementById('v-type').value.trim(),
          max_load_capacity: parseFloat(document.getElementById('v-load').value),
          odometer: parseFloat(document.getElementById('v-odo').value) || 0,
          acquisition_cost: parseFloat(document.getElementById('v-cost').value) || 0,
          region: document.getElementById('v-region').value.trim() || 'Unassigned',
        };
        if (!payload.name || !payload.type || !payload.max_load_capacity) { modalError('Name, type and max load capacity are required.'); return; }
        try {
          if (isEdit) {
            payload.status = document.getElementById('v-status').value;
            await Api.put(`/vehicles/${vehicle.id}`, payload);
            toast('Vehicle updated', 'success');
          } else {
            payload.registration_number = document.getElementById('v-reg').value.trim();
            if (!payload.registration_number) { modalError('Registration number is required.'); return; }
            await Api.post('/vehicles', payload);
            toast('Vehicle registered', 'success');
          }
          closeModal(); navigateTo('vehicles');
        } catch (e) { modalError(e.message); }
      });
    }
  });
}

/* ===================== DRIVERS ===================== */
async function renderDrivers(container) {
  const drivers = await Api.get('/drivers');
  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">Driver Roster</div>
          <div class="panel-sub">${drivers.length} drivers on file</div>
        </div>
        <div class="panel-toolbar">
          <button class="btn btn-ghost btn-sm" id="export-drivers">Export CSV</button>
          ${can('drivers') ? '<button class="btn btn-primary btn-sm" id="add-driver">+ Add Driver</button>' : ''}
        </div>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th>Name</th><th>License #</th><th>Category</th><th>License Expiry</th>
            <th>Contact</th><th>Safety Score</th><th>Status</th>${can('drivers')?'<th></th>':''}
          </tr></thead>
          <tbody id="drivers-tbody"></tbody>
        </table>
      </div>
    </div>`;

  const tbody = document.getElementById('drivers-tbody');
  if (!drivers.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">No drivers on file yet.</div></td></tr>`;
  } else {
    tbody.innerHTML = drivers.map(d => `
      <tr>
        <td>${escapeHtml(d.name)}</td>
        <td class="mono">${escapeHtml(d.license_number)}</td>
        <td class="text-dim">${escapeHtml(d.license_category)}</td>
        <td>${fmtDate(d.license_expiry)} ${d.license_expired ? '<span class="badge expired">Expired</span>' : ''}</td>
        <td class="text-dim">${escapeHtml(d.contact_number || '—')}</td>
        <td class="mono">${fmtNum(d.safety_score)}</td>
        <td>${badge(d.status)}</td>
        ${can('drivers') ? `<td class="action-row">
          <button class="btn btn-sm btn-ghost" data-edit="${d.id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-del="${d.id}">Delete</button>
        </td>` : ''}
      </tr>`).join('');
  }

  document.getElementById('export-drivers').addEventListener('click', () => exportCsv('drivers.csv', drivers));
  if (can('drivers')) {
    document.getElementById('add-driver').addEventListener('click', () => openDriverModal());
    tbody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      openDriverModal(drivers.find(d => d.id == b.dataset.edit));
    }));
    tbody.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this driver? This cannot be undone.')) return;
      try { await Api.del(`/drivers/${b.dataset.del}`); toast('Driver deleted', 'success'); navigateTo('drivers'); }
      catch (e) { toast(e.message, 'error'); }
    }));
  }
}

function openDriverModal(driver) {
  const isEdit = !!driver;
  openModal({
    title: isEdit ? `Edit ${driver.name}` : 'Add Driver',
    bodyHtml: `
      <div class="field-grid">
        <div class="field"><label>Full Name</label><input id="d-name" value="${driver ? escapeHtml(driver.name) : ''}" /></div>
        <div class="field"><label>License Number</label><input id="d-license" value="${driver ? escapeHtml(driver.license_number) : ''}" ${isEdit?'disabled':''} /></div>
        <div class="field"><label>License Category</label><input id="d-cat" value="${driver ? escapeHtml(driver.license_category) : ''}" placeholder="LMV / HMV" /></div>
        <div class="field"><label>License Expiry</label><input id="d-expiry" type="date" value="${driver ? driver.license_expiry.slice(0,10) : ''}" /></div>
        <div class="field"><label>Contact Number</label><input id="d-contact" value="${driver ? escapeHtml(driver.contact_number||'') : ''}" /></div>
        <div class="field"><label>Safety Score (0-100)</label><input id="d-score" type="number" min="0" max="100" value="${driver ? driver.safety_score : 100}" /></div>
        ${isEdit ? `<div class="field"><label>Status</label>
          <select id="d-status">${['Available','Off Duty','Suspended'].map(s=>`<option ${driver.status===s?'selected':''}>${s}</option>`).join('')}</select></div>` : ''}
      </div>`,
    footerHtml: `<button class="btn btn-ghost" id="d-cancel">Cancel</button><button class="btn btn-primary" id="d-save">${isEdit?'Save Changes':'Add Driver'}</button>`,
    onMount: () => {
      document.getElementById('d-cancel').addEventListener('click', closeModal);
      document.getElementById('d-save').addEventListener('click', async () => {
        const payload = {
          name: document.getElementById('d-name').value.trim(),
          license_category: document.getElementById('d-cat').value.trim(),
          license_expiry: document.getElementById('d-expiry').value,
          contact_number: document.getElementById('d-contact').value.trim(),
          safety_score: parseFloat(document.getElementById('d-score').value),
        };
        if (!payload.name || !payload.license_category || !payload.license_expiry) { modalError('Name, category, and expiry date are required.'); return; }
        try {
          if (isEdit) {
            payload.status = document.getElementById('d-status').value;
            await Api.put(`/drivers/${driver.id}`, payload);
            toast('Driver updated', 'success');
          } else {
            payload.license_number = document.getElementById('d-license').value.trim();
            if (!payload.license_number) { modalError('License number is required.'); return; }
            await Api.post('/drivers', payload);
            toast('Driver added', 'success');
          }
          closeModal(); navigateTo('drivers');
        } catch (e) { modalError(e.message); }
      });
    }
  });
}

/* ===================== TRIPS ===================== */
async function renderTrips(container) {
  const trips = await Api.get('/trips');
  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">Trips</div>
          <div class="panel-sub">${trips.length} trips • Draft → Dispatched → Completed / Cancelled</div>
        </div>
        <div class="panel-toolbar">
          <button class="btn btn-ghost btn-sm" id="export-trips">Export CSV</button>
          ${can('trips') ? '<button class="btn btn-primary btn-sm" id="add-trip">+ Create Trip</button>' : ''}
        </div>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th>Route</th><th>Vehicle</th><th>Driver</th><th>Cargo</th><th>Distance</th><th>Status</th>${can('trips')?'<th></th>':''}
          </tr></thead>
          <tbody id="trips-tbody"></tbody>
        </table>
      </div>
    </div>`;

  const tbody = document.getElementById('trips-tbody');
  if (!trips.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">No trips yet. Create one to get started.</div></td></tr>`;
  } else {
    tbody.innerHTML = trips.map(t => `
      <tr>
        <td>${escapeHtml(t.source)} <span class="text-faint">→</span> ${escapeHtml(t.destination)}</td>
        <td class="mono">${escapeHtml(t.registration_number)}</td>
        <td>${escapeHtml(t.driver_name)}</td>
        <td class="mono">${fmtNum(t.cargo_weight)} kg</td>
        <td class="mono">${t.actual_distance ? fmtNum(t.actual_distance) : fmtNum(t.planned_distance)} km${t.actual_distance?'':' (planned)'}</td>
        <td>${badge(t.status)}</td>
        ${can('trips') ? `<td class="action-row">
          ${t.status === 'Draft' ? `<button class="btn btn-sm btn-primary" data-dispatch="${t.id}">Dispatch</button>` : ''}
          ${t.status === 'Dispatched' ? `<button class="btn btn-sm btn-primary" data-complete="${t.id}">Complete</button>` : ''}
          ${['Draft','Dispatched'].includes(t.status) ? `<button class="btn btn-sm btn-danger" data-cancel="${t.id}">Cancel</button>` : ''}
        </td>` : ''}
      </tr>`).join('');
  }

  document.getElementById('export-trips').addEventListener('click', () => exportCsv('trips.csv', trips));
  if (can('trips')) {
    document.getElementById('add-trip').addEventListener('click', () => openTripModal());
    tbody.querySelectorAll('[data-dispatch]').forEach(b => b.addEventListener('click', async () => {
      try { await Api.post(`/trips/${b.dataset.dispatch}/dispatch`); toast('Trip dispatched', 'success'); navigateTo('trips'); }
      catch (e) { toast(e.message, 'error'); }
    }));
    tbody.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Cancel this trip?')) return;
      try { await Api.post(`/trips/${b.dataset.cancel}/cancel`); toast('Trip cancelled', 'success'); navigateTo('trips'); }
      catch (e) { toast(e.message, 'error'); }
    }));
    tbody.querySelectorAll('[data-complete]').forEach(b => b.addEventListener('click', () => {
      openCompleteTripModal(trips.find(t => t.id == b.dataset.complete));
    }));
  }
}

async function openTripModal() {
  const [vehicles, drivers] = await Promise.all([Api.get('/vehicles/available'), Api.get('/drivers/available')]);
  openModal({
    title: 'Create Trip',
    bodyHtml: `
      <div class="field-grid">
        <div class="field"><label>Source</label><input id="t-source" placeholder="Warehouse A" /></div>
        <div class="field"><label>Destination</label><input id="t-dest" placeholder="Distribution Center B" /></div>
        <div class="field"><label>Vehicle</label>
          <select id="t-vehicle">${vehicles.length ? vehicles.map(v=>`<option value="${v.id}" data-load="${v.max_load_capacity}">${v.registration_number} — ${escapeHtml(v.name)} (max ${v.max_load_capacity}kg)</option>`).join('') : '<option value="">No available vehicles</option>'}</select></div>
        <div class="field"><label>Driver</label>
          <select id="t-driver">${drivers.length ? drivers.map(d=>`<option value="${d.id}">${escapeHtml(d.name)} — ${d.license_number}</option>`).join('') : '<option value="">No available drivers</option>'}</select></div>
        <div class="field"><label>Cargo Weight (kg)</label><input id="t-cargo" type="number" min="0" step="1" /></div>
        <div class="field"><label>Planned Distance (km)</label><input id="t-distance" type="number" min="0" step="1" /></div>
      </div>
      <div class="field-hint" id="t-hint">Cargo weight must not exceed the selected vehicle's max load capacity.</div>`,
    footerHtml: `<button class="btn btn-ghost" id="t-cancel">Cancel</button><button class="btn btn-primary" id="t-save" ${(!vehicles.length||!drivers.length)?'disabled':''}>Create Trip (Draft)</button>`,
    onMount: () => {
      document.getElementById('t-cancel').addEventListener('click', closeModal);
      document.getElementById('t-save').addEventListener('click', async () => {
        const vehicleSel = document.getElementById('t-vehicle');
        const payload = {
          source: document.getElementById('t-source').value.trim(),
          destination: document.getElementById('t-dest').value.trim(),
          vehicle_id: parseInt(vehicleSel.value),
          driver_id: parseInt(document.getElementById('t-driver').value),
          cargo_weight: parseFloat(document.getElementById('t-cargo').value),
          planned_distance: parseFloat(document.getElementById('t-distance').value),
        };
        if (!payload.source || !payload.destination || !payload.vehicle_id || !payload.driver_id || !payload.cargo_weight || !payload.planned_distance) {
          modalError('All fields are required.'); return;
        }
        try {
          await Api.post('/trips', payload);
          toast('Trip created as Draft', 'success');
          closeModal(); navigateTo('trips');
        } catch (e) { modalError(e.message); }
      });
    }
  });
}

function openCompleteTripModal(trip) {
  openModal({
    title: `Complete Trip — ${trip.registration_number}`,
    bodyHtml: `
      <div class="field-grid">
        <div class="field full"><label>Final Odometer Reading (km)</label><input id="c-odo" type="number" min="0" step="0.1" /></div>
        <div class="field"><label>Fuel Consumed (liters)</label><input id="c-fuel" type="number" min="0" step="0.1" /></div>
        <div class="field"><label>Fuel Cost</label><input id="c-fuelcost" type="number" min="0" step="0.01" /></div>
        <div class="field full"><label>Trip Revenue (optional)</label><input id="c-revenue" type="number" min="0" step="0.01" placeholder="For ROI calculation" /></div>
      </div>`,
    footerHtml: `<button class="btn btn-ghost" id="c-cancel">Cancel</button><button class="btn btn-primary" id="c-save">Mark Completed</button>`,
    onMount: () => {
      document.getElementById('c-cancel').addEventListener('click', closeModal);
      document.getElementById('c-save').addEventListener('click', async () => {
        const payload = {
          final_odometer: parseFloat(document.getElementById('c-odo').value),
          fuel_consumed: parseFloat(document.getElementById('c-fuel').value),
          fuel_cost: parseFloat(document.getElementById('c-fuelcost').value) || 0,
          revenue: document.getElementById('c-revenue').value ? parseFloat(document.getElementById('c-revenue').value) : undefined,
        };
        if (isNaN(payload.final_odometer) || isNaN(payload.fuel_consumed)) { modalError('Final odometer and fuel consumed are required.'); return; }
        try {
          await Api.post(`/trips/${trip.id}/complete`, payload);
          toast('Trip completed', 'success');
          closeModal(); navigateTo('trips');
        } catch (e) { modalError(e.message); }
      });
    }
  });
}

/* ===================== MAINTENANCE ===================== */
async function renderMaintenance(container) {
  const logs = await Api.get('/maintenance');
  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">Maintenance Log</div>
          <div class="panel-sub">Active records take the vehicle out of the dispatch pool automatically</div>
        </div>
        <div class="panel-toolbar">
          <button class="btn btn-ghost btn-sm" id="export-maint">Export CSV</button>
          ${can('maintenance') ? '<button class="btn btn-primary btn-sm" id="add-maint">+ New Record</button>' : ''}
        </div>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Vehicle</th><th>Description</th><th>Cost</th><th>Opened</th><th>Closed</th><th>Status</th>${can('maintenance')?'<th></th>':''}</tr></thead>
          <tbody id="maint-tbody"></tbody>
        </table>
      </div>
    </div>`;

  const tbody = document.getElementById('maint-tbody');
  if (!logs.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">No maintenance records yet.</div></td></tr>`;
  } else {
    tbody.innerHTML = logs.map(m => `
      <tr>
        <td class="mono">${escapeHtml(m.registration_number)} <span class="text-faint">${escapeHtml(m.vehicle_name)}</span></td>
        <td>${escapeHtml(m.description)}</td>
        <td class="mono">${fmtMoney(m.cost)}</td>
        <td class="text-dim">${fmtDate(m.created_at)}</td>
        <td class="text-dim">${fmtDate(m.closed_at)}</td>
        <td>${badge(m.status)}</td>
        ${can('maintenance') ? `<td class="action-row">${m.status === 'Active' ? `<button class="btn btn-sm btn-primary" data-close="${m.id}">Close</button>` : ''}</td>` : ''}
      </tr>`).join('');
  }

  document.getElementById('export-maint').addEventListener('click', () => exportCsv('maintenance.csv', logs));
  if (can('maintenance')) {
    document.getElementById('add-maint').addEventListener('click', () => openMaintenanceModal());
    tbody.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeMaintenanceModal(b.dataset.close)));
  }
}

async function openMaintenanceModal() {
  const vehicles = (await Api.get('/vehicles')).filter(v => v.status !== 'On Trip' && v.status !== 'Retired');
  openModal({
    title: 'New Maintenance Record',
    bodyHtml: `
      <div class="field full" style="margin-bottom:14px;"><label>Vehicle</label>
        <select id="m-vehicle">${vehicles.length ? vehicles.map(v=>`<option value="${v.id}">${v.registration_number} — ${escapeHtml(v.name)} (${v.status})</option>`).join('') : '<option value="">No eligible vehicles</option>'}</select></div>
      <div class="field full" style="margin-bottom:14px;"><label>Description</label><input id="m-desc" placeholder="Oil Change" /></div>
      <div class="field full"><label>Estimated Cost</label><input id="m-cost" type="number" min="0" step="0.01" /></div>
      <div class="field-hint">Creating this record immediately sets the vehicle status to "In Shop", removing it from trip dispatch selection.</div>`,
    footerHtml: `<button class="btn btn-ghost" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-save" ${!vehicles.length?'disabled':''}>Create Record</button>`,
    onMount: () => {
      document.getElementById('m-cancel').addEventListener('click', closeModal);
      document.getElementById('m-save').addEventListener('click', async () => {
        const payload = {
          vehicle_id: parseInt(document.getElementById('m-vehicle').value),
          description: document.getElementById('m-desc').value.trim(),
          cost: parseFloat(document.getElementById('m-cost').value) || 0,
        };
        if (!payload.vehicle_id || !payload.description) { modalError('Vehicle and description are required.'); return; }
        try {
          await Api.post('/maintenance', payload);
          toast('Maintenance record created — vehicle moved to In Shop', 'success');
          closeModal(); navigateTo('maintenance');
        } catch (e) { modalError(e.message); }
      });
    }
  });
}

function closeMaintenanceModal(id) {
  openModal({
    title: 'Close Maintenance Record',
    bodyHtml: `<div class="field full"><label>Final Cost</label><input id="mc-cost" type="number" min="0" step="0.01" /></div>
      <div class="field-hint">Closing restores the vehicle to Available (unless it is Retired or has other active maintenance).</div>`,
    footerHtml: `<button class="btn btn-ghost" id="mc-cancel">Cancel</button><button class="btn btn-primary" id="mc-save">Close Record</button>`,
    onMount: () => {
      document.getElementById('mc-cancel').addEventListener('click', closeModal);
      document.getElementById('mc-save').addEventListener('click', async () => {
        const cost = document.getElementById('mc-cost').value;
        try {
          await Api.post(`/maintenance/${id}/close`, { final_cost: cost ? parseFloat(cost) : undefined });
          toast('Maintenance closed', 'success');
          closeModal(); navigateTo('maintenance');
        } catch (e) { modalError(e.message); }
      });
    }
  });
}

/* ===================== FUEL & EXPENSES ===================== */
async function renderFuel(container) {
  const [fuelLogs, expenses, opCost] = await Promise.all([
    Api.get('/fuel-logs'), Api.get('/expenses'), Api.get('/operational-cost'),
  ]);

  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div><div class="panel-title">Operational Cost per Vehicle</div><div class="panel-sub">Fuel + Maintenance + Other Expenses</div></div>
        <button class="btn btn-ghost btn-sm" id="export-opcost">Export CSV</button>
      </div>
      <div class="table-scroll"><table>
        <thead><tr><th>Vehicle</th><th>Fuel Cost</th><th>Maintenance Cost</th><th>Other</th><th>Total Operational Cost</th></tr></thead>
        <tbody>${opCost.map(o => `<tr>
          <td class="mono">${escapeHtml(o.registration_number)} <span class="text-faint">${escapeHtml(o.name)}</span></td>
          <td class="mono">${fmtMoney(o.fuel_cost)}</td><td class="mono">${fmtMoney(o.maintenance_cost)}</td>
          <td class="mono">${fmtMoney(o.other_expenses)}</td><td class="mono" style="color:var(--accent);font-weight:600;">${fmtMoney(o.total_operational_cost)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div><div class="panel-title">Fuel Logs</div><div class="panel-sub">${fuelLogs.length} entries</div></div>
        <div class="panel-toolbar">
          <button class="btn btn-ghost btn-sm" id="export-fuel">Export CSV</button>
          ${can('fuel') ? '<button class="btn btn-primary btn-sm" id="add-fuel">+ Log Fuel</button>' : ''}
        </div>
      </div>
      <div class="table-scroll"><table>
        <thead><tr><th>Vehicle</th><th>Liters</th><th>Cost</th><th>Date</th></tr></thead>
        <tbody>${fuelLogs.length ? fuelLogs.map(f => `<tr>
          <td class="mono">${escapeHtml(f.registration_number)}</td><td class="mono">${fmtNum(f.liters,1)} L</td>
          <td class="mono">${fmtMoney(f.cost)}</td><td class="text-dim">${fmtDate(f.date)}</td>
        </tr>`).join('') : `<tr><td colspan="4"><div class="empty-state">No fuel logs yet.</div></td></tr>`}</tbody>
      </table></div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div><div class="panel-title">Other Expenses</div><div class="panel-sub">Tolls, fines, and misc costs</div></div>
        <div class="panel-toolbar">
          <button class="btn btn-ghost btn-sm" id="export-expenses">Export CSV</button>
          ${can('expenses') ? '<button class="btn btn-primary btn-sm" id="add-expense">+ Log Expense</button>' : ''}
        </div>
      </div>
      <div class="table-scroll"><table>
        <thead><tr><th>Vehicle</th><th>Type</th><th>Amount</th><th>Date</th><th>Notes</th></tr></thead>
        <tbody>${expenses.length ? expenses.map(e => `<tr>
          <td class="mono">${escapeHtml(e.registration_number || '—')}</td><td class="text-dim">${escapeHtml(e.type)}</td>
          <td class="mono">${fmtMoney(e.amount)}</td><td class="text-dim">${fmtDate(e.date)}</td><td class="text-faint">${escapeHtml(e.description||'')}</td>
        </tr>`).join('') : `<tr><td colspan="5"><div class="empty-state">No expenses logged yet.</div></td></tr>`}</tbody>
      </table></div>
    </div>`;

  document.getElementById('export-opcost').addEventListener('click', () => exportCsv('operational-cost.csv', opCost));
  document.getElementById('export-fuel').addEventListener('click', () => exportCsv('fuel-logs.csv', fuelLogs));
  document.getElementById('export-expenses').addEventListener('click', () => exportCsv('expenses.csv', expenses));

  if (can('fuel')) document.getElementById('add-fuel').addEventListener('click', () => openFuelModal());
  if (can('expenses')) document.getElementById('add-expense').addEventListener('click', () => openExpenseModal());
}

async function openFuelModal() {
  const vehicles = await Api.get('/vehicles');
  openModal({
    title: 'Log Fuel',
    bodyHtml: `
      <div class="field full" style="margin-bottom:14px;"><label>Vehicle</label>
        <select id="f-vehicle">${vehicles.map(v=>`<option value="${v.id}">${v.registration_number} — ${escapeHtml(v.name)}</option>`).join('')}</select></div>
      <div class="field-grid">
        <div class="field"><label>Liters</label><input id="f-liters" type="number" min="0" step="0.1" /></div>
        <div class="field"><label>Cost</label><input id="f-cost" type="number" min="0" step="0.01" /></div>
        <div class="field full"><label>Date</label><input id="f-date" type="date" value="${new Date().toISOString().slice(0,10)}" /></div>
      </div>`,
    footerHtml: `<button class="btn btn-ghost" id="f-cancel">Cancel</button><button class="btn btn-primary" id="f-save">Log Fuel</button>`,
    onMount: () => {
      document.getElementById('f-cancel').addEventListener('click', closeModal);
      document.getElementById('f-save').addEventListener('click', async () => {
        const payload = {
          vehicle_id: parseInt(document.getElementById('f-vehicle').value),
          liters: parseFloat(document.getElementById('f-liters').value),
          cost: parseFloat(document.getElementById('f-cost').value),
          date: document.getElementById('f-date').value,
        };
        if (!payload.vehicle_id || isNaN(payload.liters) || isNaN(payload.cost)) { modalError('All fields are required.'); return; }
        try { await Api.post('/fuel-logs', payload); toast('Fuel log added', 'success'); closeModal(); navigateTo('fuel'); }
        catch (e) { modalError(e.message); }
      });
    }
  });
}

async function openExpenseModal() {
  const vehicles = await Api.get('/vehicles');
  openModal({
    title: 'Log Expense',
    bodyHtml: `
      <div class="field full" style="margin-bottom:14px;"><label>Vehicle (optional)</label>
        <select id="e-vehicle"><option value="">— Fleet-wide —</option>${vehicles.map(v=>`<option value="${v.id}">${v.registration_number} — ${escapeHtml(v.name)}</option>`).join('')}</select></div>
      <div class="field-grid">
        <div class="field"><label>Type</label><input id="e-type" placeholder="Toll / Fine / Parking" /></div>
        <div class="field"><label>Amount</label><input id="e-amount" type="number" min="0" step="0.01" /></div>
        <div class="field"><label>Date</label><input id="e-date" type="date" value="${new Date().toISOString().slice(0,10)}" /></div>
        <div class="field"><label>Notes</label><input id="e-notes" placeholder="Optional" /></div>
      </div>`,
    footerHtml: `<button class="btn btn-ghost" id="e-cancel">Cancel</button><button class="btn btn-primary" id="e-save">Log Expense</button>`,
    onMount: () => {
      document.getElementById('e-cancel').addEventListener('click', closeModal);
      document.getElementById('e-save').addEventListener('click', async () => {
        const vid = document.getElementById('e-vehicle').value;
        const payload = {
          vehicle_id: vid ? parseInt(vid) : null,
          type: document.getElementById('e-type').value.trim(),
          amount: parseFloat(document.getElementById('e-amount').value),
          date: document.getElementById('e-date').value,
          description: document.getElementById('e-notes').value.trim(),
        };
        if (!payload.type || isNaN(payload.amount)) { modalError('Type and amount are required.'); return; }
        try { await Api.post('/expenses', payload); toast('Expense logged', 'success'); closeModal(); navigateTo('fuel'); }
        catch (e) { modalError(e.message); }
      });
    }
  });
}

/* ===================== REPORTS ===================== */
let charts = {};
function destroyCharts() { Object.values(charts).forEach(c => c && c.destroy()); charts = {}; }

async function renderReports(container) {
  destroyCharts();
  const [perf, util, trend] = await Promise.all([
    Api.get('/reports/vehicle-performance'), Api.get('/reports/fleet-utilization'), Api.get('/reports/monthly-cost-trend'),
  ]);

  container.innerHTML = `
    <div class="chart-grid" style="margin-bottom:20px;">
      <div class="chart-card">
        <h3>Fleet Status Breakdown</h3>
        <div class="panel-sub">Current allocation of every vehicle</div>
        <div class="chart-wrap"><canvas id="chart-status"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>Monthly Cost Trend</h3>
        <div class="panel-sub">Fuel + Maintenance + Other, by month</div>
        <div class="chart-wrap"><canvas id="chart-trend"></canvas></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <div><div class="panel-title">Vehicle Performance & ROI</div>
          <div class="panel-sub">Fuel Efficiency = Distance / Fuel · ROI = (Revenue − (Maintenance + Fuel)) / Acquisition Cost</div></div>
        <button class="btn btn-ghost btn-sm" id="export-perf">Export CSV</button>
      </div>
      <div class="table-scroll"><table>
        <thead><tr><th>Vehicle</th><th>Trips</th><th>Distance</th><th>Fuel Efficiency</th><th>Operational Cost</th><th>Revenue</th><th>ROI</th></tr></thead>
        <tbody>${perf.map(p => `<tr>
          <td class="mono">${escapeHtml(p.registration_number)} <span class="text-faint">${escapeHtml(p.name)}</span></td>
          <td class="mono">${p.completed_trips}</td>
          <td class="mono">${fmtNum(p.total_distance)} km</td>
          <td class="mono">${p.fuel_efficiency_km_per_liter != null ? fmtNum(p.fuel_efficiency_km_per_liter,2) + ' km/L' : '—'}</td>
          <td class="mono">${fmtMoney(p.total_operational_cost)}</td>
          <td class="mono">${fmtMoney(p.revenue)}</td>
          <td class="mono ${p.roi_percent > 0 ? 'roi-pos' : p.roi_percent < 0 ? 'roi-neg' : ''}">${p.roi_percent != null ? p.roi_percent + '%' : '—'}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;

  document.getElementById('export-perf').addEventListener('click', () => exportCsv('vehicle-performance.csv', perf));

  const statusEntries = Object.entries(util.by_status);
  const statusColors = { Available: '#3fbf83', 'On Trip': '#f5a623', 'In Shop': '#e5c25f', Retired: '#5f6a7a' };
  charts.status = new Chart(document.getElementById('chart-status'), {
    type: 'doughnut',
    data: {
      labels: statusEntries.map(e => e[0]),
      datasets: [{ data: statusEntries.map(e => e[1]), backgroundColor: statusEntries.map(e => statusColors[e[0]] || '#45d0c4'), borderWidth: 0 }],
    },
    options: { plugins: { legend: { labels: { color: '#e7ebf1', font: { family: 'IBM Plex Mono', size: 11 } } } } },
  });

  charts.trend = new Chart(document.getElementById('chart-trend'), {
    type: 'bar',
    data: {
      labels: trend.map(t => t.month),
      datasets: [
        { label: 'Fuel', data: trend.map(t => t.fuel_cost), backgroundColor: '#f5a623' },
        { label: 'Maintenance', data: trend.map(t => t.maintenance_cost), backgroundColor: '#e5c25f' },
        { label: 'Other', data: trend.map(t => t.other_expenses), backgroundColor: '#45d0c4' },
      ],
    },
    options: {
      scales: {
        x: { stacked: true, ticks: { color: '#8d96a5', font: { family: 'IBM Plex Mono', size: 10.5 } }, grid: { color: '#232b36' } },
        y: { stacked: true, ticks: { color: '#8d96a5', font: { family: 'IBM Plex Mono', size: 10.5 } }, grid: { color: '#232b36' } },
      },
      plugins: { legend: { labels: { color: '#e7ebf1', font: { family: 'IBM Plex Mono', size: 11 } } } },
    },
  });
}

/* ===================== Init ===================== */
tickClock();
tryRestoreSession();
