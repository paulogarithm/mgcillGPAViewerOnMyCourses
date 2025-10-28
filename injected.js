// injected.js (placed in the extension root)
(function () {
    try {
        function sendToPage(payload) {
            window.postMessage({ __FROM_EXT_INJECTED__: true, payload }, '*');
        }

        const origFetch = window.fetch;
        window.fetch = async function (...args) {
            const response = await origFetch.apply(this, args);
            try {
                const url = (args && args[0]) ? (typeof args[0] === 'string' ? args[0] : args[0].url) : response.url;
                if (/https:\/\/.*\.organizations\.api\.brightspace\.com\/\d+/.test(url)) {
                    const clone = response.clone();
                    clone.text().then(text => {
                        let body = text;
                        try { body = JSON.parse(text); } catch (e) { }
                        sendToPage({ type: 'fetch', url, status: response.status, body });
                    }).catch(() => { });
                }
            } catch (e) {
                // ignore
            }
            return response;
        };

        // --- XHR override ---
        const OrigXHR = window.XMLHttpRequest;
        function HookedXHR() {
            const xhr = new OrigXHR();
            let _url = null;
            const origOpen = xhr.open;
            xhr.open = function (method, url, ...rest) {
                _url = url;
                return origOpen.call(this, method, url, ...rest);
            };
            xhr.addEventListener('load', function () {
                try {
                    if (_url && /https:\/\/.*\.organizations\.api\.brightspace\.com\/\d+/.test(_url)) {
                        let body = this.responseText;
                        try { body = JSON.parse(body); } catch (e) { }
                        sendToPage({ type: 'xhr', url: _url, status: this.status, body });
                    }
                } catch (e) { }
            });
            return xhr;
        }
        window.XMLHttpRequest = HookedXHR;

        // debug
        console.log('injected script initialized (MAIN world)');
    } catch (err) {
        console.error('injected.js error', err);
    }
})();
