"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

import { VisualFormattingSettingsModel } from "./settings";
import { NodeData, EdgeData } from "./interfaces";
import { initWorkspaceColors } from "./utils/helpers";
import { anc, dsc, precompute, getVisibleNodes } from "./utils/graphUtils";
import { LayoutEngine } from "./renderer/LayoutEngine";
import { CardBuilder } from "./renderer/CardBuilder";
import { EdgeDrawer } from "./renderer/EdgeDrawer";
import { Toolbar } from "./renderer/Toolbar";
import { RightPanel } from "./renderer/RightPanel";
import { TooltipManager } from "./renderer/TooltipManager";
import { ImpactBar } from "./renderer/ImpactBar";

export class Visual implements IVisual {
  private host: IVisualHost;
  private container: HTMLElement;
  private formattingSettingsService: FormattingSettingsService;
  private formattingSettings: VisualFormattingSettingsModel;

  // Data
  private nodes: NodeData[] = [];
  private edges: EdgeData[] = [];

  // Filter state
  private selWS: Set<string> = new Set();
  private selDF: Set<string> = new Set();
  private selRP: Set<string> = new Set();
  private searchTerm: string = '';
  private failedOnly: boolean = false;
  private selectedCard: string | null = null;
  private collapseState: Record<number, boolean> = {};

  // Precomputed
  private UP: Record<string, number> = {};
  private DN: Record<string, number> = {};
  private RI: Record<string, Set<string>> = {};
  private WC: Record<string, string> = {};

  // Sub-renderers
  private layoutEngine: LayoutEngine;
  private cardBuilder: CardBuilder;
  private edgeDrawer: EdgeDrawer;
  private toolbar: Toolbar;
  private rightPanel: RightPanel;
  private tooltipManager: TooltipManager;
  private impactBar: ImpactBar;

  // DOM refs
  private gridEl: HTMLElement;
  private svgLayer: SVGGElement;
  private mainEl: HTMLElement;
  private stageHeadersEl: HTMLElement;

  // Resize tracking
  private lastW: number = 0;
  private lastH: number = 0;
  private rzTimer: ReturnType<typeof setTimeout> | null = null;

  // Data change tracking
  private prevDataKey: string = '';

  constructor(options: VisualConstructorOptions) {
    this.host = options.host;
    this.container = options.element;
    this.formattingSettingsService = new FormattingSettingsService();

    this.container.classList.add('lineage-visual');
    this.buildStaticDOM();
    this.initSubRenderers();
    this.bindEvents();
    this.setupResizeHandling();

    // Restore saved theme
    try {
      if (localStorage.getItem('pbi-lineage-theme') === 'light') {
        this.container.classList.add('light');
      }
    } catch (_) { /* localStorage unavailable in some PBI environments */ }
  }

  public update(options: VisualUpdateOptions): void {
    this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
      VisualFormattingSettingsModel, options.dataViews?.[0]
    );

    const dataView = options.dataViews?.[0];
    if (!dataView?.table?.rows?.length) {
      this.showEmpty("Drag columns from your data table into the field wells");
      return;
    }

    const columns = dataView.table.columns;
    const iSourceId = columns.findIndex(c => c.roles?.['sourceId']);
    const iSourceName = columns.findIndex(c => c.roles?.['sourceName']);
    const iSourceType = columns.findIndex(c => c.roles?.['sourceType']);
    const iSourceWs = columns.findIndex(c => c.roles?.['sourceWs']);
    const iSourceStatus = columns.findIndex(c => c.roles?.['sourceStatus']);
    const iSourceTime = columns.findIndex(c => c.roles?.['sourceTime']);
    const iSourceUrl = columns.findIndex(c => c.roles?.['sourceUrl']);

    const iTargetId = columns.findIndex(c => c.roles?.['targetId']);
    const iTargetName = columns.findIndex(c => c.roles?.['targetName']);
    const iTargetType = columns.findIndex(c => c.roles?.['targetType']);
    const iTargetWs = columns.findIndex(c => c.roles?.['targetWs']);
    const iTargetStatus = columns.findIndex(c => c.roles?.['targetStatus']);
    const iTargetTime = columns.findIndex(c => c.roles?.['targetTime']);
    const iTargetUrl = columns.findIndex(c => c.roles?.['targetUrl']);

    const nodeMap = new Map<string, NodeData>();
    const edgeSet = new Set<string>();
    const parsedEdges: EdgeData[] = [];

    dataView.table.rows.forEach(row => {
      // Safe string extraction
      const getStr = (idx: number) => idx >= 0 && row[idx] != null ? String(row[idx]) : "";

      const unescapeStr = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

      const normType = (t: string) => {
        const l = t.toLowerCase().trim();
        if (l === 'dataflow') return 'Dataflow';
        if (l.includes('dataset') || l.includes('semantic model')) return 'Dataset';
        if (l === 'report') return 'Report';
        return t.trim();
      };

      const sId = getStr(iSourceId);
      const sName = unescapeStr(getStr(iSourceName));
      const sType = normType(getStr(iSourceType));
      const sWs = unescapeStr(getStr(iSourceWs));
      const sStatus = getStr(iSourceStatus);
      const sTime = getStr(iSourceTime);
      const sUrl = getStr(iSourceUrl);

      const tId = getStr(iTargetId);
      const tName = unescapeStr(getStr(iTargetName));
      const tType = normType(getStr(iTargetType));
      const tWs = unescapeStr(getStr(iTargetWs));
      const tStatus = getStr(iTargetStatus);
      const tTime = getStr(iTargetTime);
      const tUrl = getStr(iTargetUrl);

      // Add Source Node if ID exists
      if (sId) {
        if (!nodeMap.has(sId)) {
          nodeMap.set(sId, {
            NodeId: sId,
            NodeName: sName || sId,
            NodeType: sType,
            Workspace: sWs,
            RefreshStatus: sStatus,
            RefreshTime: sTime,
            PbiUrl: sUrl
          });
        } else {
          // Update optional properties if empty previously
          const n = nodeMap.get(sId);
          if (!n.RefreshStatus && sStatus) n.RefreshStatus = sStatus;
          if (!n.RefreshTime && sTime) n.RefreshTime = sTime;
          if (!n.PbiUrl && sUrl) n.PbiUrl = sUrl;
        }
      }

      // Add Target Node if ID exists
      if (tId) {
        if (!nodeMap.has(tId)) {
          nodeMap.set(tId, {
            NodeId: tId,
            NodeName: tName || tId,
            NodeType: tType,
            Workspace: tWs,
            RefreshStatus: tStatus,
            RefreshTime: tTime,
            PbiUrl: tUrl
          });
        } else {
          // Update optional properties if empty previously
          const n = nodeMap.get(tId);
          if (!n.RefreshStatus && tStatus) n.RefreshStatus = tStatus;
          if (!n.RefreshTime && tTime) n.RefreshTime = tTime;
          if (!n.PbiUrl && tUrl) n.PbiUrl = tUrl;
        }
      }

      // Add Edge if both exist
      if (sId && tId) {
        const edgeKey = sId + "###" + tId;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          parsedEdges.push({
            SourceId: sId,
            Source: sName || sId,
            TargetId: tId,
            Target: tName || tId
          });
        }
      }
    });

    this.nodes = Array.from(nodeMap.values());
    this.edges = parsedEdges;

    if (!this.nodes.length) {
      this.showEmpty("Please ensure the required Source Node ID and Target Node ID fields are mapped.");
      return;
    }

    this.hideEmpty();

    // Detect data change
    const dataKey = this.nodes.map(n => n.NodeId).sort().join(',') +
      '|' + this.edges.map(e => e.SourceId + '>' + e.TargetId).sort().join(',');
    const dataChanged = dataKey !== this.prevDataKey;
    this.prevDataKey = dataKey;

    // Recompute
    this.WC = initWorkspaceColors(this.nodes.map(n => n.Workspace));
    const pc = precompute(this.nodes, this.edges);
    this.UP = pc.UP;
    this.DN = pc.DN;
    this.RI = pc.RI;

    if (dataChanged) {
      const nodeIds = new Set(this.nodes.map(n => n.NodeId));
      const wsSet = new Set(this.nodes.map(n => n.Workspace));
      this.selWS = new Set([...this.selWS].filter(w => wsSet.has(w)));
      this.selDF = new Set([...this.selDF].filter(id => nodeIds.has(id)));
      this.selRP = new Set([...this.selRP].filter(id => nodeIds.has(id)));
      if (this.selectedCard && !nodeIds.has(this.selectedCard)) {
        this.selectedCard = null;
      }
      this.toolbar.buildDropdowns(this.nodes, this.WC, this.selWS, this.selDF, this.selRP);
    }

    this.updateSummaryBar();
    this.render();
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
  }

  private buildStaticDOM(): void {
    const htmlString = `
<div id="app-wrap">
<div class="nc-tooltip" id="tt">
  <div class="tt-name" id="tt-nm"></div>
  <div class="tt-sep"></div>
  <div class="tt-row" id="tt-type"></div>
  <div class="tt-row" id="tt-ref"></div>
  <div class="tt-row" id="tt-st"></div>
  <div class="tt-row" id="tt-ch"></div>
</div>
<div id="tb">
  <h1>&#11047; PBI Lineage</h1>
  <span class="sep"></span>
  <div class="cr">
    <span class="cl">Workspace</span>
    <div class="ms-wrap">
      <div class="ms-btn" id="ws-btn">
        <span id="ws-lbl">All</span>
        <span class="ms-badge ws" id="ws-badge" style="display:none"></span>
        <span class="ms-caret">&#9660;</span>
      </div>
      <div class="ms-drop" id="ws-drop">
        <div class="ms-drop-hdr">Filter by Workspace</div>
        <input type="text" class="ms-search" placeholder="Search...">
        <div class="ms-list" id="ws-list"></div>
        <div class="ms-foot">
          <button class="ms-foot-btn all">Select All</button>
          <button class="ms-foot-btn clr">Clear</button>
        </div>
      </div>
    </div>
  </div>
  <div class="cr">
    <span class="cl">Dataflow</span>
    <div class="ms-wrap">
      <div class="ms-btn" id="df-btn">
        <span id="df-lbl">All</span>
        <span class="ms-badge df" id="df-badge" style="display:none"></span>
        <span class="ms-caret">&#9660;</span>
      </div>
      <div class="ms-drop" id="df-drop">
        <div class="ms-drop-hdr">Filter by Dataflow</div>
        <input type="text" class="ms-search" placeholder="Search...">
        <div class="ms-list" id="df-list"></div>
        <div class="ms-foot">
          <button class="ms-foot-btn all">Select All</button>
          <button class="ms-foot-btn clr">Clear</button>
        </div>
      </div>
    </div>
  </div>
  <div class="cr">
    <span class="cl">Report</span>
    <div class="ms-wrap">
      <div class="ms-btn" id="rp-btn">
        <span id="rp-lbl">All</span>
        <span class="ms-badge rp" id="rp-badge" style="display:none"></span>
        <span class="ms-caret">&#9660;</span>
      </div>
      <div class="ms-drop" id="rp-drop">
        <div class="ms-drop-hdr">Focus on Reports</div>
        <input type="text" class="ms-search" placeholder="Search...">
        <div class="ms-list" id="rp-list"></div>
        <div class="ms-foot">
          <button class="ms-foot-btn all">Select All</button>
          <button class="ms-foot-btn clr">Clear</button>
        </div>
      </div>
    </div>
  </div>
  <span class="sep"></span>
  <div class="cr">
    <input type="text" id="sb" placeholder="Search nodes..."/>
  </div>
  <span class="sep"></span>
  <div class="vt">
    <button class="vb act" data-v="n">Normal</button>
    <button class="vb" data-v="c">Compact</button>
  </div>
  <span class="sep"></span>
  <button id="failed-btn">
    <span class="fb-dot"></span>Failed Only
  </button>
  <button id="theme-btn" title="Toggle light / dark mode">&#9790;</button>
  <span class="sep"></span>
  <div id="wsl"></div>
  <span id="ct"></span>
</div>
<div id="summary-bar">
  <div class="sb-stat sb-total" id="sbn-total-stat" title="All nodes">
    <div class="sb-sdot" style="background:#94a3c4"></div>
    <span class="sb-val" id="sbn-total">0</span>
    <span class="sb-lbl">Total</span>
  </div>
  <div class="sb-div"></div>
  <div class="sb-stat sb-success">
    <div class="sb-sdot" style="background:#34d399"></div>
    <span class="sb-val" id="sbn-ok">0</span>
    <span class="sb-lbl">Success</span>
  </div>
  <div class="sb-div"></div>
  <div class="sb-stat sb-failed" id="sbn-fail-stat">
    <div class="sb-sdot" style="background:#f472b6"></div>
    <span class="sb-val" id="sbn-fail">0</span>
    <span class="sb-lbl">Failed</span>
  </div>
  <div class="sb-div"></div>
  <div class="sb-stat sb-progress">
    <div class="sb-sdot" style="background:#fbbf24"></div>
    <span class="sb-val" id="sbn-prog">0</span>
    <span class="sb-lbl">In Progress</span>
  </div>
</div>
<div id="stage-headers"></div>
<div id="ib">
  <span class="il">&#9889; Impact</span>
  <span class="is2" id="is"></span>
  <div id="ic"></div>
</div>
<div id="body-row">
  <div id="main">
    <div id="grid">
      <svg id="esvg" aria-hidden="true">
        <defs>
          <marker id="ar" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
            <path d="M0,0 L0,7 L7,3.5 z" fill="rgba(77,120,200,.3)"/>
          </marker>
          <marker id="ah" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
            <path d="M0,0 L0,7 L7,3.5 z" fill="#fbbf24"/>
          </marker>
        </defs>
        <g id="el"></g>
      </svg>
    </div>
    <div id="emp">No matching nodes.</div>
  </div>
  <div id="kb-hint">
    <div class="kb-tag"><kbd>Esc</kbd> clear</div>
    <div class="kb-tag"><kbd>Ctrl+F</kbd> search</div>
  </div>
  <div id="rp-tab">&#9664;</div>
  <div id="rpanel">
    <div id="rp-empty">
      <div class="rpe-icon">&#9678;</div>
      <div class="rpe-txt">Click any node<br/>to see its details</div>
    </div>
    <div id="rp-content">
      <div id="rp-hdr">
        <div class="rp-label">Selected Node</div>
        <div class="rp-name" id="rp-nodename"></div>
        <div class="rp-meta">
          <span class="rp-type-badge" id="rp-typebadge"></span>
          <span class="rp-ws-lbl" id="rp-wslbl"></span>
        </div>
        <div class="rp-refresh" id="rp-refreshrow"></div>
        <div class="rp-refresh" id="rp-statusrow" style="display:none;margin-top:3px;"></div>
      </div>
      <div id="rp-body">
        <div class="rp-section">
          <div class="rp-sec-title" id="up-title">
            <span class="rp-sec-arrow" id="up-arrow">&#9660;</span>
            <span style="color:#60a5fa">&#8593; UPSTREAM</span>
            <span class="rp-sec-cnt" id="rp-up-cnt">0</span>
          </div>
          <div class="rp-list" id="rp-up-list"></div>
        </div>
        <div class="rp-section">
          <div class="rp-sec-title" id="dn-title">
            <span class="rp-sec-arrow" id="dn-arrow">&#9660;</span>
            <span style="color:#fb923c">&#8595; DOWNSTREAM</span>
            <span class="rp-sec-cnt" id="rp-dn-cnt">0</span>
          </div>
          <div class="rp-list" id="rp-dn-list"></div>
        </div>
      </div>
      <div id="rp-foot">
        <div class="rpf-stat up">
          <span class="rpf-val" id="rpf-up">0</span>
          <span class="rpf-lbl">Upstream</span>
        </div>
        <div class="rpf-stat dn">
          <span class="rpf-val" id="rpf-dn">0</span>
          <span class="rpf-lbl">Downstream</span>
        </div>
        <div class="rpf-stat rk">
          <span class="rpf-val" id="rpf-rk">0</span>
          <span class="rpf-lbl">At-risk reports</span>
        </div>
      </div>
    </div>
  </div>
</div>
<div id="bnn"></div>
</div>
<div class="empty-state" id="empty-msg" style="display:none">
  <div>Drag columns from the Data table into the visual's field wells</div>
</div>`;
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    while (doc.body.firstChild) {
      this.container.appendChild(doc.body.firstChild);
    }
  }

  private initSubRenderers(): void {
    this.gridEl = this.container.querySelector('#grid') as HTMLElement;
    this.mainEl = this.container.querySelector('#main') as HTMLElement;
    this.stageHeadersEl = this.container.querySelector('#stage-headers') as HTMLElement;
    this.svgLayer = this.container.querySelector('#el') as unknown as SVGGElement;

    const ttEl = this.container.querySelector('#tt') as HTMLElement;
    const rpanelEl = this.container.querySelector('#rpanel') as HTMLElement;

    this.layoutEngine = new LayoutEngine();
    this.cardBuilder = new CardBuilder();
    this.edgeDrawer = new EdgeDrawer(this.svgLayer, this.mainEl);
    this.toolbar = new Toolbar(this.container, () => this.onFilterChange());
    this.rightPanel = new RightPanel(rpanelEl);
    this.tooltipManager = new TooltipManager(ttEl);
    this.impactBar = new ImpactBar(this.container);

    this.toolbar.bindDropdownToggles();
    this.rightPanel.bindSectionToggles();
  }

  private bindEvents(): void {
    const sb = this.container.querySelector('#sb') as HTMLInputElement;
    const failedBtn = this.container.querySelector('#failed-btn') as HTMLElement;

    // Search
    if (sb) {
      sb.addEventListener('input', () => {
        this.searchTerm = sb.value.toLowerCase().trim();
        this.clearSelection();
        this.render();
      });
    }

    // Normal/Compact toggle
    this.container.querySelectorAll('.vb').forEach(b => {
      b.addEventListener('click', () => {
        this.container.querySelectorAll('.vb').forEach(x => x.classList.remove('act'));
        b.classList.add('act');
        this.container.classList.toggle('cmp', (b as HTMLElement).dataset.v === 'c');
        requestAnimationFrame(() => this.redraw());
      });
    });

    // Failed-only toggle
    if (failedBtn) {
      failedBtn.addEventListener('click', () => {
        this.failedOnly = !this.failedOnly;
        failedBtn.classList.toggle('active', this.failedOnly);
        const stat = this.container.querySelector('#sbn-fail-stat');
        if (stat) stat.classList.toggle('active', this.failedOnly);
        if (this.failedOnly) this.clearSelection();
        this.render();
        requestAnimationFrame(() => this.redraw());
      });
    }

    // Theme (light / dark) toggle
    const themeBtn = this.container.querySelector('#theme-btn') as HTMLElement;
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const isLight = this.container.classList.toggle('light');
        themeBtn.textContent = isLight ? '\u2600' : '\u263D'; // ☀ or ☾
        try { localStorage.setItem('pbi-lineage-theme', isLight ? 'light' : 'dark'); } catch (_) { /* ignore */ }
      });
      // Sync icon with restored theme
      if (this.container.classList.contains('light')) themeBtn.textContent = '\u2600';
    }

    // Clear failed on total click
    const totalStat = this.container.querySelector('#sbn-total-stat') as HTMLElement;
    if (totalStat) {
      totalStat.addEventListener('click', () => {
        this.failedOnly = false;
        if (failedBtn) failedBtn.classList.remove('active');
        const stat = this.container.querySelector('#sbn-fail-stat');
        if (stat) stat.classList.remove('active');
        this.render();
        requestAnimationFrame(() => this.redraw());
      });
    }

    // Click outside node
    if (this.mainEl) {
      this.mainEl.addEventListener('click', (e: Event) => {
        if (!(e.target as HTMLElement).closest('.nc')) {
          this.clearSelection();
          this.drawCurrentEdges(null);
        }
      });
      this.mainEl.addEventListener('scroll', () => this.redraw());
    }

    // Panel toggle
    const rpTab = this.container.querySelector('#rp-tab') as HTMLElement;
    if (rpTab) rpTab.addEventListener('click', () => this.togglePanel());

    // Keyboard
    this.container.setAttribute('tabindex', '0');
    this.container.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.clearSelection();
        this.failedOnly = false;
        if (failedBtn) failedBtn.classList.remove('active');
        if (sb) { sb.value = ''; this.searchTerm = ''; }
        this.render();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        if (sb) { sb.focus(); sb.select(); }
      }
    });

    window.addEventListener('resize', () => {
      this.fixTabPosition();
      this.redraw();
    });
  }

  private render(): void {
    const visNodes = getVisibleNodes(
      this.nodes, this.edges,
      this.selWS, this.selDF, this.selRP,
      this.searchTerm, this.failedOnly
    );

    const nIds = new Set(visNodes.map(n => n.NodeId));
    const visEdges = this.edges.filter(e => nIds.has(e.SourceId) && nIds.has(e.TargetId));
    const columns = this.layoutEngine.computeLayout(visNodes, visEdges);

    const svgEl = this.container.querySelector('#esvg') as SVGElement;
    while (this.gridEl.firstChild) this.gridEl.removeChild(this.gridEl.firstChild);
    if (svgEl) this.gridEl.appendChild(svgEl);

    while (this.stageHeadersEl.firstChild) this.stageHeadersEl.removeChild(this.stageHeadersEl.firstChild);

    columns.forEach((col) => {
      const sh = document.createElement('div');
      sh.className = 'sh' + (this.collapseState[col.index] ? ' collapsed' : '');
      sh.style.flex = '0 0 260px';

      const colBtn = document.createElement('button');
      colBtn.className = 'sh-collapse';
      colBtn.title = 'Collapse stage';
      colBtn.textContent = this.collapseState[col.index] ? '\u25B6' : '\u25C0';
      colBtn.addEventListener('click', () => {
        this.collapseState[col.index] = !this.collapseState[col.index];
        this.render();
        requestAnimationFrame(() => this.redraw());
      });

      const dot = document.createElement('div');
      dot.className = 'sh-dot';
      dot.style.background = col.info.dotColor;
      sh.appendChild(dot);
      sh.appendChild(document.createTextNode(col.info.label));

      const shCnt = document.createElement('span');
      shCnt.className = 'sh-cnt';
      shCnt.textContent = String(col.nodes.length);
      sh.appendChild(shCnt);
      sh.appendChild(colBtn);
      this.stageHeadersEl.appendChild(sh);

      const shg = document.createElement('div');
      shg.className = 'sh-gap';
      this.stageHeadersEl.appendChild(shg);

      const colDiv = document.createElement('div');
      colDiv.className = 'stage' + (this.collapseState[col.index] ? ' collapsed' : '');

      const cLbl = document.createElement('div');
      cLbl.className = 'collapsed-label';
      cLbl.textContent = col.info.label;
      colDiv.appendChild(cLbl);

      col.nodes.forEach(n => {
        colDiv.appendChild(this.cardBuilder.makeCard(
          n, this.WC, this.UP, this.DN, this.RI,
          (id) => this.onCardClick(id),
          (node, el) => this.tooltipManager.show(node, el, this.UP, this.DN),
          () => this.tooltipManager.hide()
        ));
      });

      this.gridEl.appendChild(colDiv);
      const gap = document.createElement('div');
      gap.className = 'stage-gap' + (this.collapseState[col.index] ? ' collapsed' : '');
      this.gridEl.appendChild(gap);
    });

    const ct = this.container.querySelector('#ct') as HTMLElement;
    if (ct) ct.textContent = visNodes.length + ' nodes \u00b7 ' + visEdges.length + ' edges';

    const emp = this.container.querySelector('#emp') as HTMLElement;
    if (emp) emp.style.display = visNodes.length === 0 ? 'block' : 'none';

    requestAnimationFrame(() => this.drawCurrentEdges(null));

    if (this.selectedCard && nIds.has(this.selectedCard)) {
      this.onCardClick(this.selectedCard);
    } else {
      this.rightPanel.hideContent();
    }

    this.fixTabPosition();
  }

  private onCardClick(id: string): void {
    if (this.selectedCard === id) {
      this.clearSelection();
      this.drawCurrentEdges(null);
      return;
    }

    this.selectedCard = id;
    const ae = this.getVisibleEdges();
    const a = anc(id, ae);
    const d = dsc(id, ae);
    const ls = new Set([id, ...a, ...d]);

    this.container.querySelectorAll('.nc').forEach(c => {
      const el = c as HTMLElement;
      const cid = el.dataset.id || '';
      el.classList.remove('sel', 'hl', 'dm');
      if (cid === id) el.classList.add('sel');
      else if (ls.has(cid)) el.classList.add('hl');
      else el.classList.add('dm');
    });

    this.edgeDrawer.drawEdges(ae, ls);
    this.impactBar.show(id, this.nodes, d);
    this.rightPanel.show(id, this.nodes, this.edges, a, d, this.WC, (clickId) => this.onCardClick(clickId));
  }

  private clearSelection(): void {
    this.selectedCard = null;
    this.container.querySelectorAll('.nc').forEach(c => c.classList.remove('sel', 'hl', 'dm'));
    this.impactBar.hide();
    this.rightPanel.hideContent();
  }

  private getVisibleEdges(): EdgeData[] {
    const ids = new Set<string>();
    this.container.querySelectorAll('.nc').forEach(c => {
      const id = (c as HTMLElement).dataset.id;
      if (id) ids.add(id);
    });
    return this.edges.filter(e => ids.has(e.SourceId) && ids.has(e.TargetId));
  }

  private drawCurrentEdges(hlSet: Set<string> | null): void {
    const ae = this.getVisibleEdges();
    if (this.selectedCard && !hlSet) {
      const a = anc(this.selectedCard, ae);
      const d = dsc(this.selectedCard, ae);
      this.edgeDrawer.drawEdges(ae, new Set([this.selectedCard, ...a, ...d]));
    } else {
      this.edgeDrawer.drawEdges(ae, hlSet);
    }
  }

  private redraw(): void {
    const ae = this.getVisibleEdges();
    if (this.selectedCard) {
      const a = anc(this.selectedCard, ae);
      const d = dsc(this.selectedCard, ae);
      this.edgeDrawer.drawEdges(ae, new Set([this.selectedCard, ...a, ...d]));
    } else {
      this.edgeDrawer.drawEdges(ae, null);
    }
  }

  private onFilterChange(): void {
    const sel = this.toolbar.getFilterSelections();
    this.selWS = sel.ws;
    this.selDF = sel.df;
    this.selRP = sel.rp;
    this.clearSelection();
    this.render();
  }

  private updateSummaryBar(): void {
    this.setTextById('sbn-total', String(this.nodes.length));
    this.setTextById('sbn-ok', String(this.nodes.filter(n => n.RefreshStatus === 'success').length));
    this.setTextById('sbn-fail', String(this.nodes.filter(n => n.RefreshStatus === 'failed').length));
    this.setTextById('sbn-prog', String(this.nodes.filter(n => n.RefreshStatus === 'progress').length));
  }

  private togglePanel(): void {
    const panel = this.container.querySelector('#rpanel') as HTMLElement;
    const tab = this.container.querySelector('#rp-tab') as HTMLElement;
    if (!panel || !tab) return;
    panel.classList.toggle('hidden');
    tab.textContent = panel.classList.contains('hidden') ? '\u25B6' : '\u25C0';
    tab.style.right = panel.classList.contains('hidden') ? '0' : '270px';
    requestAnimationFrame(() => this.redraw());
  }

  private fixTabPosition(): void {
    const p = this.container.querySelector('#rpanel') as HTMLElement;
    const t = this.container.querySelector('#rp-tab') as HTMLElement;
    if (!p || !t) return;
    t.style.display = 'flex';
    t.style.right = p.classList.contains('hidden') ? '0' : '270px';
  }

  private showEmpty(msg: string): void {
    const appWrap = this.container.querySelector('#app-wrap') as HTMLElement;
    const emptyMsg = this.container.querySelector('#empty-msg') as HTMLElement;
    if (appWrap) appWrap.style.display = 'none';
    if (emptyMsg) {
      emptyMsg.style.display = 'flex';
      while (emptyMsg.firstChild) emptyMsg.removeChild(emptyMsg.firstChild);
      const child = document.createElement('div');
      child.textContent = msg;
      emptyMsg.appendChild(child);
    }
  }

  private hideEmpty(): void {
    const appWrap = this.container.querySelector('#app-wrap') as HTMLElement;
    const emptyMsg = this.container.querySelector('#empty-msg') as HTMLElement;
    if (appWrap) appWrap.style.display = 'flex';
    if (emptyMsg) emptyMsg.style.display = 'none';
  }

  private setupResizeHandling(): void {
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.onResize()).observe(this.container);
    }
    setInterval(() => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      if (w !== this.lastW || h !== this.lastH) {
        this.lastW = w;
        this.lastH = h;
        this.onResize();
      }
    }, 150);
  }

  private onResize(): void {
    if (this.rzTimer) clearTimeout(this.rzTimer);
    this.rzTimer = setTimeout(() => {
      if (this.nodes.length) {
        this.render();
        this.redraw();
      }
      this.fixTabPosition();
    }, 80);
  }

  private setTextById(id: string, text: string): void {
    const el = this.container.querySelector('#' + id) as HTMLElement;
    if (el) el.textContent = text;
  }
}
