import { NodeData } from "../interfaces";
import { esc } from "../utils/helpers";

export class ImpactBar {
    private container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;
    }

    public show(id: string, nodes: NodeData[], dSet: Set<string>): void {
        const node = nodes.find(x => x.NodeId === id);
        if (!node || node.NodeType === 'Report') {
            this.hide();
            return;
        }

        const reports = [...dSet].filter(d => {
            const x = nodes.find(m => m.NodeId === d);
            return x && x.NodeType === 'Report';
        });

        const datasets = [...dSet].filter(d => {
            const x = nodes.find(m => m.NodeId === d);
            return x && x.NodeType === 'Dataset';
        });

        if (!reports.length && !datasets.length) {
            this.hide();
            return;
        }

        const nm = node.NodeName.length > 35
            ? node.NodeName.slice(0, 35) + '\u2026'
            : node.NodeName;

        const isEl = this.container.querySelector('#is') as HTMLElement;
        if (isEl) isEl.textContent = 'Impact: ' + nm + ' \u2192 ' + datasets.length + ' dataset(s), ' + reports.length + ' report(s)';

        const icEl = this.container.querySelector('#ic') as HTMLElement;
        if (icEl) {
            while (icEl.firstChild) icEl.removeChild(icEl.firstChild);

            datasets.slice(0, 3).forEach(d => {
                const x = nodes.find(m => m.NodeId === d);
                const sp = document.createElement('span');
                sp.className = 'ich';
                const dsp = document.createElement('span');
                dsp.className = 'ichd';
                dsp.style.background = '#34d399';
                sp.appendChild(dsp);
                sp.appendChild(document.createTextNode(x ? x.NodeName.slice(0, 22) : d));
                icEl.appendChild(sp);
            });

            reports.slice(0, 5).forEach(r => {
                const x = nodes.find(m => m.NodeId === r);
                const sp = document.createElement('span');
                sp.className = 'ich';
                const dsp = document.createElement('span');
                dsp.className = 'ichd';
                dsp.style.background = '#fb923c';
                sp.appendChild(dsp);
                sp.appendChild(document.createTextNode(x ? x.NodeName.slice(0, 22) : r));
                icEl.appendChild(sp);
            });
        }

        const ib = this.container.querySelector('#ib') as HTMLElement;
        if (ib) ib.style.display = 'flex';
    }

    public hide(): void {
        const ib = this.container.querySelector('#ib') as HTMLElement;
        if (ib) ib.style.display = 'none';
    }
}
