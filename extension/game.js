// Content script in the game's tab: relays the game's prompts (window.postMessage) to the
// extension and posts answers back. The game itself checks for this bridge and falls back
// to the paste sheet when it isn't there.
(() => {
  window.addEventListener('message', async ev => {
    if (ev.source !== window) return;                 // same frame only
    const m = ev.data;
    if (!m || m.source !== 'frontline-ai') return;
    if (m.type === 'ping') {
      window.postMessage({ source: 'frontline-ai-ext', id: m.id, pong: true }, '*');
    } else if (m.type === 'ask') {
      let out;
      try {
        out = await chrome.runtime.sendMessage({ type: 'ask-gemini', prompt: m.prompt, timeoutMs: m.timeoutMs || 180000 });
        if (!out) out = { error: 'The relay extension sent no answer.' };
      } catch (e) {
        out = { error: 'Relay extension error: ' + String(e && e.message || e) };
      }
      window.postMessage({ source: 'frontline-ai-ext', id: m.id, text: out.text, error: out.error }, '*');
    }
  });
})();
