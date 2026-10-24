// Background router: carries an ask from the game's tab to an open Gemini tab, creating
// one if none is open. Service worker (MV3).
'use strict';
const GEM = 'https://gemini.google.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let chain = Promise.resolve();   // one ask at a time — Gemini is a single conversation

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'ask-gemini') return;
  chain = chain.then(() =>
    route(msg).then(sendResponse).catch(e => sendResponse({ error: String(e && e.message || e) }))
  );
  return true;                       // the response arrives asynchronously
});

async function route(msg) {
  const ms = msg.timeoutMs || 180000;
  const tabs = await chrome.tabs.query({ url: GEM + '/*' });
  let tab = tabs.find(t => !t.loading) || tabs[0];
  if (!tab) tab = await chrome.tabs.create({ url: GEM + '/app', active: false });
  const t0 = Date.now();
  let lastErr = null;
  // first injections can race the tab's own load; retry until the deadline
  while (Date.now() - t0 < ms) {
    try {
      return await Promise.race([
        chrome.tabs.sendMessage(tab.id, { type: 'ask', prompt: msg.prompt, timeoutMs: Math.max(5000, ms - (Date.now() - t0)) }),
        (async () => { await sleep(ms); throw new Error('The Gemini tab did not answer in time.'); })()
      ]);
    } catch (e) { lastErr = e; await sleep(1000); }
  }
  throw lastErr || new Error('The Gemini tab did not answer.');
}
