import { NodeData } from "../interfaces";
import { nodeCls, esc, fresh } from "../utils/helpers";

export class CardBuilder {

    public makeCard(
        node: NodeData,
        wc: Record<string, string>,
        UP: Record<string, number>,
        DN: Record<string, number>,
        RI: Record<string, Set<string>>,
        onCardClick: (id: string) => void,
        onHover: (node: NodeData, el: HTMLElement) => void,
        onLeave: () => void
    ): HTMLElement {
        const cls = nodeCls(node.NodeType);
        const wsColor = wc[node.Workspace] || '#6b7fa3';

        const uc = UP[node.NodeId] || 0;
        const dc = DN[node.NodeId] || 0;
        const ic = (RI[node.NodeId] || new Set()).size;

        const card = document.createElement('div');
        card.className = 'nc ' + cls;
        card.dataset.id = node.NodeId;

        const wt = document.createElement('div');
        wt.className = 'wt';
        wt.style.background = wsColor;
        card.appendChild(wt);

        const cbody = document.createElement('div');
        cbody.className = 'cbody';

        const ct2 = document.createElement('div');
        ct2.className = 'ct2';

        const cnm = document.createElement('div');
        cnm.className = 'cnm';
        cnm.textContent = node.NodeName;
        ct2.appendChild(cnm);

        const cbs = document.createElement('div');
        cbs.className = 'cbs';

        if (node.NodeType !== 'Report' && ic > 0) {
            const ib = document.createElement('span');
            ib.className = 'bg bi';
            ib.title = ic + ' reports affected';
            ib.textContent = '\u26A1' + ic; // thunderbolt icon
            cbs.appendChild(ib);
        }
        if (uc > 0) {
            const upb = document.createElement('span');
            upb.className = 'bg bu';
            upb.title = uc + ' upstream';
            upb.textContent = '\u2191' + uc; // up arrow
            cbs.appendChild(upb);
        }
        if (dc > 0) {
            const dnb = document.createElement('span');
            dnb.className = 'bg bd';
            dnb.title = dc + ' downstream';
            dnb.textContent = '\u2193' + dc; // down arrow
            cbs.appendChild(dnb);
        }
        ct2.appendChild(cbs);
        cbody.appendChild(ct2);

        const cws = document.createElement('div');
        cws.className = 'cws';
        cws.style.color = wsColor;
        cws.textContent = node.Workspace;
        cbody.appendChild(cws);

        const cmt = document.createElement('div');
        cmt.className = 'cmt';

        const fr = fresh(node.RefreshTime);
        if (fr) {
            const fh = document.createElement('span');
            fh.className = 'mi';
            const fd = document.createElement('span');
            fd.className = 'fd ' + fr.cssClass;
            fh.appendChild(fd);
            fh.appendChild(document.createTextNode(fr.label));
            cmt.appendChild(fh);
        }

        if (node.PbiUrl && node.PbiUrl !== '') {
            const lh = document.createElement('a');
            lh.className = 'lnk';
            lh.href = node.PbiUrl;
            lh.target = '_blank';
            lh.rel = 'noopener';
            lh.textContent = '\u2197 Open'; // upward slanted arrow
            lh.onclick = (e) => e.stopPropagation();
            cmt.appendChild(lh);
        }

        cbody.appendChild(cmt);
        card.appendChild(cbody);

        const rB = this.rsBar(node.RefreshStatus || '');
        if (rB) card.appendChild(rB);

        card.addEventListener('mouseenter', () => onHover(node, card));
        card.addEventListener('mouseleave', onLeave);
        card.addEventListener('click', () => onCardClick(node.NodeId));

        return card;
    }

    private rsBar(st: string): HTMLElement | null {
        if (!st) return null;
        const d = document.createElement('div');
        const s = document.createElement('span');
        s.className = 'rs-dot';
        d.appendChild(s);

        if (st === 'success') {
            d.className = 'rs-bar rs-success';
            d.appendChild(document.createTextNode('Success'));
            return d;
        }
        if (st === 'failed') {
            d.className = 'rs-bar rs-failed';
            d.appendChild(document.createTextNode('Failed'));
            return d;
        }
        if (st === 'progress') {
            d.className = 'rs-bar rs-progress';
            d.appendChild(document.createTextNode('In Progress'));
            return d;
        }
        return null;
    }
}
