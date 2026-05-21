// ==========================================
// mobo.js — Motherboard simulation engine
// ==========================================
// Usage (OJS):
//   import { initMoboSvg, getMoboExplanations, renderMobo } from "./assets/js/custom/mobo.js"
//
//   init = initMoboSvg("#motherboard-view")
//   moboExplanations = getMoboExplanations("#mobo-data table")
//   updateMotherboardUI = renderMobo(hardwareState, moboExplanations)
//

import { renderTemplate, parseTableData } from "../core.js";

/**
 * Loads the motherboard SVG dynamically and renders it inline inside the container
 * so that JavaScript has full interactive access to its internal DOM nodes.
 *
 * @param {string} selector - CSS selector for the motherboard container
 */
export async function initMoboSvg(selector) {
  const container = document.querySelector(selector);
  if (!container) return;

  // Extract motherboard.svg URL from computed styles or markdown background
  let svgUrl = new URL('../../ui/motherboard.svg', import.meta.url).href;
  
  const style = getComputedStyle(container).backgroundImage;
  const match = style.match(/url\("?([^"\)]+)"?\)/);
  if (match && match[1]) {
    svgUrl = match[1];
  }

  try {
    const res = await fetch(svgUrl);
    if (res.ok) {
      const svgText = await res.text();
      container.innerHTML = svgText;
      container.style.backgroundImage = 'none'; // clear background once inline
    }
  } catch (e) {
    console.error("initMoboSvg: Failed to fetch motherboard SVG inline —", e);
  }
}

/**
 * Parses the Markdown table explanations into a simple dictionary.
 *
 * @param {string} tableSelector - CSS selector for the Markdown data table
 * @returns {Object}             - Dictionary mapping id -> text explanation
 */
export function getMoboExplanations(tableSelector) {
  const moboData = parseTableData(tableSelector);
  return Object.fromEntries(moboData.map(row => [row.id, row.text]));
}

/**
 * Updates the motherboard system state, triggers CSS flow animations, and renders descriptions.
 *
 * @param {string} hardwareState - The current system state ('idle', 'loading', 'processing')
 * @param {Object} explanations  - Dictionary of step descriptions
 */
export function renderMobo(hardwareState, explanations = null) {
  // A. Mise à jour facultative du texte explicatif via le template
  if (explanations && document.querySelector("#mobo-explanation")) {
    renderTemplate("#mobo-explanation", { 
      text: explanations[hardwareState] || "Sélectionnez un état pour démarrer le simulateur." 
    });
  }

  // B. Sélection des éléments SVG (doivent être inline dans le DOM)
  const disk = document.querySelector("#part-disk rect");
  const ram  = document.querySelector("#part-ram rect");
  const cpu  = document.querySelector("#part-cpu rect");
  const bus1 = document.querySelector("#bus-disk-ram");
  const bus2 = document.querySelector("#bus-ram-cpu");

  if (!disk || !ram || !cpu) return;

  // C. Reset total des classes SVG
  [disk, ram, cpu].forEach(el => el.className.baseVal = "mobo-part");
  [bus1, bus2].forEach(el => {
    if (el) el.className.baseVal = "mobo-bus";
  });

  // D. Application dynamique des animations
  if (hardwareState === "loading") {
    disk.className.baseVal += " is-active-disk";
    ram.className.baseVal  += " is-active-ram";
    if (bus1) bus1.className.baseVal += " is-flowing";
  } 
  else if (hardwareState === "processing") {
    ram.className.baseVal  += " is-active-ram";
    cpu.className.baseVal  += " is-active-cpu";
    if (bus2) bus2.className.baseVal += " is-flowing";
  }
}
