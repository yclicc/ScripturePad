async function populateDropdowns() {
    const response = await fetch("/api/bibles");
    const data = await response.json();

    const language_select = document.getElementById("language-select");
    data.forEach(language => {
        const opt = document.createElement('option');
        opt.value = language.iso;
        if (language.autonym !== null) {
            opt.textContent = `${language.autonym} (${language.name})`;
        } else {
            opt.textContent = `${language.name}`;
        }
        language_select.appendChild(opt);
    })
}

document.addEventListener('DOMContentLoaded', populateDropdowns);