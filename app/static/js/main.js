// =================================================================
//                      Tableur Pro - Main Script
// =================================================================
// This script contains the core frontend logic for the spreadsheet
// application. It manages state, handles user interactions,
// evaluates formulas, and communicates with the backend API.
//

// --- Global Constants ---
const CODE_SERVER_URL = 'http://localhost:8000';

/**
 * Executes a block of code on the server backend via a secure API endpoint.
 * @param {string} code - The source code to execute.
 * @param {Array<any>} args - A list of arguments to pass to the code.
 * @param {string} language - The programming language ('python', 'javascript', 'c', 'lua').
 * @returns {Promise<any>} The result of the execution.
 */
async function executeCode(code, args, language) {
    try {
        const response = await fetch(`${CODE_SERVER_URL}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, args, language, timeout: 10 })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Server error for ${language}`);
        }
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }
        return data.result;
    } catch (e) {
        console.error(`Execution error for ${language}:`, e);
        return `#EXEC!`;
    }
}

// --- Main Application Logic ---
document.addEventListener('DOMContentLoaded', function() {

    // --- State Management ---
    let sheetData = {}; // Central data model, e.g., { "A1": { value: "10", formula: "=5+5", style: {} } }
    let dependencyGraph = {}; // Stores precedents, e.g., { "C1": ["A1", "B1"] } means C1 depends on A1 and B1.
    let reverseDependencyGraph = {}; // Stores dependents, e.g., { "A1": ["C1"] } means C1 depends on A1.

    // --- Global UI Variables ---
    const spreadsheet = document.getElementById('spreadsheet');
    const formulaInput = document.getElementById('formula-input');
    let initialRows = 100;
    let initialCols = 26;
    let currentCellCoords = null; // e.g., "A1"
    let isEditing = false;
    let customFunctions = {}; // To store loaded custom functions
    let functionEditor = null; // ACE editor instance
    let chartPreview = null;

    // --- Initialization ---
    function initializeApp() {
        initSpreadsheetUI();
        setupEventListeners();
        initFunctionEditor();
        loadInitialData();
    }

    async function loadInitialData() {
        await loadCustomFunctions();
        await loadSpreadsheet();
        await loadAndDisplayReports();
    }

    // =================================================================
    //                  Spreadsheet UI and Grid Logic
    // =================================================================

    /**
     * Creates the initial spreadsheet grid UI (headers and cells).
     */
    function initSpreadsheetUI() {
        const thead = spreadsheet.querySelector('thead tr');
        const tbody = spreadsheet.querySelector('tbody');

        thead.innerHTML = '<th class="corner-header"></th>';
        tbody.innerHTML = '';

        for (let i = 0; i < initialCols; i++) {
            const th = document.createElement('th');
            th.className = 'cell-header';
            th.textContent = getColumnLabel(i);
            thead.appendChild(th);
        }

        for (let i = 0; i < initialRows; i++) {
            const tr = document.createElement('tr');
            const rowHeader = document.createElement('th');
            rowHeader.className = 'row-header';
            rowHeader.textContent = i + 1;
            tr.appendChild(rowHeader);

            for (let j = 0; j < initialCols; j++) {
                const td = document.createElement('td');
                const coords = `${getColumnLabel(j)}${i + 1}`;
                td.className = 'cell';
                td.dataset.coords = coords;
                td.addEventListener('click', onCellClick);
                td.addEventListener('dblclick', onCellDblClick);
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
    }

    function getColumnLabel(index) {
        let label = '';
        let num = index;
        while (num >= 0) {
            label = String.fromCharCode(65 + (num % 26)) + label;
            num = Math.floor(num / 26) - 1;
        }
        return label;
    }

    function colLabelToIndex(label) {
        let index = 0;
        for (let i = 0; i < label.length; i++) {
            index = index * 26 + (label.charCodeAt(i) - 64);
        }
        return index - 1;
    }

    // =================================================================
    //                  State and Calculation Engine
    // =================================================================

    async function updateCell(coords, rawValue) {
        if (!sheetData[coords]) sheetData[coords] = {};
        const cell = sheetData[coords];
        const oldFormula = cell.formula;

        if (rawValue.startsWith('=')) {
            cell.formula = rawValue;
        } else {
            cell.formula = null;
            cell.value = rawValue;
        }

        if (oldFormula !== cell.formula) {
            buildDependencyGraphs();
        }

        await recalculate(coords);
    }

    function buildDependencyGraphs() {
        dependencyGraph = {};
        reverseDependencyGraph = {};
        const cellRefRegex = /([A-Z]+[0-9]+)/g;

        for (const coord in sheetData) {
            const cell = sheetData[coord];
            if (cell && cell.formula) {
                const dependencies = [...new Set([...cell.formula.matchAll(cellRefRegex)].map(match => match[0]))];
                dependencyGraph[coord] = dependencies;
                dependencies.forEach(dep => {
                    if (!reverseDependencyGraph[dep]) reverseDependencyGraph[dep] = [];
                    reverseDependencyGraph[dep].push(coord);
                });
            }
        }
    }

    async function recalculate(startCoord) {
        const cellsToRecalculate = getTopologicalOrder(startCoord);
        for (const coord of cellsToRecalculate) {
            const cell = sheetData[coord];
            if (cell && cell.formula) {
                try {
                    cell.value = await evaluateFormula(cell.formula.substring(1));
                } catch (e) {
                    console.error(`Error evaluating ${coord}:`, e);
                    cell.value = e.message.startsWith('#') ? e.message : '#ERROR!';
                }
            }
            renderCell(coord);
        }
    }

    function getTopologicalOrder(startCoord) {
        const order = [];
        const visited = new Set();
        const fullDepGraph = new Set();
        const queue = [startCoord];
        const seen = new Set([startCoord]);

        while (queue.length > 0) {
            const current = queue.shift();
            fullDepGraph.add(current);
            if (reverseDependencyGraph[current]) {
                reverseDependencyGraph[current].forEach(dep => {
                    if (!seen.has(dep)) {
                        seen.add(dep);
                        queue.push(dep);
                    }
                });
            }
        }

        function visit(coord) {
            if (visited.has(coord)) return;
            visited.add(coord);
            if (dependencyGraph[coord]) {
                dependencyGraph[coord].forEach(dep => {
                    if (fullDepGraph.has(dep)) {
                        visit(dep);
                    }
                });
            }
            order.push(coord);
        }

        fullDepGraph.forEach(coord => {
            if (!visited.has(coord)) {
                visit(coord);
            }
        });

        return order;
    }

    async function evaluateFormula(formula) {
        // This is a placeholder for a real formula evaluation engine.
        // For now, it only handles simple cell references and basic arithmetic.
        let expression = formula;

        const cellRefRegex = /([A-Z]+[0-9]+)/g;
        const cellRefs = [...new Set(expression.match(cellRefRegex))];

        if (cellRefs) {
            for (const ref of cellRefs) {
                const value = sheetData[ref] ? (Number(sheetData[ref].value) || 0) : 0;
                expression = expression.replace(new RegExp(`\\b${ref}\\b`, 'g'), value);
            }
        }

        try {
            // WARNING: Insecure, for demonstration only. Use a parser library in production.
            return new Function(`return ${expression}`)();
        } catch (e) {
            return "#NAME?";
        }
    }

    // =================================================================
    //                        UI Rendering
    // =================================================================

    function renderCell(coords) {
        const cellElement = document.querySelector(`.cell[data-coords="${coords}"]`);
        if (cellElement) {
            const cellData = sheetData[coords] || {};
            cellElement.textContent = cellData.value || '';
        }
    }

    function renderSheet() {
        for (let i = 0; i < initialRows; i++) {
            for (let j = 0; j < initialCols; j++) {
                const coords = `${getColumnLabel(j)}${i + 1}`;
                renderCell(coords);
            }
        }
    }

    // =================================================================
    //                        Event Handlers
    // =================================================================

    function onCellClick(e) {
        const cellElement = e.target;
        const coords = cellElement.dataset.coords;

        if (currentCellCoords) {
            document.querySelector(`.cell[data-coords="${currentCellCoords}"]`)?.classList.remove('selected');
        }

        saveCellContentFromInput();

        currentCellCoords = coords;
        cellElement.classList.add('selected');

        const cellData = sheetData[coords] || {};
        formulaInput.value = cellData.formula || cellData.value || '';
        document.getElementById('current-cell').textContent = coords;
        formulaInput.focus();
    }

    function onCellDblClick(e) {
        isEditing = true;
        const cellElement = e.target;
        cellElement.contentEditable = true;
        cellElement.focus();
        cellElement.addEventListener('blur', onCellBlur, { once: true });
    }

    function onCellBlur(e) {
        isEditing = false;
        e.target.contentEditable = false;
        updateCell(e.target.dataset.coords, e.target.textContent);
    }


    function onFormulaInput(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveCellContentFromInput();
            document.querySelector(`.cell[data-coords="${currentCellCoords}"]`)?.focus();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            const cellData = sheetData[currentCellCoords] || {};
            formulaInput.value = cellData.formula || cellData.value || '';
        }
    }

    function saveCellContentFromInput() {
        if (currentCellCoords) {
            updateCell(currentCellCoords, formulaInput.value);
        }
    }

    function setupEventListeners() {
        formulaInput.addEventListener('keydown', onFormulaInput);
        formulaInput.addEventListener('blur', saveCellContentFromInput);
        document.getElementById('save-btn').addEventListener('click', saveSpreadsheet);
        document.getElementById('load-btn').addEventListener('click', loadSpreadsheet);
        // ... Add all other event listeners from the HTML here
    }

    // =================================================================
    //                     Backend API Communication
    // =================================================================

    async function saveSpreadsheet() {
        const spreadsheetName = document.getElementById('spreadsheet-container').dataset.spreadsheetName;
        if (!spreadsheetName) return alert("Error: Spreadsheet name not found.");

        const dataToSave = { cells: sheetData };

        try {
            const response = await fetch(`/api/spreadsheets/${spreadsheetName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSave)
            });
            if (!response.ok) throw new Error('Failed to save spreadsheet.');
            alert('Spreadsheet saved successfully!');
        } catch (e) {
            console.error('Error saving spreadsheet:', e);
            alert('Error saving spreadsheet.');
        }
    }

    async function loadSpreadsheet() {
        const spreadsheetName = document.getElementById('spreadsheet-container').dataset.spreadsheetName;
        try {
            const response = await fetch(`/api/spreadsheets/${spreadsheetName}`);
            if (response.status === 404) {
                sheetData = {};
                console.log('New spreadsheet initialized.');
            } else if (response.ok) {
                const data = await response.json();
                sheetData = data.cells || {};
            } else {
                 throw new Error(`Server error: ${response.status}`);
            }

            buildDependencyGraphs();
            await recalculateAll();
            renderSheet();

        } catch (e) {
            console.error('Error loading spreadsheet:', e);
            alert('Could not load spreadsheet data.');
        }
    }

    async function recalculateAll() {
        buildDependencyGraphs(); // Ensure graphs are up to date
        const allCoords = Object.keys(sheetData);
        const allFormulaCells = allCoords.filter(c => sheetData[c].formula);

        // This is a simplified full recalculation. A more robust version
        // would do a full topological sort of all formula cells.
        for (const coord of allFormulaCells) {
            await recalculate(coord);
        }
    }

    // --- Placeholder for features not yet re-implemented ---
    function initFunctionEditor() { console.warn("initFunctionEditor not fully implemented."); }
    async function loadCustomFunctions() { console.warn("loadCustomFunctions not fully implemented."); }
    async function loadAndDisplayReports() { console.warn("loadAndDisplayReports not fully implemented."); }

    // --- Start the App ---
    initializeApp();
});
