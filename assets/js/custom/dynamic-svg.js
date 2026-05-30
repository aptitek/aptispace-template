// ==========================================
// dynamic-svg.js — Generic SVG Interactivity Utilities
// ==========================================

/**
 * Creates dynamic hover states and click callbacks for mapped SVG elements.
 * 
 * @param {string} svgSelector - The CSS selector for the SVG container.
 * @param {Object} idMap       - A mapping of SVG element IDs to semantic values (e.g., { "part-ssd": "SSD" })
 * @param {Function} onClick   - Callback triggered on click: onClick(id, mappedValue)
 */
export function createDynamicSvg(svgSelector, idMap, onClick) {
  const container = document.querySelector(svgSelector);
  if (!container) return;

  Object.keys(idMap).forEach(id => {
    const el = container.querySelector(`#${id}`);
    if (el) {
      el.classList.add("dynamic-svg-interactive");
      
      // We overwrite existing listeners or rely on event delegation
      // For simplicity in OJS reactivity where elements may be re-rendered:
      el.onclick = (e) => {
        e.preventDefault();
        if (typeof onClick === "function") {
          onClick(id, idMap[id]);
        }
      };
    }
  });
}

/**
 * Specialized wrapper to bind an SVG's interactive elements directly to a Quarto tabset.
 * 
 * @param {string} svgSelector    - The CSS selector for the SVG container.
 * @param {string} tabsetSelector - The CSS selector for the Quarto panel-tabset.
 * @param {Object} idMap          - Mapping of SVG element IDs to Tab plain-text labels.
 */
export function bindSvgToTabset(svgSelector, tabsetSelector, idMap) {
  createDynamicSvg(svgSelector, idMap, (id, tabLabel) => {
    // Find the corresponding nav-link in the tabset
    const links = document.querySelectorAll(`${tabsetSelector} .nav-link`);
    for (const link of links) {
      if (link.textContent.includes(tabLabel)) {
        link.click();
        break;
      }
    }
  });
}

