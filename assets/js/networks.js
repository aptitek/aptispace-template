// ==========================================
// networks.js - Composants de Réseaux et de Graphes
// ==========================================
import ForceGraph from "https://esm.sh/force-graph";
import ForceGraph3D from "https://esm.sh/3d-force-graph";
import SpriteText from "https://esm.sh/three-spritetext";
import TagCloud from "https://esm.sh/TagCloud";
import { getThemeColor, utils, StateMachine } from "./core.js";

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
 * 📊 RAM Columnar vs Row-oriented simulator rendered as a Force-Directed Graph.
 */
export function createRamStorageGraph(containerSelector, storageMode, queryCol) {
  const container = document.querySelector(containerSelector.startsWith('#') ? containerSelector : '#' + containerSelector);
  if (!container) {
    console.warn(`createRamStorageGraph: element ${containerSelector} not found.`);
    return null;
  }

  // Clear previous instance to prevent overlapping canvases
  container.innerHTML = "";

  // The actual data columns to process (excluding the ID index column)
  const tableData = [
    { Age: 25, Salaire: "50k" },
    { Age: 30, Salaire: "60k" },
    { Age: 28, Salaire: "55k" }
  ];

  const nodes = [];
  const links = [];

  // 1. Add CPU Node
  nodes.push({
    id: "CPU",
    label: "CPU",
    val: "Processeur",
    type: "cpu",
    x: 0,
    y: -110,
    fx: 0,
    fy: -110
  });

  const columns = ["Age", "Salaire"];
  const colLabels = ["Âge", "Salaire"];
  const colColors = {
    "Age": "#859900",      // green
    "Salaire": "#cb4b16"   // orange
  };

  // 2. Map physical addresses based on storage mode (excluding index column ID)
  const addrMap = {};
  if (storageMode === "ligne") {
    let index = 0;
    tableData.forEach((row, r) => {
      columns.forEach(col => {
        addrMap[`${r}_${col}`] = `0x${(index * 8).toString(16).toUpperCase().padStart(2, '0')}`;
        index++;
      });
    });
  } else {
    let index = 0;
    columns.forEach(col => {
      tableData.forEach((row, r) => {
        addrMap[`${r}_${col}`] = `0x${(index * 8).toString(16).toUpperCase().padStart(2, '0')}`;
        index++;
      });
    });
  }

  // 3. Generate RAM nodes in a structured 2x3 layout (excluding index ID)
  tableData.forEach((row, r) => {
    columns.forEach((col, c) => {
      const cellId = `${r}_${col}`;
      const colLabel = colLabels[c];
      
      nodes.push({
        id: cellId,
        label: colLabel,
        val: row[col],
        type: "ram",
        addr: addrMap[cellId],
        color: colColors[col],
        x: (c - 0.5) * 118,
        y: (r - 1) * 60 + 20,
        fx: (c - 0.5) * 118,
        fy: (r - 1) * 60 + 20
      });
    });
  });

  // 4. Connect physical layout path
  const physicalOrder = [];
  if (storageMode === "ligne") {
    tableData.forEach((row, r) => {
      columns.forEach(col => {
        physicalOrder.push(`${r}_${col}`);
      });
    });
  } else {
    columns.forEach(col => {
      tableData.forEach((row, r) => {
        physicalOrder.push(`${r}_${col}`);
      });
    });
  }

  for (let i = 0; i < physicalOrder.length - 1; i++) {
    links.push({
      id: `${physicalOrder[i]}->${physicalOrder[i + 1]}`,
      source: physicalOrder[i],
      target: physicalOrder[i + 1],
      type: "physical",
      color: "rgba(88, 110, 117, 0.2)",
      width: 1.5,
      dashed: true
    });
  }

  // 5. Connect active CPU access trajectory
  if (queryCol !== "Aucune") {
    const colIndex = colLabels.indexOf(queryCol);
    const colName = columns[colIndex];
    const activeColor = colColors[colName];

    // Access CPU -> First Element
    links.push({
      id: `CPU->0_${colName}`,
      source: "CPU",
      target: `0_${colName}`,
      type: "cpu-access",
      color: activeColor,
      width: 4
    });

    // Element jumps (contiguous or non-contiguous depending on storage mode)
    for (let r = 0; r < tableData.length - 1; r++) {
      const isContiguous = (storageMode === "colonne");
      
      links.push({
        id: `${r}_${colName}->${r + 1}_${colName}`,
        source: `${r}_${colName}`,
        target: `${r + 1}_${colName}`,
        type: "cpu-access",
        color: isContiguous ? "#859900" : "#dc322f", // green (Hit) vs red (Miss)
        width: 4
      });
    }
  }

  // 6. Build the animation states sequence for our generic StateMachine
  const statesSequence = [];
  
  // State 0: CPU Active / Idle
  statesSequence.push({
    activeNodes: new Set(["CPU"]),
    activeLinks: new Set([])
  });

  if (queryCol !== "Aucune") {
    const colIndex = colLabels.indexOf(queryCol);
    const colName = columns[colIndex];
    
    // State 1: Traversing CPU -> First Node
    statesSequence.push({
      activeNodes: new Set(["CPU"]),
      activeLinks: new Set([`CPU->0_${colName}`])
    });

    // State 2: First Node Reached
    statesSequence.push({
      activeNodes: new Set(["CPU", `0_${colName}`]),
      activeLinks: new Set([`CPU->0_${colName}`])
    });

    // State 3: Traversing First Node -> Second Node
    statesSequence.push({
      activeNodes: new Set(["CPU", `0_${colName}`]),
      activeLinks: new Set([`CPU->0_${colName}`, `0_${colName}->1_${colName}`])
    });

    // State 4: Second Node Reached
    statesSequence.push({
      activeNodes: new Set(["CPU", `0_${colName}`, `1_${colName}`]),
      activeLinks: new Set([`CPU->0_${colName}`, `0_${colName}->1_${colName}`])
    });

    // State 5: Traversing Second Node -> Third Node
    statesSequence.push({
      activeNodes: new Set(["CPU", `0_${colName}`, `1_${colName}`]),
      activeLinks: new Set([`CPU->0_${colName}`, `0_${colName}->1_${colName}`, `1_${colName}->2_${colName}`])
    });

    // State 6: Third Node Reached / Sequence Complete
    statesSequence.push({
      activeNodes: new Set(["CPU", `0_${colName}`, `1_${colName}`, `2_${colName}`]),
      activeLinks: new Set([`CPU->0_${colName}`, `0_${colName}->1_${colName}`, `1_${colName}->2_${colName}`])
    });
  }

  const width = container.clientWidth || 700;
  const height = container.clientHeight || 380;

  const graph = createGraph(container, { nodes, links }, false);

  // Set explicit canvas dimensions to prevent CSS scaling/stretching, preserving 1:1 aspect ratio
  graph
    .width(width)
    .height(height)
    .nodeRelSize(7)
    .nodeCanvasObject((node, ctx, globalScale) => {
      const label = node.type === "cpu" ? "CPU: Processeur" : `${node.label}: ${node.val}`;
      const fontSize = 11.5 / globalScale;
      ctx.font = `${fontSize}px var(--font-mono, monospace)`;
      const textWidth = ctx.measureText(label).width;
      const padding = 7;
      const bWidth = textWidth + padding * 2;
      const bHeight = fontSize * 2.5;

      let fillColor = "";
      let strokeColor = "";
      
      // Node lighting: "full colors no borders unless active then neon borders/aura"
      if (node.type === "cpu") {
        fillColor = node.isActive ? "#6c71c4" : "rgba(108, 113, 196, 0.4)";
        strokeColor = node.isActive ? "var(--sol-yellow)" : "transparent";
      } else {
        fillColor = node.isActive ? node.color : utils.rgba(node.color, 0.45);
        strokeColor = node.isActive ? "var(--sol-yellow)" : "transparent";
      }

      // Neon aura/glow shadow only when active
      if (node.isActive) {
        ctx.shadowColor = node.type === "cpu" ? "#6c71c4" : "var(--sol-yellow)";
        ctx.shadowBlur = 12 / globalScale;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      } else {
        ctx.shadowColor = "transparent";
      }

      ctx.fillStyle = fillColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = node.isActive ? 2.5 : 0; // border strictly when active

      drawRoundedRect(ctx, node.x - bWidth/2, node.y - bHeight/2, bWidth, bHeight, 5);
      ctx.fill();
      
      // Reset shadows before drawing borders and text
      ctx.shadowColor = "transparent";
      if (node.isActive) {
        ctx.stroke();
      }

      // Text color: base3 (#fdf6e3)
      ctx.fillStyle = "#fdf6e3";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, node.x, node.y - fontSize * 0.25);

      if (node.type !== "cpu") {
        ctx.font = `${8 / globalScale}px var(--font-mono, monospace)`;
        ctx.fillStyle = node.isActive ? "var(--sol-yellow)" : "rgba(253, 246, 227, 0.6)"; // slightly dimmer base3 address text
        ctx.fillText(node.addr, node.x, node.y + fontSize * 0.7);
      }
    })
    .linkWidth(link => {
      if (link.type === "physical") return 1.5;
      return link.isActive ? 4.5 : 1.5;
    })
    .linkColor(link => {
      if (link.type === "physical") return link.color;
      return link.isActive ? link.color : "rgba(88, 110, 117, 0.08)";
    })
    .linkLineDash(link => link.dashed ? [4, 4] : null)
    .linkCurvature(link => {
      if (link.type === "physical") return 0.08;
      // Arched curves for cell access jumps, straight line from CPU
      return link.source.id === "CPU" ? 0 : 0.35;
    })
    .linkDirectionalArrowLength(link => (link.type === "cpu-access" && link.isActive) ? 5 : 0)
    .linkDirectionalArrowRelPos(0.95)
    .linkDirectionalParticles(link => (link.type === "cpu-access" && link.isActive) ? 2 : 0)
    .linkDirectionalParticleSpeed(0.015)
    .linkDirectionalParticleWidth(4.5);

  // Lock zoom, pan, and disable user interaction to keep the visualizer static and clean
  graph
    .cooldownTicks(0)
    .enableZoomInteraction(false)
    .enablePanInteraction(false);

  // Automatically center and scale all nodes to fit perfectly with a comfortable margins/padding
  setTimeout(() => {
    graph.zoomToFit(0, 65);
  }, 60);

  // 7. Initialize and start the generic StateMachine engine
  // Clean up any existing state machine on this container to avoid interval/memory leaks
  if (container.__stateMachine) {
    container.__stateMachine.stop();
  }

  const animationEngine = new StateMachine({
    states: statesSequence,
    interval: 900,
    loop: true,
    onStateChange: (statePayload) => {
      // Sync sets for nodeCanvasObject and links accessors
      nodes.forEach(n => {
        n.isActive = statePayload.activeNodes.has(n.id);
      });
      links.forEach(l => {
        // Resolve link ID
        const srcId = typeof l.source === 'object' ? l.source.id : l.source;
        const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
        l.isActive = statePayload.activeLinks.has(`${srcId}->${tgtId}`);
      });
      // Request smooth, hardware-accelerated redraw frame by updating graphData references
      graph.graphData({ nodes, links });
    }
  });

  container.__stateMachine = animationEngine;
  animationEngine.start();

  // 8. Inject custom start button on the far right of the tabset bar
  const navTabs = document.querySelector(".ram-storage-tabset .nav-tabs");
  if (navTabs && !navTabs.querySelector(".ram-start-btn")) {
    const btnContainer = document.createElement("li");
    btnContainer.className = "nav-item ram-start-btn";
    btnContainer.style.marginLeft = "auto";
    btnContainer.style.display = "flex";
    btnContainer.style.alignItems = "center";
    btnContainer.style.paddingRight = "12px";

    const startBtn = document.createElement("button");
    startBtn.className = "btn btn-outline-warning btn-sm fw-bold";
    startBtn.innerHTML = "<i class='bi bi-play-fill'></i> Lancer Simulation";
    startBtn.style.fontSize = "0.78rem";
    startBtn.style.padding = "3px 12px";
    startBtn.style.borderRadius = "20px";
    startBtn.style.borderColor = "var(--sol-yellow, #b58900)";
    startBtn.style.color = "var(--sol-yellow, #b58900)";
    startBtn.style.background = "transparent";
    startBtn.style.transition = "all 0.2s ease-in-out";
    startBtn.style.cursor = "pointer";

    // Hover dynamics matching Solarized theme highlights
    startBtn.onmouseenter = () => {
      startBtn.style.background = "rgba(181, 137, 0, 0.12)";
      startBtn.style.boxShadow = "0 0 10px rgba(181, 137, 0, 0.4)";
    };
    startBtn.onmouseleave = () => {
      startBtn.style.background = "transparent";
      startBtn.style.boxShadow = "none";
    };

    startBtn.onclick = (e) => {
      e.preventDefault();
      if (container.__stateMachine) {
        container.__stateMachine.reset();
        container.__stateMachine.start();
      }
    };

    btnContainer.appendChild(startBtn);
    navTabs.appendChild(btnContainer);
  }

  return graph;
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
