(function () {
  const storageApi = typeof browser !== "undefined" ? browser.storage.local : chrome.storage.local;

  const MAX_PAGES = 10;
  const ROOT_ID = "gh-following-stars";
  const STYLE_ID = "gh-following-stars-style";
  const RESERVED_PATHS = new Set([
    "about",
    "blog",
    "collections",
    "customer-stories",
    "enterprise",
    "events",
    "explore",
    "features",
    "marketplace",
    "new",
    "notifications",
    "orgs",
    "pricing",
    "pulls",
    "search",
    "settings",
    "sponsors",
    "topics",
    "users",
  ]);
  let runId = 0;
  let mountId = 0;

  async function getStorage(keys) {
    if (typeof browser !== "undefined") return await storageApi.get(keys);

    return await new Promise((resolve) => {
      storageApi.get(keys, resolve);
    });
  }

  async function setStorage(obj) {
    if (typeof browser !== "undefined") return await storageApi.set(obj);

    return await new Promise((resolve) => {
      storageApi.set(obj, resolve);
    });
  }

  function getRepo() {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    if (RESERVED_PATHS.has(parts[0])) return null;
    return { owner: parts[0], name: parts[1] };
  }

  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  async function gql(query, variables, token) {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.errors?.length) {
      const message = payload.errors?.map((e) => e.message).join("; ") || `GitHub API returned ${res.status}`;
      throw new Error(message);
    }

    return payload;
  }

  async function findMatches(owner, name, token) {
    let hasNext = true;
    let cursor = null;
    let page = 0;
    let scanned = 0;
    let total = null;
    let hitMatchLimit = false;

    const matches = [];

    while (hasNext && page < MAX_PAGES) {
      page++;

      const q = `query Stargazers($owner: String!, $name: String!, $cursor: String) {
        repository(owner: $owner, name: $name) {
          stargazerCount
          stargazers(first: 100, after: $cursor, orderBy: { field: STARRED_AT, direction: DESC }) {
            nodes { login viewerIsFollowing }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`;

      const r = await gql(q, { owner, name, cursor }, token);
      const repository = r?.data?.repository;
      const s = repository?.stargazers;
      if (!s) break;
      total = repository.stargazerCount;
      scanned += s.nodes.length;

      for (const u of s.nodes) {
        if (u.viewerIsFollowing) {
          matches.push(u.login.toLowerCase());
        }
      }

      if (matches.length >= 5) {
        hitMatchLimit = true;
        break;
      }

      hasNext = s.pageInfo.hasNextPage;
      cursor = s.pageInfo.endCursor;
    }

    return { matches, scanned, total, reachedLimit: hitMatchLimit || (hasNext && page >= MAX_PAGES) };
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        display: flex;
        align-items: center;
        flex-wrap: nowrap;
        gap: 6px;
        max-width: 100%;
        margin: 4px 0 0;
        font-size: 12px;
        color: var(--fgColor-muted, #656d76);
        line-height: 24px;
        white-space: nowrap;
      }

      #${ROOT_ID} .ghfs-badge {
        display: inline-flex;
        align-items: center;
        min-height: 20px;
        padding: 0 8px;
        border: 1px solid var(--borderColor-default, #d0d7de);
        border-radius: 999px;
        background: var(--bgColor-neutral-muted, #afb8c133);
        font-weight: 600;
        line-height: 20px;
      }

      #${ROOT_ID} a {
        color: var(--fgColor-accent, #0969da);
      }

      #${ROOT_ID} .ghfs-list {
        display: inline;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #${ROOT_ID} .ghfs-loading-star {
        animation: ghfs-star-pulse 1.1s ease-in-out infinite;
        display: inline-block;
      }

      @keyframes ghfs-star-pulse {
        0%, 100% {
          filter: saturate(0.8) brightness(0.85);
          opacity: 0.55;
          transform: scale(0.94);
        }

        50% {
          filter: saturate(1.4) brightness(1.35);
          opacity: 1;
          transform: scale(1.08);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function removeExisting() {
    mountId++;
    document.getElementById(ROOT_ID)?.remove();
  }

  function findTitleTarget(owner, name) {
    const repoPath = `/${owner}/${name}`;
    const repoHeader = findRepoHeader();
    const headers = Array.from((repoHeader || document).querySelectorAll("h1"));

    for (const header of headers) {
      const links = Array.from(header.querySelectorAll("a[href]"));
      if (links.some((link) => link.pathname === repoPath)) {
        return header;
      }
    }

    const repoLink = findRepoLink(owner, name);
    return (
      repoLink?.closest("h1") ||
      repoLink?.closest(".d-flex") ||
      repoLink?.parentElement ||
      document.querySelector("[data-testid='repository-header'] h1") ||
      document.querySelector(".repohead h1")
    );
  }

  function findRepoLink(owner, name) {
    const repoPath = `/${owner}/${name}`;
    const links = Array.from(document.querySelectorAll("a[href]"));

    return links.find((link) => {
      const url = new URL(link.href, location.origin);
      const pathname = url.pathname.replace(/\/$/, "");
      const text = link.textContent.trim();

      if (pathname !== repoPath) return false;
      if (url.hash) return false;
      if (link.classList.contains("show-on-focus")) return false;

      return text === owner || text === name || text === `${owner}/${name}`;
    });
  }

  function findRepoHeader() {
    return (
      document.querySelector("#repository-container-header") ||
      document.querySelector("[data-testid='repository-header']") ||
      document.querySelector(".pagehead")
    );
  }

  function findMountTarget(repo) {
    const repoHeader = findRepoHeader();
    const titleTarget = findTitleTarget(repo.owner, repo.name);
    const repoLink = findRepoLink(repo.owner, repo.name);
    const header =
      repoHeader ||
      titleTarget?.closest("[data-testid='repository-header']") ||
      titleTarget?.closest("#repository-container-header") ||
      titleTarget?.closest(".pagehead") ||
      repoLink?.closest("[data-testid='repository-header']") ||
      repoLink?.closest("#repository-container-header") ||
      repoLink?.closest(".pagehead") ||
      titleTarget?.parentElement;

    const existingSlot = findNearbyDesktopSlot(titleTarget || repoLink) || header?.querySelector(".d-none.d-md-block");

    if (existingSlot) return existingSlot;

    if (titleTarget) {
      const slot = document.createElement("div");
      slot.className = "ghfs-mount";
      titleTarget.insertAdjacentElement("afterend", slot);
      return slot;
    }

    if (repoLink) {
      const slot = document.createElement("div");
      slot.className = "ghfs-mount";
      repoLink.closest("strong, h1, div, span")?.insertAdjacentElement("afterend", slot);
      return slot;
    }

    return null;
  }

  function findNearbyDesktopSlot(anchor) {
    if (!anchor) return null;

    let node = anchor;
    for (let depth = 0; node && depth < 5; depth++) {
      const slot = node.querySelector?.(".d-none.d-md-block");
      if (slot) return slot;

      const siblingSlot =
        node.nextElementSibling?.matches?.(".d-none.d-md-block")
          ? node.nextElementSibling
          : node.nextElementSibling?.querySelector?.(".d-none.d-md-block");

      if (siblingSlot) return siblingSlot;
      node = node.parentElement;
    }

    return null;
  }

  function mount(container, repo) {
    const target = findMountTarget(repo);
    if (!target) return false;

    if (target.matches(".d-none.d-md-block, .ghfs-mount")) {
      target.appendChild(container);
    } else {
      target.insertAdjacentElement("afterend", container);
    }

    return true;
  }

  function mountOrRetry(container, repo, currentMountId, attempt = 0) {
    if (currentMountId !== mountId) return;
    if (mount(container, repo)) return;
    if (attempt >= 20) return;

    window.setTimeout(() => mountOrRetry(container, repo, currentMountId, attempt + 1), 250);
  }

  function renderLoading(repo) {
    removeExisting();
    ensureStyles();

    const container = document.createElement("div");
    container.id = ROOT_ID;
    container.title = "Checking followed stargazers...";

    const star = document.createElement("span");
    star.className = "ghfs-loading-star";
    star.textContent = "⭐";

    const text = document.createElement("span");
    text.textContent = "checking followed stargazers...";

    container.appendChild(star);
    container.appendChild(text);

    mountOrRetry(container, repo, ++mountId);
  }

  function render(repo, { matches, scanned, total, reachedLimit }) {
    removeExisting();
    ensureStyles();

    const container = document.createElement("div");
    container.id = ROOT_ID;
    const checkedText = total && scanned < total ? `Checked the latest ${scanned} of ${total} stargazers.` : `Checked ${scanned} stargazers.`;
    container.title = reachedLimit ? `${checkedText} More may match.` : checkedText;

    const badge = document.createElement("span");
    badge.className = "ghfs-badge";
    badge.textContent = reachedLimit && matches.length ? `${matches.length}+` : String(matches.length);

    const text = document.createElement("span");
    text.textContent = matches.length === 1 ? "followed stargazer:" : "followed stargazers:";

    container.appendChild(badge);

    if (matches.length) {
      text.textContent = "starred:";
      container.appendChild(text);

      const list = document.createElement("span");
      list.className = "ghfs-list";

      matches.slice(0, 3).forEach((u, i) => {
        const a = document.createElement("a");
        a.href = "/" + u;
        a.textContent = u;

        list.appendChild(a);

        if (i < matches.length - 1 && i < 2) {
          list.appendChild(document.createTextNode(", "));
        }
      });

      if (matches.length > 3) {
        const more = document.createElement("span");
        more.textContent = ` +${matches.length - 3}`;
        list.appendChild(more);
      }

      container.appendChild(list);
    } else {
      text.textContent = "following";
      container.appendChild(text);
    }

    mountOrRetry(container, repo, ++mountId);
  }

  async function main(currentRunId) {
    removeExisting();

    const repo = getRepo();
    if (!repo) return;

    const { token } = await getStorage(["token"]);
    if (!token) return;

    // ждём DOM GitHub
    await waitForElement("#repository-container-header, [data-testid='repository-header'], .pagehead, main");
    renderLoading(repo);

    const result = await findMatches(repo.owner, repo.name, token);
    if (currentRunId !== runId) return;

    render(repo, result);
  }

  function scheduleRun() {
    const currentRunId = ++runId;
    window.setTimeout(() => {
      main(currentRunId).catch((e) => {
        console.error("[GH EXT] fatal:", e);
        removeExisting();
      });
    }, 100);
  }

  function watchNavigation() {
    let lastUrl = location.href;
    const notify = () => window.dispatchEvent(new Event("ghfs:navigation"));

    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];
      history[method] = function (...args) {
        const result = original.apply(this, args);
        notify();
        return result;
      };
    }

    window.addEventListener("popstate", notify);
    window.addEventListener("ghfs:navigation", () => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      scheduleRun();
    });
  }

  watchNavigation();
  scheduleRun();
})();
