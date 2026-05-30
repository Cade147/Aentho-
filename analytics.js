/**
 * Aentho — analytics.js
 * Charts: monthly revenue/profit, payment methods, top products.
 */

const _charts = {};

async function renderAnalytics() {
  await Promise.all([loadMonthlyChart(), loadPaymentChart(), loadTopProductsChart(), loadGrowthMetrics()]);
}

async function loadMonthlyChart() {
  const canvas = document.getElementById('monthly-chart');
  if (!canvas || !window.Chart) return;
  const all = await ADB.Sales.getAll();
  const labels=[], rev=[], profit=[];
  for (let i=5;i>=0;i--) {
    const d=new Date(); d.setMonth(d.getMonth()-i);
    const yr=d.getFullYear(), mo=d.getMonth();
    labels.push(d.toLocaleDateString('en-ZA',{month:'short',year:'2-digit'}));
    const ms = all.filter(s=>{const x=new Date(s.date);return x.getFullYear()===yr&&x.getMonth()===mo;});
    rev.push(ms.reduce((s,x)=>s+x.total,0));
    profit.push(ms.reduce((s,x)=>s+(x.profit||0),0));
  }
  _kill('monthly-chart');
  _charts['monthly-chart'] = new Chart(canvas.getContext('2d'),{
    type:'bar', data:{ labels, datasets:[
      {label:'Revenue',data:rev,   backgroundColor:'rgba(79,142,247,0.75)', borderRadius:6},
      {label:'Profit', data:profit,backgroundColor:'rgba(0,212,170,0.75)',  borderRadius:6}
    ]},
    options: _opts('currency')
  });
}

async function loadPaymentChart() {
  const canvas = document.getElementById('payment-chart');
  if (!canvas || !window.Chart) return;
  const all = await ADB.Sales.getAll();
  const tally={};
  all.forEach(s=>{const m=s.payMethod||'Cash'; tally[m]=(tally[m]||0)+s.total;});
  const keys=Object.keys(tally);
  if (!keys.length) { canvas.parentElement.innerHTML='<div class="empty-state"><p>No sales data yet</p></div>'; return; }
  const colors=['#4f8ef7','#7c5cfc','#00d4aa','#f97316','#f59e0b','#ef4444'];
  _kill('payment-chart');
  _charts['payment-chart'] = new Chart(canvas.getContext('2d'),{
    type:'doughnut',
    data:{ labels: keys, datasets:[{ data: keys.map(k=>tally[k]), backgroundColor:colors.slice(0,keys.length), borderWidth:0, hoverOffset:4 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'65%',
      plugins:{ legend:{ position:'bottom', labels:{color:'#8b9ab5',boxWidth:12,padding:16,font:{size:12}} },
        tooltip:{ callbacks:{ label: c => ' '+UI.formatCurrency(c.parsed) } } } }
  });
}

async function loadTopProductsChart() {
  const canvas = document.getElementById('top-products-chart');
  if (!canvas || !window.Chart) return;
  const all = await ADB.Sales.getAll();
  const tally={};
  all.forEach(s=>{const k=s.productName||'Unknown';tally[k]=(tally[k]||0)+s.total;});
  const sorted=Object.entries(tally).sort((a,b)=>b[1]-a[1]).slice(0,8);
  if (!sorted.length) { canvas.parentElement.innerHTML='<div class="empty-state"><p>No sales data yet</p></div>'; return; }
  _kill('top-products-chart');
  _charts['top-products-chart'] = new Chart(canvas.getContext('2d'),{
    type:'bar', indexAxis:'y',
    data:{ labels: sorted.map(e=>e[0]), datasets:[{label:'Revenue',data:sorted.map(e=>e[1]),backgroundColor:'rgba(124,92,252,0.75)',borderRadius:5}] },
    options: _opts('currency')
  });
}

async function loadGrowthMetrics() {
  const all=await ADB.Sales.getAll();
  const now=new Date();
  const thisM=all.filter(s=>{const d=new Date(s.date);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();});
  const lm=new Date(now.getFullYear(),now.getMonth()-1,1);
  const lastM=all.filter(s=>{const d=new Date(s.date);return d.getFullYear()===lm.getFullYear()&&d.getMonth()===lm.getMonth();});
  const thisRev=thisM.reduce((s,x)=>s+x.total,0);
  const lastRev=lastM.reduce((s,x)=>s+x.total,0);
  const chg=UI.pctChange(thisRev,lastRev);
  _t('analytics-this-month', UI.formatCurrency(thisRev));
  _t('analytics-last-month', UI.formatCurrency(lastRev));
  const growthEl=document.getElementById('analytics-growth');
  if (growthEl) {
    growthEl.textContent=`${chg.dir==='up'?'+':chg.dir==='down'?'-':''}${chg.value}%`;
    growthEl.style.color=chg.dir==='up'?'var(--success)':chg.dir==='down'?'var(--danger)':'var(--text-muted)';
  }
  _t('analytics-total-sales', all.length);
}

function _opts(type) {
  return {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ labels:{color:'#8b9ab5',boxWidth:12,font:{size:12}} },
      tooltip:{ callbacks:{ label: c=> ' '+( type==='currency'?UI.formatCurrency(c.parsed.y??c.parsed):(c.parsed.y??c.parsed)) } } },
    scales:{
      x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#4a5878',font:{size:11}}},
      y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#4a5878',font:{size:11},callback:v=>type==='currency'?UI.formatCurrency(v):v}}
    }
  };
}
function _kill(id) { if(_charts[id]){_charts[id].destroy();delete _charts[id];} }
function _t(id,v) { const el=document.getElementById(id); if(el) el.textContent=v; }

window.AnalyticsModule = { renderAnalytics };
