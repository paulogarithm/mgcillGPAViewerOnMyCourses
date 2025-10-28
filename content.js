// convert notes into gpa
const notesToGPA = (notes) => {
    let totalWeights = 0;
    let totalNote = 0;

    if (notes.length == 0)
        return "No Content";
    Object.entries(notes).forEach(([courseNumber, courseNotes]) => {
        courseNotes.forEach((e) => {
            totalWeights += e.weight;
            totalNote += e.grade * e.weight;
        });
    });
    return `${((totalNote / totalWeights) * 4).toFixed(2)}`;
}

setTimeout(() => {
    const homepageRow = document.querySelector('.homepage-row');
    if (!homepageRow) return;

    const firstDiv = homepageRow.querySelector('div');
    if (!firstDiv)
        return;

    const secondDiv = firstDiv.querySelector('div');
    if (!secondDiv)
        return;

    const widgetDiv = document.createElement('div');
    widgetDiv.setAttribute('role', 'region');
    widgetDiv.setAttribute('aria-labelledby', 'd2l_1_11_933');
    widgetDiv.className = 'd2l-widget d2l-tile';
    widgetDiv.id = "gpa-div";

    const headerDiv = document.createElement('div');
    headerDiv.className = 'd2l-widget-header';

    const wrapperDiv = document.createElement('div');
    wrapperDiv.className = 'd2l-homepage-header-wrapper';

    const h2 = document.createElement('h2');
    h2.className = 'd2l-heading vui-heading-4';
    h2.id = 'my_gpa_text';
    // h2.textContent = 'GPA: Undefined';
    chrome.storage.local.get(["notes"], (res) => {
        const notes = res.notes || {};
        console.log("Getting notes: ", notes);

        const h2 = document.getElementById('my_gpa_text');
        if (!h2)
            return;
        console.log("changing content...")
        h2.textContent = `GPA: ${notesToGPA(notes)}`;
    });

    wrapperDiv.appendChild(h2);
    headerDiv.appendChild(wrapperDiv);
    widgetDiv.appendChild(headerDiv);

    secondDiv.prepend(widgetDiv);
}, 1 * 1000); // 1 seconds

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "NOTE_UPDATE") {
        console.log("Mise à jour des notes détectée !");
        chrome.storage.local.get(["notes"], (res) => {
            const notes = res.notes || {};
            console.log("Nouvelles notes :", notes);

            const h2 = document.getElementById('my_gpa_text');
            if (!h2)
                return;
            h2.textContent = `GPA: ${notesToGPA(notes)}`;
        });
    }
});
