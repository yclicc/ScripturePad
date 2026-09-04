import QRCode from "qrcode";

/**
 * A QR code for the current page, so a congregation can reach the notes from
 * a projected slide or a printed handout without typing a URL.
 *
 * Generated in the browser rather than via an image service: sending every
 * reader's document URL to a third party would leak who is reading what, and a
 * locally drawn code keeps working offline and in print.
 */

/** Rendered large enough to stay scannable when printed or projected. */
const SIZE = 512;

async function toDataUrl(url: string, dark: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: SIZE,
    margin: 2,
    // Medium correction tolerates a fold or a smudge on a paper handout.
    errorCorrectionLevel: "M",
    color: { dark, light: "#ffffff" },
  });
}

/**
 * Mount a QR panel showing `url`, with actions to copy or download the image.
 */
export function mountQrCode(container: HTMLElement, url: string): void {
  const section = document.createElement("section");
  section.className = "qr";

  const heading = document.createElement("h2");
  heading.className = "qr__heading";
  heading.textContent = "Share this page";

  const image = document.createElement("img");
  image.className = "qr__image";
  image.width = 160;
  image.height = 160;
  // The code encodes the page URL; describe it rather than leaving it unlabelled.
  image.alt = `QR code linking to ${url}`;
  image.loading = "lazy";

  const actions = document.createElement("div");
  actions.className = "qr__actions";

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "qr__button";
  copyButton.textContent = "Copy image";

  const downloadLink = document.createElement("a");
  downloadLink.className = "qr__button";
  downloadLink.textContent = "Download";
  downloadLink.download = "scripturepad-qr.png";

  const copyLinkButton = document.createElement("button");
  copyLinkButton.type = "button";
  copyLinkButton.className = "qr__button";
  copyLinkButton.textContent = "Copy link";

  actions.append(copyButton, downloadLink, copyLinkButton);
  section.append(heading, image, actions);
  container.append(section);

  const say = (button: HTMLElement, message: string, revert: string) => {
    button.textContent = message;
    setTimeout(() => (button.textContent = revert), 1800);
  };

  void (async () => {
    try {
      // Black on white regardless of theme: an inverted code scans poorly, and
      // this is the image people will print.
      const dataUrl = await toDataUrl(url, "#000000");
      image.src = dataUrl;
      downloadLink.href = dataUrl;
    } catch {
      section.remove();
    }
  })();

  copyButton.addEventListener("click", async () => {
    try {
      const blob = await (await fetch(image.src)).blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      say(copyButton, "Copied", "Copy image");
    } catch {
      // Firefox and Safari restrict image writes; downloading still works.
      say(copyButton, "Use Download", "Copy image");
    }
  });

  copyLinkButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
      say(copyLinkButton, "Copied", "Copy link");
    } catch {
      say(copyLinkButton, "Press Ctrl+C", "Copy link");
    }
  });
}
