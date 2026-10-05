# Troubleshooting

## Extension does not appear after loading

Open `chrome://extensions`, confirm Developer mode is enabled, and select the extracted folder containing `manifest.json`.

## Popup says it cannot connect

Reload the Google Photos tab, then use the **Reload** button on the extension card in `chrome://extensions`. The extension only runs on `https://photos.google.com/*`.

## Search returns no result

The page may not have loaded the photo yet. Scroll through the album, try the filename without its extension, or use **Load all photos** for the broader metadata workflow.

## Batch results are incomplete

Batch mode accepts up to 100 unique filenames. Results depend on the same page/index availability as single search. A missing result does not prove that the photo does not exist in the album.

## The extension breaks after Google Photos changes

Open an issue with the Chrome version, extension version, page type, and anonymized steps. Do not include private album URLs, filenames, screenshots, cookies, or authentication data.
