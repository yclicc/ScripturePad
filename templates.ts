const _if = (condition: unknown, template: string) =>
  condition ? template : "";

// Error notification component for more visible errors
const ErrorNotification = (error: string) =>
  error
    ? `
  <div class="error-notification">
    <div class="error-content">
      <strong>Error:</strong> ${error}
    </div>
  </div>
`
    : "";

const Tabs = () => `
  <input type="radio" name="tabs" id="tab1" class="tab-input" checked />
  <label class="tab" for="tab1">editor</label>
  <input type="radio" name="tabs" id="tab2" class="tab-input" />
  <label class="tab" for="tab2">preview</label>
  <small id="characterCount"></small>
`;

const Editor = (paste = "") => `
  <div id="editor-container">
    <textarea id="pasteTextArea" name="paste" required>${paste}</textarea>
    <div id="editor"></div>
  </div>

  <div id="preview-container">
  </div>
`;

const layout = (title: string, content: string) => `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <meta name="description" content="pastebin" >
    <link rel="stylesheet" href="/codemirror.min.css">
    <link rel="stylesheet" href="/main.css">
    <title>
      ${title || "ScripturePad"}
    </title>
  </head>
  <body>
    <div class="dark-mode-container">
      <input style="display: none;" type="checkbox" id="darkSwitch" />
      <label class="dark-mode-btn" for="darkSwitch">🌒</label>
    </div>

    ${content}
    <footer>
      <hr />
      <div class="footer-links">
        <a href="/">new</a>
        <a href="/guide">guide</a>
        <a href="https://github.com/yclicc/ScripturePad">source</a>
      </div>
      <div class="antioch-footer">
        <div class="antioch-attribution">
          Originally created for Antioch Network Manchester
        </div>
        <div class="antioch-logo-container">
          <a href="https://www.antiochnetwork.org.uk" target="_blank" rel="noopener noreferrer">
            <img
              src="https://www.antiochnetwork.org.uk/images/elements/xfooter_logo.png,ql=20270704.11.pagespeed.ic.456AOnF_xg.png"
              alt="Antioch Network Manchester Logo"
              class="antioch-logo"
            />
          </a>
        </div>
      </div>
    </footer>
    <script src="/theme-switch.js"></script>
  </body>
  </html>
`;

export const homePage = ({
  paste = "",
  url = "",
  errors = { url: "", editCode: "" },
} = {}) =>
  layout(
    "ScripturePad",
    `
  <main>
    ${ErrorNotification(errors.editCode || errors.url)}
    ${Tabs()}

    <form id="editor-form" method="post" action="/save">
      ${Editor(paste)}

      <div class="input-group">
        <div>
          <input
            name="url"
            type="text"
            placeholder="custom url"
            minlength="3"
            maxlength="40"
            value="${url}"
            pattern=".*\\S+.*"
            aria-invalid="${Boolean(errors.url)}"
            ${_if(errors.url, 'aria-describedby="url-error"')}
          />
          ${_if(
            errors.url,
            `
            <small class="error" id="url-error">${errors.url}</small>
          `,
          )}
        </div>
        <div>
          <input
            name="editcode"
            type="text"
            placeholder="edit code (required)"
            minlength="3"
            maxlength="40"
            required
            aria-invalid="${Boolean(errors.editCode)}"
            ${_if(errors.editCode, 'aria-describedby="editcode-error"')}
          />
          ${_if(
            errors.editCode,
            `
            <small class="error" id="editcode-error">${errors.editCode}</small>
          `,
          )}
        </div>
      </div>

      <div class="button-group">
        <button type="submit">
          save
        </button>
      </div>
    </form>
  </main>
  <script src="/marked.min.js"></script>
  <script src="/codemirror.min.js"></script>
  <script src="/cm-markdown.min.js"></script>
  <script src="/cm-sublime.min.js"></script>
  <script src="/utils.js" type="module"></script>
  <script src="/editor.js" type="module"></script>
`,
  );

export const pastePage = ({ id = "", html = "", title = "" } = {}) =>
  layout(
    title,
    `
  <main>
    <div class="bible-controls">
      <div class="translation-note">
        <p>To view this page in your language, use your browser's built-in translation feature (such as Google Translate or Microsoft Translator).</p>
        <p>While the main text will be machine translated, Bible verses will be automatically replaced with passages from official Bible translations in the detected language, when available.</p>
      </div>
      <div class="dropdown-selectors">
        <div class="select-group">
          <label for="language-select">Select Bible Language: </label>
          <select id="language-select" name="language-select">
            <!-- Options will be populated here -->
          </select>
        </div>
        <div class="select-group">
          <label for="version-select">Select Version: </label>
          <select id="version-select" name="version-select">
            <!-- Options will be populated here -->
          </select>
        </div>
      </div>
    </div>
    <div class="paste-container">
      ${html}
    </div>
    <div class="button-group">
      <a class="btn" href="/${id}/raw">raw</a>
      <a class="btn" href="/${id}/edit">edit</a>
      <a class="btn" href="/${id}/delete">delete</a>
    </div>
    <script type="module" src="/viewer.js"></script>
  </main>
`,
  );

export const guidePage = ({ html = "", title = "" } = {}) =>
  layout(
    title,
    `
  <main>
    <div class="paste-container">
      ${html}
    </div>
  </main>
`,
  );

export const editPage = ({
  id = "",
  paste = "",
  hasEditCode = false,
  errors = { editCode: "" },
} = {}) =>
  layout(
    `edit ${id}`,
    `
  <main>
    ${ErrorNotification(errors.editCode)}
    ${Tabs()}

    <form id="editor-form" method="post" action="/${id}/save">
      ${Editor(paste)}

      <input class="display-none" name="url" type="text" value="${id}" disabled />
      <div class="input-group">
        ${_if(
          hasEditCode,
          `
          <div>
            <input
              name="editcode"
              type="text"
              placeholder="edit code"
              minlength="3"
              maxlength="40"
              required
              aria-invalid="${Boolean(errors.editCode)}"
              ${_if(errors.editCode, 'aria-describedby="editcode-error"')}
            />

            ${_if(
              errors.editCode,
              `
              <small class="error" id="editcode-error">${errors.editCode}</small>
            `,
            )}
          </div>
        `,
        )}
      </div>

      <div class="button-group">
        <button type="submit">
          save
        </button>
      </div>
    </form>
  </main>
  <script src="/marked.min.js"></script>
  <script src="/codemirror.min.js"></script>
  <script src="/cm-markdown.min.js"></script>
  <script src="/cm-sublime.min.js"></script>
  <script src="/utils.js" type="module"></script>
  <script src="/editor.js" type="module"></script>
`,
  );

export const deletePage = ({
  id = "",
  hasEditCode = false,
  errors = { editCode: "" },
} = {}) =>
  layout(
    `delete ${id}`,
    `
  <main>
    ${ErrorNotification(errors.editCode)}
    <div>
      <em>are you sure you want to delete this paste?</em>
      <strong>${id}</strong>
    </div>
    <form method="post" action="/${id}/delete">
      <div class="input-group">
        ${_if(
          hasEditCode,
          `
          <div>
            <input
              name="editcode"
              type="text"
              placeholder="edit code"
              minlength="3"
              maxlength="40"
              required
              aria-invalid="${Boolean(errors.editCode)}"
              ${_if(errors.editCode, 'aria-describedby="editcode-error"')}
            />

            ${_if(
              errors.editCode,
              `
              <small class="error" id="editcode-error">${errors.editCode}</small>
            `,
            )}
          </div>
        `,
        )}
      </div>

      <div class="button-group">
        <button type="submit">
          delete
        </button>

        <a class="btn" href="/${id}">
          cancel
        </a>
      </div>
    </form>
  </main>
`,
  );

export const errorPage = () =>
  layout(
    "404",
    `
  <main>
    <h1>404</h1>
    <p>That paste doesn't exist! Maybe it was deleted?</p>
  </main>
`,
  );
