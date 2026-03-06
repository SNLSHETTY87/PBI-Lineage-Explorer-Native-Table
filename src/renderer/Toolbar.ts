import { NodeData } from "../interfaces";
import { initWorkspaceColors } from "../utils/helpers";

export class Toolbar {
    private container: HTMLElement;
    private onFilterChange: () => void;

    constructor(container: HTMLElement, onFilterChange: () => void) {
        this.container = container;
        this.onFilterChange = onFilterChange;
    }

    public buildDropdowns(
        nodes: NodeData[],
        WC: Record<string, string>,
        selWS: Set<string>,
        selDF: Set<string>,
        selRP: Set<string>
    ): void {
        // workspace list
        const wsList = this.container.querySelector('#ws-list') as HTMLElement;
        if (wsList) {
            while (wsList.firstChild) wsList.removeChild(wsList.firstChild);
            [...new Set(nodes.map(n => n.Workspace))].sort().forEach(w =>
                wsList.appendChild(this.makeMsItem('ws', w, w, WC[w] || '#818cf8'))
            );
        }

        // dataflow list
        const dfList = this.container.querySelector('#df-list') as HTMLElement;
        if (dfList) {
            while (dfList.firstChild) dfList.removeChild(dfList.firstChild);
            nodes.filter(n => n.NodeType === 'Dataflow')
                .sort((a, b) => a.NodeName.localeCompare(b.NodeName))
                .forEach(n => dfList.appendChild(this.makeMsItem('df', n.NodeId, n.NodeName, '#4d9eff', n.Workspace)));
        }

        // report list
        const rpList = this.container.querySelector('#rp-list') as HTMLElement;
        if (rpList) {
            while (rpList.firstChild) rpList.removeChild(rpList.firstChild);
            nodes.filter(n => n.NodeType === 'Report')
                .sort((a, b) => a.NodeName.localeCompare(b.NodeName))
                .forEach(n => rpList.appendChild(this.makeMsItem('rp', n.NodeId, n.NodeName, '#fb923c', n.Workspace)));
        }

        // workspace legend
        const wsl = this.container.querySelector('#wsl') as HTMLElement;
        if (wsl) {
            while (wsl.firstChild) wsl.removeChild(wsl.firstChild);
            [...new Set(nodes.map(n => n.Workspace))].sort().forEach(w => {
                const d = document.createElement('div');
                d.className = 'wli';
                const wld = document.createElement('div');
                wld.className = 'wld';
                wld.style.background = WC[w];
                d.appendChild(wld);
                d.appendChild(document.createTextNode(w));
                wsl.appendChild(d);
            });
        }
    }

    public getFilterSelections(): { ws: Set<string>; df: Set<string>; rp: Set<string> } {
        return {
            ws: this.getChecked('ws'),
            df: this.getChecked('df'),
            rp: this.getChecked('rp')
        };
    }

    public bindDropdownToggles(): void {
        ['ws', 'df', 'rp'].forEach(type => {
            const btn = this.container.querySelector('#' + type + '-btn') as HTMLElement;
            if (btn) btn.addEventListener('click', () => this.toggleDrop(type));

            const searchInput = this.container.querySelector('#' + type + '-drop .ms-search') as HTMLInputElement;
            if (searchInput) {
                searchInput.addEventListener('input', () => this.filterList(type, searchInput.value));
                // prevent dropdown close when clicking inside search
                searchInput.addEventListener('click', (e: Event) => e.stopPropagation());
            }

            const allBtn = this.container.querySelector('#' + type + '-drop .ms-foot-btn.all') as HTMLElement;
            const clrBtn = this.container.querySelector('#' + type + '-drop .ms-foot-btn.clr') as HTMLElement;
            if (allBtn) allBtn.addEventListener('click', () => this.selectAll(type));
            if (clrBtn) clrBtn.addEventListener('click', () => this.clearAll(type));
        });

        // close dropdowns on click outside
        document.addEventListener('click', (e: Event) => {
            if (!(e.target as HTMLElement).closest('.ms-wrap')) {
                this.container.querySelectorAll('.ms-drop').forEach(d => d.classList.remove('open'));
                this.container.querySelectorAll('.ms-btn').forEach(b => b.classList.remove('open'));
                this.clearAllSearches();
            }
        });
    }

    private makeMsItem(type: string, val: string, label: string, dotColor: string, subtitle?: string): HTMLElement {
        const div = document.createElement('div');
        div.className = 'ms-item';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.type = type;
        cb.dataset.val = val;
        cb.addEventListener('change', () => {
            this.updateBadge(type);
            this.onFilterChange();
        });

        const dot = document.createElement('span');
        dot.className = 'ms-item-dot';
        dot.style.background = dotColor;

        const lblWrap = document.createElement('span');
        lblWrap.className = 'ms-item-wrap';

        const lbl = document.createElement('span');
        lbl.className = 'ms-item-lbl';
        lbl.title = subtitle ? label + ' · ' + subtitle : label;
        lbl.textContent = label;
        lblWrap.appendChild(lbl);

        if (subtitle) {
            const sub = document.createElement('span');
            sub.className = 'ms-item-sub';
            sub.textContent = subtitle;
            lblWrap.appendChild(sub);
        }

        div.appendChild(cb);
        div.appendChild(dot);
        div.appendChild(lblWrap);

        // entire row toggles checkbox
        div.addEventListener('click', (e: Event) => {
            if ((e.target as HTMLElement).tagName !== 'INPUT') {
                cb.checked = !cb.checked;
                this.updateBadge(type);
                this.onFilterChange();
            }
        });

        return div;
    }

    private toggleDrop(type: string): void {
        const drop = this.container.querySelector('#' + type + '-drop') as HTMLElement;
        const btn = this.container.querySelector('#' + type + '-btn') as HTMLElement;
        const isOpen = drop?.classList.contains('open');

        this.container.querySelectorAll('.ms-drop').forEach(d => d.classList.remove('open'));
        this.container.querySelectorAll('.ms-btn').forEach(b => b.classList.remove('open'));
        this.clearAllSearches();

        if (!isOpen) {
            drop?.classList.add('open');
            btn?.classList.add('open');
            const searchInput = drop?.querySelector('.ms-search') as HTMLInputElement;
            if (searchInput) setTimeout(() => searchInput.focus(), 50);
        }
    }

    private filterList(type: string, query: string): void {
        const q = query.toLowerCase().trim();
        this.container.querySelectorAll<HTMLElement>('#' + type + '-list .ms-item').forEach(item => {
            const lbl = item.querySelector('.ms-item-lbl')?.textContent?.toLowerCase() || '';
            const sub = item.querySelector('.ms-item-sub')?.textContent?.toLowerCase() || '';
            item.style.display = q && !lbl.includes(q) && !sub.includes(q) ? 'none' : '';
        });
    }

    private clearAllSearches(): void {
        this.container.querySelectorAll<HTMLInputElement>('.ms-search').forEach(s => {
            s.value = '';
        });
        this.container.querySelectorAll<HTMLElement>('.ms-item').forEach(item => {
            item.style.display = '';
        });
    }

    private selectAll(type: string): void {
        this.container.querySelectorAll<HTMLInputElement>('input[data-type="' + type + '"]')
            .forEach(cb => cb.checked = true);
        this.updateBadge(type);
        this.onFilterChange();
    }

    private clearAll(type: string): void {
        this.container.querySelectorAll<HTMLInputElement>('input[data-type="' + type + '"]')
            .forEach(cb => cb.checked = false);
        this.updateBadge(type);
        this.onFilterChange();
    }

    private getChecked(type: string): Set<string> {
        const checked: string[] = [];
        this.container.querySelectorAll<HTMLInputElement>('input[data-type="' + type + '"]:checked')
            .forEach(c => checked.push(c.dataset.val || ''));
        return new Set(checked);
    }

    private updateBadge(type: string): void {
        const checked = this.getChecked(type);
        const badge = this.container.querySelector('#' + type + '-badge') as HTMLElement;
        const lbl = this.container.querySelector('#' + type + '-lbl') as HTMLElement;

        if (!badge || !lbl) return;

        if (checked.size === 0) {
            badge.style.display = 'none';
            lbl.textContent = 'All';
        } else {
            badge.style.display = '';
            badge.textContent = String(checked.size);

            const firstItem = this.container.querySelector('input[data-type="' + type + '"]:checked');
            const firstName = firstItem?.closest('.ms-item')?.querySelector('.ms-item-lbl')?.textContent || '';

            lbl.textContent = checked.size === 1
                ? firstName.slice(0, 14) + (firstName.length > 14 ? '\u2026' : '')
                : 'Multi';
        }
    }
}
