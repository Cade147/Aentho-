/**
 * Aentho — sync.js
 * Offline/online detection, background sync to Firestore.
 */

const FB_VER  = '10.7.1';
const FB_BASE = `https://www.gstatic.com/firebasejs/${FB_VER}`;
let   _syncing = false;

window.addEventListener('online',  () => { _hideBanner(); triggerSync(); });
window.addEventListener('offline', () => _showBanner());

if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'SYNC_REQUESTED') triggerSync();
  });
}

function _showBanner() { document.getElementById('offline-banner')?.classList.add('show'); }
function _hideBanner() { document.getElementById('offline-banner')?.classList.remove('show'); }

async function triggerSync() {
  if (_syncing || !navigator.onLine) return;
  _syncing = true;
  try {
    await AAuth.initFirebase();
    const db = window._aenthoFirestoreDB;
    if (!db) return;
    const session = AAuth.getLocalSession();
    if (!session) return;
    const queue = await ADB.SyncQueue.getAll();
    if (!queue.length) return;

    const { doc, setDoc, deleteDoc } = await import(`${FB_BASE}/firebase-firestore.js`);
    let n = 0;
    for (const item of queue) {
      try {
        const ref = doc(db, `users/${session.uid}/${item.entity}/${item.data.id}`);
        if (item.action === 'DELETE') await deleteDoc(ref);
        else await setDoc(ref, { ...item.data, synced: true }, { merge: true });
        n++;
      } catch (err) { console.warn('[Sync] item failed', err.message); }
    }
    if (n > 0) {
      await ADB.SyncQueue.clear();
      window.UI?.toast(`${n} record${n > 1 ? 's' : ''} synced to cloud ☁`, 'success');
    }
  } catch (err) { console.warn('[Sync] error', err.message); }
  finally { _syncing = false; }
}

async function _registerBgSync() {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register('aentho-sync');
  } catch {}
}

function initSync() {
  if (!navigator.onLine) _showBanner();
  _registerBgSync();
}

window.Sync = { triggerSync, initSync };
