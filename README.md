# Google Photos Filename Search

An open-source Chrome extension that helps you find a photo by filename inside the currently open Google Photos page.

## Why this exists

Google Photos is convenient for viewing large albums, but finding one known filename can require a lot of scrolling. This extension adds a small filename search tool to the Google Photos page.

## Current release

This is a Chrome Developer Preview. It is not currently available in the Chrome Web Store.

The primary tested workflow is a Google Photos shared album on desktop Chrome. The extension may also work on other Google Photos pages, but those pages are not the supported baseline yet.

## Features

- Search for one filename at a time.
- Match filenames without case sensitivity.
- Search visible Google Photos content and scroll to the first match.
- Highlight the matching photo on the page.
- Optionally load more photo metadata for broader filename searching.
- Open a matched photo in a new Google Photos tab when a valid photo link is available.

Batch search is planned as a separate secondary feature. It is intentionally not part of the single-search baseline.

## Install in Chrome Developer Mode

Chrome users normally install extensions from the Chrome Web Store. This project is not currently listed there, so installation requires Developer Mode. Only install code you trust.

1. Download the latest ZIP from the [GitHub Releases](https://github.com/quan191/gg-photos-search/releases) page.
2. Extract the ZIP to a permanent folder. Do not select the ZIP file itself.
3. Open Chrome and visit `chrome://extensions`.
4. Turn on **Developer mode** in the top-right corner.
5. Click **Load unpacked**.
6. Select the extracted folder that contains `manifest.json` directly inside it.
7. Pin **Google Photos Filename Search** from Chrome's Extensions menu.
8. Open or reload a Google Photos shared album.
9. Click the extension icon, enter a filename such as `IMG_1234.jpg`, and choose **Search**.

The extension is for desktop Chrome. Chrome mobile does not support this installation flow.

## Updating

1. Download and extract the newest release into a new folder.
2. Open `chrome://extensions`.
3. Find the unpacked extension and click **Remove**.
4. Click **Load unpacked** and select the new extracted folder.

Keep the old folder until the new version has loaded successfully.

## Troubleshooting

### “Load unpacked” is disabled

Enable **Developer mode** on `chrome://extensions`. Work or school computers may be managed by an administrator who blocks developer extensions.

### Chrome says the manifest is missing

Select the extracted folder containing `manifest.json`, not the downloaded ZIP and not a parent folder.

### No photo is found

Scroll through the album first so Google Photos loads more photos. Search is limited by what the current page can expose. Try the filename with and without its extension.

### The extension cannot connect

Reload the Google Photos page, then reload the unpacked extension from `chrome://extensions`. Google Photos interface changes can also temporarily break compatibility.

### The extension behaves differently in a shared album

Shared albums are the primary tested workflow. Other Google Photos pages may expose different markup or internal requests.

## Privacy

The project has no backend, account system, analytics, or remote code. Search and temporary search state are processed locally in the browser. The extension can read the current `photos.google.com` page and, when the user chooses to load more photos, makes requests in the Google Photos page context using the user's existing session.

The extension does not upload photos or filenames to a project-owned server. See [PRIVACY.md](./PRIVACY.md) for details.

## Limitations

- Google Photos can change its DOM or internal request formats without notice.
- The first release is Chrome-only.
- Shared albums are the primary tested surface.
- Photos must be loaded or loadable by the current Google Photos page.
- This project is not affiliated with or endorsed by Google.

## Development

```bash
npm install
npm test
```

Load the repository root as an unpacked extension from `chrome://extensions` while developing.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Bug reports should include the Google Photos page type, Chrome version, extension version, and anonymized reproduction steps. Do not include private album links, filenames, screenshots, cookies, or authentication data.

## License

MIT. See [LICENSE](./LICENSE).
