// We import langs in to convert from the 3 character iso code used by dbt to
// the two character machine translation one (and back)
import langs from 'https://cdn.jsdelivr.net/npm/langs-es@4.0.2/+esm'

function langDBTtoMT(code) {
    return langs.where("3", code)["1"];
}

function langMTtoDBT(code) {
    return langs.where("1", code)["3"];
}

function getPageLanguage(spec = "MT") {
    var lang = document.documentElement.lang;
    if (spec == "MT") {
        return lang;
    } else if (spec = "DBT") {
        return langMTtoDBT(lang);
    } else {
        throw new Error(`Spec ${spec} not implemented`);
    }
}

async function populateDropdowns() {
    const response = await fetch("/api/completebibles");
    const data = await response.json();

    const language_select = document.getElementById("language-select");
    for (var language_name in data) {
        // Skip loop if the property is from prototype
        if (!data.hasOwnProperty(language_name)) continue;

        var language = data[language_name];
        
        const opt = document.createElement('option');
        opt.value = language.iso;
        if ((language.autonym !== null) && (language.autonym !== language_name) ) {
            opt.textContent = `${language.autonym} (${language_name})`;
        } else {
            opt.textContent = `${language_name}`;
        }
        language_select.appendChild(opt);
    }
    language_select.value = getPageLanguage("DBT");
}

document.addEventListener('DOMContentLoaded', populateDropdowns);