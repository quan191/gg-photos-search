# Release Guide

This project currently publishes a Chrome Developer Preview, not a Chrome Web Store item.

## Prepare a release

1. Confirm the version in `manifest.json` and `package.json` matches.
2. Run the full local checks:

   ```bash
   npm ci --ignore-scripts
   npm run validate:release
   npm test -- --runInBand
   npm run package
   ```

3. Inspect `dist/gg-photos-search-v<VERSION>.zip`.
4. Extract the ZIP and load it through Chrome's **Load unpacked** flow.
5. Test single search and batch search on a non-sensitive test album or anonymized fixture.
6. Update the README and release notes if behavior or limitations changed.
7. Commit source and documentation changes separately from release metadata.
8. Tag the release and attach the generated ZIP to GitHub Releases.

## Release checklist

- [ ] Tests pass.
- [ ] Release validation passes.
- [ ] ZIP contains `manifest.json` at its root.
- [ ] ZIP contains no tests, `.git` data, agent directories, credentials, or local paths.
- [ ] README installation steps work from the ZIP.
- [ ] Privacy and permission descriptions match the manifest and runtime.
- [ ] Release notes say that Chrome Web Store publication is unavailable.
- [ ] No private album links, filenames, screenshots, or account data are published.
