// We import langs in to convert from the 3 character iso code used by dbt to
// the two character machine translation one (and back)
import langs from "https://cdn.jsdelivr.net/npm/langs-es@4.0.2/+esm";

function langMTtoDBT(inCode) {
  // TODO Add other hacks for different edge languages
  if (inCode == "zh-CN") {
    // If simplified, assume Mandarin
    return "cmn";
  } else if (inCode == "zh-TW") {
    // If traditional, assume "Cantonese"
    return "yue";
  } else if (inCode == "fa") {
    // If Farsi, assume "Western Persian"
    return "pes";
  }
  var outCode = langs.where("1", inCode)["3"];
  if (outCode == "ara") {
    outCode = "arb";
  }
  return outCode;
}

function getPageLanguage(spec = "MT") {
  // Spec stores whether we want a 2 letter machine translation code "MT"
  // or a 3 letter code of the kind used by DBT, "DBT"
  var lang = document.documentElement.lang;
  if (spec == "MT") {
    return lang;
  } else if ((spec = "DBT")) {
    return langMTtoDBT(lang);
  } else {
    throw new Error(`Spec ${spec} not implemented`);
  }
}

// The language the page is currently known to be in. Should always be English to start.
var currentLanguage = document.documentElement.lang;

var completeBibleData;
const languageSelect = document.getElementById("language-select");
const versionSelect = document.getElementById("version-select");

async function populateLanguageDropdown() {
  // Populate the language select with languages for which we have a
  // complete Bible, then set the default to the current page language
  const response = await fetch("/api/completebibles");
  completeBibleData = await response.json();

  for (var languageName in completeBibleData) {
    // Skip loop if the property is from prototype
    if (!completeBibleData.hasOwnProperty(languageName)) continue;

    var language = completeBibleData[languageName];

    const opt = document.createElement("option");
    // Set the option element to translate="no" so that it doesn't get
    // translated by Google Translate
    opt.setAttribute("translate", "no");
    opt.value = language.iso;
    if (language.autonym !== null && language.autonym !== languageName) {
      opt.textContent = `${language.autonym} (${languageName})`;
    } else {
      opt.textContent = `${languageName}`;
    }
    languageSelect.appendChild(opt);
  }
  languageSelect.value = getPageLanguage("DBT");
}

function onLanguageChange() {
  // When we detect a change to the page language or on load, do this
  languageSelect.value = getPageLanguage("DBT");
  onLanguageSelect();
}

function onLanguageSelect() {
  // Populate the versionSelect dropdown (TODO)
}

document.addEventListener("DOMContentLoaded", populateLanguageDropdown);

// See https://martijnhols.nl/gists/how-to-detect-google-translate-and-other-machine-translation
const languageObserver = new MutationObserver(() => {
  const lang = document.documentElement.lang;
  if (lang !== currentLanguage) {
    currentLanguage = lang;
    onLanguageChange();
  }
});
languageObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["lang"],
  childList: false,
  characterData: false,
});
