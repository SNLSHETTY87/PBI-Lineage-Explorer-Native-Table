import { NodeData } from "../interfaces";
import { nodeColor, fresh } from "../utils/helpers";

export class TooltipManager {
    private ttEl: HTMLElement;
    private ttTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(ttEl: HTMLElement) {
        this.ttEl = ttEl;
    }

    public show(
        node: NodeData,
        cardEl: HTMLElement,
        UP: Record<string, number>,
        DN: Record<string, number>
    ): void {
        this.hide();
        this.ttTimer = setTimeout(() => {
            if (!this.ttEl) return;

            const col = nodeColor(node.NodeType);

            const ttNm = this.ttEl.querySelector('#tt-nm') as HTMLElement;
            if (ttNm) ttNm.textContent = node.NodeName;

            const ttType = this.ttEl.querySelector('#tt-type') as HTMLElement;
            if (ttType) {
                while (ttType.firstChild) ttType.removeChild(ttType.firstChild);
                const s = document.createElement('span');
                s.className = 'tt-dot';
                s.style.background = col;
                ttType.appendChild(s);
                ttType.appendChild(document.createTextNode(node.NodeType + ' \u00B7 ' + node.Workspace));
            }

            const fr = fresh(node.RefreshTime);
            const ttRef = this.ttEl.querySelector('#tt-ref') as HTMLElement;
            if (ttRef) {
                while (ttRef.firstChild) ttRef.removeChild(ttRef.firstChild);
                if (fr) {
                    const s = document.createElement('span');
                    s.className = 'tt-dot';
                    s.style.background = '#94a3c4';
                    ttRef.appendChild(s);
                    ttRef.appendChild(document.createTextNode(fr.label));
                }
            }

            const rs = node.RefreshStatus || '';
            const ttSt = this.ttEl.querySelector('#tt-st') as HTMLElement;
            if (ttSt) {
                while (ttSt.firstChild) ttSt.removeChild(ttSt.firstChild);
                if (rs) {
                    const rc = rs === 'success' ? '#34d399' : rs === 'failed' ? '#f472b6' : '#fbbf24';
                    const rl = rs === 'success' ? '\u2713 Success' : rs === 'failed' ? '\u2717 Failed' : '\u21BA In Progress';

                    const dot = document.createElement('span');
                    dot.className = 'tt-dot';
                    dot.style.background = rc;
                    ttSt.appendChild(dot);

                    const lbl = document.createElement('span');
                    lbl.style.color = rc;
                    lbl.style.fontWeight = '600';
                    lbl.textContent = rl;
                    ttSt.appendChild(lbl);
                }
            }

            const up = UP[node.NodeId] || 0;
            const dn = DN[node.NodeId] || 0;
            const ttCh = this.ttEl.querySelector('#tt-ch') as HTMLElement;
            if (ttCh) {
                while (ttCh.firstChild) ttCh.removeChild(ttCh.firstChild);
                const s = document.createElement('span');
                s.className = 'tt-dot';
                s.style.background = '#4a5878';
                ttCh.appendChild(s);
                ttCh.appendChild(document.createTextNode('\u2191' + up + ' upstream \u00B7 \u2193' + dn + ' downstream'));
            }

            const r = cardEl.getBoundingClientRect();
            this.ttEl.style.left = (r.right + 8) + 'px';
            this.ttEl.style.top = r.top + 'px';
            this.ttEl.classList.add('show');

            setTimeout(() => {
                const tr = this.ttEl.getBoundingClientRect();
                if (tr.right > window.innerWidth - 8)
                    this.ttEl.style.left = (r.left - tr.width - 8) + 'px';
                if (tr.bottom > window.innerHeight - 8)
                    this.ttEl.style.top = (window.innerHeight - tr.height - 8) + 'px';
            }, 0);
        }, 350);
    }

    public hide(): void {
        if (this.ttTimer) {
            clearTimeout(this.ttTimer);
            this.ttTimer = null;
        }
        if (this.ttEl) this.ttEl.classList.remove('show');
    }
}
