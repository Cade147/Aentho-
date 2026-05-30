/**
 * Aentho — db.js  v2
 * Complete local database layer: IndexedDB v2 with all stores.
 * Exports window.ADB for use by all modules.
 */

const DB_NAME    = 'AenthoDB';
const DB_VERSION = 2;
let   _db        = null;

// ── Open / Upgrade DB ─────────────────────────────────────────────
function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      function mkStore(name, keyPath, indexes = []) {
        if (db.objectStoreNames.contains(name)) return;
        const s = db.createObjectStore(name, { keyPath });
        indexes.forEach(([n, k]) => s.createIndex(n, k, { unique: false }));
      }
      mkStore('products',   'id', [['name','name'],['category','category'],['synced','synced']]);
      mkStore('sales',      'id', [['date','date'],['synced','synced']]);
      mkStore('expenses',   'id', [['date','date'],['category','category'],['synced','synced']]);
      mkStore('settings',   'key');
      mkStore('notifications','id',[['read','read']]);
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

// ── Generic CRUD helpers ──────────────────────────────────────────
async function getAll(store) {
  const db  = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(store,'readonly').objectStore(store).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror   = () => rej(req.error);
  });
}
async function getById(store, id) {
  const db  = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(store,'readonly').objectStore(store).get(id);
    req.onsuccess = () => res(req.result || null);
    req.onerror   = () => rej(req.error);
  });
}
async function put(store, record) {
  const db  = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(store,'readwrite').objectStore(store).put(record);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}
async function remove(store, id) {
  const db  = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(store,'readwrite').objectStore(store).delete(id);
    req.onsuccess = () => res(true);
    req.onerror   = () => rej(req.error);
  });
}
async function clearStore(store) {
  const db  = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(store,'readwrite').objectStore(store).clear();
    req.onsuccess = () => res(true);
    req.onerror   = () => rej(req.error);
  });
}

// ── ID generator ──────────────────────────────────────────────────
function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
}

// ── Products ──────────────────────────────────────────────────────
const Products = {
  getAll: () => getAll('products'),
  getById: (id) => getById('products', id),

  async add(data) {
    const p = {
      id: generateId('prod'), name: data.name, sku: data.sku || '',
      category: data.category || 'General', price: +data.price || 0,
      cost: +data.cost || 0, stock: +data.stock || 0,
      minStock: +data.minStock || 5, unit: data.unit || 'unit',
      notes: data.notes || '', createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), synced: false
    };
    await put('products', p);
    await SyncQueue.add('CREATE','products', p);
    return p;
  },
  async update(id, data) {
    const ex = await getById('products', id);
    if (!ex) throw new Error('Product not found');
    const u = { ...ex, ...data, id, updatedAt: new Date().toISOString(), synced: false };
    await put('products', u);
    await SyncQueue.add('UPDATE','products', u);
    return u;
  },
  async delete(id) {
    await remove('products', id);
    await SyncQueue.add('DELETE','products',{ id });
  },
  async updateStock(id, delta) {
    const p = await getById('products', id);
    if (!p) return;
    p.stock = Math.max(0, p.stock + delta);
    p.updatedAt = new Date().toISOString();
    p.synced = false;
    await put('products', p);
    return p;
  },
  async getLowStock() {
    const all = await getAll('products');
    return all.filter(p => p.stock <= p.minStock);
  }
};

// ── Sales ─────────────────────────────────────────────────────────
const Sales = {
  async getAll() {
    const s = await getAll('sales');
    return s.sort((a,b) => new Date(b.date) - new Date(a.date));
  },
  getById: (id) => getById('sales', id),

  async add(data) {
    const qty   = +data.qty   || 1;
    const price = +data.price || 0;
    const cost  = +data.cost  || 0;
    const total  = +data.total  || +(qty * price).toFixed(2);
    const profit = +data.profit || +(total - cost * qty).toFixed(2);
    const sale = {
      id: generateId('sale'),
      productId:   data.productId || '',
      productName: data.productName || 'Manual Sale',
      qty, price, cost, total, profit,
      customer:  data.customer  || '',
      payMethod: data.payMethod || 'Cash',
      notes:     data.notes     || '',
      date:      data.date      || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      synced:    false
    };
    if (sale.productId) await Products.updateStock(sale.productId, -sale.qty);
    await put('sales', sale);
    await SyncQueue.add('CREATE','sales', sale);
    return sale;
  },
  async update(id, data) {
    const ex = await getById('sales', id);
    if (!ex) throw new Error('Sale not found');
    const u = { ...ex, ...data, id, synced: false };
    await put('sales', u);
    await SyncQueue.add('UPDATE','sales', u);
    return u;
  },
  async delete(id) {
    const sale = await getById('sales', id);
    if (sale?.productId) await Products.updateStock(sale.productId, +sale.qty);
    await remove('sales', id);
    await SyncQueue.add('DELETE','sales',{ id });
  },
  async getByDateRange(from, to) {
    const all = await this.getAll();
    return all.filter(s => { const d = new Date(s.date); return d >= new Date(from) && d <= new Date(to); });
  },
  async getThisMonth() {
    const n = new Date();
    return this.getByDateRange(new Date(n.getFullYear(),n.getMonth(),1), new Date(n.getFullYear(),n.getMonth()+1,0,23,59,59));
  },
  async getToday() {
    const n = new Date();
    return this.getByDateRange(new Date(n.getFullYear(),n.getMonth(),n.getDate()), new Date(n.getFullYear(),n.getMonth(),n.getDate(),23,59,59));
  }
};

// ── Expenses ──────────────────────────────────────────────────────
const Expenses = {
  async getAll() {
    const e = await getAll('expenses');
    return e.sort((a,b) => new Date(b.date) - new Date(a.date));
  },
  getById: (id) => getById('expenses', id),

  async add(data) {
    const rec = {
      id: generateId('exp'), description: data.description,
      category: data.category || 'Other', amount: +data.amount || 0,
      payMethod: data.payMethod || 'Cash', notes: data.notes || '',
      date: data.date || new Date().toISOString().slice(0,10),
      createdAt: new Date().toISOString(), synced: false
    };
    await put('expenses', rec);
    await SyncQueue.add('CREATE','expenses', rec);
    return rec;
  },
  async update(id, data) {
    const ex = await getById('expenses', id);
    if (!ex) throw new Error('Expense not found');
    const u = { ...ex, ...data, id, synced: false };
    await put('expenses', u);
    await SyncQueue.add('UPDATE','expenses', u);
    return u;
  },
  async delete(id) {
    await remove('expenses', id);
    await SyncQueue.add('DELETE','expenses',{ id });
  },
  async getThisMonth() {
    const n = new Date();
    const all = await this.getAll();
    return all.filter(e => {
      const d = new Date(e.date);
      return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
    });
  }
};

// ── Settings ──────────────────────────────────────────────────────
const Settings = {
  async get(key) { const r = await getById('settings', key); return r ? r.value : null; },
  async set(key, value) { await put('settings', { key, value }); },
  async getAll() {
    const rows = await getAll('settings');
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }
};

// ── Notifications ──────────────────────────────────────────────────
const Notifications = {
  async getAll() {
    const n = await getAll('notifications');
    return n.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  async getUnread() { return (await this.getAll()).filter(n => !n.read); },
  async add(type, title, message) {
    const n = { id: generateId('notif'), type, title, message, read: false, createdAt: new Date().toISOString() };
    await put('notifications', n);
    return n;
  },
  async markRead(id) { const n = await getById('notifications', id); if (n) { n.read = true; await put('notifications', n); } },
  async markAllRead() { const all = await getAll('notifications'); await Promise.all(all.map(n => { n.read = true; return put('notifications', n); })); },
  async delete(id) { await remove('notifications', id); },
  async clearAll() { await clearStore('notifications'); }
};

// ── Sync Queue ─────────────────────────────────────────────────────
const SyncQueue = {
  async add(action, entity, data) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const req = db.transaction('sync_queue','readwrite').objectStore('sync_queue')
        .add({ action, entity, data, timestamp: new Date().toISOString() });
      req.onsuccess = () => res(true);
      req.onerror   = () => rej(req.error);
    });
  },
  getAll: () => getAll('sync_queue'),
  clear:  () => clearStore('sync_queue')
};

window.ADB = { openDB, Products, Sales, Expenses, Settings, Notifications, SyncQueue, generateId };
