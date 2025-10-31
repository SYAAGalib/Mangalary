(() => {
  const settingsButton = document.getElementById("settings-button");
  const backButton = document.getElementById("back-to-gallery");
  const zoomWrapper = document.getElementById("zoom-wrapper");
  const zoomSlider = document.getElementById("zoom-slider");
  const statusRegion = document.getElementById("status");
  const currentSeriesLabel = document.getElementById("current-series");
  const gallery = document.getElementById("gallery");
  const reader = document.getElementById("reader");
  const pagesContainer = document.getElementById("pages");
  const pageTemplate = document.getElementById("page-template");
  const seriesCardTemplate = document.getElementById("series-card-template");
  const folderInput = document.getElementById("folder-input");

  if (!settingsButton || !zoomSlider || !statusRegion) {
    return;
  }

  const supportsFileSystemAccess = "showDirectoryPicker" in window && window.isSecureContext;
  const legacyDirectorySelectionSupported = !!folderInput && "webkitdirectory" in folderInput;
  const supportedExtensions = ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg"];
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const slideshowTimers = new WeakMap();

  let currentZoom = Number(zoomSlider.value) || 100;
  let currentSeries = "";
  let rootHandle = null;
  let rootName = "";
  let library = new Map();
  let activeUrls = [];
  const previewRegistry = new Map();

  document.documentElement.style.setProperty("--zoom-width", `${currentZoom}%`);

  const ensureStatus = (message, { tone = "info" } = {}) => {
    statusRegion.textContent = message;
    statusRegion.classList.remove("empty-state", "error");
    if (tone === "error") {
      statusRegion.classList.add("error");
    } else if (tone === "empty") {
      statusRegion.classList.add("empty-state");
    }
  };

  const setView = (mode) => {
    if (mode === "gallery") {
      gallery.hidden = false;
      reader.hidden = true;
      backButton.hidden = true;
      zoomWrapper.hidden = true;
  currentSeriesLabel.textContent = rootName ? `Library: ${rootName}` : "";
    } else {
      gallery.hidden = true;
      reader.hidden = false;
      backButton.hidden = false;
      zoomWrapper.hidden = false;
      currentSeriesLabel.textContent = currentSeries ? `Reading: ${currentSeries}` : "";
    }
  };

  const revokeActiveUrls = () => {
    activeUrls.forEach((url) => URL.revokeObjectURL(url));
    activeUrls = [];
  };

  const releasePreviews = () => {
    previewRegistry.forEach((previews) => {
      previews.forEach(({ url }) => URL.revokeObjectURL(url));
    });
    previewRegistry.clear();
  };

  const resetViewer = () => {
    revokeActiveUrls();
    pagesContainer.innerHTML = "";
    currentSeries = "";
  };

  const isSupportedFile = (name) => {
    const extension = name.split(".").pop()?.toLowerCase();
    return extension ? supportedExtensions.includes(extension) : false;
  };

  const collectImages = async (dirHandle, prefix = "") => {
    const files = [];
    for await (const entry of dirHandle.values()) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === "file") {
        if (isSupportedFile(entry.name)) {
          const handleRef = entry;
          files.push({ path, getFile: () => handleRef.getFile() });
        }
      } else if (entry.kind === "directory") {
        const nested = await collectImages(entry, path);
        files.push(...nested);
      }
    }
    files.sort((a, b) => collator.compare(a.path, b.path));
    return files;
  };

  const createPreviewUrls = async (seriesName, files) => {
    const previews = [];
    const count = Math.min(files.length, 5);
    for (let index = 0; index < count; index += 1) {
      const fileObject = await files[index].getFile();
      const url = URL.createObjectURL(fileObject);
      previews.push({ url, path: files[index].path });
    }
    previewRegistry.set(seriesName, previews);
    return previews;
  };

  const buildLibrary = async (handle) => {
    const map = new Map();
    for await (const [name, entry] of handle.entries()) {
      if (entry.kind !== "directory") continue;
      const entries = await collectImages(entry);
      if (!entries.length) continue;
      const previews = await createPreviewUrls(name, entries);
      map.set(name, { handle: entry, entries, previews });
    }
    return map;
  };

  const buildLibraryFromFileList = async (fileList) => {
    const grouped = new Map();
    let fallbackRoot = "";

    Array.from(fileList).forEach((file) => {
      if (!isSupportedFile(file.name)) return;
      const relPath = file.webkitRelativePath || file.name;
      const parts = relPath.split("/").filter(Boolean);
      if (!parts.length) return;
      if (!fallbackRoot) {
        fallbackRoot = parts[0];
      }

      if (parts.length < 2) {
        return;
      }

      const seriesName = parts[1];
      const innerParts = parts.slice(2);
      const entryPath = innerParts.length ? innerParts.join("/") : file.name;

      if (!grouped.has(seriesName)) {
        grouped.set(seriesName, []);
      }

      const storedFile = file;
      grouped.get(seriesName).push({
        path: entryPath,
        getFile: () => Promise.resolve(storedFile),
      });
    });

    const map = new Map();
    for (const [seriesName, entries] of grouped.entries()) {
      entries.sort((a, b) => collator.compare(a.path, b.path));
      const previews = await createPreviewUrls(seriesName, entries);
      map.set(seriesName, { entries, previews });
    }

    return { map, rootLabel: fallbackRoot || "Selected Library" };
  };

  const stopSlideshow = (card, record) => {
    const active = slideshowTimers.get(card);
    if (active) {
      clearInterval(active.timer);
      slideshowTimers.delete(card);
    }
    const image = card.querySelector(".series-image");
    if (image && record.previews.length) {
      image.src = record.previews[0].url;
    }
  };

  const startSlideshow = (card, record) => {
    if (record.previews.length <= 1) return;
    stopSlideshow(card, record);
    const image = card.querySelector(".series-image");
    if (!image) return;
    let index = 0;
    const timer = setInterval(() => {
      index = (index + 1) % record.previews.length;
      image.src = record.previews[index].url;
    }, 750);
    slideshowTimers.set(card, { timer });
  };

  const renderGallery = () => {
    gallery.innerHTML = "";

    if (!library.size) {
      setView("gallery");
      ensureStatus("No manga folders found in this library. Add some chapters and try again.", { tone: "error" });
      return;
    }

    const fragment = document.createDocumentFragment();
    const seriesNames = Array.from(library.keys()).sort((a, b) => collator.compare(a, b));

    seriesNames.forEach((name) => {
      const record = library.get(name);
      const card = seriesCardTemplate.content.firstElementChild.cloneNode(true);
      const image = card.querySelector(".series-image");
      const title = card.querySelector(".series-title");
      const count = card.querySelector(".series-count");

      if (record.previews.length) {
        image.src = record.previews[0].url;
        image.alt = `Preview for ${name}`;
      } else {
        image.alt = `No preview available for ${name}`;
      }

      title.textContent = name;
  count.textContent = `${record.entries.length} page${record.entries.length === 1 ? "" : "s"}`;
      card.dataset.series = name;

      card.addEventListener("click", () => {
        stopSlideshow(card, record);
        openSeries(name);
      });

      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          stopSlideshow(card, record);
          openSeries(name);
        }
      });

      card.addEventListener("mouseenter", () => startSlideshow(card, record));
      card.addEventListener("mouseleave", () => stopSlideshow(card, record));
      card.addEventListener("blur", () => stopSlideshow(card, record));

      fragment.appendChild(card);
    });

    gallery.appendChild(fragment);
    setView("gallery");
  ensureStatus(`Choose a series from “${rootName || "your library"}” (${library.size} found).`);
  };

  const displaySeries = (seriesName, entries) => {
    resetViewer();

    if (!entries.length) {
      ensureStatus("No supported images found in this series.", { tone: "error" });
      setView("gallery");
      return;
    }

    const fragment = document.createDocumentFragment();

    entries.forEach(({ file }, index) => {
      const figure = pageTemplate.content.firstElementChild.cloneNode(true);
      const image = figure.querySelector(".page-image");
      const url = URL.createObjectURL(file);
      activeUrls.push(url);
      image.src = url;
      image.alt = `${seriesName} page ${index + 1}`;
      fragment.appendChild(figure);
    });

    pagesContainer.appendChild(fragment);
    currentSeries = seriesName;
    currentSeriesLabel.textContent = `Reading: ${seriesName}`;
    setView("reader");
    ensureStatus(`Reading “${seriesName}” (${entries.length} pages) — Zoom ${currentZoom}%`);
  };

  const openSeries = async (seriesName) => {
    const record = library.get(seriesName);
    if (!record) return;

    try {
      ensureStatus(`Loading “${seriesName}”...`);
      const files = await Promise.all(
        record.entries.map(async (entry) => {
          const file = await entry.getFile();
          if (!file.webkitRelativePath) {
            Object.defineProperty(file, "webkitRelativePath", {
              value: `${seriesName}/${entry.path}`,
              configurable: true,
            });
          }
          return { file, path: entry.path };
        })
      );
      displaySeries(seriesName, files);
    } catch (error) {
      console.error(error);
      ensureStatus(`Couldn't open “${seriesName}”. ${error.message}`, { tone: "error" });
    }
  };

  const handleZoomChange = (value) => {
    currentZoom = Number(value);
    document.documentElement.style.setProperty("--zoom-width", `${currentZoom}%`);
    if (currentSeries) {
      ensureStatus(`Reading “${currentSeries}” (${pagesContainer.childElementCount} pages) — Zoom ${currentZoom}%`);
    }
  };

  const verifyPermission = async (handle, mode = "read") => {
    if (!handle.queryPermission) return true;
    const options = { mode };
    const status = await handle.queryPermission(options);
    if (status === "granted") return true;
    if (status === "denied") return false;
    const request = await handle.requestPermission(options);
    return request === "granted";
  };

  const handleStore = supportsFileSystemAccess
    ? (() => {
        const DB_NAME = "manga-reader";
        const STORE_NAME = "handles";
        const ROOT_KEY = "root";

        const openDb = () =>
          new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => {
              request.result.createObjectStore(STORE_NAME);
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });

        const wrapRequest = (tx, request) =>
          new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            tx.oncomplete = () => resolve(request.result);
            tx.onerror = () => reject(tx.error);
          });

        return {
          async get() {
            const db = await openDb();
            try {
              const tx = db.transaction(STORE_NAME, "readonly");
              const store = tx.objectStore(STORE_NAME);
              const request = store.get(ROOT_KEY);
              return await wrapRequest(tx, request);
            } finally {
              db.close();
            }
          },
          async set(handle) {
            const db = await openDb();
            try {
              const tx = db.transaction(STORE_NAME, "readwrite");
              const store = tx.objectStore(STORE_NAME);
              const request = store.put(handle, ROOT_KEY);
              await wrapRequest(tx, request);
            } finally {
              db.close();
            }
          },
          async clear() {
            const db = await openDb();
            try {
              const tx = db.transaction(STORE_NAME, "readwrite");
              const store = tx.objectStore(STORE_NAME);
              const request = store.delete(ROOT_KEY);
              await wrapRequest(tx, request);
            } finally {
              db.close();
            }
          },
        };
      })()
    : null;

  const loadLibraryFromHandle = async (handle) => {
    ensureStatus("Loading library...");
    releasePreviews();
    library = await buildLibrary(handle);
    rootHandle = handle;
    rootName = handle.name || rootName || "Selected Library";
    renderGallery();
  };

  const loadLibraryFromFiles = async (files) => {
    ensureStatus("Loading library...");
    releasePreviews();
    const { map, rootLabel } = await buildLibraryFromFileList(files);
    library = map;
    rootHandle = null;
    rootName = rootLabel;
    renderGallery();
  };

  zoomSlider.addEventListener("input", (event) => {
    handleZoomChange(event.target.value);
  });

  backButton.addEventListener("click", () => {
    resetViewer();
    setView("gallery");
    if (library.size) {
      ensureStatus(`Choose a series from “${rootName || "your library"}” (${library.size} found).`);
    } else {
      ensureStatus("Choose a library folder from settings to get started.", { tone: "empty" });
    }
  });

  settingsButton.addEventListener("click", async () => {
    if (supportsFileSystemAccess) {
      try {
        const handle = await window.showDirectoryPicker();
        const granted = await verifyPermission(handle);
        if (!granted) {
          ensureStatus("Permission denied. Please allow folder access.", { tone: "error" });
          return;
        }
        await handleStore?.set(handle);
        await loadLibraryFromHandle(handle);
      } catch (error) {
        if (error?.name === "AbortError") {
          ensureStatus("Folder selection canceled.", { tone: "empty" });
          return;
        }
        console.error(error);
        ensureStatus(`Couldn't open that folder. ${error.message}`, { tone: "error" });
      }
      return;
    }

    if (legacyDirectorySelectionSupported) {
      folderInput.value = "";
      folderInput.click();
      return;
    }

    ensureStatus("Folder selection isn't available in this browser.", { tone: "error" });
  });

  if (legacyDirectorySelectionSupported) {
    folderInput.addEventListener("change", async (event) => {
      const files = Array.from(event.target.files || []);
      if (!files.length) {
        ensureStatus("Folder selection canceled.", { tone: "empty" });
        return;
      }

      try {
        await loadLibraryFromFiles(files);
      } catch (error) {
        console.error(error);
        ensureStatus(`Couldn't open that folder. ${error.message}`, { tone: "error" });
      } finally {
        folderInput.value = "";
      }
    });
  }

  const init = async () => {
    setView("gallery");

    if (supportsFileSystemAccess) {
      try {
        const savedHandle = await handleStore?.get();
        if (savedHandle) {
          const granted = await verifyPermission(savedHandle);
          if (granted) {
            await loadLibraryFromHandle(savedHandle);
            return;
          }
          await handleStore?.clear();
          ensureStatus("The saved library needs permission again. Use the settings icon to reconnect.", { tone: "empty" });
        } else {
          ensureStatus("Use the settings icon to choose your library folder.", { tone: "empty" });
        }
      } catch (error) {
        console.error(error);
        ensureStatus("Unable to restore your saved library. Pick it again from settings.", { tone: "error" });
      }
      return;
    }

    if (!legacyDirectorySelectionSupported) {
      ensureStatus("This browser cannot select folders. Please switch to a Chromium-based browser.", { tone: "error" });
      settingsButton.disabled = true;
      return;
    }

    const insecureContext = !window.isSecureContext;
    ensureStatus(
      insecureContext
        ? "Choose a library folder with the settings icon. Tip: serving the app over http://localhost enables faster access."
        : "Choose a library folder with the settings icon.",
      { tone: "empty" }
    );
  };

  window.addEventListener("beforeunload", () => {
    revokeActiveUrls();
    releasePreviews();
  });

  handleZoomChange(currentZoom);
  init();
})();
