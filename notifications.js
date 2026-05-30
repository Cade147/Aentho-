/**
 * Aentho — notifications.js
 * Notification centre: render, mark read, clear, auto-alerts.
 */

async function renderNotifications() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  await _autoAlerts();
  const notifs = await ADB.Notifications.getAll();
  const unread  = notifs.filter(n=>!n.read).length;
  DashOverview?.updateNotifBadge(unread);
  if (!notifs.length) {
    list.innerHTML='<div class="empty-state"><div class="empty-icon">🔔</div><p>No notifications</p></div>';
    return;
  }
  list.innerHTML = notifs.map(n=>`
    <div class="alert-item" style="${n.read?'opacity:.5':''}">
      <div class="alert-dot ${n.type}"></div>
      <div class="alert-body">
        <div class="alert-title">${_e(n.title)}</div>
        <div class="alert-meta">${_e(n.message)}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
        <div class="alert-time">${UI.timeAgo(n.createdAt)}</div>
        <div class="flex gap-1">
          ${!n.read?`<button class="btn btn-secondary btn-sm" style="padding:3px 8px;font-size:.72rem" onclick="_notifRead('${n.id}')">Read</button>`:''}
          <button class="btn btn-danger btn-sm" style="padding:3px 8px;font-size:.72rem" onclick="_notifDel('${n.id}')">✕</button>
        </div>
      </div>
    </div>`).join('');
}

async function _autoAlerts() {
  const [low, existing] = await Promise.all([ADB.Products.getLowStock(), ADB.Notifications.getAll()]);
  for (const p of low) {
    if (!existing.some(n=>n.title==='Low Stock'&&n.message.includes(p.name))) {
      await ADB.Notifications.add('warning','Low Stock',`${_e(p.name)} has only ${p.stock} ${p.unit}(s) left (min: ${p.minStock}).`);
    }
  }
}

async function _notifRead(id) { await ADB.Notifications.markRead(id); renderNotifications(); }
async function _notifDel(id)  { await ADB.Notifications.delete(id);   renderNotifications(); }

async function markAllRead() {
  await ADB.Notifications.markAllRead();
  renderNotifications();
  UI.toast('All notifications marked as read','success');
}

async function clearAllNotifs() {
  if (!await UI.confirm('Clear all notifications?','Clear Notifications',true)) return;
  await ADB.Notifications.clearAll();
  renderNotifications();
}

function _e(s='') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// expose inline onclick handlers
window._notifRead = _notifRead;
window._notifDel  = _notifDel;
window.NotifModule = { renderNotifications, markAllRead, clearAllNotifs };
