import { compileD2 } from "./d2.js";

const loadingBox = document.getElementById("loading-box");
const errorBox = document.getElementById("error-box");
const snapshotBox = document.getElementById("snapshot-box");
const bitcoinBlock = document.getElementById("bitcoin-block");
const generatedAt = document.getElementById("generated-at");
const sortitionRow = document.getElementById("sortition-row");
const sortitionId = document.getElementById("sortition-id");
const description = document.getElementById("description");
const vizContainer = document.getElementById("miner-viz-container");

function hide(element) {
  element?.classList.add("is-hidden");
}

function show(element) {
  element?.classList.remove("is-hidden");
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
}

async function loadSnapshot() {
  show(loadingBox);
  hide(errorBox);
  hide(snapshotBox);

  try {
    const response = await fetch("/api/miners/viz");
    if (!response.ok) {
      throw new Error(`Failed to load miner viz: ${response.statusText}`);
    }
    const payload = await response.json();

    bitcoinBlock.textContent =
      payload.bitcoinBlockHeight?.toLocaleString?.() ?? "";
    generatedAt.textContent = formatDate(payload.generatedAt);
    description.textContent = payload.description ?? "";

    if (payload.sortitionId) {
      sortitionId.textContent = payload.sortitionId;
      show(sortitionRow);
    } else {
      sortitionId.textContent = "";
      hide(sortitionRow);
    }

    const svgMarkup = await compileD2(payload.d2Source);
    if (svgMarkup) {
      vizContainer.innerHTML = svgMarkup;
    } else {
      vizContainer.innerHTML =
        "<p>Unable to render miner visualization. Please try again later.</p>";
    }

    show(snapshotBox);
  } catch (error) {
    console.error("[static-index] error loading snapshot", error);
    errorBox.textContent =
      error instanceof Error ? error.message : "Unknown error loading data";
    show(errorBox);
  } finally {
    hide(loadingBox);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadSnapshot);
} else {
  loadSnapshot();
}
