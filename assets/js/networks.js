// ==========================================
// networks.js - Composants de Réseaux et de Graphes
// ==========================================
import ForceGraph from "https://esm.sh/force-graph";
import ForceGraph3D from "https://esm.sh/3d-force-graph";
import SpriteText from "https://esm.sh/three-spritetext";
import TagCloud from "https://esm.sh/TagCloud";
import { getThemeColor, resolveCssValue, utils, StateMachine } from "./core.js";

const SOL_FALLBACKS = {
  base03: "#002b36", base02: "#073642", base01: "#586e75", base00: "#657b83",
  base0: "#839496", base1: "#93a1a1", base2: "#eee8d5", base3: "#fdf6e3",
  yellow: "#b58900", orange: "#cb4b16", red: "#dc322f", magenta: "#d33682",
  violet: "#6c71c4", blue: "#268bd2", cyan: "#2aa198", green: "#859900"
};

/**
 * 🕸️ Force-Directed Graph (2D or 3D)
 * Creates and returns a graph instance mounted on the given container.
 */
export function createGraph(container, graphData, is3D = false) {
  if (is3D) {
    return ForceGraph3D()(container)
      .graphData(graphData)
      .nodeThreeObject(node => {
        const sprite = new SpriteText(node.id);
        sprite.color = node.color || 'white';
        sprite.textHeight = 8;
        return sprite;
      });
  }
  return ForceGraph()(container).graphData(graphData);
}

/**
 * Helper to draw a rounded rectangle on a 2D Canvas context.
 */
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}


/**
 * ☁️ 3D Interactive Word Cloud
 * Creates and returns a TagCloud instance mounted on the given container.
 *
 * @param {string} containerSelector - Element ID (without #) or CSS selector
 * @param {string[]} words
 * @param {object}  options          - Merged with defaults (radius, maxSpeed, etc.)
 */
export function createWordCloud(containerSelector, words, options = {}) {
  const container = document.querySelector('#' + containerSelector);
  if (!container) {
    console.warn(`createWordCloud: element #${containerSelector} not found.`);
    return null;
  }

  container.innerHTML = ""; // clear before re-render to avoid OJS duplicates

  const finalOptions = {
    radius: 100,
    maxSpeed: 'normal',
    initSpeed: 'normal',
    keep: true,
    ...options
  };

  return TagCloud(container, words, finalOptions);
}

/**
 * ⚡ Cabling Exercise — jsPlumb-based HTML/SVG implementation
 *
 * Renders left/right pill elements in a flexbox layout.
 * jsPlumb Community 6.x draws SVG Bezier connectors between endpoints.
 * Supports both drag-to-connect and click-to-connect interactions.
 *
 * @param {string}  containerId  - CSS selector for the host element (e.g. "#cabling-canvas")
 * @param {Array}   leftItems    - [{id, label}]
 * @param {Array}   rightItems   - [{id, label}]
 * @param {Function} onStateUpdate - called with {score, total, connections} on every change
 */
export class CablingManager {
  constructor(containerId, leftItems, rightItems, onStateUpdate) {
    this.containerId    = containerId;
    this.container      = document.querySelector(containerId);
    this.leftItems      = leftItems;
    this.rightItems     = rightItems;
    this.onStateUpdate  = onStateUpdate;

    this.connections  = {};   // { leftSrcId: rightSrcId }
    this.activeNode   = null; // { el, srcId, group } — pour click-to-connect
    this.validated    = false;
    this.jsp          = null; // jsPlumb instance
    this._connMap     = new Map(); // srcId → jsPlumb Connection object
    this._sparks      = [];   // spark DOM elements for incorrect connections

    if (this.container) {
      this._init();
    }
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  async _init() {
    const { newInstance } = await import("https://esm.sh/@jsplumb/browser-ui@6.2.10");

    // Vider le conteneur (sécurité OJS — re-render)
    this.container.innerHTML = "";

    // Structure de base
    this.container.style.position = "relative";
    this.container.style.display  = "flex";
    this.container.style.alignItems = "center";

    // ── Colonnes HTML ───────────────────────────────
    const colLeft  = this._makeColumn("left");
    const colMid   = this._makeMidColumn();
    const colRight = this._makeColumn("right");

    this.leftItems.forEach((it, i) => {
      colLeft.appendChild(this._makePill(it, "left", i));
    });
    this.rightItems.forEach((it, i) => {
      colRight.appendChild(this._makePill(it, "right", i));
    });

    this.container.append(colLeft, colMid, colRight);

    // ── Instance jsPlumb ────────────────────────────
    this.jsp = newInstance({
      container: this.container,
      connector: { 
        type: "Bezier", 
        options: { 
          curviness: 80
        } 
      },
      paintStyle: { 
        stroke: "var(--sol-cyan)", 
        strokeWidth: 4,
        outlineStroke: "rgba(0,0,0,0.3)",
        outlineWidth: 2
      },
      hoverPaintStyle: { 
        stroke: "var(--sol-yellow)", 
        strokeWidth: 5,
        outlineStroke: "rgba(0,0,0,0.4)",
        outlineWidth: 2
      },
      endpoint: "Dot",
      endpointStyle: { fill: "var(--sol-base01)", radius: 6 }
    });

    // ── Endpoints jsPlumb ───────────────────────────
    const SOCKET_STYLE = {
      fill: "#02161b",
      stroke: "#586e75",
      strokeWidth: 4,
    };
    const SOCKET_HOVER = {
      fill: "#02161b",
      stroke: "#2aa198",
      strokeWidth: 4,
    };

    this.leftItems.forEach((it) => {
      const el = this.container.querySelector(`[data-id="L_${it.id}"]`);
      if (!el) return;
      this.jsp.addEndpoint(el, {
        anchor: [ 1, 0.5, 1, 0.4 ],
        source: true,
        target: false,
        endpoint: { type: "Dot", options: { radius: 14 } },
        paintStyle: SOCKET_STYLE,
        hoverPaintStyle: SOCKET_HOVER,
        maxConnections: 1,
        connectionsDetachable: true,
        cssClass: "cabling-ep-left",
      });
    });

    this.rightItems.forEach((it) => {
      const el = this.container.querySelector(`[data-id="R_${it.id}"]`);
      if (!el) return;
      this.jsp.addEndpoint(el, {
        anchor: [ 0, 0.5, -1, 0.4 ],
        source: false,
        target: true,
        endpoint: { type: "Dot", options: { radius: 14 } },
        paintStyle: SOCKET_STYLE,
        hoverPaintStyle: SOCKET_HOVER,
        maxConnections: 1,
        connectionsDetachable: true,
        cssClass: "cabling-ep-right",
      });
    });

    // ── Événements jsPlumb ──────────────────────────

    // Empêcher les connexions invalides (même groupe)
    this.jsp.bind("beforeDrop", (info) => {
      if (this.validated) return false;
      const srcGroup = info.connection.source.dataset.group;
      const tgtGroup = info.dropEndpoint.element.dataset.group;
      return srcGroup !== tgtGroup;
    });

    // Connexion créée
    this.jsp.bind("connection", ({ source, target, connection }) => {
      const leftEl  = source.dataset.group === "left" ? source : target;
      const rightEl = source.dataset.group === "right" ? source : target;
      const lid = leftEl.dataset.srcId;
      const rid = rightEl.dataset.srcId;
      if (!lid || !rid) return;

      // Supprimer l'ancien câble si existant pour ce connecteur gauche
      const old = this._connMap.get(lid);
      if (old && old !== connection) {
        try { this.jsp.deleteConnection(old); } catch {}
      }
      this.connections[lid] = rid;
      this._connMap.set(lid, connection);

      // Couleur par index de la pill gauche (classe CSS data-color pour ciblage)
      const ci = this.leftItems.findIndex(it => it.id === lid);
      const colors = ["var(--sol-cyan)", "var(--sol-magenta)", "var(--sol-orange)", "var(--sol-violet)", "var(--sol-blue)"];
      const stroke = colors[ci % colors.length];
      connection.setPaintStyle({ 
        stroke, 
        strokeWidth: 4,
        outlineStroke: "rgba(0,0,0,0.3)",
        outlineWidth: 2
      });
      connection.setHoverPaintStyle({ 
        stroke: "var(--sol-yellow)", 
        strokeWidth: 5,
        outlineStroke: "rgba(0,0,0,0.4)",
        outlineWidth: 2
      });

      this._clearActive();
      this.onStateUpdate(this.getState());
    });

    // Connexion détruite
    this.jsp.bind("connectionDetached", ({ source, target }) => {
      const leftEl = source.dataset.group === "left" ? source : target;
      const lid = leftEl.dataset.srcId;
      if (lid) {
        delete this.connections[lid];
        this._connMap.delete(lid);
      }
      this.onStateUpdate(this.getState());
    });

    // ── Click-to-connect ────────────────────────────
    this.container.addEventListener("click", (e) => {
      if (this.validated) return;
      const pill = e.target.closest(".cabling-pill");
      if (!pill) return;

      const group  = pill.dataset.group;
      const srcId  = pill.dataset.srcId;

      if (!this.activeNode) {
        // Rien de sélectionné → sélectionner cette pill
        this._setActive(pill);
        return;
      }

      if (this.activeNode.srcId === srcId && this.activeNode.group === group) {
        // Même pill cliquée → désélectionner
        this._clearActive();
        return;
      }

      if (this.activeNode.group === group) {
        // Même groupe → déplacer la sélection
        this._setActive(pill);
        return;
      }

      // Groupes opposés → connecter
      const leftEl  = group === "right" ? this.activeNode.el : pill;
      const rightEl = group === "right" ? pill : this.activeNode.el;
      this._connectElements(leftEl, rightEl);
    });

    // ── Resizing ────────────────────────────────────
    this._resizeHandler = () => {
      if (this.jsp) {
        this.jsp.repaintEverything();
      }
    };
    window.addEventListener("resize", this._resizeHandler);
  }

  // ── Helpers DOM ───────────────────────────────────────────────────────────

  _makeColumn(side) {
    const col = document.createElement("div");
    col.className = `cabling-col cabling-col--${side}`;
    return col;
  }

  _makeMidColumn() {
    const mid = document.createElement("div");
    mid.style.cssText = "flex: 1 1 auto; min-width: 80px;";
    return mid;
  }

  _makePill(item, group, index) {
    const pill = document.createElement("div");
    pill.className = "cabling-pill";
    pill.dataset.id    = `${group === "left" ? "L" : "R"}_${item.id}`;
    pill.dataset.srcId = item.id;
    pill.dataset.group = group;
    pill.textContent   = item.label;
    return pill;
  }

  // ── Click-to-connect state ────────────────────────────────────────────────

  _setActive(pill) {
    this._clearActive();
    this.activeNode = { el: pill, srcId: pill.dataset.srcId, group: pill.dataset.group };
    pill.classList.add('is-active');
  }

  _clearActive() {
    if (this.activeNode?.el) {
      this.activeNode.el.classList.remove('is-active');
    }
    this.activeNode = null;
  }

  // ── Connexion programmatique ──────────────────────────────────────────────

  _connectElements(leftEl, rightEl) {
    if (!leftEl || !rightEl || !this.jsp) return;

    const lid = leftEl.dataset.srcId;
    const rid = rightEl.dataset.srcId;

    // Supprimer l'ancien câble du côté gauche s'il existe
    const oldLeft = this._connMap.get(lid);
    if (oldLeft) { try { this.jsp.deleteConnection(oldLeft); } catch {} }

    // Supprimer l'ancien câble du côté droit si déjà occupé
    for (const [l, conn] of this._connMap.entries()) {
      if (this.connections[l] === rid && l !== lid) {
        try { this.jsp.deleteConnection(conn); } catch {}
        delete this.connections[l];
        this._connMap.delete(l);
      }
    }

    // Créer la connexion — jsPlumb émettra "connection" qui met à jour l'état
    const leftEps  = this.jsp.getEndpoints(leftEl);
    const rightEps = this.jsp.getEndpoints(rightEl);
    if (leftEps.length && rightEps.length) {
      try {
        this.jsp.connect({ source: leftEps[0], target: rightEps[0] });
      } catch (err) {
        console.warn("jsPlumb connect error:", err);
      }
    }
  }

  // ── Spark particles ────────────────────────────────────────

  _addSparks(pillEl, side) {
    const containerRect = this.container.getBoundingClientRect();
    const pillRect      = pillEl.getBoundingClientRect();
    // Socket center relative to the cabling container
    const x = side === "right"
      ? pillRect.right  - containerRect.left
      : pillRect.left   - containerRect.left;
    const y = pillRect.top + pillRect.height / 2 - containerRect.top;

    const COUNT = 6;
    for (let i = 0; i < COUNT; i++) {
      const spark = document.createElement("span");
      spark.className = "cabling-spark";
      spark.style.left  = `${x}px`;
      spark.style.top   = `${y}px`;
      spark.style.setProperty("--angle", `${i * (360 / COUNT)}deg`);
      spark.style.animationDelay = `${(i * 0.1) % 0.6}s`;
      this.container.appendChild(spark);
      this._sparks.push(spark);
    }
  }

  // ── API publique ──────────────────────────────────────────────

  validate() {
    if (Object.keys(this.connections).length < this.leftItems.length) {
      return { status: "incomplete", ...this.getState() };
    }

    this.validated = true;

    // Ajouter les classes CSS de validation (couleur + animation gérées en CSS)
    for (const [lid, conn] of this._connMap.entries()) {
      const rid       = this.connections[lid];
      const item      = this.leftItems.find(it => it.id === lid);
      const isCorrect = item && rid === item.match;
      conn.removeClass("conn-active");
      conn.addClass(isCorrect ? "conn-correct" : "conn-incorrect");

      if (!isCorrect) {
        // Ajouter des étincelles aux deux extrémités de la connexion incorrecte
        const leftEl  = this.container.querySelector(`[data-src-id="${lid}"][data-group="left"]`);
        const rightEl = this.container.querySelector(`[data-src-id="${rid}"][data-group="right"]`);
        if (leftEl)  this._addSparks(leftEl,  "right");
        if (rightEl) this._addSparks(rightEl, "left");
      }
    }

    // Force le re-rendu SVG immédiat (sans nécessiter un hover)
    this.jsp.repaintEverything();

    // Lock pills visually
    this.container.querySelectorAll(".cabling-pill").forEach(el => {
      el.classList.add('is-validated');
    });

    return { status: "validated", ...this.getState() };
  }

  reset() {
    this.validated  = false;
    this._clearActive();

    if (this.jsp) {
      this._connMap.forEach(c => {
        c.removeClass("conn-correct conn-incorrect");
        try { this.jsp.deleteConnection(c); } catch {}
      });
    }

    this.connections = {};
    this._connMap.clear();

    // Supprimer les étincelles
    this._sparks.forEach(s => s.remove());
    this._sparks = [];

    // Restore pills
    this.container.querySelectorAll(".cabling-pill").forEach(el => {
      // Pour la version boutons (si style inline présent)
      if (el.style.cursor) {
        el.style.cursor      = "pointer";
        el.style.borderColor = "#586e75";
        el.style.color       = "#93a1a1";
      }
      // Pour la version levier (CSS-based)
      el.classList.remove('is-active', 'is-validated');
    });

    return { status: "hidden", ...this.getState() };
  }

  clearValidation() {
    this.validated  = false;
    this._clearActive();

    if (this.jsp) {
      this._connMap.forEach(c => {
        c.removeClass("conn-correct conn-incorrect");
      });
    }

    // Supprimer les étincelles
    this._sparks.forEach(s => s.remove());
    this._sparks = [];

    // Restore pills
    this.container.querySelectorAll(".cabling-pill").forEach(el => {
      // Pour la version boutons
      if (el.style.cursor) {
        el.style.cursor      = "pointer";
        el.style.borderColor = "#586e75";
        el.style.color       = "#93a1a1";
      }
      // Pour la version levier (CSS-based)
      el.classList.remove('is-active', 'is-validated');
    });

    return { status: "hidden", ...this.getState() };
  }

  getState() {
    let score = 0;
    this.leftItems.forEach(it => {
      if (this.connections[it.id] === it.match) score++;
    });
    return { score, total: this.leftItems.length, connections: { ...this.connections } };
  }

  destroy() {
    if (this._resizeHandler) {
      window.removeEventListener("resize", this._resizeHandler);
    }
    if (this.jsp) {
      this.jsp.destroy();
      this.jsp = null;
    }
  }
}

/**
 * 📊 RAM Columnar vs Row-oriented simulator rendered as a Force-Directed Graph.
 */
export function createRamStorageGraph(containerSelector, storageMode, queryCol, tableData = []) {
  const container = document.querySelector(containerSelector.startsWith('#') ? containerSelector : '#' + containerSelector);
  if (!container) {
    console.warn(`createRamStorageGraph: element ${containerSelector} not found.`);
    return null;
  }

  container.innerHTML = "";
  if (!tableData || tableData.length === 0) return null;

  const columns = Object.keys(tableData[0]);
  const nodes = [];
  const links = [];

  // Theme Colors Resolution (Safe for Canvas API)
  const colorHit = getThemeColor("--sol-green", "#859900");
  const colorMiss = getThemeColor("--sol-red", "#dc322f");
  const colorLoad = getThemeColor("--sol-blue", "#268bd2");
  const colorActive = getThemeColor("--sol-yellow", "#b58900");
  
  const colorPalette = [ colorHit, getThemeColor("--sol-orange", "#cb4b16"), colorLoad, getThemeColor("--sol-magenta", "#d33682") ];
  const colColors = {};
  columns.forEach((col, i) => colColors[col] = colorPalette[i % colorPalette.length]);

  // 1. Add CPU Node (Lowered to -80 for absolute vertical symmetry and canvas headroom)
  nodes.push({ id: "CPU", label: "CPU", val: "Processeur", type: "cpu", x: 0, y: -80, fx: 0, fy: -80 });

  // 2. Map physical addresses
  const addrMap = {};
  let addressIndex = 0;
  if (storageMode === "ligne") {
    tableData.forEach((row, r) => columns.forEach(col => {
      addrMap[`${r}_${col}`] = `0x${(addressIndex * 8).toString(16).toUpperCase().padStart(2, '0')}`;
      addressIndex++;
    }));
  } else {
    columns.forEach(col => tableData.forEach((row, r) => {
      addrMap[`${r}_${col}`] = `0x${(addressIndex * 8).toString(16).toUpperCase().padStart(2, '0')}`;
      addressIndex++;
    }));
  }

  // 3. Generate RAM nodes
  tableData.forEach((row, r) => {
    columns.forEach((col, c) => {
      const cellId = `${r}_${col}`;
      nodes.push({
        id: cellId, label: col, val: row[col], type: "ram", addr: addrMap[cellId],
        color: colColors[col],
        x: (c - (columns.length - 1) / 2) * 118, y: (r - 1) * 60 + 20,
        fx: (c - (columns.length - 1) / 2) * 118, fy: (r - 1) * 60 + 20
      });
    });
  });

  // 4. Build physical layout path & Pre-calculate Cache Status
  const physicalOrder = [];
  if (storageMode === "ligne") {
    tableData.forEach((row, r) => columns.forEach(col => physicalOrder.push(`${r}_${col}`)));
  } else {
    columns.forEach(col => tableData.forEach((row, r) => physicalOrder.push(`${r}_${col}`)));
  }

  // CPU Initial Load Wire
  links.push({
    id: `CPU->${physicalOrder[0]}`,
    source: nodes.find(n => n.id === "CPU"), 
    target: nodes.find(n => n.id === physicalOrder[0]),
    type: "physical", cacheLabel: "Load", cacheColor: colorLoad
  });

  // Inter-cell Wires
  for (let i = 0; i < physicalOrder.length - 1; i++) {
    const sourceId = physicalOrder[i];
    const targetId = physicalOrder[i + 1];
    
    let isHit = false;
    
    if (storageMode === "colonne") {
      // Extract column names (everything after the first underscore)
      const sourceCol = sourceId.substring(sourceId.indexOf('_') + 1);
      const targetCol = targetId.substring(targetId.indexOf('_') + 1);
      
      // It's only a Cache Hit if the CPU is reading contiguously within the SAME column
      isHit = (sourceCol === targetCol);
    }

    links.push({
      id: `${sourceId}->${targetId}`,
      source: nodes.find(n => n.id === sourceId), 
      target: nodes.find(n => n.id === targetId),
      type: "physical", 
      cacheLabel: isHit ? "Hit" : "Miss", 
      cacheColor: isHit ? colorHit : colorMiss
    });
  }

  // 5. Build State Sequence (Tracking current vs past links)
  const statesSequence = [];
  statesSequence.push({ activeNodes: new Set(["CPU"]), currentLinks: new Set(), pastLinks: new Set() });

  if (queryCol !== "Aucune" && columns.includes(queryCol)) {
    let accumulatedNodes = new Set(["CPU"]);
    let pastLinks = new Set();
    
    // Step 1: CPU Load
    const firstLinkId = `CPU->${physicalOrder[0]}`;
    accumulatedNodes.add(physicalOrder[0]);
    statesSequence.push({ activeNodes: new Set([...accumulatedNodes]), currentLinks: new Set([firstLinkId]), pastLinks: new Set([...pastLinks]) });
    pastLinks.add(firstLinkId);

    let hitCount = Array.from(accumulatedNodes).filter(id => id.endsWith(`_${queryCol}`)).length;
    
    // Step 2..N: Traverse Memory
    if (hitCount < tableData.length) {
      for (let i = 1; i < physicalOrder.length; i++) {
        const currentCellId = physicalOrder[i];
        const linkId = `${physicalOrder[i - 1]}->${currentCellId}`;
        
        accumulatedNodes.add(currentCellId);
        statesSequence.push({ activeNodes: new Set([...accumulatedNodes]), currentLinks: new Set([linkId]), pastLinks: new Set([...pastLinks]) });
        pastLinks.add(linkId);

        if (Array.from(accumulatedNodes).filter(id => id.endsWith(`_${queryCol}`)).length === tableData.length) break;
      }
    }
    
    // Final Step: Complete (All disabled style)
    statesSequence.push({ activeNodes: new Set([...accumulatedNodes]), currentLinks: new Set(), pastLinks: new Set([...pastLinks]) });
  }

  // 6. Initialize Graph & Draw Labels natively
  // 6. Extract Design Tokens from CSS to control Canvas styling
  const compStyle = getComputedStyle(container);
  const getNum = (varName, fallback) => parseFloat(compStyle.getPropertyValue(varName)) || fallback;
  const getStr = (varName, fallback) => {
    const rawVal = compStyle.getPropertyValue(varName).trim();
    return rawVal ? resolveCssValue(rawVal) : fallback;
  };

  const cfg = {
    nodeText: getStr('--canvas-node-text', '#fdf6e3'),
    nodeFont: getNum('--canvas-node-font-size', 14),
    addrFont: getNum('--canvas-addr-font-size', 9),
    nodePadX: getNum('--canvas-node-pad-x', 18),
    labelFont: getNum('--canvas-label-font-size', 12),
    labelBg: getStr('--canvas-label-bg', 'rgba(0, 43, 54, 0.9)'),
    wActive: getNum('--canvas-wire-width-active', 2.5),
    wPast: getNum('--canvas-wire-width-past', 1.5),
    wIdle: getNum('--canvas-wire-width-idle', 1),
    cPast: getStr('--canvas-wire-color-past', 'rgba(88, 110, 117, 0.5)'),
    cIdle: getStr('--canvas-wire-color-idle', 'rgba(88, 110, 117, 0.15)')
  };

  // 6. Initialize Graph via generalized renderGraph
  const graph = renderGraph(container, { nodes, links }, {
    manualCentering: true,
    cooldownTicks: 0,
    enableZoom: false,
    enablePan: false
  });

  graph
    .nodeCanvasObject((node, ctx, globalScale) => {
      const label = node.type === "cpu" ? "CPU: Processeur" : `${node.label}: ${node.val}`;
      const fontSize = cfg.nodeFont / globalScale;
      const fontMono = getThemeColor('--font-mono', 'monospace');
      ctx.font = `${fontSize}px ${fontMono}`;
      const textWidth = ctx.measureText(label).width;
      const bWidth = textWidth + cfg.nodePadX;
      const bHeight = fontSize * 2.5;

      const fillColor = node.type === "cpu" ? "#6c71c4" : node.color;
      
      if (node.isActive) {
        ctx.shadowColor = node.type === "cpu" ? "#6c71c4" : colorActive;
        ctx.shadowBlur = 12 / globalScale;
      } else ctx.shadowColor = "transparent";

      ctx.fillStyle = fillColor;
      ctx.strokeStyle = node.isActive ? colorActive : "transparent";
      ctx.lineWidth = node.isActive ? cfg.wActive : 0;

      drawRoundedRect(ctx, node.x - bWidth/2, node.y - bHeight/2, bWidth, bHeight, 5);
      ctx.fill();
      
      ctx.shadowColor = "transparent";
      if (node.isActive) ctx.stroke();

      ctx.fillStyle = cfg.nodeText;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, node.x, node.y - fontSize * 0.25);

      if (node.type !== "cpu") {
        const fontMono = getThemeColor('--font-mono', 'monospace');
        ctx.font = `${cfg.addrFont / globalScale}px ${fontMono}`;
        ctx.fillStyle = node.isActive ? colorActive : "rgba(253, 246, 227, 0.6)";
        ctx.fillText(node.addr, node.x, node.y + fontSize * 0.7);
      }
    })
    // 🎨 Link Styling via extracted generic helper
    setupGraphLinkStyling(graph, {
      wireWidthActive: cfg.wActive,
      wireWidthPast: cfg.wPast,
      wireWidthIdle: cfg.wIdle,
      wireColorActive: colorActive,
      wireColorPast: cfg.cPast,
      wireColorIdle: cfg.cIdle
    })
    .linkCurvature(0)
    
    // 🏷️ Draw Cache Hit / Miss Labels via generic helper
    setupGraphLinkLabelDrawing(graph, {
      labelFontSize: cfg.labelFont,
      labelBg: cfg.labelBg,
      fontFamily: getThemeColor('--font-mono', 'monospace')
    });

  // 7. Initialize State Engine via extracted helper
  runGraphStateMachine(container, graph, nodes, links, statesSequence, {
    interval: 1100,
    loop: true,
    startBtnId: "btn-ram-start"
  });

  return graph;
}

/**
 * 🏃 Reusable State Machine Runner for Graph animations
 * Animates node and link active/past states over time.
 * Can be imported and used as a standalone function in QMD.
 *
 * @param {HTMLElement|string} container - The DOM element or selector hosting the graph.
 * @param {Object} graph - The 2D ForceGraph instance.
 * @param {Array} nodes - The nodes dataset.
 * @param {Array} links - The links dataset.
 * @param {Array} statesSequence - The array of state payloads.
 * @param {Object} options - { interval: 1100, loop: true, startBtnId: 'btn-ram-start' }
 * @returns {StateMachine} The running StateMachine instance.
 */
export function runGraphStateMachine(container, graph, nodes, links, statesSequence, options = {}) {
  const containerEl = typeof container === 'string' 
    ? document.querySelector(container.startsWith('#') ? container : '#' + container) 
    : container;
  if (!containerEl) {
    console.warn("runGraphStateMachine: container element not found.");
    return null;
  }

  const { interval = 1100, loop = true, startBtnId = 'btn-ram-start' } = options;

  if (containerEl.__stateMachine) {
    containerEl.__stateMachine.stop();
  }

  const animationEngine = new StateMachine({
    states: statesSequence,
    interval: interval,
    loop: loop,
    onStateChange: (statePayload) => {
      nodes.forEach(n => n.isActive = statePayload.activeNodes.has(n.id));
      links.forEach(l => {
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;
        l.source = nodes.find(n => n.id === sourceId) || l.source;
        l.target = nodes.find(n => n.id === targetId) || l.target;
        
        const linkId = `${sourceId}->${targetId}`;
        l.isCurrent = statePayload.currentLinks.has(linkId);
        l.isPast = statePayload.pastLinks.has(linkId);
      });
      graph.graphData({ nodes: [...nodes], links: [...links] });
    }
  });

  containerEl.__stateMachine = animationEngine;

  let startBtn = document.getElementById(startBtnId);

  if (startBtn) {
    // Render the initial frame first (state 0) so the graph loads in a clean idle state
    if (statesSequence && statesSequence.length > 0) {
      animationEngine.onStateChange(statesSequence[0]);
    }
    
    startBtn.onclick = (e) => {
      e.preventDefault();
      animationEngine.reset();
      animationEngine.start();
    };
  } else {
    animationEngine.start();
  }

  return animationEngine;
}

/**
 * 📊 Generalized Graph Renderer
 * Renders a base force graph with robust canvas scaling, transparent background, and automatic resize observing.
 * Adheres to SRP (Single Responsibility Principle) by separating graph creation & lifecycle from specific state animations.
 *
 * @param {string|HTMLElement} containerSelector - Selector or DOM node where the graph is rendered
 * @param {Object} data - { nodes, links }
 * @param {Object} options - Custom style overrides (e.g., zoomPadding)
 * @returns {Object} The instantiated 2D ForceGraph
 */
export function renderGraph(containerSelector, data, options = {}) {
  const container = typeof containerSelector === 'string'
    ? document.querySelector(containerSelector.startsWith('#') ? containerSelector : '#' + containerSelector)
    : containerSelector;
  
  if (!container) {
    console.warn(`renderGraph: element ${containerSelector} not found.`);
    return null;
  }

  container.innerHTML = "";

  const {
    zoomPadding = 35,
    cooldownTicks = 0,
    enableZoom = false,
    enablePan = false,
    manualCentering = false
  } = options;

  // Initialize base ForceGraph
  const graph = createGraph(container, data, false);

  graph
    .backgroundColor('rgba(0,0,0,0)')
    .nodeRelSize(7)
    .cooldownTicks(cooldownTicks)
    .enableZoomInteraction(enableZoom)
    .enablePanInteraction(enablePan);

  // General Fix: Disable D3 forces for fixed-layout graphs (cooldownTicks === 0)
  // to prevent D3's default center force from shifting fixed coordinates off-center.
  if (cooldownTicks === 0) {
    graph.d3Force('center', null);
    graph.d3Force('charge', null);
    if (graph.d3Force('link')) {
      graph.d3Force('link').strength(0);
    }
  }

  // ResizeObserver for clean responsiveness and viewport matching
  const resizeObserver = new ResizeObserver(entries => {
    for (let entry of entries) {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        graph.width(w).height(h);
        
        if (manualCentering) {
          const fitDimension = Math.min(w, h);
          const dynamicZoom = fitDimension / 260; // 260px covers CPU bounds + padding
          graph.centerAt(0, 0, 0);
          graph.zoom(dynamicZoom, 0);
        } else {
          graph.zoomToFit(300, zoomPadding);
        }
      }
    }
  });

  resizeObserver.observe(container);
  
  // Multi-pass centering to guarantee fitment as canvas loads and fonts compute
  if (manualCentering) {
    setTimeout(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        const fitDimension = Math.min(w, h);
        const dynamicZoom = fitDimension / 260;
        graph.centerAt(0, 0, 0);
        graph.zoom(dynamicZoom, 0);
      }
    }, 50);
    setTimeout(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        const fitDimension = Math.min(w, h);
        const dynamicZoom = fitDimension / 260;
        graph.centerAt(0, 0, 0);
        graph.zoom(dynamicZoom, 0);
      }
    }, 250);
  } else {
    setTimeout(() => graph.zoomToFit(0, zoomPadding), 50);
    setTimeout(() => graph.zoomToFit(300, zoomPadding), 250);
  }

  // Store the resizeObserver on the container to avoid memory leaks/untracked handles
  if (container.__resizeObserver) {
    container.__resizeObserver.disconnect();
  }
  container.__resizeObserver = resizeObserver;

  return graph;
}

/**
 * 🏷️ Standard link label drawing configuration for Simulator Graphs
 * Renders labels on curved or straight lines using theme variables.
 *
 * @param {Object} graph - ForceGraph instance
 * @param {Object} style - { labelFontSize, labelBg, fontFamily, wireColorActive, wireColorPast }
 * @returns {Object} ForceGraph instance (for chaining)
 */
export function setupGraphLinkLabelDrawing(graph, style) {
  return graph
    .linkCanvasObjectMode(() => 'after')
    .linkCanvasObject((link, ctx, globalScale) => {
      const label = link.cacheLabel || link.label;
      if (!label) return;

      // RAM simulator specific visibility check
      if (link.cacheLabel && !link.isCurrent && !link.isPast) return;

      const start = link.source;
      const end = link.target;
      if (typeof start !== 'object' || typeof end !== 'object') return;

      // Calculate curved or straight midpoint
      const curvature = link.curvature !== undefined ? link.curvature : (graph.linkCurvature ? (typeof graph.linkCurvature === 'function' ? graph.linkCurvature(link) : graph.linkCurvature) : 0);
      let cx, cy;
      if (curvature === 0) {
        cx = start.x + (end.x - start.x) / 2;
        cy = start.y + (end.y - start.y) / 2;
      } else {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const mx = start.x + dx / 2;
        const my = start.y + dy / 2;
        const px = -dy * curvature;
        const py = dx * curvature;
        cx = mx + px * 0.5;
        cy = my + py * 0.5;
      }

      const fontSize = style.labelFontSize / globalScale;
      ctx.font = `bold ${fontSize}px ${style.fontFamily || 'monospace'}`;
      const textWidth = ctx.measureText(label).width;
      const pX = 5 / globalScale;
      const pY = 3 / globalScale;

      ctx.fillStyle = style.labelBg;
      drawRoundedRect(ctx, cx - textWidth/2 - pX, cy - fontSize/2 - pY, textWidth + pX*2, fontSize + pY*2, 3 / globalScale);
      ctx.fill();

      // Determine colors dynamically
      ctx.fillStyle = link.cacheColor || (link.isCurrent ? style.wireColorActive : (link.isPast ? style.wireColorPast : "rgba(147, 161, 161, 0.7)"));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy);
    });
}

/**
 * 🎨 Standard link, particle, and flow animation configuration for Simulator Graphs
 * Ensures consistent visual treatment of active, past, and idle states.
 *
 * @param {Object} graph - ForceGraph instance
 * @param {Object} style - { wireWidthActive, wireWidthPast, wireWidthIdle, wireColorActive, wireColorPast, wireColorIdle }
 * @returns {Object} ForceGraph instance (for chaining)
 */
export function setupGraphLinkStyling(graph, style) {
  return graph
    .linkWidth(link => link.isCurrent ? style.wireWidthActive : (link.isPast ? style.wireWidthPast : style.wireWidthIdle))
    .linkColor(link => link.isCurrent ? style.wireColorActive : (link.isPast ? style.wireColorPast : style.wireColorIdle))
    .linkLineDash(link => link.isCurrent ? null : [4, 4])
    .linkDirectionalParticles(link => link.isCurrent ? 3 : 0)
    .linkDirectionalParticleSpeed(0.015)
    .linkDirectionalParticleWidth(4.5)
    .linkDirectionalParticleColor(() => style.wireColorActive);
}


/**
 * 🤖 Render a Generic State Machine Graph and animate its execution
 * Renders states as nodes and transitions as directed links.
 * Styles elements dynamically using computed theme design tokens.
 *
 * @param {string|HTMLElement} containerSelector - Selector or DOM node where the graph is rendered
 * @param {Array} states - [{ id, label, val, x, y }]
 * @param {Array} transitions - [{ source, target, label }]
 * @param {Object} options - Custom style overrides & animation engine configurations
 */
export function renderStateMachine(containerSelector, states, transitions, options = {}) {
  const container = typeof containerSelector === 'string'
    ? document.querySelector(containerSelector.startsWith('#') ? containerSelector : '#' + containerSelector)
    : containerSelector;
  
  if (!container) {
    console.warn(`renderStateMachine: element ${containerSelector} not found.`);
    return null;
  }

  container.innerHTML = "";

  // Ensure the container has the generic state machine class for stylesheet tokens
  if (!container.classList.contains('state-machine-wrapper')) {
    container.classList.add('state-machine-wrapper');
  }

  const {
    interval = 1200,
    loop = true,
    startBtnId = null,
    sequence = null, // Custom playback order of state IDs, e.g. ['A', 'B', 'C']
  } = options;

  // 1. Build nodes & links representation
  const nodes = states.map(s => ({
    id: s.id,
    label: s.label || s.id,
    val: s.val || "",
    x: s.x,
    y: s.y,
    fx: s.x !== undefined ? s.x : null,
    fy: s.y !== undefined ? s.y : null
  }));

  const links = transitions.map(t => ({
    id: `${t.source}->${t.target}`,
    source: nodes.find(n => n.id === t.source) || t.source,
    target: nodes.find(n => n.id === t.target) || t.target,
    label: t.label || ""
  }));

  // 2. Build States Sequence for Playback
  const playbackSequence = sequence || states.map(s => s.id);
  const statesSequence = [];

  for (let i = 0; i < playbackSequence.length; i++) {
    const activeNodeId = playbackSequence[i];
    const currentLinks = new Set();
    const pastLinks = new Set();

    // The active link is the one leading to the current active node
    if (i > 0) {
      const prevNodeId = playbackSequence[i - 1];
      currentLinks.add(`${prevNodeId}->${activeNodeId}`);
      
      // All previous steps are marked as past links
      for (let j = 1; j < i; j++) {
        pastLinks.add(`${playbackSequence[j - 1]}->${playbackSequence[j]}`);
      }
    }

    statesSequence.push({
      activeNodes: new Set([activeNodeId]),
      currentLinks,
      pastLinks
    });
  }

  // Final idle/complete state if not looping
  if (statesSequence.length > 0 && !loop) {
    const lastActive = playbackSequence[playbackSequence.length - 1];
    const pastLinks = new Set();
    for (let j = 1; j < playbackSequence.length; j++) {
      pastLinks.add(`${playbackSequence[j - 1]}->${playbackSequence[j]}`);
    }
    statesSequence.push({
      activeNodes: new Set([lastActive]),
      currentLinks: new Set(),
      pastLinks
    });
  }

  // 3. Setup canvas styling properties from theme variables
  const compStyle = getComputedStyle(container);
  const getStr = (varName, fallback) => {
    const rawVal = compStyle.getPropertyValue(varName).trim();
    return rawVal ? resolveCssValue(rawVal) : fallback;
  };
  const getNum = (varName, fallback) => parseFloat(compStyle.getPropertyValue(varName)) || fallback;

  // Generic Style Object loaded dynamically with CSS variables as defaults
  const style = {
    shape: options.nodeShape || getStr('--sm-node-shape', 'rect'),
    nodeColorIdle: options.nodeColorIdle || getStr('--sm-node-color-idle', '#268bd2'),
    nodeColorActive: options.nodeColorActive || getStr('--sm-node-color-active', '#b58900'),
    nodeTextColor: options.nodeTextColor || getStr('--sm-node-text-color', '#fdf6e3'),
    nodePadX: options.nodePadX !== undefined ? options.nodePadX : getNum('--sm-node-pad-x', 16),
    nodeFontSize: options.nodeFontSize !== undefined ? options.nodeFontSize : getNum('--sm-node-font-size', 12),
    addrFontSize: options.addrFontSize !== undefined ? options.addrFontSize : getNum('--sm-addr-font-size', 9.5),
    
    wireWidthActive: options.wireWidthActive !== undefined ? options.wireWidthActive : getNum('--sm-wire-width-active', 3),
    wireWidthPast: options.wireWidthPast !== undefined ? options.wireWidthPast : getNum('--sm-wire-width-past', 1.5),
    wireWidthIdle: options.wireWidthIdle !== undefined ? options.wireWidthIdle : getNum('--sm-wire-width-idle', 1),
    
    wireColorActive: options.wireColorActive || getStr('--sm-wire-color-active', '#b58900'),
    wireColorPast: options.wireColorPast || getStr('--sm-wire-color-past', '#586e75'),
    wireColorIdle: options.wireColorIdle || getStr('--sm-wire-color-idle', 'rgba(88, 110, 117, 0.25)'),
    
    labelFontSize: options.labelFontSize !== undefined ? options.labelFontSize : getNum('--sm-label-font-size', 11),
    labelBg: options.labelBg || getStr('--sm-label-bg', 'rgba(0, 43, 54, 0.9)'),
    fontFamily: options.fontFamily || getThemeColor('--font-mono', 'monospace')
  };

  // 4. Initialize Graph via generalized renderGraph helper
  const graph = renderGraph(container, { nodes, links }, {
    zoomPadding: 55,
    cooldownTicks: 0,
    enableZoom: false,
    enablePan: false
  });

  graph
    .nodeCanvasObject((node, ctx, globalScale) => {
      const name = node.label;
      const desc = node.val;
      const fontSize = style.nodeFontSize / globalScale;
      ctx.font = `${fontSize}px ${style.fontFamily}`;
      
      // Node size calculations
      const nameWidth = ctx.measureText(name).width;
      const descWidth = desc ? ctx.measureText(desc).width : 0;
      const textWidth = Math.max(nameWidth, descWidth);
      
      const bWidth = textWidth + style.nodePadX;
      const bHeight = desc ? fontSize * 3.2 : fontSize * 2.2;

      // Glow when active
      if (node.isActive) {
        ctx.shadowColor = style.nodeColorActive;
        ctx.shadowBlur = 15 / globalScale;
      } else {
        ctx.shadowColor = "transparent";
      }

      ctx.fillStyle = node.isActive ? style.nodeColorActive : style.nodeColorIdle;
      ctx.strokeStyle = node.isActive ? style.nodeTextColor : "transparent";
      ctx.lineWidth = node.isActive ? 2 : 0;

      if (style.shape === 'circle') {
        const radius = Math.max(bWidth, bHeight) / 2;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
        ctx.fill();
        if (node.isActive) ctx.stroke();
      } else {
        drawRoundedRect(ctx, node.x - bWidth/2, node.y - bHeight/2, bWidth, bHeight, 6);
        ctx.fill();
        if (node.isActive) ctx.stroke();
      }

      // Reset shadow for text
      ctx.shadowColor = "transparent";

      // Text colors
      ctx.fillStyle = style.nodeTextColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (desc) {
        ctx.font = `bold ${fontSize}px ${style.fontFamily}`;
        ctx.fillText(name, node.x, node.y - fontSize * 0.5);
        ctx.font = `${style.addrFontSize / globalScale}px ${style.fontFamily}`;
        ctx.fillStyle = node.isActive ? style.nodeTextColor : "rgba(253, 246, 227, 0.7)";
        ctx.fillText(desc, node.x, node.y + fontSize * 0.7);
      } else {
        ctx.font = `bold ${fontSize}px ${style.fontFamily}`;
        ctx.fillText(name, node.x, node.y);
      }
    })
    
    // Links styling via extracted generic helper
    setupGraphLinkStyling(graph, style)
    .linkCurvature(0.2) // Beautiful curved arrows for state transitions
    .linkDirectionalArrowLength(6)
    .linkDirectionalArrowRelPos(0.95)
    .linkDirectionalArrowColor(link => link.isCurrent ? style.wireColorActive : (link.isPast ? style.wireColorPast : style.wireColorIdle))

    // Render Event / Transition Labels via generic helper
    setupGraphLinkLabelDrawing(graph, style);

  // Playback execution using the exported state machine helper
  runGraphStateMachine(container, graph, nodes, links, statesSequence, {
    interval,
    loop,
    startBtnId
  });

  return graph;
}