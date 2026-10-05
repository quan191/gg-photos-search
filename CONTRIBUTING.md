# Contributing

Thank you for helping improve Google Photos Filename Search.

## Before opening an issue

- Confirm the problem still exists with the latest release.
- Check existing issues for duplicates.
- Do not include private album URLs, personal filenames, screenshots containing personal data, cookies, or authentication tokens.
- Include Chrome version, extension version, page type, and anonymized reproduction steps.

## Development setup

```bash
npm install
npm test
```

Load the repository root as an unpacked extension from `chrome://extensions` with Developer mode enabled.

## Pull requests

- Keep each pull request focused.
- Add or update tests for behavior changes.
- Update README or privacy documentation when user behavior, permissions, setup, or data handling changes.
- Do not add remote code, analytics, tracking, or a backend without a separate design discussion.
- Do not commit `.claude/`, `.codex/`, `.agents/`, credentials, private screenshots, generated release bundles, or local machine paths.
- Explain how the change was tested against a Google Photos shared album without sharing private album data.

## Commit style

Use short imperative Conventional Commit messages, for example:

```text
feat: add batch filename search
fix: handle missing filename labels
docs: clarify developer mode installation
test: cover localized filename parsing
```

## Scope

The first public release is Chrome-only, local-only, and focused on filename search in Google Photos. Larger changes should begin with an issue describing the user problem, compatibility impact, and privacy implications.
