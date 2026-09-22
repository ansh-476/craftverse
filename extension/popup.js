const btn = document.getElementById('fillBtn');
const status = document.getElementById('status');

btn.addEventListener('click', async () => {
  btn.disabled = true;
  status.textContent = 'Filling form…';
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) throw new Error('No active tab');
    const result = await chrome.runtime.sendMessage({ type: 'MANUAL_FILL' });
    if (!result?.ok) throw new Error(result?.error || 'Unable to fill this page');
    status.textContent = `Filled ${result.filled ?? 0} field${result.filled === 1 ? '' : 's'}.`;
  } catch (e) {
    status.textContent = e.message || 'Unable to fill this page.';
  } finally {
    btn.disabled = false;
  }
});
