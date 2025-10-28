const MATCH_HOST = /https:\/\/.*\.organizations\.api\.brightspace\.com|https:\/\/mycourses2\.mcgill\.ca|https:\/\/.*\.brightspace\.com/;

function tryInject(tabId, url) {
    if (!url || !MATCH_HOST.test(url))
        return;

    chrome.scripting.executeScript({
        target: { tabId: tabId, allFrames: false },
        files: ['injected.js'],
        world: 'MAIN'
    }, (_) => {
        if (chrome.runtime.lastError) {
            console.warn('Injection failed:', chrome.runtime.lastError.message);
        } else {
            console.log('Injected into tab', tabId);
        }
    });
}

// inject when tab updates (navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' || changeInfo.status === 'complete')
        tryInject(tabId, tab.url);
});

// also inject on activation (switch tab)
chrome.tabs.onActivated.addListener(activeInfo => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        tryInject(tab.id, tab.url);
    });
});

// Optional: allow manual injection from dev tools via message
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'force-inject' && sender.tab) {
        tryInject(sender.tab.id, sender.tab.url);
        sendResponse({ injected: true });
    }
});

//=== fun beggins here ===//

const defaultDebounceDuration = 60 * 1000; // 1 minutes

const gradingURL = "https://mycourses2.mcgill.ca/d2l/lms/grades/my_grades/main.d2l";

const clocks = new Map();

var totalWeights = 0;
var totalNote = 0;

class DebounceClock {
    constructor(duration = defaultDebounceDuration) {
        this.duration = duration;
        this.locked = false;
        this.timerId = null;
        this.activate();
    }

    activate() {
        this.cancel();
        this.locked = true;
        this.timerId = setTimeout(() => {
            this.locked = false;
            this.timerId = null;
        }, this.duration);
    }

    isLocked() {
        return this.locked;
    }

    cancel() {
        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
        this.locked = false;
    }
}

// from tabId, courseNumber -> html page content of grades
const fetchGradings = async (tabId, courseNumber) => {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: false },
            world: "MAIN",
            func: async (url, courseNumberParam) => {
                const fullUrl = url + '?ou=' + encodeURIComponent(courseNumberParam);
                const resp = await fetch(fullUrl, {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });
                const text = await resp.text();
                return { ok: resp.ok, status: resp.status, text };
            },
            args: [gradingURL, courseNumber]
        });

        if (!results || !results.length)
            throw new Error('No result from executeScript');
        const r = results[0].result;
        if (!r.ok)
            throw new Error('Fetch failed, status ' + r.status);
        return r.text;
    } catch (err) {
        console.error('fetchGradesInPage error:', err);
        throw err;
    }
}

// from html page content -> list of grades
const parseGradings = async (tabId, content) => {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (html) => {
            const doc = new DOMParser().parseFromString(html, "text/html");
            const grades = [];

            const rows = doc.querySelectorAll('table.d2l-grid tr');

            rows.forEach(row => {
                const hasTreeImage = row.querySelector('td.d_g_treeNodeImage');
                if (hasTreeImage || row.classList.contains('d_gh'))
                    return;

                const nameLabel = row.querySelector('th label');
                if (!nameLabel)
                    return;
                const name = nameLabel.textContent.trim();

                const cells = row.querySelectorAll('td');
                if (cells.length < 3)
                    return;

                // parse grade: expected format: 90.5 %" or "80 %" or "-%"
                const gradeText = cells[2].textContent.trim();
                const gradeMatch = gradeText.match(/^([\d.]+)\s*%$/);
                if (!gradeMatch)
                    return;
                const grade = parseFloat(gradeMatch[1]) / 100;

                // parse weight, expected: "8 / 10" or "18 / 20"
                const weightText = cells[1].textContent.trim();
                const weightMatch = weightText.match(/^([\d.]+)\s*\/\s*([\d.]+)$/);
                if (!weightMatch)
                    return;
                const weight = parseFloat(weightMatch[2]);

                console.log("found !");

                grades.push({
                    name,
                    grade,
                    weight
                });

            });
            return grades;
        },
        args: [content]
    });
    return results[0]?.result ?? [];
}

// from response data, course number & tab id -> gpa results
const onInfoReceived = async (data, courseNumber, tabId) => {
    const classes = data?.class;
    const isCourse = Array.isArray(classes) && classes.includes('course-offering');

    // check for integrity
    if (!isCourse)
        return;
    if (clocks.has(courseNumber) && clocks.get(courseNumber).isLocked())
        return;

    // activate clock directly
    if (!clocks.has(courseNumber))
        clocks.set(courseNumber, new DebounceClock());
    else
        clocks.get(courseNumber).activate();

    // get the html page content
    const content = await fetchGradings(tabId, courseNumber);

    // parse the html page
    const res = await parseGradings(tabId, content);

    // save the notes
    // console.log("course found: ", data.properties?.name || data, courseNumber);
    chrome.storage.local.get(["notes"], (result) => {
        const notes = result.notes || {};
        notes[courseNumber] = res;
        chrome.storage.local.set({ notes }, () => {
            console.log("Notes correctement sauvegardées :", notes);
        });
    });

    // notify
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { type: "NOTE_UPDATE" });
        });
    });

    // res.forEach((e) => {
    //     totalWeights += e.weight;
    //     totalNote += e.grade * e.weight;
    // });

    // chrome.storage.session.set({ gpa: (totalNote / totalWeights) * 4 });
    // chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    //     tabs.forEach(tab => {
    //         chrome.tabs.sendMessage(tab.id, { type: "GPA_UPDATE", value: (totalNote / totalWeights) * 4 });
    //     });
    // });
};

chrome.runtime.onMessage.addListener((msg, sender) => {
    if (!msg || msg.type !== 'PAGE_API_DATA')
        return;

    const payload = msg.data;
    const url = payload?.url || '';

    const m = url.match(/https?:\/\/[^/]+\/(\d+)(?:[/?#]|$)/);
    const number = m ? parseInt(m[1], 10) : null;
    const validNumber = (Number.isInteger(number) && number >= 0) ? number : null;
    if (validNumber === null)
        return;

    const tabId = sender?.tab?.id ?? null;
    onInfoReceived(payload.body, validNumber, tabId);
});
