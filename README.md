# GitHub Following Highlighter

A small browser extension that shows which people you follow have starred the GitHub repository you are viewing.

The extension runs only on `github.com`, stores your GitHub token locally in browser extension storage, and talks directly to the GitHub GraphQL API. There is no backend service.

## What it does

- Adds a compact badge to GitHub repository pages.
- Checks recent repository stargazers and highlights the ones followed by the authenticated viewer.
- Stops early once enough matches are found for a useful preview.
- Uses GitHub GraphQL's `viewerIsFollowing` field, so it does not need to download your full following list.
- Caches no social graph data; removing the token clears saved authentication state.

## How it works

For each repository page, the extension requests stargazers in pages of 100:

```graphql
query Stargazers($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    stargazerCount
    stargazers(
      first: 100
      after: $cursor
      orderBy: { field: STARRED_AT, direction: DESC }
    ) {
      nodes {
        login
        viewerIsFollowing
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
```

GitHub's GraphQL API does not expose a server-side filter for "stargazers followed by the viewer", so the extension scans recent stargazers and uses `viewerIsFollowing` on each returned user.

## Limits

By default, the extension checks up to 10 pages of stargazers, which means up to 1,000 recent stargazers per repository. It also stops once it finds enough followed stargazers to render a concise result.

For very popular repositories, the badge is a preview of recent stars, not a complete intersection of all stargazers and everyone you follow.

## Installation

Download the latest archive from the GitHub Releases page:

- `gh-friends-stars-chrome.zip` for Chrome, Chromium, Edge, Brave, and other Chromium-based browsers.
- `gh-friends-stars-firefox.zip` for Firefox.

### Chrome

Chrome does not install arbitrary zip archives directly. Unpack the Chrome archive first, then load the unpacked folder:

1. Download `gh-friends-stars-chrome.zip` from Releases.
2. Unzip it somewhere stable on your machine.
3. Open `chrome://extensions`.
4. Enable Developer mode.
5. Click Load unpacked and select the unzipped folder.
6. Click the extension icon and add a GitHub token.

### Firefox

For local testing, Firefox can load the packaged zip temporarily:

1. Download `gh-friends-stars-firefox.zip` from Releases.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click Load Temporary Add-on.
4. Select `gh-friends-stars-firefox.zip`.
5. Click the extension icon and add a GitHub token.

Temporary Firefox add-ons are removed when Firefox restarts. For persistent installation, the extension must be signed through Mozilla Add-ons.

### Development Install

To run from source, clone this repository, open your browser's extensions page, enable developer mode, and load the repository directory as an unpacked extension.

## GitHub Token

Use a GitHub token that can read public user data through the GraphQL API. For a classic personal access token, enable the `read:user` scope. If your token UI uses permission labels instead of classic scopes, choose read access for user data (`user:read` / `User: read`).

The extension uses the token to:

- verify the authenticated viewer;
- query public repository stargazers;
- evaluate `viewerIsFollowing` for returned users.

The token is stored only in local browser extension storage.

## Development

This is a plain Manifest V3 extension:

- `manifest.json` declares permissions and content scripts.
- `content.js` injects the badge and queries GitHub GraphQL.
- `options.html` and `options.js` implement token setup.
- `background.js` opens the options page from the extension icon.

There is no build step. To validate JavaScript syntax:

```bash
node --check content.js
node --check options.js
```

To build packaged extension archives:

```bash
make chrome
make firefox
make all
```

Build output is written to `dist/`. The Chrome build rewrites the Manifest V3 background entry to use `service_worker`; the Firefox build keeps `background.scripts`.

## Privacy

The extension does not send data to any third-party server controlled by this project. Network requests go directly from your browser to `https://api.github.com/graphql`.

Your token remains in browser extension storage until you remove it from the options page or uninstall the extension.
