import { EdgeData } from "../interfaces";

const SVG_NS = "http://www.w3.org/2000/svg";
const SP = 0.55;
const MG = (1 - SP) / 2;

export class EdgeDrawer {
    private layer: SVGGElement;
    private mainEl: HTMLElement;

    constructor(layer: SVGGElement, mainEl: HTMLElement) {
        this.layer = layer;
        this.mainEl = mainEl;
    }

    public drawEdges(edges: EdgeData[], hlSet: Set<string> | null): void {
        while (this.layer.firstChild) {
            this.layer.removeChild(this.layer.firstChild);
        }
        if (!edges.length) return;

        const mr = this.mainEl.getBoundingClientRect();
        const sl = this.mainEl.scrollLeft;
        const st = this.mainEl.scrollTop;

        const rects: Record<string, DOMRect> = {};

        // collect card positions
        edges.forEach(e => {
            [e.SourceId, e.TargetId].forEach(id => {
                if (!rects[id]) {
                    const el = this.mainEl.querySelector(`.nc[data-id="${id}"]`) as HTMLElement;
                    if (el) rects[id] = el.getBoundingClientRect();
                }
            });
        });

        const sE: Record<string, EdgeData[]> = {};
        const tE: Record<string, EdgeData[]> = {};

        edges.forEach(e => {
            if (!sE[e.SourceId]) sE[e.SourceId] = [];
            sE[e.SourceId].push(e);
            if (!tE[e.TargetId]) tE[e.TargetId] = [];
            tE[e.TargetId].push(e);
        });

        // sort edges by vertical location
        Object.keys(sE).forEach(id =>
            sE[id].sort((a, b) =>
                (rects[a.TargetId] ? rects[a.TargetId].top : 0) -
                (rects[b.TargetId] ? rects[b.TargetId].top : 0)
            )
        );

        Object.keys(tE).forEach(id =>
            tE[id].sort((a, b) =>
                (rects[a.SourceId] ? rects[a.SourceId].top : 0) -
                (rects[b.SourceId] ? rects[b.SourceId].top : 0)
            )
        );

        const portY: Record<string, { srcY?: number; tgtY?: number }> = {};

        // compute Y port for each source
        Object.keys(sE).forEach(id => {
            const list = sE[id];
            const r = rects[id];
            if (!r) return;
            list.forEach((e, i) => {
                const f = list.length === 1 ? 0.5 : MG + SP * (i / (list.length - 1));
                const k = e.SourceId + '>' + e.TargetId;
                if (!portY[k]) portY[k] = {};
                portY[k].srcY = r.top + r.height * f;
            });
        });

        // compute Y port for each target
        Object.keys(tE).forEach(id => {
            const list = tE[id];
            const r = rects[id];
            if (!r) return;
            list.forEach((e, i) => {
                const f = list.length === 1 ? 0.5 : MG + SP * (i / (list.length - 1));
                const k = e.SourceId + '>' + e.TargetId;
                if (!portY[k]) portY[k] = {};
                portY[k].tgtY = r.top + r.height * f;
            });
        });

        // draw edges
        edges.forEach(e => {
            const sr = rects[e.SourceId];
            const tr = rects[e.TargetId];
            if (!sr || !tr) return;

            const k = e.SourceId + '>' + e.TargetId;
            const ports = portY[k] || {};

            const x1 = sr.right - mr.left + sl;
            const y1 = (ports.srcY || sr.top + sr.height / 2) - mr.top + st;
            const x2 = tr.left - mr.left + sl;
            const y2 = (ports.tgtY || tr.top + tr.height / 2) - mr.top + st;

            if (x2 <= x1 + 5) return;

            const cp = (x2 - x1) * 0.42;
            const isHL = hlSet && hlSet.has(e.SourceId) && hlSet.has(e.TargetId);
            const isDm = hlSet && !isHL;

            const path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('d',
                'M' + x1 + ',' + y1 +
                ' C' + (x1 + cp) + ',' + y1 +
                ' ' + (x2 - cp) + ',' + y2 +
                ' ' + x2 + ',' + y2
            );
            path.setAttribute('class',
                'ep' + (isHL ? ' ehl' : '') + (isDm ? ' edm' : '')
            );
            path.setAttribute('marker-end', isHL ? 'url(#ah)' : 'url(#ar)');
            this.layer.appendChild(path);

            // port dot
            const dot = document.createElementNS(SVG_NS, 'circle');
            dot.setAttribute('cx', String(x1));
            dot.setAttribute('cy', String(y1));
            dot.setAttribute('r', isDm ? '0' : '2.5');
            dot.setAttribute('class',
                'eport' + (isHL ? ' ehl' : '') + (isDm ? ' edm' : '')
            );
            this.layer.appendChild(dot);
        });
    }
}
