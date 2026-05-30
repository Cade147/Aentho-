/**
 * Aentho — inventory.js
 * Product/stock management: add, edit, delete, filter, export.
 */

let _editProductId = null;

async function renderInventory() {
  await loadCategoryFilter();
  await loadInventoryTable();
  await loadInventoryStats();
}

async function loadInventoryStats() {
  const products = await ADB.Products.getAll();
  const low = products.filter(p => p.stock <= p.minStock);
  _t('inv-stat-total',    products.length);
  _t('inv-stat-lowstock', low.length);
  _t('inv-stat-value',    UI.formatCurrency(products.reduce((s,p)=>s+(p.stock*p.cost),0)));
  _t('inv-stat-out',      products.filter(p=>p.stock===0).length);
}

async function loadInventoryTable() {
  const tbody = document.getElementById('inv-tbody');
  if (!tbody) return;
  let products = await ADB.Products.getAll();
  const q   = document.getElementById('inv-search')?.value?.toLowerCase()||'';
  const cat = document.getElementById('inv-category-filter')?.value||'';
  if (q)   products = products.filter(p => p.name.toLowerCase().includes(q)||(p.sku||'').toLowerCase().includes(q)||(p.category||'').toLowerCase().includes(q));
  if (cat) products = products.filter(p => p.category === cat);

  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">
      <div class="empty-icon">📦</div><p>No products found</p>
      <button class="btn btn-primary btn-sm" onclick="InventoryModule.openAddProduct()">Add Product</button>
    </div></td></tr>`;
    return;
  }
  tbody.innerHTML = products.map(p => {
    const s = p.stock===0?'danger':p.stock<=p.minStock?'warning':'success';
    const l = p.stock===0?'Out of Stock':p.stock<=p.minStock?'Low Stock':'In Stock';
    const c = p.stock===0?'var(--danger)':p.stock<=p.minStock?'var(--warning)':'var(--success)';
    return `<tr>
      <td><div style="font-weight:500">${_e(p.name)}</div><div style="font-size:.75rem;color:var(--text-muted)">${_e(p.sku||'—')}</div></td>
      <td class="hide-mobile">${_e(p.category||'—')}</td>
      <td style="font-weight:600">${UI.formatCurrency(p.price)}</td>
      <td class="hide-mobile">${UI.formatCurrency(p.cost)}</td>
      <td style="font-weight:600;color:${c}">${p.stock} ${_e(p.unit)}</td>
      <td class="hide-mobile"><span class="badge badge-${s}">${l}</span></td>
      <td><div class="flex gap-1">
        <button class="btn btn-icon btn-secondary btn-sm" onclick="InventoryModule.openEditProduct('${p.id}')" title="Edit">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn btn-icon btn-danger btn-sm" onclick="InventoryModule.deleteProduct('${p.id}')" title="Delete">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div></td>
    </tr>`;
  }).join('');
}

async function loadCategoryFilter() {
  const sel = document.getElementById('inv-category-filter');
  if (!sel) return;
  const cats = [...new Set((await ADB.Products.getAll()).map(p=>p.category).filter(Boolean))];
  sel.innerHTML = `<option value="">All Categories</option>` + cats.map(c=>`<option value="${_e(c)}">${_e(c)}</option>`).join('');
}

function openAddProduct() {
  _editProductId = null;
  _t('product-modal-title','Add Product');
  document.getElementById('product-form')?.reset();
  _sf('product-minstock','5');
  UI.openModal('product-modal');
}

async function openEditProduct(id) {
  const p = await ADB.Products.getById(id);
  if (!p) return;
  _editProductId = id;
  _t('product-modal-title','Edit Product');
  _sf('product-name',     p.name);
  _sf('product-sku',      p.sku||'');
  _sf('product-category', p.category||'');
  _sf('product-price',    p.price);
  _sf('product-cost',     p.cost);
  _sf('product-stock',    p.stock);
  _sf('product-minstock', p.minStock||5);
  _sf('product-unit',     p.unit||'unit');
  _sf('product-notes',    p.notes||'');
  UI.openModal('product-modal');
}

async function saveProduct() {
  const name = document.getElementById('product-name')?.value?.trim();
  if (!name) { UI.toast('Product name is required','error'); return; }
  const price = document.getElementById('product-price')?.value;
  if (!price) { UI.toast('Selling price is required','error'); return; }
  const data = {
    name, sku: document.getElementById('product-sku')?.value?.trim()||'',
    category: document.getElementById('product-category')?.value?.trim()||'General',
    price, cost: document.getElementById('product-cost')?.value||0,
    stock: document.getElementById('product-stock')?.value||0,
    minStock: document.getElementById('product-minstock')?.value||5,
    unit: document.getElementById('product-unit')?.value||'unit',
    notes: document.getElementById('product-notes')?.value||''
  };
  try {
    if (_editProductId) { await ADB.Products.update(_editProductId,data); UI.toast('Product updated','success'); }
    else                { await ADB.Products.add(data);                   UI.toast('Product added','success'); }
    UI.closeModal('product-modal');
    await loadInventoryTable(); await loadInventoryStats(); await loadCategoryFilter();
  } catch(e) { UI.toast('Error: '+e.message,'error'); }
}

async function deleteProduct(id) {
  if (!await UI.confirm('Delete this product? This cannot be undone.','Delete Product',true)) return;
  await ADB.Products.delete(id);
  UI.toast('Product deleted','warning');
  await loadInventoryTable(); await loadInventoryStats();
}

function filterInventory() { loadInventoryTable(); }

async function exportInventoryCSV() {
  const products = await ADB.Products.getAll();
  const rows = [['Name','SKU','Category','Sell Price','Cost','Stock','Min Stock','Unit']];
  products.forEach(p => rows.push([`"${p.name}"`,`"${p.sku||''}"`,`"${p.category||''}"`,p.price,p.cost,p.stock,p.minStock,`"${p.unit}"`]));
  const blob = new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'});
  const a = Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`aentho-inventory-${Date.now()}.csv`});
  a.click(); URL.revokeObjectURL(a.href);
  UI.toast('Inventory exported','success');
}

function _t(id,v)  { const el=document.getElementById(id); if(el) el.textContent=v; }
function _sf(id,v) { const el=document.getElementById(id); if(el) el.value=v; }
function _e(s='')  { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

window.InventoryModule = { renderInventory, openAddProduct, openEditProduct, saveProduct, deleteProduct, filterInventory, exportInventoryCSV };
