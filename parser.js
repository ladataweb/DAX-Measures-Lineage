// parser.js: Parse explicit measure and table lineage JSON, with dependency depth calculation

function parseMeasuresJson(json) {
    let obj = typeof json === "string" ? JSON.parse(json) : json;
    let header = obj.header, data = obj.data;
    if (!header || !data) throw new Error("Invalid JSON format");

    let nameIdx = header.indexOf("[Measure]");
    let exprIdx = header.indexOf("[Expression]");
    let typeIdx = header.indexOf("[Referenced_Object_Type]");
    let refIdx  = header.indexOf("[Referenced_Object]");
    if (nameIdx < 0 || exprIdx < 0 || typeIdx < 0 || refIdx < 0)
        throw new Error("Header missing required columns");

    // Build measure and table maps
    let measureMap = {}, tableMap = {};
    let edges = []; // { fromType, from, toType, to }

    for (let row of data) {
        let measure = row[nameIdx].trim();
        let expr = row[exprIdx] ?? "";
        let refType = row[typeIdx]?.toUpperCase() ?? "";
        let refObj = row[refIdx]?.trim();
        if (!(measure in measureMap))
            measureMap[measure] = { name: measure, expression: expr, dependencies: [], tables: [] };
        if (refType === "MEASURE") {
            measureMap[measure].dependencies.push(refObj);
            edges.push({ fromType:"MEASURE", from: refObj, toType:"MEASURE", to: measure });
        }
        if (refType === "TABLE") {
            measureMap[measure].tables.push(refObj);
            tableMap[refObj] = { name: refObj };
            edges.push({ fromType:"TABLE", from: refObj, toType:"MEASURE", to: measure });
        }
    }
    let tables = Object.values(tableMap);
    let measures = Object.values(measureMap);

    // --- Dependency depth calculation ---
    let tableSet = new Set(tables.map(t => t.name));
    let measureSet = new Set(measures.map(m => m.name));
    let depthMap = {};
    function getDepth(name) {
        if (depthMap[name] != null) return depthMap[name];
        if (tableSet.has(name)) return 0;
        let m = measureMap[name];
        if (!m) return 1;
        let deps = m.dependencies.filter(dep => measureSet.has(dep));
        if (!deps.length) {
            return depthMap[name] = 1;
        }
        let d = 1 + Math.max(...deps.map(getDepth));
        return depthMap[name] = d;
    }
    for (let m of measures) getDepth(m.name);
    for (let m of measures) m._depth = depthMap[m.name] ?? 1;

    let nameMap = {};
    for (let m of measures) nameMap[m.name] = m;

    return { measures, tables, edges, nameMap };
}