// We import langs in to convert from the 3 character iso code used by dbt to
// the two character machine translation one (and back)
import langs from "https://cdn.jsdelivr.net/npm/langs-es@4.0.2/+esm";
import { testamentLookup } from "./utils.js";

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
  onLanguageSelect();
}

function onLanguageChange() {
  // When we detect a change to the page language or on load, do this
  languageSelect.value = getPageLanguage("DBT");
  onLanguageSelect();
}

// Cache for filesets to avoid repeated lookups
let selectedFilesetsCache = {};

async function onLanguageSelect() {
  // Clear existing options from version select dropdown
  versionSelect.innerHTML = "";

  // Get the selected language ISO code
  const selectedLanguageCode = languageSelect.value;

  // Find the language data in the completeBibleData
  const selectedLanguage = Object.keys(completeBibleData).find(
    (langName) => completeBibleData[langName].iso === selectedLanguageCode,
  );

  // If we found the language data, populate the versions dropdown
  if (selectedLanguage && completeBibleData[selectedLanguage]) {
    const bibles = completeBibleData[selectedLanguage].bibles;

    // Add each Bible version as an option
    for (const bibleName in bibles) {
      // Skip loop if the property is from prototype
      if (!bibles.hasOwnProperty(bibleName)) continue;

      const opt = document.createElement("option");
      // Set the option element to translate="no" so that it doesn't get
      // translated by Google Translate
      opt.setAttribute("translate", "no");
      opt.value = bibleName;
      opt.textContent = bibleName;
      versionSelect.appendChild(opt);
    }

    // If there are versions available, select the first one
    if (versionSelect.options.length > 0) {
      versionSelect.selectedIndex = 0;
      
      // Process Bible references after selecting a version
      processBibleReferences(selectedLanguage);
    }
  } else {
    // If no versions available, add a default "No Versions Available" option
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No Versions Available";
    opt.disabled = true;
    opt.selected = true;
    versionSelect.appendChild(opt);
  }
}

// Function to process all Bible references on the page
async function processBibleReferences(selectedLanguage) {
  // Get all Bible reference elements
  const bibleRefs = document.querySelectorAll("x-bibleref");
  if (bibleRefs.length === 0) return;
  
  // Get the selected Bible version
  const selectedVersion = versionSelect.value;
  if (!selectedVersion) return;
  
  // Get the filesets for the selected version
  const bibles = completeBibleData[selectedLanguage].bibles;
  const filesets = bibles[selectedVersion]["dbp-prod"];
  
  // Find text filesets for OT and NT
  let otFilesetId = null;
  let ntFilesetId = null;
  
  // Find appropriate filesets for OT and NT
  for (const fileset of filesets) {
    if (["text_format", "text_plain"].includes(fileset.type)) {
      if (fileset.size === "C") {
        // Complete Bible
        otFilesetId = fileset.id;
        ntFilesetId = fileset.id;
        break;
      } else if (fileset.size === "OT" && !fileset.size.includes("OTP")) {
        otFilesetId = fileset.id;
      } else if (fileset.size === "NT" && !fileset.size.includes("NTP")) {
        ntFilesetId = fileset.id;
      }
    }
  }
  
  // Cache the filesets for this version
  selectedFilesetsCache[selectedVersion] = {
    otFilesetId,
    ntFilesetId
  };
  
  // Process each Bible reference
  for (const ref of bibleRefs) {
    const book = ref.getAttribute("data-book");
    const chapter = ref.getAttribute("data-chapter");
    const startVerse = ref.getAttribute("data-start-verse");
    const endVerse = ref.getAttribute("data-end-verse");
    
    // Determine if OT or NT
    const testament = testamentLookup[book] || "OT";
    
    // Select the appropriate fileset based on testament
    const filesetId = testament === "OT" ? otFilesetId : ntFilesetId;
    
    if (!filesetId) {
      console.warn(`No fileset available for ${testament} in this Bible version`);
      continue;
    }
    
    try {
      // Construct the API URL
      let apiUrl = `/api/bibletext/${filesetId}/${book}/${chapter}`;
      
      // Add verse parameters if specified
      if (startVerse) {
        apiUrl += `?verse_start=${startVerse}`;
        // If endVerse is specified and different from startVerse, include it
        // Otherwise, the server will use startVerse as endVerse to get just one verse
        if (endVerse && endVerse !== startVerse) {
          apiUrl += `&verse_end=${endVerse}`;
        }
      }
      
      // Fetch the scripture text
      const response = await fetch(apiUrl);
      const data = await response.json();
      
      if (data && data.data) {
        // Create a container for the scripture text
        const scriptureContainer = document.createElement("div");
        scriptureContainer.classList.add("scripture-text");
        
        // Set translate="no" to prevent Google Translate from modifying scripture text
        scriptureContainer.setAttribute("translate", "no");
        
        // Add the verses
        let verseText = "";
        for (const verse of data.data) {
          verseText += `<sup>${verse.verse_start}</sup> ${verse.verse_text} `;
        }
        
        scriptureContainer.innerHTML = verseText;
        
        // Add the scripture container after the reference
        if (ref.nextElementSibling && ref.nextElementSibling.classList.contains("scripture-text")) {
          // Replace existing scripture container if it exists
          ref.nextElementSibling.innerHTML = scriptureContainer.innerHTML;
          
          // Ensure translate="no" is set on the existing container too
          ref.nextElementSibling.setAttribute("translate", "no");
        } else {
          // Insert new scripture container
          ref.insertAdjacentElement("afterend", scriptureContainer);
        }
      }
    } catch (error) {
      console.error(`Error fetching scripture for ${book} ${chapter}:${startVerse || 1}-${endVerse || startVerse || chapter}`, error);
    }
  }
}

// Initialize the dropdowns when the page loads
document.addEventListener("DOMContentLoaded", function () {
  populateLanguageDropdown();
  
  // Add event listener for language select changes
  languageSelect.addEventListener("change", onLanguageSelect);
  
  // Add event listener for version select changes
  versionSelect.addEventListener("change", function() {
    const selectedLanguage = Object.keys(completeBibleData).find(
      langName => completeBibleData[langName].iso === languageSelect.value
    );
    
    if (selectedLanguage) {
      processBibleReferences(selectedLanguage);
    }
  });
});

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
