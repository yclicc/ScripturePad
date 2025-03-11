import { scriptureReftagExtension, noTranslateExtension } from "./utils.js";

(({ marked }) => {
  const MAX_LENGTH = 40000;
  const cmEl = document.getElementById("editor");
  const textArea = document.getElementById("pasteTextArea");
  const editorTab = document.getElementById("tab1");
  const editorForm = document.getElementById("editor-form");
  const previewTab = document.getElementById("tab2");
  const previewContainer = document.getElementById("preview-container");
  const characterCount = document.getElementById("characterCount");

  // onload, reset to editorTab since we can't be sure preview tab will be populated
  editorTab.click();

  // hide paste textarea
  textArea.style.display = "none";

  const editor = new CodeMirror(cmEl, {
    mode: "markdown",
    value: textArea.value,
    keymap: "sublime",
    theme: "default",
    viewportMargin: Infinity,
    lineWrapping: true, // Enable word wrapping
  });

  // attach editor to window
  window.cmEditor = editor;

  // initialize characterCount
  const updateCharacterCount = (count) => {
    characterCount.innerText = `${count}/${MAX_LENGTH}`;
  };

  updateCharacterCount(textArea.value.length);

  const updateTextArea = debounce((value) => {
    textArea.value = value;
  }, 1500);

  // set onChange to update text area with editor text
  // this is helpful for persistence across page reloads
  const onChange = (instance, change) => {
    const value = instance.getValue();
    textArea.value = value;
    updateCharacterCount(value.length);
    updateTextArea(value);
  };

  // this is a long-winded way of implementing a max-length on CodeMirror
  const onBeforeChange = (instance, change) => {
    if (change.update) {
      const newLine = instance.getDoc().lineSeparator();
      let text = change.text.join(newLine);
      let delta =
        text.length -
        (instance.indexFromPos(change.to) - instance.indexFromPos(change.from));
      if (delta <= 0) return true;

      delta = instance.getValue().length + delta - MAX_LENGTH;
      if (delta > 0) {
        text = text.substr(0, text.length - delta);
        change.update(change.from, change.to, text.split(newLine));
      }
    }

    return true;
  };

  editor.on("change", onChange);
  editor.on("beforeChange", onBeforeChange);

  // set event listener to refresh editor on tab select
  editorTab.addEventListener("click", () => {
    editor.refresh();
  });

  // override form submit
  editorForm.addEventListener("submit", (ev) => {
    ev.preventDefault();

    // set textarea to ensure it is up to date
    textArea.value = editor.getValue();

    editorForm.submit();
  });

  // Register the extension with marked.
  marked.use({ extensions: [scriptureReftagExtension, noTranslateExtension] });

  // populate preview tab when activating it
  previewTab.addEventListener("change", () => {
    previewContainer.innerHTML = marked.parse(editor.getValue(), {
      breaks: true,
    });

    // Add <SCRIPTURE_REFERENCE> to all x-bibleref tags in preview
    const bibleTags = previewContainer.getElementsByTagName("x-bibleref");
    for (let tag of bibleTags) {
      tag.textContent = " <SCRIPTURE_REFERENCE>";
    }
  });

  function debounce(cb, wait) {
    let timer;

    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => cb(...args), wait);
    };
  }
})(window);
