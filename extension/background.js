const API = 'https://formly-c2wk.onrender.com';
const AUTH_KEY = 'formly_auth_token';
const ACTIVE_KEY = 'formly_active_tabs';

function isFormlyPage(url) {
  return !!url && url.startsWith(API);
}

async function getToken() {
  const data = await chrome.storage.local.get(AUTH_KEY);
  return data[AUTH_KEY] || '';
}

async function getProfile() {
  const token = await getToken();
  if (!token) return null;
  try {
    const r = await fetch(`${API}/api/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (r.status === 401) {
      await chrome.storage.local.remove(AUTH_KEY);
      return null;
    }
    if (!r.ok) return null;
    const data = await r.json();
    return data.profile || {};
  } catch (e) {
    console.warn('[Formly] Server unavailable:', e);
    return null;
  }
}

async function getActiveTabs() {
  const data = await chrome.storage.session.get(ACTIVE_KEY);
  return data[ACTIVE_KEY] || {};
}

async function setActiveTabs(tabs) {
  await chrome.storage.session.set({ [ACTIVE_KEY]: tabs });
}

async function getActive(tabId) {
  const tabs = await getActiveTabs();
  return tabs[String(tabId)] || null;
}

async function activateTab(tabId) {
  const tabs = await getActiveTabs();
  tabs[String(tabId)] = {
    activatedAt: Date.now(),
    autoFilled: false
  };
  await setActiveTabs(tabs);
}

async function deactivateTab(tabId) {
  const tabs = await getActiveTabs();
  if (!tabs[String(tabId)]) return;
  delete tabs[String(tabId)];
  await setActiveTabs(tabs);
}

async function sendAutomaticFill(tabId, profile) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'FILL', profile });
    return true;
  } catch (e) {
    // Content script may not be ready yet; CONTENT_READY will retry.
    return false;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'FORMLY_AUTH' && sender.tab?.url && isFormlyPage(sender.tab.url)) {
    (async () => {
      if (msg.token) await chrome.storage.local.set({ [AUTH_KEY]: msg.token });
      else await chrome.storage.local.remove(AUTH_KEY);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg?.type === 'OPEN_FORM') {
    (async () => {
      if (!sender.tab?.url || !isFormlyPage(sender.tab.url)) {
        sendResponse({ ok: false, error: 'Open & Autofill must be started from Formly.' });
        return;
      }

      const rawUrl = String(msg.url || '').trim();
      if (!rawUrl) {
        sendResponse({ ok: false, error: 'Form URL is required.' });
        return;
      }

      let parsed;
      try { parsed = new URL(rawUrl); } catch {
        sendResponse({ ok: false, error: 'Invalid form URL.' });
        return;
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        sendResponse({ ok: false, error: 'Only web form URLs are supported.' });
        return;
      }

      // TAB-ID-ONLY ACTIVATION: the unique Chrome tabId is the sole activation key.
      const tab = await chrome.tabs.create({
        url: parsed.toString(),
        openerTabId: sender.tab.id
      });
      await activateTab(tab.id);
      console.log(`[Formly] activated tab ${tab.id} for ${parsed.toString()}`);
      sendResponse({ ok: true, tabId: tab.id });
    })().catch(e => {
      console.warn('[Formly] Could not open form:', e);
      sendResponse({ ok: false, error: 'Could not open the form.' });
    });
    return true;
  }

  if (msg?.type === 'MANUAL_FILL') {
    (async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (!tab?.id || !tab.url || isFormlyPage(tab.url)) {
        sendResponse({ ok: false, error: 'This form was not opened through Formly.' });
        return;
      }

      const active = await getActive(tab.id);
      if (!active) {
        sendResponse({ ok: false, error: 'This form was not opened through Formly.' });
        return;
      }

      const profile = await getProfile();
      if (!profile) {
        sendResponse({ ok: false, error: 'Not logged in to Formly' });
        return;
      }

      try {
        const result = await chrome.tabs.sendMessage(tab.id, { type: 'MANUAL_FILL', profile });
        sendResponse(result || { ok: true, filled: 0 });
      } catch (e) {
        sendResponse({ ok: false, error: 'Form content script is not ready. Reload the active Formly form and try again.' });
      }
    })();
    return true;
  }

  if (msg?.type === 'CONTENT_READY' && sender.tab?.id) {
    (async () => {
      const tabId = sender.tab.id;
      if (isFormlyPage(sender.tab.url || '')) {
        sendResponse({ ok: true, mode: 'auth-sync' });
        return;
      }

      // Only the exact Chrome tabId created by Formly can be active.
      // The URL is deliberately NOT checked; tabId is the sole activation key.
      const active = await getActive(tabId);
      if (!active) {
        sendResponse({ ok: true, mode: 'inactive', autoFilled: false });
        return;
      }

      // Automatic fill is one-shot for this tab activation. Reloading the tab
      // does not trigger another automatic fill; the popup can still refill it.
      if (!active.autoFilled) {
        const profile = await getProfile();
        if (!profile) {
          sendResponse({ ok: false, mode: 'formly-active', error: 'Not logged in to Formly' });
          return;
        }
        const sent = await sendAutomaticFill(tabId, profile);
        if (sent) {
          active.autoFilled = true;
          const tabs = await getActiveTabs();
          tabs[String(tabId)] = active;
          await setActiveTabs(tabs);
        }
      }

      sendResponse({ ok: true, mode: 'formly-active', autoFilled: !!active.autoFilled });
    })();
    return true;
  }
});

// Activation belongs to a tab. Closing the tab removes it automatically.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await deactivateTab(tabId);
});

