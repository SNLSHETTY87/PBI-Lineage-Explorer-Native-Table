import { NodeData, EdgeData } from "../interfaces";
import { nodeCls, nodeColor, esc, fresh, fdSpan, fdDot } from "../utils/helpers";

export class RightPanel {
    private container: HTMLElement;
    private secState: Record<string, boolean> = { up: true, dn: true };

    constructor(container: HTMLElement) {
        this.container = container;
    }

    public hideContent(): void {
        const empty = this.container.querySelector('#rp-empty') as HTMLElement;
        const content = this.container.querySelector('#rp-content') as HTMLElement;
        if (empty) empty.style.display = 'flex';
        if (content) { content.classList.remove('show'); content.style.display = ''; }
    }

    public show(
        id: string,
        nodes: NodeData[],
        edges: EdgeData[],
        ancSet: Set<string>,
        dscSet: Set<string>,
        WC: Record<string, string>,
        onCardClick: (id: string) => void
    ): void {
        const node = nodes.find(n => n.NodeId === id);
        if (!node) return;

        const empty = this.container.querySelector('#rp-empty') as HTMLElement;
        const content = this.container.querySelector('#rp-content') as HTMLElement;
        if (empty) empty.style.display = 'none';
        if (content) { content.classList.add('show'); content.style.display = ''; }

        // Header
        const nameEl = this.container.querySelector('#rp-nodename') as HTMLElement;
        if (nameEl) nameEl.textContent = node.NodeName;

        const tb = this.container.querySelector('#rp-typebadge') as HTMLElement;
        if (tb) { tb.textContent = node.NodeType; tb.className = 'rp-type-badge rp-type-' + nodeCls(node.NodeType); }

        const wsl = this.container.querySelector('#rp-wslbl') as HTMLElement;
        if (wsl) { wsl.textContent = '\u00b7 ' + node.Workspace; wsl.style.color = WC[node.Workspace] || '#6b7fa3'; }

        const fr = fresh(node.RefreshTime);
        const refRow = this.container.querySelector('#rp-refreshrow') as HTMLElement;
        if (refRow) {
            while (refRow.firstChild) refRow.removeChild(refRow.firstChild);
            if (fr) {
                const fdDotSpan = document.createElement('span');
                fdDotSpan.className = 'fd ' + fr.cssClass;
                refRow.appendChild(fdDotSpan);
                refRow.appendChild(document.createTextNode(' Refreshed ' + fr.label));
            }
        }

        const rs = node.RefreshStatus || '';
        const rsEl = this.container.querySelector('#rp-statusrow') as HTMLElement;
        if (rsEl) {
            while (rsEl.firstChild) rsEl.removeChild(rsEl.firstChild);
            if (rs) {
                const rsCol = rs === 'success' ? '#34d399' : rs === 'failed' ? '#f472b6' : '#fbbf24';
                const rsLbl = rs === 'success' ? '\u2713 Success' : rs === 'failed' ? '\u2717 Failed' : '\u21BA In Progress';
                const s = document.createElement('span');
                s.style.color = rsCol;
                s.style.fontSize = '10px';
                s.style.fontFamily = 'monospace';
                s.style.fontWeight = '600';
                s.textContent = rsLbl;
                rsEl.appendChild(s);
                rsEl.style.display = 'flex';
            } else {
                rsEl.style.display = 'none';
            }
        }

        // Upstream/downstream lists
        const directUp = edges.filter(e => e.TargetId === id).map(e => e.SourceId);
        const directDn = edges.filter(e => e.SourceId === id).map(e => e.TargetId);

        const upNodes = [...ancSet]
            .map(aid => nodes.find(n => n.NodeId === aid))
            .filter(Boolean as any as (v: NodeData | undefined) => v is NodeData)
            .sort((a, b) =>
                (directUp.includes(a.NodeId) ? 0 : 1) - (directUp.includes(b.NodeId) ? 0 : 1)
                || a.NodeName.localeCompare(b.NodeName)
            );

        const dnNodes = [...dscSet]
            .map(did => nodes.find(n => n.NodeId === did))
            .filter(Boolean as any as (v: NodeData | undefined) => v is NodeData)
            .sort((a, b) =>
                (directDn.includes(a.NodeId) ? 0 : 1) - (directDn.includes(b.NodeId) ? 0 : 1)
                || a.NodeName.localeCompare(b.NodeName)
            );

        const upList = this.container.querySelector('#rp-up-list') as HTMLElement;
        const dnList = this.container.querySelector('#rp-dn-list') as HTMLElement;
        if (upList) {
            while (upList.firstChild) upList.removeChild(upList.firstChild);
            upNodes.forEach(n => upList.appendChild(this.makeItem(n, directUp.includes(n.NodeId), onCardClick)));
        }
        if (dnList) {
            while (dnList.firstChild) dnList.removeChild(dnList.firstChild);
            dnNodes.forEach(n => dnList.appendChild(this.makeItem(n, directDn.includes(n.NodeId), onCardClick)));
        }

        this.setTextById('rp-up-cnt', String(upNodes.length));
        this.setTextById('rp-dn-cnt', String(dnNodes.length));
        this.setTextById('rpf-up', String(upNodes.length));
        this.setTextById('rpf-dn', String(dnNodes.length));
        this.setTextById('rpf-rk', String(dnNodes.filter(n => n.NodeType === 'Report').length));
    }

    public bindSectionToggles(): void {
        const upTitle = this.container.querySelector('#up-title') as HTMLElement;
        const dnTitle = this.container.querySelector('#dn-title') as HTMLElement;
        if (upTitle) upTitle.addEventListener('click', () => this.toggleSec('up'));
        if (dnTitle) dnTitle.addEventListener('click', () => this.toggleSec('dn'));
    }

    private toggleSec(sec: string): void {
        this.secState[sec] = !this.secState[sec];
        const list = this.container.querySelector('#rp-' + sec + '-list') as HTMLElement;
        const arrow = this.container.querySelector('#' + sec + '-arrow') as HTMLElement;
        if (list) list.classList.toggle('collapsed', !this.secState[sec]);
        if (arrow) arrow.style.transform = this.secState[sec] ? '' : 'rotate(-90deg)';
    }

    private makeItem(node: NodeData, isDirect: boolean, onCardClick: (id: string) => void): HTMLElement {
        const div = document.createElement('div');
        div.className = 'rp-item';

        const dot = document.createElement('span');
        dot.className = 'rp-item-dot';
        dot.style.background = nodeColor(node.NodeType);
        if (!isDirect) dot.style.opacity = '0.45';

        const body = document.createElement('div');
        body.className = 'rp-item-body';

        const fr = fresh(node.RefreshTime);

        const nameDiv = document.createElement('div');
        nameDiv.className = 'rp-item-name';
        nameDiv.textContent = node.NodeName;
        body.appendChild(nameDiv);

        const subDiv = document.createElement('div');
        subDiv.className = 'rp-item-sub';

        const typeSpan = document.createElement('span');
        typeSpan.style.color = nodeColor(node.NodeType);
        typeSpan.style.opacity = '0.75';
        typeSpan.textContent = node.NodeType;
        subDiv.appendChild(typeSpan);

        if (fr) {
            const fsDiv = document.createElement('span');
            fsDiv.className = 'mi';
            const fsDot = document.createElement('span');
            fsDot.className = 'fd ' + fr.cssClass;
            fsDiv.appendChild(fsDot);
            fsDiv.appendChild(document.createTextNode(fr.label));
            subDiv.appendChild(fsDiv);
        }

        if (!isDirect) {
            const indSpan = document.createElement('span');
            indSpan.style.color = '#2a3550';
            indSpan.style.fontSize = '8px';
            indSpan.textContent = 'INDIRECT';
            subDiv.appendChild(indSpan);
        }

        body.appendChild(subDiv);

        div.appendChild(dot);
        div.appendChild(body);
        div.addEventListener('click', () => onCardClick(node.NodeId));
        return div;
    }

    private setTextById(id: string, text: string): void {
        const el = this.container.querySelector('#' + id) as HTMLElement;
        if (el) el.textContent = text;
    }
}
