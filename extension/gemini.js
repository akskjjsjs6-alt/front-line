// Content script in the Gemini tab: types the game's prompt into the composer, sends it and
// returns the finished answer. Gemini's UI changes now and then, so every step has layered
// selectors and safe fallbacks; a failure surfaces as a message the game can show.
(() => {
  'use strict';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const editable = () => document.querySelector(
    'rich-textarea div[contenteditable="true"], div.ql-editor[contenteditable="true"], div[contenteditable="true"][role="textbox"], textarea[placeholder]');

  // Gemini renders each reply in a <model-response> (or similar) element.
  const responses = () => document.querySelectorAll('model-response, .model-response, response-container, message-content, .response-container-content');
  const byLabel = labels => {
    for (const b of document.querySelectorAll('button, a')) {
      const l = ((b.getAttribute && (b.getAttribute('aria-label') || b.getAttribute('title'))) || '').toLowerCase();
      if (labels.some(x => l.includes(x)) && !b.disabled) return b;
    }
    return null;
  };
  const typeInto = async (ed, prompt) => {
    if (ed.tagName === 'TEXTAREA') {
      ed.value = prompt;
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      ed.focus();
      await sleep(120);
      const ok = document.execCommand && document.execCommand('insertText', false, prompt);
      if (!ok || !(ed.textContent || '').length) {
        ed.textContent = prompt;
        ed.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
    }
    await sleep(250);
    return ed.tagName === 'TEXTAREA' ? ed.value.length : (ed.textContent || '').length;
  };

  async function ask(prompt, ms) {
    ms = ms || 180000;
    // fresh chat per prompt: the state input is self-contained, so old turns don't bleed in
    const nc = byLabel(['new chat', 'new conversation']);
    if (nc) { nc.click(); await sleep(1200); }
    const ed = editable();
    if (!ed) throw new Error('No Gemini composer found. Is the tab open on gemini.google.com?');
    const before = responses().length;
    if (!(await typeInto(ed, prompt))) throw new Error('Could not type into the Gemini composer.');
    await sleep(350);
    const send = byLabel(['send message', 'submit']);
    if (send) send.click();
    else ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    // wait for a new response element, then for its text to settle (streaming stops)
    const t0 = Date.now();
    let got = '', grew = Date.now();
    while (Date.now() - t0 < ms) {
      await sleep(400);
      const all = responses();
      const fresh = all.length > before ? all[all.length - 1] : null;
      if (fresh) {
        const md = fresh.querySelector('.markdown');
        const txt = ((md || fresh).innerText || '').replace(/\u00a0/g, ' ');
        if (txt && txt.length > 40) {
          if (txt !== got) { got = txt; grew = Date.now(); }
          else if (Date.now() - grew > 1600) return txt;
        }
      } else if (Date.now() - t0 > 15000) {
        throw new Error('Gemini did not start answering — daily limit reached, sign-in needed, or the page changed.');
      }
    }
    throw new Error('Timed out waiting for Gemini to finish.');
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'ask') return;
    ask(msg.prompt, msg.timeoutMs).then(
      text => sendResponse({ text }),
      e => sendResponse({ error: String(e && e.message || e) })
    );
    return true;
  });
})();
