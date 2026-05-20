// ==========================================
// networks.js - Composants de Réseaux et de Graphes
// ==========================================
import ForceGraph from "https://esm.sh/force-graph";
import ForceGraph3D from "https://esm.sh/3d-force-graph";
import SpriteText from "https://esm.sh/three-spritetext";
import TagCloud from "https://esm.sh/TagCloud";
import { getThemeColor, utils } from "./core.js"; // Import de getThemeColor et de utils

const SOL_FALLBACKS = {
  base03: "#002b36", base02: "#073642", base01: "#586e75", base00: "#657b83",
  base0: "#839496", base1: "#93a1a1", base2: "#eee8d5", base3: "#fdf6e3",
  yellow: "#b58900", orange: "#cb4b16", red: "#dc322f", magenta: "#d33682",
  violet: "#6c71c4", blue: "#268bd2", cyan: "#2aa198", green: "#859900"
};

/**
 * 🕸️ Tracé de Réseau 2D ou 3D (Force-Directed Graph)
 */
export function renderGraph(container, graphData, is3D = false) {
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
 * ☁️ Nuage de Mots 3D interactif
 */
export function renderWordCloud3D(containerSelector, words, options = {}) {
  const container = document.querySelector('#' + containerSelector);
  if (!container) {
    console.warn(`Conteneur #${containerSelector} introuvable pour le WordCloud.`);
    return null;
  }

  // Sécurité OJS : vider le conteneur avant de re-rendre pour éviter les doublons
  container.innerHTML = "";

  //TODO: Add colors

  // Options par défaut fusionnées avec les options personnalisées
  const finalOptions = {
    radius: 100,
    maxSpeed: 'normal',
    initSpeed: 'normal',
    keep: true, // Garde la rotation active quand la souris sort
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
      connector: { type: "Bezier", options: { curviness: 70 } },
      paintStyle: { stroke: "#2aa198", strokeWidth: 3 },
      hoverPaintStyle: { stroke: "#b58900", strokeWidth: 4 },
      endpointStyle: { fill: "#2aa198", radius: 8 },
      endpointHoverStyle: { fill: "#b58900" },
    });

    // ── Endpoints jsPlumb ───────────────────────────
    this.leftItems.forEach((it) => {
      const el = this.container.querySelector(`[data-id="L_${it.id}"]`);
      if (!el) return;
      this.jsp.addEndpoint(el, {
        anchor: "Right",
        source: true,
        target: false,
        endpoint: { type: "Dot", options: { radius: 9 } },
        maxConnections: 1,
        connectionsDetachable: true,
        cssClass: "cabling-ep-left",
      });
    });

    this.rightItems.forEach((it) => {
      const el = this.container.querySelector(`[data-id="R_${it.id}"]`);
      if (!el) return;
      this.jsp.addEndpoint(el, {
        anchor: "Left",
        source: false,
        target: true,
        endpoint: { type: "Dot", options: { radius: 9 } },
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

      // Couleur par index de la pill gauche
      const ci = this.leftItems.findIndex(it => it.id === lid);
      const colors = ["#2aa198","#d33682","#cb4b16","#6c71c4","#268bd2"];
      const stroke = colors[ci % colors.length];
      connection.setPaintStyle({ stroke, strokeWidth: 3 });
      connection.setHoverPaintStyle({ stroke: "#b58900", strokeWidth: 4 });

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
  }

  // ── Helpers DOM ───────────────────────────────────────────────────────────

  _makeColumn(side) {
    const col = document.createElement("div");
    col.className = `cabling-col cabling-col--${side}`;
    col.style.cssText = `
      display: flex; flex-direction: column; gap: 16px;
      flex: 0 0 auto; width: 220px;
      ${side === "left" ? "align-items: flex-end;" : "align-items: flex-start;"}
    `;
    return col;
  }

  _makeMidColumn() {
    const mid = document.createElement("div");
    mid.style.cssText = "flex: 1 1 auto; min-width: 80px;";
    return mid;
  }

  _makePill(item, group, index) {
    const colors = ["#2aa198","#d33682","#cb4b16","#6c71c4","#268bd2"];
    const accent = colors[group === "left" ? index : 0];

    const pill = document.createElement("div");
    pill.className = "cabling-pill";
    pill.dataset.id    = `${group === "left" ? "L" : "R"}_${item.id}`;
    pill.dataset.srcId = item.id;
    pill.dataset.group = group;
    pill.textContent   = item.label;
    pill.style.cssText = `
      padding: 10px 18px;
      border-radius: 8px;
      background: #073642;
      color: #93a1a1;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      user-select: none;
      border: 2px solid #586e75;
      transition: border-color 0.2s, box-shadow 0.2s, color 0.2s;
      max-width: 210px;
      text-align: ${group === "left" ? "right" : "left"};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      position: relative;
    `;

    // Hover visuel
    pill.addEventListener("mouseenter", () => {
      if (!this.validated) {
        pill.style.borderColor = "#b58900";
        pill.style.color = "#fdf6e3";
      }
    });
    pill.addEventListener("mouseleave", () => {
      if (!this.validated && this.activeNode?.el !== pill) {
        pill.style.borderColor = this.activeNode?.el === pill ? "#b58900" : "#586e75";
        pill.style.color = "#93a1a1";
      }
    });

    return pill;
  }

  // ── Click-to-connect state ────────────────────────────────────────────────

  _setActive(pill) {
    this._clearActive();
    this.activeNode = { el: pill, srcId: pill.dataset.srcId, group: pill.dataset.group };
    pill.style.borderColor = "#b58900";
    pill.style.boxShadow   = "0 0 0 3px rgba(181,137,0,0.35)";
    pill.style.color       = "#b58900";
  }

  _clearActive() {
    if (this.activeNode?.el) {
      this.activeNode.el.style.borderColor = "#586e75";
      this.activeNode.el.style.boxShadow   = "";
      this.activeNode.el.style.color       = "#93a1a1";
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

  // ── API publique (appelée depuis le QMD) ──────────────────────────────────

  validate() {
    if (Object.keys(this.connections).length < this.leftItems.length) {
      return { status: "incomplete", ...this.getState() };
    }

    this.validated = true;

    // Colorier les connexions selon leur validité
    for (const [lid, conn] of this._connMap.entries()) {
      const rid       = this.connections[lid];
      const item      = this.leftItems.find(it => it.id === lid);
      const isCorrect = item && rid === item.match;
      conn.setPaintStyle({
        stroke: isCorrect ? "#859900" : "#dc322f",
        strokeWidth: 4,
      });
      conn.setHoverPaintStyle({
        stroke: isCorrect ? "#859900" : "#dc322f",
        strokeWidth: 4,
      });
    }

    // Bloquer les pills visuellement
    this.container.querySelectorAll(".cabling-pill").forEach(el => {
      el.style.cursor = "default";
    });

    return { status: "validated", ...this.getState() };
  }

  reset() {
    this.validated  = false;
    this.connections = {};
    this._connMap.clear();
    this._clearActive();

    if (this.jsp) {
      this.jsp.deleteAllConnections();
    }

    // Réactiver les pills
    this.container.querySelectorAll(".cabling-pill").forEach(el => {
      el.style.cursor      = "pointer";
      el.style.borderColor = "#586e75";
      el.style.color       = "#93a1a1";
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
    if (this.jsp) {
      this.jsp.destroy();
      this.jsp = null;
    }
  }
}
