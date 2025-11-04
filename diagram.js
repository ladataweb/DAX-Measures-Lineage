// diagram.js: DAG-style layout, draggable nodes, highlight on click/hover, fixed node size forever

const NODE_WIDTH = 220, NODE_HEIGHT = 56, NODE_GAP_X = 180, NODE_GAP_Y = 80;
const TABLE_WIDTH = 160, TABLE_HEIGHT = 48;
const FONT = "14px 'Segoe UI', Arial, sans-serif";
const BOX_COLOR = "#232323";
const BOX_BORDER = "#333";
const BOX_SELECTED = "#ff9800";
const REF_HIGHLIGHT = "#ffa733";
const HOVER_HIGHLIGHT = "#38bdf8";
const FILTER_HIGHLIGHT = "#2563eb";
const TABLE_BOX_COLOR = "#353535";
const TABLE_BORDER = BOX_BORDER;
const TEXT_COLOR = "#e0e0e0";
const TABLE_TEXT_COLOR = "#ff9800";
const SHADOW = "rgba(30,30,30,0.6)";
const ARROW_COLOR = "#bbbbbb";
const ARROW_TABLE = "#bbbbbb";

function layoutNodes(measures, tables, customNodePos) {
    let nodePos = {};
    let x0 = 80, y0 = 80;
    for (let i = 0; i < tables.length; ++i) {
        let key = "TBL::" + tables[i].name;
        if (customNodePos && customNodePos[key]) {
            nodePos[key] = { ...customNodePos[key], type: "table", node: tables[i] };
        } else {
            nodePos[key] = {
                x: x0,
                y: y0 + i * (TABLE_HEIGHT + NODE_GAP_Y),
                type: "table",
                node: tables[i]
            };
        }
    }
    let depthGroups = {};
    for (let m of measures) {
        let d = m._depth ?? 1;
        if (!depthGroups[d]) depthGroups[d] = [];
        depthGroups[d].push(m);
    }
    let depths = Object.keys(depthGroups).map(Number).sort((a, b) => a - b);
    let colCount = depths.length;
    for (let c = 0; c < colCount; ++c) {
        let d = depths[c];
        let group = depthGroups[d];
        for (let i = 0; i < group.length; ++i) {
            let key = group[i].name;
            if (customNodePos && customNodePos[key]) {
                nodePos[key] = { ...customNodePos[key], type: "measure", node: group[i] };
            } else {
                nodePos[key] = {
                    x: x0 + TABLE_WIDTH + NODE_GAP_X + c * (NODE_WIDTH + NODE_GAP_X),
                    y: y0 + i * (NODE_HEIGHT + NODE_GAP_Y),
                    type: "measure",
                    node: group[i]
                };
            }
        }
    }
    return nodePos;
}

function drawDiagram(ctx, measures, tables, edges, nodePos, selected = null, referenced = null, hovered = null, filterSet = null, draggingKey = null, filterMode = "highlight", zoom = 1) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // 1. Draw arrows
    for (let edge of edges) {
        let fromKey = (edge.fromType === "TABLE" ? "TBL::" : "") + edge.from;
        let toKey = edge.to;
        let fromBox = nodePos[fromKey];
        let toBox = nodePos[toKey];
        if (!fromBox || !toBox) continue;
        let fromX = fromBox.x + (fromBox.type === "table" ? TABLE_WIDTH : NODE_WIDTH);
        let fromY = fromBox.y + (fromBox.type === "table" ? TABLE_HEIGHT/2 : NODE_HEIGHT/2);
        let toX = toBox.x;
        let toY = toBox.y + NODE_HEIGHT/2;
        drawArrow(ctx, fromX, fromY, toX, toY, edge.fromType === "TABLE" ? ARROW_TABLE : ARROW_COLOR);
    }
    // 2. Draw nodes
    for (let t of tables) {
        let key = "TBL::" + t.name;
        let pos = nodePos[key];
        if (!pos) continue;
        let isSel = selected && selected.kind === "table" && selected.name === t.name;
        let isRef = referenced && referenced.has(key);
        let isHovered = hovered && hovered.kind === "table" && hovered.name === t.name;
        let matchesFilter = filterSet && filterSet.has(key);
        let isDragging = draggingKey === key;
        drawTableNode(ctx, pos.x, pos.y, t.name, isSel, isRef, isHovered, matchesFilter, isDragging);
    }
    for (let m of measures) {
        let key = m.name;
        let pos = nodePos[key];
        if (!pos) continue;
        let isSel = selected && selected.kind === "measure" && selected.name === m.name;
        let isRef = referenced && referenced.has(m.name);
        let isHovered = hovered && hovered.kind === "measure" && hovered.name === m.name;
        let matchesFilter = filterSet && filterSet.has(m.name);
        let isDragging = draggingKey === key;
        drawMeasureNode(ctx, pos.x, pos.y, m.name, isSel, isRef, isHovered, matchesFilter, isDragging);
    }
}

function drawMeasureNode(ctx, x, y, name, selected = false, referenced = false, hovered = false, matchesFilter = false, dragging = false) {
    ctx.save();
    ctx.beginPath();
    ctx.shadowColor = SHADOW;
    ctx.shadowBlur = dragging ? 20 : selected ? 18 : referenced ? 12 : hovered ? 12 : matchesFilter ? 11 : 6;

    // Prioridad: seleccionado > referenced > hovered > matchesFilter > borde normal
    ctx.strokeStyle = dragging ? "#38bdf8"
        : selected ? BOX_SELECTED
        : referenced ? REF_HIGHLIGHT
        : hovered ? HOVER_HIGHLIGHT
        : matchesFilter ? FILTER_HIGHLIGHT
        : BOX_BORDER;

    ctx.fillStyle = BOX_COLOR;
    ctx.lineWidth = dragging ? 4
        : selected ? 3
        : referenced ? 2.5
        : hovered ? 2.5
        : matchesFilter ? 2
        : 2;
    ctx.roundRect(x, y, NODE_WIDTH, NODE_HEIGHT, 11);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = FONT;
    ctx.fillStyle = TEXT_COLOR;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(name, x + 18, y + NODE_HEIGHT / 2, NODE_WIDTH - 36);
    ctx.restore();
}

function drawTableNode(ctx, x, y, name, selected = false, referenced = false, hovered = false, matchesFilter = false, dragging = false) {
    ctx.save();
    ctx.beginPath();
    ctx.shadowColor = SHADOW;
    ctx.shadowBlur = dragging ? 20 : selected ? 18 : referenced ? 12 : hovered ? 12 : matchesFilter ? 11 : 8;

    // Prioridad: seleccionado > referenced > hovered > matchesFilter > borde normal
    ctx.strokeStyle = dragging ? "#38bdf8"
        : selected ? BOX_SELECTED
        : referenced ? REF_HIGHLIGHT
        : hovered ? HOVER_HIGHLIGHT
        : matchesFilter ? FILTER_HIGHLIGHT
        : TABLE_BORDER;

    ctx.fillStyle = TABLE_BOX_COLOR;
    ctx.lineWidth = dragging ? 4
        : selected ? 4
        : referenced ? 3
        : hovered ? 3
        : matchesFilter ? 2.5
        : 2.5;
    ctx.roundRect(x, y, TABLE_WIDTH, TABLE_HEIGHT, 15);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = "bold 15px 'Segoe UI', Arial, sans-serif";
    ctx.fillStyle = TABLE_TEXT_COLOR;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(name, x + TABLE_WIDTH / 2, y + TABLE_HEIGHT / 2, TABLE_WIDTH - 30);
    ctx.restore();
}

function drawArrow(ctx, x1, y1, x2, y2, color) {
    let dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
    if (len < 16) return;
    ctx.save();
    ctx.strokeStyle = color || ARROW_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let mx = x1 + (x2 - x1) * 0.4;
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2);
    ctx.stroke();
    let angle = Math.atan2(y2 - y1, x2 - x1);
    let size = 9;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - size * Math.cos(angle - 0.32), y2 - size * Math.sin(angle - 0.32));
    ctx.lineTo(x2 - size * Math.cos(angle + 0.32), y2 - size * Math.sin(angle + 0.32));
    ctx.closePath();
    ctx.fillStyle = color || ARROW_COLOR;
    ctx.fill();
    ctx.restore();
}

function hitTestNode(mouse, nodePos) {
    for (let key in nodePos) {
        let pos = nodePos[key];
        if (pos.type === "table") {
            if (
                mouse.x >= pos.x &&
                mouse.x <= pos.x + TABLE_WIDTH &&
                mouse.y >= pos.y &&
                mouse.y <= pos.y + TABLE_HEIGHT
            ) {
                return { kind: "table", name: pos.node.name };
            }
        } else {
            if (
                mouse.x >= pos.x &&
                mouse.x <= pos.x + NODE_WIDTH &&
                mouse.y >= pos.y &&
                mouse.y <= pos.y + NODE_HEIGHT
            ) {
                return { kind: "measure", name: pos.node.name };
            }
        }
    }
    return null;
}

function exportCanvasToPng(canvas, filename) {
    const link = document.createElement('a');
    link.download = filename || 'diagram.png';
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

window.Diagram = {
    layoutNodes,
    drawDiagram,
    hitTestNode,
    NODE_WIDTH,
    NODE_HEIGHT,
    TABLE_WIDTH,
    TABLE_HEIGHT,
    exportCanvasToPng
};