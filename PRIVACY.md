# Privacy Notice

Google Photos Filename Search is designed to run locally in the user's browser.

## Data the extension can access

The extension runs on `https://photos.google.com/*` and can read page content needed to identify filenames and photo elements. When the user chooses **Load all photos**, the extension uses the current Google Photos page context and the user's existing Google session to request additional photo metadata from Google Photos.

The extension may temporarily store the following in Chrome session storage:

- the current search query;
- the last displayed result;
- a Google Photos photo URL returned by the page;
- whether the current page has been indexed;
- a temporary page-session identifier.

This state is intended to restore the popup during the current browsing session. The project does not operate a server-side database for this data.

## Data the project does not collect

The project does not intentionally collect or send to a project-owned server:

- photos or photo files;
- filenames;
- Google account credentials;
- authentication cookies or tokens;
- browsing analytics;
- advertising identifiers;
- crash reports or telemetry.

Requests made while loading photo metadata go directly from the browser to Google Photos using the user's existing page session. The project does not proxy those requests through its own service.

## Permissions

- `activeTab`: communicate with the active tab when the user uses the extension.
- `storage`: keep temporary popup/session state locally.
- `https://photos.google.com/*`: run the search workflow on Google Photos pages.

## Important limitations

The extension depends on Google Photos page markup and internal page behavior. Google may change those interfaces at any time. This project is not affiliated with Google and does not guarantee continued compatibility.

If you discover a privacy or security issue, do not post private album links, credentials, cookies, tokens, or personal filenames in a public issue. Contact the maintainer privately through the GitHub repository first.
