// main.js: fast isolate mode via filtered subgraph, highlight/isolate toggle, fit to content, precomputed dependents

window.onload = () => {
    const params = new URLSearchParams(window.location.search);
    const copy = params.get("copy");
    if (copy) {
		startDialog.style.display = "flex";
	}
}


let measures = [], tables = [], edges = [], nameMap = {}, nodePos = {};
let selectedNode = null, referencedNodes = new Set(), filterText = "";
let hoveredNode = null;
let filterSet = null;
let filterMode = "highlight";
let pan = { x: 0, y: 0 }, zoom = 1;
let isPanning = false, panButton = null, dragStart = null, dragPanStart = null;
let dragNode = null, dragStartNode = null, dragStartMouse = null, customNodePos = {};
let possibleDragNode = null;
let dependentsMap = {}, dependenciesMap = {}, tableDependents = {};

let filteredMeasures = [], filteredTables = [], filteredEdges = [], filteredNameMap = {}, filteredCustomNodePos = {};

const canvas = document.getElementById("diagramCanvas");
const container = document.getElementById("canvasContainer");
const searchInput = document.getElementById("searchInput");
const exportBtn = document.getElementById("exportBtn");
const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("fileInput");
const pasteBtn = document.getElementById("pasteBtn");
const startBtn = document.getElementById("startConfirmBtn");
const sidebar = document.getElementById("sidebar");
const sidebarTitle = document.getElementById("sidebarTitle");
const sidebarBody = document.getElementById("sidebarBody");
const sidebarRefs = document.getElementById("sidebarRefs");
const closeSidebar = document.getElementById("closeSidebar");
const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");
const closeHelpModal = document.getElementById("closeHelpModal");
const startDialog = document.getElementById("startDialog");
const closeStartDialog = document.getElementById("closeStartDialog");
const pasteDialog = document.getElementById("pasteDialog");
const pasteArea = document.getElementById("pasteArea");
const closePasteDialog = document.getElementById("closePasteDialog");
const pasteConfirmBtn = document.getElementById("pasteConfirmBtn");
const fitBtn = document.getElementById("fitBtn");
const filterHighlight = document.getElementById("filterHighlight");
const filterIsolate = document.getElementById("filterIsolate");

function updateToggleUI() {
  filterHighlight.classList.toggle("selected", filterMode === "highlight");
  filterIsolate.classList.toggle("selected", filterMode === "isolate");
}
filterHighlight.onclick = () => {
  filterMode = "highlight";
  updateToggleUI();
  updateFilterSet();
  requestRedraw();
};
filterIsolate.onclick = () => {
  filterMode = "isolate";
  updateToggleUI();
  updateFilterSet();
  requestRedraw();
};
updateToggleUI();

let redrawRequested = false;
function requestRedraw() {
    if (!redrawRequested) {
        redrawRequested = true;
        window.requestAnimationFrame(() => {
            redrawRequested = false;
            layoutAndDraw();
        });
    }
}

function loadMeasuresFromJson(json) {
    try {
        let parsed = parseMeasuresJson(json);
        measures = parsed.measures;
        tables = parsed.tables;
        edges = parsed.edges;
        nameMap = parsed.nameMap;
        pan = { x: 0, y: 0 };
        zoom = 1;
        filterText = "";
        searchInput.value = "";
        selectedNode = null;
        referencedNodes = new Set();
        hoveredNode = null;
        filterSet = null;
        customNodePos = {};
        dependentsMap = {}; dependenciesMap = {}; tableDependents = {};
        for (let m of measures) {
            dependenciesMap[m.name] = { measures: new Set(m.dependencies || []), tables: new Set(m.tables || []) };
            if (!(dependentsMap[m.name])) dependentsMap[m.name] = new Set();
        }
        for (let t of tables) {
            tableDependents[t.name] = new Set();
        }
        for (let m of measures) {
            for (let dep of m.dependencies || []) {
                if (!dependentsMap[dep]) dependentsMap[dep] = new Set();
                dependentsMap[dep].add(m.name);
            }
            for (let t of m.tables || []) {
                if (!tableDependents[t]) tableDependents[t] = new Set();
                tableDependents[t].add(m.name);
            }
        }
        closeSidebarFn();
        fitToContent();
        requestRedraw();
    } catch (e) {
        alert("Failed to parse JSON: " + e.message +".\nIf this was trigger from Power Bi Desktop, Go to help and follow the instructions to start the lineage.");
    }
}

function layoutAndDraw() {
    let useFiltered = (filterMode === "isolate" && filterSet && filterSet.size > 0);
    let layoutMeasures = measures, layoutTables = tables, layoutEdges = edges, layoutNameMap = nameMap, layoutCustomNodePos = customNodePos;
    if (useFiltered) {
        layoutMeasures = filteredMeasures;
        layoutTables = filteredTables;
        layoutEdges = filteredEdges;
        layoutNameMap = filteredNameMap;
        layoutCustomNodePos = filteredCustomNodePos;
    }
    nodePos = Diagram.layoutNodes(layoutMeasures, layoutTables, layoutCustomNodePos);

    let ext = getExtents(nodePos);
    let pad = 200;
    let w = Math.max(container.clientWidth, ext.maxX + pad), h = Math.max(container.clientHeight, ext.maxY + pad);
    canvas.width = w; canvas.height = h;
    let ctx = canvas.getContext("2d");
    ctx.save();
    ctx.setTransform(zoom, 0, 0, zoom, pan.x, pan.y);
    Diagram.drawDiagram(
        ctx, layoutMeasures, layoutTables, layoutEdges, nodePos,
        selectedNode, referencedNodes, hoveredNode,
        filterSet, dragNode && dragNode.key, filterMode, zoom
    );
    ctx.restore();
}

function getExtents(nodePos) {
    let minX = 1e9, minY = 1e9, maxX = 0, maxY = 0;
    for (let n in nodePos) {
        let p = nodePos[n];
        let w = p.type === "table" ? Diagram.TABLE_WIDTH : Diagram.NODE_WIDTH;
        let h = p.type === "table" ? Diagram.TABLE_HEIGHT : Diagram.NODE_HEIGHT;
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + w);
        maxY = Math.max(maxY, p.y + h);
    }
    if (maxX < minX) minX = maxX = minY = maxY = 0;
    return { minX, minY, maxX, maxY };
}

uploadBtn.onclick = () => fileInput.click();
fileInput.onchange = e => {
    let file = e.target.files[0];
    if (!file) return;
    let reader = new FileReader();
    reader.onload = evt => loadMeasuresFromJson(evt.target.result);
    reader.readAsText(file);
};

pasteBtn.onclick = () => {
    pasteDialog.style.display = "flex";
    pasteArea.value = "";
};
closePasteDialog.onclick = () => { pasteDialog.style.display = "none"; };
pasteConfirmBtn.onclick = () => {
    let txt = pasteArea.value.trim();
    if (!txt) return;
    loadMeasuresFromJson(txt);
    pasteDialog.style.display = "none";
};

startBtn.onclick = () => {
    let clipboardText = "";
    navigator.clipboard.readText().then(text => {
        clipboardText = text.trim();
        if (clipboardText) {
            loadMeasuresFromJson(clipboardText);
            startDialog.style.display = "none";
        } else {
            alert("There was an error reading the model automatically. Please follow the instructions at help to run it manually.");
        }
    }).catch(err => {
        alert("Failed to read clipboard: " + err);
    });
};

closeStartDialog.onclick = () => { startDialog.style.display = "none";};

searchInput.oninput = e => {
    filterText = e.target.value;
    updateFilterSet();
    requestRedraw();
};

function updateFilterSet() {
    if (!filterText.trim()) {
        filterSet = null;
        filteredMeasures = [];
        filteredTables = [];
        filteredEdges = [];
        filteredNameMap = {};
        filteredCustomNodePos = {};
        return;
    }
    let txt = filterText.trim().toLowerCase();
    let matchedMeasures = measures.filter(m => m.name.toLowerCase().includes(txt));
    let matchedTables = tables.filter(t => t.name.toLowerCase().includes(txt));
    if (filterMode === "highlight") {
        filterSet = new Set();
        matchedMeasures.forEach(m => filterSet.add(m.name));
        matchedTables.forEach(t => filterSet.add("TBL::" + t.name));
        filteredMeasures = [];
        filteredTables = [];
        filteredEdges = [];
        filteredNameMap = {};
        filteredCustomNodePos = {};
    } else if (filterMode === "isolate") {
        filterSet = new Set();
        matchedMeasures.forEach(m => filterSet.add(m.name));
        matchedTables.forEach(t => filterSet.add("TBL::" + t.name));
        for (let m of matchedMeasures) {
            (m.dependencies || []).forEach(dep => filterSet.add(dep));
            (m.tables || []).forEach(tbl => filterSet.add("TBL::" + tbl));
            for (let dep of (dependentsMap[m.name] || [])) filterSet.add(dep);
        }
        for (let t of matchedTables) {
            for (let m of (tableDependents[t.name] || [])) filterSet.add(m);
        }

        // --- Filtered subgraph: only nodes and edges in filterSet ---
        filteredMeasures = measures.filter(m => filterSet.has(m.name));
        filteredTables = tables.filter(t => filterSet.has("TBL::" + t.name));
        filteredEdges = edges.filter(e => {
            let fromKey = (e.fromType === "TABLE" ? "TBL::" : "") + e.from;
            let toKey = e.to;
            return filterSet.has(fromKey) && filterSet.has(toKey);
        });
        filteredNameMap = {};
        filteredMeasures.forEach(m => filteredNameMap[m.name] = m);
        filteredTables.forEach(t => filteredNameMap["TBL::" + t.name] = t);

        // Only preserve custom positions for filtered nodes (for smooth dragging)
        filteredCustomNodePos = {};
        for (let key of filterSet) {
            if (customNodePos[key]) filteredCustomNodePos[key] = { ...customNodePos[key] };
        }
    }
}

exportBtn.onclick = () => {
    Diagram.exportCanvasToPng(canvas, "dax-lineage.png");
};

helpBtn.onclick = () => {
    helpModal.style.display = "flex";
};
closeHelpModal.onclick = () => {
    helpModal.style.display = "none";
};

closeSidebar.onclick = closeSidebarFn;
function closeSidebarFn() {
    sidebar.classList.remove("open");
}

fitBtn.onclick = fitToContent;
function fitToContent() {
    // Support subgraph for isolate mode
    let useFiltered = (filterMode === "isolate" && filterSet && filterSet.size > 0);
    let nodePosToFit = useFiltered
        ? Diagram.layoutNodes(filteredMeasures, filteredTables, filteredCustomNodePos)
        : Diagram.layoutNodes(measures, tables, customNodePos);
    let ext = getExtents(nodePosToFit);
    let containerW = container.clientWidth, containerH = container.clientHeight;
    let pad = 30;
    let contentW = ext.maxX - ext.minX + pad * 2;
    let contentH = ext.maxY - ext.minY + pad * 2;
    let zoomW = containerW / contentW;
    let zoomH = containerH / contentH;
    let newZoom = Math.min(zoomW, zoomH, 1.5);
    zoom = Math.max(0.3, Math.min(newZoom, 2.5));
    pan.x = (containerW - (ext.maxX + ext.minX) * zoom) / 2;
    pan.y = (containerH - (ext.maxY + ext.minY) * zoom) / 2;
    requestRedraw();
}

function getMousePos(evt) {
    let rect = canvas.getBoundingClientRect();
    let x = (evt.clientX - rect.left - pan.x) / zoom;
    let y = (evt.clientY - rect.top - pan.y) / zoom;
    return { x, y };
}

canvas.onmousedown = evt => {
    let mouse = getMousePos(evt);
    let hit = Diagram.hitTestNode(mouse, nodePos);
    if (evt.button === 1) { // Middle mouse for panning
        evt.preventDefault();
        isPanning = true;
        panButton = 1;
        dragNode = null;
        dragStart = { x: evt.clientX, y: evt.clientY };
        dragPanStart = { x: pan.x, y: pan.y };
        canvas.style.cursor = "grabbing";
    } else if (evt.button === 0) { // Left click
        if (hit) {
            possibleDragNode = { ...hit, key: (hit.kind === "table" ? "TBL::" : "") + hit.name };
            dragStartNode = { ...nodePos[possibleDragNode.key] };
            dragStartMouse = getMousePos(evt);
        } else {
            selectedNode = null;
            referencedNodes = new Set();
            hoveredNode = null;
            closeSidebarFn();
            requestRedraw();
        }
    }
};

canvas.onmousemove = evt => {
    if (isPanning) {
        let dx = evt.clientX - dragStart.x;
        let dy = evt.clientY - dragStart.y;
        pan.x = dragPanStart.x + dx;
        pan.y = dragPanStart.y + dy;
        requestRedraw();
        return;
    }
    let mouse = getMousePos(evt);
    if (possibleDragNode && evt.buttons & 1) {
        let dx = mouse.x - dragStartMouse.x;
        let dy = mouse.y - dragStartMouse.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) {
            dragNode = possibleDragNode;
            possibleDragNode = null;
        }
    }
    if (dragNode && (evt.buttons & 1)) {
        let mouseNow = getMousePos(evt);
        // Drag should apply to only the correct customNodePos set (filtered or full)
        let key = dragNode.key;
        let useFiltered = (filterMode === "isolate" && filterSet && filterSet.size > 0);
        let _customNodePos = useFiltered ? filteredCustomNodePos : customNodePos;
        _customNodePos[key] = {
            x: dragStartNode.x + (mouseNow.x - dragStartMouse.x),
            y: dragStartNode.y + (mouseNow.y - dragStartMouse.y)
        };
        requestRedraw();
        return;
    }
    let hit = Diagram.hitTestNode(mouse, nodePos);
    let changed = !(
        (hit && hoveredNode && hit.kind === hoveredNode.kind && hit.name === hoveredNode.name) ||
        (!hit && !hoveredNode)
    );
    if (changed) {
        hoveredNode = hit;
        requestRedraw();
    }
};

canvas.onmouseup = evt => {
    if (isPanning && evt.button === panButton) {
        isPanning = false;
        panButton = null;
        canvas.style.cursor = "default";
    }
    if (dragNode && evt.button === 0) {
        dragNode = null;
        requestRedraw();
        return;
    }
    if (possibleDragNode && evt.button === 0) {
        selectedNode = { kind: possibleDragNode.kind, name: possibleDragNode.name };
        referencedNodes = new Set();
        hoveredNode = null;
        let useFiltered = (filterMode === "isolate" && filterSet && filterSet.size > 0);
        let _nameMap = useFiltered ? filteredNameMap : nameMap;
        let _measures = useFiltered ? filteredMeasures : measures;
        let _tables = useFiltered ? filteredTables : tables;
        let _tableDependents = useFiltered ? {} : tableDependents;
        if (possibleDragNode.kind === "measure") {
            let m = _nameMap[possibleDragNode.name];
            if (m) {
                (m.dependencies || []).forEach(dep => referencedNodes.add(dep));
                (m.tables || []).forEach(tab => referencedNodes.add("TBL::" + tab));
                sidebarTitle.textContent = m.name;
                sidebarBody.textContent = m.expression.trim();
                let html = '';
                if (m.dependencies && m.dependencies.length) {
                    html += `<b>Referenced measures:</b><ul>${m.dependencies.map(d => `<li>${d}</li>`).join("")}</ul>`;
                }
                if (m.tables && m.tables.length) {
                    html += `<b>Referenced tables:</b><ul>${m.tables.map(t => `<li>${t}</li>`).join("")}</ul>`;
                }
                sidebarRefs.innerHTML = html || "";
                sidebar.classList.add("open");
            }
        } else if (possibleDragNode.kind === "table") {
            sidebarTitle.textContent = `Table: ${possibleDragNode.name}`;
            sidebarBody.textContent = possibleDragNode.name;
            let dependents = useFiltered
                ? _measures.filter(m => (m.tables || []).includes(possibleDragNode.name)).map(m => m.name)
                : Array.from((_tableDependents[possibleDragNode.name] || []));
            for (let m of dependents) {
                referencedNodes.add(m);
            }
            sidebarRefs.innerHTML = "";
            sidebar.classList.add("open");
        }
        possibleDragNode = null;
        dragStartNode = null;
        dragStartMouse = null;
        requestRedraw();
    }
    dragNode = null;
};

canvas.onmouseleave = () => {
    if (isPanning) {
        isPanning = false;
        panButton = null;
        canvas.style.cursor = "default";
    }
    if (dragNode) {
        dragNode = null;
    }
    possibleDragNode = null;
    dragStartNode = null;
    dragStartMouse = null;
    hoveredNode = null;
    requestRedraw();
};

canvas.onwheel = evt => {
    let mx = evt.offsetX, my = evt.offsetY;
    let oldZoom = zoom;
    let delta = evt.deltaY < 0 ? 1.08 : 0.93;
    let newZoom = Math.max(0.35, Math.min(2.5, zoom * delta));
    if (Math.abs(newZoom - zoom) < 0.01) return;
    let wx = (mx - pan.x) / zoom, wy = (my - pan.y) / zoom;
    pan.x = mx - wx * newZoom;
    pan.y = my - wy * newZoom;
    zoom = newZoom;
    requestRedraw();
    evt.preventDefault();
};

window.onkeydown = evt => {
    if (evt.key === "Escape") {
        closeSidebarFn();
        pasteDialog.style.display = "none";
        helpModal.style.display = "none";
    }
};
window.onresize = () => requestRedraw();

requestRedraw();
canvas.style.cursor = "default";