const storageApi = typeof browser !== "undefined" ? browser.storage.local : chrome.storage.local;

async function getStorage(key) {
  if (typeof browser !== "undefined") return await storageApi.get(key);

  return await new Promise((resolve) => {
    storageApi.get(key, resolve);
  });
}

async function setStorage(obj) {
  if (typeof browser !== "undefined") return await storageApi.set(obj);

  return await new Promise((resolve) => {
    storageApi.set(obj, resolve);
  });
}

async function removeStorage(keys) {
  if (typeof browser !== "undefined") return await storageApi.remove(keys);

  return await new Promise((resolve) => {
    storageApi.remove(keys, resolve);
  });
}

async function testToken(token) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: "query OptionsViewer { viewer { login } rateLimit { remaining } }",
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.errors?.length) {
    const message = payload.errors?.map((e) => e.message).join("; ") || `GitHub API returned ${res.status}`;
    throw new Error(message);
  }

  return payload.data;
}

document.addEventListener("DOMContentLoaded", async () => {
  const input = document.getElementById("token");
  const saveBtn = document.getElementById("save");
  const removeTokenBtn = document.getElementById("remove-token");
  const status = document.getElementById("status");

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.style.color = isError ? "#d1242f" : "";
  }

  function setBusy(isBusy) {
    saveBtn.disabled = isBusy;
    removeTokenBtn.disabled = isBusy;
  }

  const res = await getStorage("token");
  if (res.token) input.value = res.token;

  saveBtn.onclick = async () => {
    const token = input.value.trim();
    if (!token) {
      setStatus("Token required.", true);
      input.focus();
      return;
    }

    setBusy(true);
    setStatus("Testing token...");

    try {
      const data = await testToken(token);
      await removeStorage("followingCache");
      await setStorage({ token });
      setStatus(`Saved. Authenticated as ${data.viewer.login}. API calls remaining: ${data.rateLimit.remaining}.`);
    } catch (error) {
      setStatus(`Token test failed: ${error.message}`, true);
    } finally {
      setBusy(false);
    }
  };

  removeTokenBtn.onclick = async () => {
    await removeStorage(["token", "viewerLogin", "followingCache"]);
    input.value = "";
    setStatus("Token removed.");
  };
});
