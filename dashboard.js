/**
 * Aentho — dashboard.js
 * Overview page: KPI cards, revenue chart, top products, alerts.
 */

let _revChart = null;

async function renderOverview() {
  await Promise.all([loadStats(), loadRevenueChart(), loadTopProducts(), loadRecentSales(), loadAlerts()]);
  _setGreeting();
}

function _setGreeting() {
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const name = (AAuth.getProfile()?.ownerName || '').split(' ')[0];
  const el   = document.getElementById('overview-greeting');
  if (el) el.textContent = `${g}${name ? ', ' + name : ''} — here's your business at a glance.`;
}

async function loadStats() {
  const [month, all, products, expenses] = await Promise.all([
    ADB.Sales.getThisMonth(), ADB.Sales.getAll(),
    ADB.Products.getAll(),    ADB.Expenses.getThisMonth()
  ]);

  const revenue  = month.reduce((s,x) => s + x.total,  0);
  const profit   = month.reduce((s,x) => s + (x.profit || 0), 0);
  const expTotal = expenses.reduce((s,x) => s + x.amount, 0);
  const low      = products.filter(p => p.stock <= p.minStock).length;

  // last month revenue for comparison
  const now = new Date();
  const lmS = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const lmE = new Date(now.getFullYear(), now.getMonth(),   0, 23,59,59);
  const lastRev = all.filter(s => { const d=new Date(s.date); return d>=lmS && d<=lmE; })
                     .reduce((s,x) => s+x.total, 0);
  const chg = UI.pctChange(revenue, lastRev);

  _set('stat-revenue',  UI.formatCurrency(revenue));
  _set('stat-profit',   UI.formatCurrency(profit));
  _set('stat-expenses', UI.formatCurrency(expTotal));
  _set('stat-sales',    month.length);
  _set('stat-lowstock', low);
  _set('stat-products', products.length);

  const chgEl = document.querySelector('#stat-revenue .stat-change');
  if (chgEl) {
    const arrow = chg.dir === 'up' ? '↑' : chg.dir === 'down' ? '↓' : '–';
    chgEl.textContent = `${arrow} ${chg.value}% vs last month`;
    chgEl.className   = `stat-change ${chg.dir}`;
  }
}

function _set(id, val) {
  const el = document.getElementById(id);
  if (el) { const v = el.querySelector('.stat-value'); if (v) v.textContent = val; }
}

async function loadRevenueChart() {
  const canvas = document.getElementById('revenue-chart');
  if (!canvas || !window.Chart) return;
  const all = await ADB.Sales.getAll();
  const labels = [], data = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const label = UI.formatDate(d.toISOString(), true);
    labels.push(label);
    data.push(all.filter(s => UI.formatDate(s.date, true) === label).reduce((s,x)=>s+x.total,0));
  }
  if (_revChart) _revChart.destroy();
  _revChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'Revenue', data, borderColor: '#4f8ef7',
        backgroundColor: 'rgba(79,142,247,0.08)', borderWidth: 2,
        pointRadius: 4, pointBackgroundColor: '#4f8ef7', tension: 0.4, fill: true }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: c => ' ' + UI.formatCurrency(c.parsed.y) } } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#4a5878', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#4a5878', font: { size: 11 },
              callback: v => UI.formatCurrency(v) } }
      }
    }
  });
}

async function loadTopProducts() {
  const el = document.getElementById('top-products-list');
  if (!el) return;
  const all = await ADB.Sales.getAll();
  const tally = {};
  all.forEach(s => { const k = s.productName||'Unknown'; tally[k] = (tally[k]||0)+s.total; });
  const sorted = Object.entries(tally).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const max = sorted[0]?.[1] || 1;
  if (!sorted.length) { el.innerHTML = '<div class="empty-state"><p>No sales yet</p></div>'; return; }
  const colors = ['#4f8ef7','#7c5cfc','#00d4aa','#f97316','#f59e0b'];
  el.innerHTML = sorted.map(([name, total], i) => `
    <div style="margin-bottom:14px">
      <div class="flex justify-between" style="margin-bottom:5px">
        <span style="font-size:.85rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">${_esc(name)}</span>
        <span style="font-size:.82rem;color:var(--text-secondary)">${UI.formatCurrency(total)}</span>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${((total/max)*100).toFixed(0)}%;background:${colors[i]||colors[0]}"></div>
      </div>
    </div>`).join('');
}

async function loadRecentSales() {
  const el = document.getElementById('recent-sales-list');
  if (!el) return;
  const sales = (await ADB.Sales.getAll()).slice(0,5);
  if (!sales.length) { el.innerHTML='<tr><td colspan="4"><div class="empty-state"><p>No sales yet</p></div></td></tr>'; return; }
  el.innerHTML = sales.map(s => `<tr>
    <td><span style="font-weight:500">${_esc(s.productName)}</span></td>
    <td>${UI.formatDate(s.date,true)}</td>
    <td class="hide-mobile">${_esc(s.payMethod)}</td>
    <td><span style="font-weight:600;color:var(--success)">${UI.formatCurrency(s.total)}</span></td>
  </tr>`).join('');
}

async function loadAlerts() {
  const el = document.getElementById('alert-list');
  if (!el) return;
  const low = await ADB.Products.getLowStock();
  for (const p of low) {
    const existing = await ADB.Notifications.getAll();
    const already  = existing.some(n => n.title==='Low Stock' && n.message.includes(p.name));
    if (!already) await ADB.Notifications.add('warning','Low Stock',`${_esc(p.name)} has only ${p.stock} ${p.unit}(s) left (min: ${p.minStock}).`);
  }
  const notifs = (await ADB.Notifications.getAll()).slice(0,5);
  const unread  = notifs.filter(n=>!n.read).length;
  updateNotifBadge(unread);
  if (!notifs.length) { el.innerHTML='<div class="empty-state"><p>No alerts</p></div>'; return; }
  el.innerHTML = notifs.map(n => `
    <div class="alert-item">
      <div class="alert-dot ${n.type}"></div>
      <div class="alert-body">
        <div class="alert-title">${_esc(n.title)}</div>
        <div class="alert-meta">${_esc(n.message)}</div>
      </div>
      <div class="alert-time">${UI.timeAgo(n.createdAt)}</div>
    </div>`).join('');
}

function updateNotifBadge(count) {
  ['notif-badge-sidebar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = count; el.style.display = count ? '' : 'none'; }
  });
  const dot = document.getElementById('notif-topbar-dot');
  if (dot) dot.style.display = count ? '' : 'none';
}

function _esc(s='') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

window.DashOverview = { renderOverview, loadStats, updateNotifBadge };
