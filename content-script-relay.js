// simple relay: listen window messages then forward to background
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (msg && msg.__FROM_EXT_INJECTED__) {
    // optionally filter here
    try {
      chrome.runtime.sendMessage({ type: 'PAGE_API_DATA', data: msg.payload });
    } catch(e) {
      // in some contexts chrome.runtime might not be available; log quietly
      console.warn('relay sendMessage failed', e);
    }
  }
}, false);
