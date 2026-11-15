const IDLE_MS = 20 * 60 * 1000;

async function snooze() {
  const tabs = await chrome.tabs.query({ active: false, pinned: false, audible: false, discarded: false });
  const now = Date.now();
  for (const tab of tabs) {
    if (!tab.lastAccessed || now - tab.lastAccessed < IDLE_MS) continue;
    try { await chrome.tabs.discard(tab.id); } catch {}
  }
}

function schedule() {
  chrome.alarms.create('snooze', { periodInMinutes: 5 });
}

chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'snooze') snooze();
});
