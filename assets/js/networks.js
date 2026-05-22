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
 */
export function createCabling(containerId, leftItems, rightItems, onStateUpdate) {
  return new CablingManager(containerId, leftItems, rightItems, onStateUpdate);
}

class CablingManager {
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
 * 🔄 Generic State Machine Force-Directed Graph Renderer
 * Highly parameterizable, DRY, SRP-compliant 2D graph visualizer.
 * Displays state machine steps, highlights traversed (past), active (current),
 * and untraversed (default) nodes and links with visual tokens (glow, colors, flow particles).
 *
 * @param {HTMLElement|string} container - Target DOM element or CSS selector.
 * @param {Object} graphData - { nodes, links } data array.
 * @param {Object} customOptions - Parameters to customize style, size, and callbacks.
 * @returns {Object} The ForceGraph instance.
 */
export function renderStateMachineGraph(container, graphData, customOptions = {}) {
  // 1. Resolve container element
  const targetEl = typeof container === "string" ? document.querySelector(container) : container;
  if (!targetEl) {
    console.warn("renderStateMachineGraph: Target container not found.", container);
    return null;
  }

  // Clear previous instance or contents to avoid OJS duplicate rendering
  targetEl.innerHTML = "";

  // 2. Build configuration with robust defaults (curated Solarized Dark palette tokens)
  const defaultStyles = {
    default: {
      nodeBg: "var(--sol-base3)",       // Light base fallback
      nodeBorder: "var(--sol-base01)",  // Muted gray
      nodeText: "var(--sol-base00)",    // Dark gray text
      linkStroke: "var(--sol-base1)",
      linkText: "var(--sol-base01)",
      particles: 0,
      particleColor: "var(--sol-base1)",
      particleWidth: 2,
      particleSpeed: 0.01
    },
    past: {
      nodeBg: "var(--sol-base2)",
      nodeBorder: "var(--sol-green)",    // Solarized Green
      nodeText: "var(--sol-green)",
      linkStroke: "var(--sol-green)",
      linkText: "var(--sol-green)",
      particles: 1,                      // Slow flow particles showing traversed paths
      particleColor: "var(--sol-green)",
      particleWidth: 3,
      particleSpeed: 0.015
    },
    current: {
      nodeBg: "var(--sol-base2)",
      nodeBorder: "var(--sol-yellow)",   // Solarized Yellow (active)
      nodeText: "var(--sol-yellow)",
      linkStroke: "var(--sol-yellow)",
      linkText: "var(--sol-yellow)",
      particles: 4,                      // Fast pulsing flow particles
      particleColor: "var(--sol-yellow)",
      particleWidth: 4,
      particleSpeed: 0.03
    },
    entry: {
      nodeBg: "rgba(38, 139, 210, 0.15)", // Semi-transparent blue for entry node
      nodeBorder: "var(--sol-blue)",      // Solarized Blue
      nodeText: "var(--sol-blue)",
      linkStroke: "var(--sol-base1)",
      linkText: "var(--sol-base01)",
      particles: 0,
      particleColor: "var(--sol-base1)",
      particleWidth: 2,
      particleSpeed: 0.01
    }
  };

  const options = {
    nodeRadius: 16,
    nodeBorderWidth: 2,
    fontSize: 10,
    fontFamily: "var(--font-code, Consolas, monospace)",
    linkWidth: 2,
    linkArrowLength: 6,
    cooldownTicks: 120,
    enableZoom: true,
    enablePan: true,
    enableDrag: true,
    zoomToFit: false,
    zoomToFitPadding: 50,
    getNodeStatus: (node) => node.status || "default",
    getLinkStatus: (link) => link.status || "default",
    getNodeLabel: (node) => node.label || node.id,
    getLinkLabel: (link) => link.label || "",
    onNodeClick: null,
    styles: {},
    ...customOptions
  };

  // Deep merge style states
  const styles = {};
  for (const state of ["default", "past", "current", "entry"]) {
    styles[state] = {
      ...defaultStyles[state],
      ...(options.styles[state] || {})
    };
  }

  // Helper to resolve CSS variables at runtime
  const resolveColor = (colorStr, fallback) => {
    return resolveCssValue(colorStr) || fallback;
  };

  // 3. Initialize ForceGraph
  const graph = ForceGraph()(targetEl)
    .graphData(graphData)
    .cooldownTicks(options.cooldownTicks)
    .enableZoomInteraction(options.enableZoom)
    .enablePanInteraction(options.enablePan)
    .enableNodeDrag(options.enableDrag)
    .linkDirectionalArrowLength(options.linkArrowLength)
    .linkDirectionalArrowRelPos(1); // Position arrow at the end of the link

  // Set graph size if requested
  if (options.width) graph.width(options.width);
  if (options.height) graph.height(options.height);

  // Link basic properties
  graph
    .linkColor((link) => {
      const status = options.getLinkStatus(link);
      const style = styles[status] || styles.default;
      return resolveColor(style.linkStroke, "#586e75");
    })
    .linkWidth((link) => {
      const status = options.getLinkStatus(link);
      return status === "current" ? options.linkWidth * 1.5 : options.linkWidth;
    })
    .linkDirectionalArrowColor((link) => {
      const status = options.getLinkStatus(link);
      const style = styles[status] || styles.default;
      return resolveColor(style.linkStroke, "#586e75");
    });

  // Dynamic flow particles based on link status
  graph
    .linkDirectionalParticles((link) => {
      const status = options.getLinkStatus(link);
      const style = styles[status] || styles.default;
      return style.particles || 0;
    })
    .linkDirectionalParticleColor((link) => {
      const status = options.getLinkStatus(link);
      const style = styles[status] || styles.default;
      return resolveColor(style.particleColor, "#2aa198");
    })
    .linkDirectionalParticleWidth((link) => {
      const status = options.getLinkStatus(link);
      const style = styles[status] || styles.default;
      return style.particleWidth || 2;
    })
    .linkDirectionalParticleSpeed((link) => {
      const status = options.getLinkStatus(link);
      const style = styles[status] || styles.default;
      return style.particleSpeed || 0.01;
    });

  // 4. Custom Node Drawing: nodeCanvasObject
  // Draws high-fidelity, polished nodes with dynamic halos for the active state
  graph.nodeCanvasObject((node, ctx, globalScale) => {
    const status = options.getNodeStatus(node);
    const style = styles[status] || styles.default;
    
    const nodeBg = resolveColor(style.nodeBg, "#eee8d5");
    const nodeBorder = resolveColor(style.nodeBorder, "#586e75");
    const nodeText = resolveColor(style.nodeText, "#657b83");
    
    const r = options.nodeRadius;

    ctx.save();

    // Pulse effect for the 'current' active node using system clock
    if (status === "current") {
      const pulseFactor = 1 + 0.1 * Math.sin(Date.now() / 150);
      const glowRadius = r * pulseFactor;

      // Outer glowing halo
      ctx.beginPath();
      ctx.arc(node.x, node.y, glowRadius + 4, 0, 2 * Math.PI, false);
      ctx.fillStyle = utils.rgba(nodeBorder, 0.15);
      ctx.fill();

      // Shadow config for 3D look
      ctx.shadowColor = nodeBorder;
      ctx.shadowBlur = 15;
    }

    // Opaque background backing circle to hide the link lines underneath
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
    ctx.fillStyle = resolveColor("var(--sol-base3)", "#fdf6e3");
    ctx.fill();

    // Main Circle Background (Status-based, could be semi-transparent)
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
    ctx.fillStyle = nodeBg;
    ctx.fill();

    // Node Border
    ctx.lineWidth = options.nodeBorderWidth / Math.min(1, globalScale); // Keep border crisp
    ctx.strokeStyle = nodeBorder;
    ctx.stroke();

    // Text Label inside Node
    const label = options.getNodeLabel(node);
    if (label) {
      const fSize = options.fontSize;
      ctx.font = `bold ${fSize}px ${options.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = nodeText;
      
      // Handle multiline labels or truncation if required
      const maxTextWidth = r * 1.8;
      let text = label;
      
      // Simple intelligent truncation inside the circle
      let textWidth = ctx.measureText(text).width;
      if (textWidth > maxTextWidth) {
        while (text.length > 3 && textWidth > maxTextWidth) {
          text = text.slice(0, -1);
          textWidth = ctx.measureText(text + "…").width;
        }
        text = text + "…";
      }
      ctx.fillText(text, node.x, node.y);
    }

    ctx.restore();
  });

  // 5. Custom Link Labels in 'after' mode
  // Renders beautiful, centered labels along the links with a solid background pill
  const hasLinkLabels = graphData.links.some(l => options.getLinkLabel(l));
  if (hasLinkLabels) {
    graph.linkCanvasObjectMode(() => "after");
    graph.linkCanvasObject((link, ctx, globalScale) => {
      const label = options.getLinkLabel(link);
      if (!label) return;

      const status = options.getLinkStatus(link);
      const style = styles[status] || styles.default;
      const linkText = resolveColor(style.linkText, "#657b83");
      const labelBg = resolveColor("var(--sol-base3)", "#fdf6e3"); // Clean pill background

      const { source, target } = link;
      if (typeof source !== "object" || typeof target !== "object") return; // Position safety

      // Midpoint coordinate calculations
      const x = source.x + (target.x - source.x) * 0.5;
      const y = source.y + (target.y - source.y) * 0.5;

      ctx.save();
      
      const fSize = Math.max(4, options.fontSize - 1);
      ctx.font = `${fSize}px ${options.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const textWidth = ctx.measureText(label).width;
      const paddingX = 4;
      const paddingY = 2;
      const rectW = textWidth + paddingX * 2;
      const rectH = fSize + paddingY * 2;

      // Draw standard curved/rounded background pill to avoid overlap mess
      ctx.fillStyle = labelBg;
      ctx.strokeStyle = resolveColor(style.linkStroke, "#586e75");
      ctx.lineWidth = 1;
      
      drawRoundedRect(
        ctx, 
        x - rectW / 2, 
        y - rectH / 2, 
        rectW, 
        rectH, 
        rectH / 2
      );
      ctx.fill();
      ctx.stroke();

      // Centered label text inside pill
      ctx.fillStyle = linkText;
      ctx.fillText(label, x, y);

      ctx.restore();
    });
  }

  // Handle Node Selection / Interaction Callback
  if (options.onNodeClick) {
    graph.onNodeClick((node, event) => {
      options.onNodeClick(node, event);
    });
  }

  // Auto zoom-to-fit to keep all states visible in the viewport
  if (options.zoomToFit) {
    setTimeout(() => {
      try {
        graph.zoomToFit(400, options.zoomToFitPadding);
      } catch (err) {
        console.warn("zoomToFit error:", err);
      }
    }, 150);
  }

  // Return the instance so that external wrappers can manipulate layout
  return graph;
}


