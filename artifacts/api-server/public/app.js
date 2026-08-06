// ===== State =====
let csrfToken = sessionStorage.getItem('csrfToken') || '';
let instances = [];

// ===== Helpers =====
async function apiFetch(url, opts) {
  opts = opts || {};
  const method = opts.method || 'GET';
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  const res = await fetch(url, Object.assign({}, opts, { method, headers }));
  if (res.status === 401) { window.location.href = '/login.html'; return null; }
  return res;
}

function showAlert(el, msg, type) {
  type = type || 'error';
  el.className = 'alert alert-' + type;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(function() { el.classList.add('hidden'); }, 6000);
}

function jsonBlock(data) {
  const pre = document.createElement('pre');
  pre.className = 'result-box';
  pre.textContent = JSON.stringify(data, null, 2);
  return pre;
}

function getActiveInstance() {
  return document.getElementById('active-instance').value;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===== Session check =====
async function checkSession() {
  const res = await fetch('/auth/session');
  const data = await res.json();
  if (!data.authenticated) {
    window.location.href = '/login.html';
    return;
  }
  csrfToken = data.csrfToken;
  sessionStorage.setItem('csrfToken', csrfToken);
  document.getElementById('topbar-user').textContent = data.username;
}

// ===== Logout =====
document.getElementById('logout-btn').addEventListener('click', async function() {
  await apiFetch('/auth/logout', { method: 'POST' });
  sessionStorage.clear();
  window.location.href = '/login.html';
});

// ===== Instances =====
async function loadInstances() {
  const res = await apiFetch('/api/instances');
  if (!res) return;
  instances = await res.json();
  renderInstances();
  renderInstanceSelector();
}

function maskBadge(instance) {
  return '<span style="color:var(--text-muted);font-size:11px;font-family:monospace;">' + escHtml(instance.clientIdMasked) + '</span>';
}

function renderInstances() {
  const list = document.getElementById('instances-list');
  if (instances.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;margin-bottom:14px;">No instances added yet.</p>';
    return;
  }
  list.innerHTML = instances.map(function(inst) {
    return '<div class="instance-row" id="inst-' + inst.id + '">' +
      '<div class="instance-row-header">' +
        '<span class="instance-name">' + escHtml(inst.name) + '</span>' +
        '<div class="instance-row-actions">' +
          '<button class="btn btn-ghost btn-sm" onclick="testInstance(\'' + inst.id + '\')">Test</button>' +
          '<button class="btn btn-danger btn-sm" onclick="deleteInstance(\'' + inst.id + '\')">Delete</button>' +
        '</div>' +
      '</div>' +
      '<div class="instance-meta">' +
        '<span>' + escHtml(inst.apiBase) + '</span>' +
        '<span>Client ID: ' + maskBadge(inst) + '</span>' +
        '<span>Scope: ' + escHtml(inst.scope) + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderInstanceSelector() {
  const sel = document.getElementById('active-instance');
  const cur = sel.value;
  sel.innerHTML = '<option value="">\u2014 select an instance \u2014</option>' +
    instances.map(function(i) {
      return '<option value="' + i.id + '"' + (cur === i.id ? ' selected' : '') + '>' + escHtml(i.name) + '</option>';
    }).join('');
}

// Add instance collapsible
const addToggle = document.getElementById('add-toggle');
const addFormWrap = document.getElementById('add-form-wrap');
addToggle.addEventListener('click', function() {
  addToggle.classList.toggle('open');
  addFormWrap.classList.toggle('open');
});

document.getElementById('add-instance-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = {};
  fd.forEach(function(v, k) { body[k] = v; });
  const res = await apiFetch('/api/instances', { method: 'POST', body: JSON.stringify(body) });
  if (!res) return;
  const data = await res.json();
  if (!res.ok) {
    showAlert(document.getElementById('add-error'), data.error || 'Failed to add instance');
    return;
  }
  showAlert(document.getElementById('add-success'), 'Instance "' + data.name + '" added.', 'success');
  e.target.reset();
  addToggle.classList.remove('open');
  addFormWrap.classList.remove('open');
  loadInstances();
});

// Test instance
window.testInstance = async function(id) {
  const row = document.getElementById('inst-' + id);
  const btn = row.querySelector('[onclick*="testInstance"]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  const res = await apiFetch('/api/instances/' + id + '/test', { method: 'POST' });
  btn.disabled = false;
  btn.textContent = 'Test';
  if (!res) return;
  const data = await res.json();
  const badge = document.createElement('span');
  badge.className = data.ok ? 'badge badge-ok' : 'badge badge-fail';
  badge.textContent = data.ok ? '\u2713 OK' : '\u2717 Failed';
  badge.title = data.message;
  const existing = row.querySelector('.badge');
  if (existing) existing.remove();
  row.querySelector('.instance-row-header').appendChild(badge);
};

// Delete instance
window.deleteInstance = async function(id) {
  if (!confirm('Delete this instance? This cannot be undone.')) return;
  const res = await apiFetch('/api/instances/' + id, { method: 'DELETE' });
  if (!res) return;
  if (!res.ok) { alert('Failed to delete instance'); return; }
  loadInstances();
};

// ===== Tabs =====
document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab-pane').forEach(function(p) { p.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ===== End Users =====
document.getElementById('eu-search-btn').addEventListener('click', async function() {
  const email = document.getElementById('eu-search-email').value.trim();
  if (!email) return;
  const iid = getActiveInstance();
  if (!iid) { alert('Select an instance first.'); return; }
  const res = await apiFetch('/api/actions/' + iid + '/end-users/search?email=' + encodeURIComponent(email));
  if (!res) return;
  const data = await res.json();
  const el = document.getElementById('eu-search-result');
  el.innerHTML = '';
  el.appendChild(jsonBlock(!res.ok ? { error: data.error } : data));
});

document.getElementById('create-eu-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const iid = getActiveInstance();
  if (!iid) { alert('Select an instance first.'); return; }
  const fd = new FormData(e.target);
  const body = {};
  fd.forEach(function(v, k) { body[k] = v; });
  if (!body.roleName) delete body.roleName;
  const res = await apiFetch('/api/actions/' + iid + '/end-users', { method: 'POST', body: JSON.stringify(body) });
  if (!res) return;
  const data = await res.json();
  if (!res.ok) { showAlert(document.getElementById('eu-create-error'), data.error || 'Failed to create user'); return; }
  let msg = 'Created end user: ' + (data.user && data.user.email);
  if (data.roleError) msg += ' (role error: ' + data.roleError + ')';
  else if (data.roleAssigned) msg += ' \u2014 role assigned';
  showAlert(document.getElementById('eu-create-success'), msg, 'success');
  e.target.reset();
});

// ===== Technicians =====
document.getElementById('create-tech-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const iid = getActiveInstance();
  if (!iid) { alert('Select an instance first.'); return; }
  const fd = new FormData(e.target);
  const body = {};
  fd.forEach(function(v, k) { body[k] = v; });
  if (!body.roleName) delete body.roleName;
  const res = await apiFetch('/api/actions/' + iid + '/technicians', { method: 'POST', body: JSON.stringify(body) });
  if (!res) return;
  const data = await res.json();
  if (!res.ok) { showAlert(document.getElementById('tech-create-error'), data.error || 'Failed to create technician'); return; }
  let msg = 'Created technician: ' + (data.user && data.user.email);
  if (data.roleError) msg += ' (role error: ' + data.roleError + ')';
  else if (data.roleAssigned) msg += ' \u2014 role assigned';
  showAlert(document.getElementById('tech-create-success'), msg, 'success');
  e.target.reset();
});

// ===== Devices =====
document.getElementById('dev-search-btn').addEventListener('click', async function() {
  const name = document.getElementById('dev-search-name').value.trim();
  if (!name) return;
  const iid = getActiveInstance();
  if (!iid) { alert('Select an instance first.'); return; }
  const res = await apiFetch('/api/actions/' + iid + '/devices/search?name=' + encodeURIComponent(name));
  if (!res) return;
  const data = await res.json();
  const el = document.getElementById('dev-search-result');
  el.innerHTML = '';
  if (!res.ok) { el.appendChild(jsonBlock({ error: data.error })); return; }
  if (Array.isArray(data) && data.length > 0) {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = '<thead><tr><th>ID</th><th>Hostname</th></tr></thead><tbody>' +
      data.map(function(d) {
        return '<tr><td>' + escHtml(String(d.id)) + '</td><td>' + escHtml(d.systemName) + '</td></tr>';
      }).join('') + '</tbody>';
    wrap.appendChild(table);
    el.appendChild(wrap);
  } else {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">No devices found.</p>';
  }
});

// ===== Device-User Report =====
document.getElementById('report-view-btn').addEventListener('click', async function() {
  const iid = getActiveInstance();
  if (!iid) { alert('Select an instance first.'); return; }
  const btn = document.getElementById('report-view-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Loading\u2026';
  const res = await apiFetch('/api/actions/' + iid + '/device-user-mapping');
  btn.disabled = false;
  btn.textContent = 'View as table';
  if (!res) return;
  const data = await res.json();
  const el = document.getElementById('report-result');
  el.innerHTML = '';
  if (!res.ok) { el.appendChild(jsonBlock({ error: data.error })); return; }
  if (!Array.isArray(data) || data.length === 0) {
    el.innerHTML = '<p style="color:var(--text-muted);">No data.</p>';
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = '<thead><tr><th>Device ID</th><th>Hostname</th><th>OS</th><th>User ID</th><th>First</th><th>Last</th><th>Email</th></tr></thead><tbody>' +
    data.map(function(r) {
      return '<tr>' +
        '<td>' + escHtml(String(r.deviceId)) + '</td>' +
        '<td style="' + (r.hostname === '(device not found)' ? 'color:var(--danger)' : '') + '">' + escHtml(r.hostname) + '</td>' +
        '<td>' + escHtml(r.os || '') + '</td>' +
        '<td>' + escHtml(String(r.userId)) + '</td>' +
        '<td>' + escHtml(r.firstName) + '</td>' +
        '<td>' + escHtml(r.lastName) + '</td>' +
        '<td>' + escHtml(r.userEmail) + '</td>' +
      '</tr>';
    }).join('') + '</tbody>';
  wrap.appendChild(table);
  el.appendChild(wrap);
});

document.getElementById('report-csv-btn').addEventListener('click', function() {
  const iid = getActiveInstance();
  if (!iid) { alert('Select an instance first.'); return; }
  window.location.href = '/api/actions/' + iid + '/device-user-mapping?format=csv';
});

// ===== Init =====
(async function init() {
  await checkSession();
  await loadInstances();
})();
