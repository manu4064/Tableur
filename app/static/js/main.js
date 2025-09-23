
// Configuration du serveur de code
const CODE_SERVER_URL = 'http://localhost:8000';

/**
 * Exécute un bloc de code sur le serveur backend via une requête API.
 * @param {string} code - Le code source à exécuter.
 * @param {Array<any>} args - Une liste d'arguments à passer au code.
 * @param {string} language - Le langage de programmation ('python', 'javascript', etc.).
 * @returns {Promise<any>} Le résultat de l'exécution du code.
 */
async function executeCode(code, args, language) {
    try {
        const response = await fetch(`${CODE_SERVER_URL}/execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                code: code,
                args: args,
                language: language,
                timeout: 5  // timeout en secondes
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Erreur serveur ${language}`);
        }

        const data = await response.json();

        // Gestion des erreurs retournées par le serveur
        if (data.error) {
            console.error(`Erreur ${language}:`, data.error);
            return 'ERREUR';
        }

        // Log des performances pour le débogage
        console.log(`Temps d'exécution: ${data.execution_time}s`);
        console.log(`Utilisation mémoire: ${data.memory_usage}`);

        return data.result;
    } catch (e) {
        console.error(`Erreur d'exécution ${language}:`, e);
        return 'ERREUR';
    }
}




document.addEventListener('DOMContentLoaded', function() {
    // --- Variables Globales ---
    const spreadsheet = document.getElementById('spreadsheet');
    let initialRows = 100;
    let initialCols = 26;
    let currentCell = null;
    let isEditing = false;
    let elements = [];
    let charts = [];
    let chartPreview = null;
    let history = [];
    let historyIndex = -1;
    let currentAction = null;
    let colorModalTarget = null;
    let colorModalCallback = null;
    let customFunctions = {};
    let functionEditor = null;
    let currentEditorTheme = 'dawn';
    let currentEditingElement = null;
    let dataImporters = {}; // Pour stocker les importateurs de données en cours
    let lastIncrementalRow = {}; // Pour suivre la dernière ligne utilisée dans les imports incrémentiels

    // --- Initialisation ---
    initSpreadsheet();
    setupEventListeners();
    initFunctionEditor();

    // Charger les données depuis la base de données au démarrage
    loadSpreadsheet();
    loadCustomFunctions();
    loadAndDisplayReports();


    /**
     * Initialise la grille du tableur en créant les en-têtes et les cellules.
     */
    function initSpreadsheet() {
        const thead = spreadsheet.querySelector('thead tr');
        const tbody = spreadsheet.querySelector('tbody');

        // Créer les en-têtes de colonnes (A-Z)
        for (let i = 0; i < initialCols; i++) {
            addColumnHeader(thead, i);
        }

        // Créer les cellules
        for (let i = 0; i < initialRows; i++) {
            addRow(tbody, i, initialCols);
        }
    }

    function addColumnHeader(thead, colIndex) {
        const th = document.createElement('th');
        th.className = 'cell-header';
        th.textContent = getColumnLabel(colIndex);
        thead.appendChild(th);
    }

    /**
     * Convertit un index de colonne (0-based) en son étiquette alphabétique (A, B, ..., Z, AA, ...).
     * @param {number} index - L'index de la colonne.
     * @returns {string} L'étiquette de la colonne.
     */
    function getColumnLabel(index) {
        let label = '';
        while (index >= 0) {
            label = String.fromCharCode(65 + (index % 26)) + label;
            index = Math.floor(index / 26) - 1;
        }
        return label;
    }

    function addRow(tbody, rowIndex, numCols) {
        const tr = document.createElement('tr');
        const rowHeader = document.createElement('th');
        rowHeader.className = 'row-header';
        rowHeader.textContent = rowIndex + 1;
        tr.appendChild(rowHeader);

        for (let j = 0; j < numCols; j++) {
            const td = document.createElement('td');
            td.className = 'cell';
            td.dataset.row = rowIndex;
            td.dataset.col = j;
            td.dataset.coords = `${getColumnLabel(j)}${rowIndex + 1}`;
            td.contentEditable = false;
            td.addEventListener('click', selectCell);
            td.addEventListener('dblclick', startEditing);
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
        return tr;
    }

    function addColumns(numColumns = 10) {
        const thead = spreadsheet.querySelector('thead tr');
        const tbody = spreadsheet.querySelector('tbody');
        const currentCols = parseInt(thead.children.length) - 1;

        // Ajouter les en-têtes de colonnes
        for (let i = 0; i < numColumns; i++) {
            addColumnHeader(thead, currentCols + i);
        }

        // Ajouter les cellules pour chaque ligne
        tbody.querySelectorAll('tr').forEach((tr, rowIndex) => {
            for (let i = 0; i < numColumns; i++) {
                const colIndex = currentCols + i;
                const td = document.createElement('td');
                td.className = 'cell';
                td.dataset.row = rowIndex;
                td.dataset.col = colIndex;
                td.dataset.coords = `${getColumnLabel(colIndex)}${rowIndex + 1}`;
                td.contentEditable = false;
                td.addEventListener('click', selectCell);
                td.addEventListener('dblclick', startEditing);
                tr.appendChild(td);
            }
        });

        initialCols = currentCols + numColumns;
    }

    function addRows(numRows = 10) {
        const tbody = spreadsheet.querySelector('tbody');
        const currentRows = tbody.children.length;

        for (let i = 0; i < numRows; i++) {
            addRow(tbody, currentRows + i, initialCols);
        }

        initialRows = currentRows + numRows;
    }

    /**
     * Initialise l'éditeur de code ACE pour l'édition de fonctions personnalisées.
     */
    function initFunctionEditor() {
        functionEditor = ace.edit("function-code-editor");
        functionEditor.setTheme(`ace/theme/${currentEditorTheme}`);
        functionEditor.session.setMode("ace/mode/javascript");
        functionEditor.setOptions({
            fontSize: "14px",
            showLineNumbers: true,
            showGutter: true,
            tabSize: 2,
            useSoftTabs: true,
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: true
        });

        // Gérer le changement de langage
        document.getElementById('function-language').addEventListener('change', function(e) {
            const mode = `ace/mode/${e.target.value}`;
            functionEditor.session.setMode(mode);
            // Mettre à jour le modèle du code en fonction du langage
            const templates = {
                javascript: `function NOUVELLE_FONCTION(...args) {
// Votre code ici
try {
const valeur = parseFloat(args[0]);
return isNaN(valeur) ? 0 : valeur;
} catch (e) {
return 0;
}
}`,
                python: `def NOUVELLE_FONCTION(*args):
# Votre code ici
try:
valeur = float(args[0]) if args else 0.0
return valeur
except (ValueError, TypeError, IndexError):
return 0.0`,
                php: `function NOUVELLE_FONCTION() {
$args = func_get_args();
# Votre code ici
try {
return floatval($args[0] ?? 0);
} catch (Exception $e) {
return 0;
}
}`,
                lua: `function NOUVELLE_FONCTION(...)
-- Votre code ici
local args = {...}
local valeur = tonumber(args[1])
return valeur or 0
end`,
                c: `double NOUVELLE_FONCTION(double* args, int n) {
// Votre code ici
if (n < 1) return 0.0;
return args[0];
}`
            };
            if (functionEditor.getValue().trim() === "" ||
                functionEditor.getValue().includes("// Votre code ici") ||
                functionEditor.getValue().includes("# Votre code ici") ||
                functionEditor.getValue().includes("-- Votre code ici")) {
                functionEditor.setValue(templates[e.target.value], -1);
            }
        });

        // Ajouter des snippets utiles
        functionEditor.commands.addCommand({
            name: 'insertCellValue',
            bindKey: {win: 'Ctrl-Shift-C', mac: 'Command-Shift-C'},
            exec: function(editor) {
                editor.insert(`// Valeur de la cellule A1\nconst a1 = getCellValue("A1");\n`);
            }
        });

        functionEditor.commands.addCommand({
            name: 'insertCellRange',
            bindKey: {win: 'Ctrl-Shift-R', mac: 'Command-Shift-R'},
            exec: function(editor) {
                editor.insert(`// Somme des cellules A1 à A10\nconst sum = getRangeSum("A1:A10");\n`);
            }
        });
    }

    /**
     * Met en place tous les écouteurs d'événements pour les éléments de l'interface utilisateur.
     */
    function setupEventListeners() {
        const formulaInput = document.getElementById('formula-input');
        formulaInput.addEventListener('keydown', handleFormulaInput);
        formulaInput.addEventListener('blur', saveCellContentFromInput);

        // Boutons de la toolbar
        document.getElementById('add-text-btn').addEventListener('click', () => openModal('text'));
        document.getElementById('add-chart-btn').addEventListener('click', () => openModal('chart'));
        document.getElementById('functions-btn').addEventListener('click', () => openModal('functions'));
        document.getElementById('custom-functions-btn').addEventListener('click', toggleCustomFunctionsPanel);
        document.getElementById('reports-btn').addEventListener('click', toggleReportsPanel);
        document.getElementById('close-reports').addEventListener('click', toggleReportsPanel);
        document.getElementById('new-report-btn').addEventListener('click', () => openReportEditor());
        document.getElementById('close-report-editor-btn').addEventListener('click', closeReportEditor);
        document.getElementById('add-report-element-btn').addEventListener('click', openAddElementModal);
        document.getElementById('close-add-element-modal').addEventListener('click', () => document.getElementById('add-element-modal').classList.remove('active'));
        document.getElementById('report-element-type').addEventListener('change', handleReportElementTypeChange);
        document.getElementById('confirm-add-report-element').addEventListener('click', confirmAddReportElement);
        document.getElementById('save-report-btn').addEventListener('click', saveReport);
        document.getElementById('export-report-pdf-btn').addEventListener('click', () => exportToPDF('#report-canvas'));
        document.getElementById('save-btn').addEventListener('click', saveSpreadsheet);
        document.getElementById('load-btn').addEventListener('click', loadSpreadsheet);
        document.getElementById('export-excel').addEventListener('click', exportToExcel);
        document.getElementById('export-pdf').addEventListener('click', exportToPDF);
        document.getElementById('import-excel').addEventListener('click', () => document.getElementById('excel-input').click());
        document.getElementById('excel-input').addEventListener('change', importFromExcel);
        document.getElementById('history-btn').addEventListener('click', toggleHistoryPanel);
        document.getElementById('close-history').addEventListener('click', toggleHistoryPanel);
        document.getElementById('undo-btn').addEventListener('click', undo);
        document.getElementById('redo-btn').addEventListener('click', redo);
        document.getElementById('close-custom-functions').addEventListener('click', toggleCustomFunctionsPanel);

        // Gestion de l'importation de données
        document.getElementById('import-data-btn').addEventListener('click', () => openModal('import'));
        document.getElementById('viz-mode-btn').addEventListener('click', toggleVisualizationMode);
        document.getElementById('start-import').addEventListener('click', startDataImport);

        // Boutons de l'éditeur de fonctions
        document.getElementById('new-function-btn').addEventListener('click', newCustomFunction);
        document.getElementById('save-function-btn').addEventListener('click', () => {
            saveCustomFunction().catch(e => {
                console.error('Erreur lors de la sauvegarde:', e);
                document.getElementById('function-error').classList.add('visible');
                document.getElementById('function-error').textContent =
                    `Erreur : ${e.message}`;
            });
        });
        document.getElementById('cancel-function-btn').addEventListener('click', cancelCustomFunction);

        // Gestion des packages
        document.getElementById('manage-packages-btn').addEventListener('click', function() {
            document.getElementById('function-list-container').style.display = 'none';
            document.getElementById('packages-container').style.display = 'block';
            listInstalledPythonPackages().then(packages => {
                const packageList = document.getElementById('package-list');
                packageList.innerHTML = packages.length ? packages.map(pkg =>
                    `<div class="package-item">${pkg}</div>`
                ).join('') : 'Aucun package installé';
            });
        });

        document.getElementById('back-to-functions-btn').addEventListener('click', function() {
            document.getElementById('packages-container').style.display = 'none';
            document.getElementById('function-list-container').style.display = 'block';
        });

        document.getElementById('install-package-btn').addEventListener('click', async function() {
            const packageName = document.getElementById('package-name').value.trim();
            if (!packageName) return;

            const statusDiv = document.getElementById('package-status');
            statusDiv.textContent = `Installation de ${packageName}...`;
            statusDiv.style.color = 'var(--primary-purple)';

            try {
                const success = await installPythonPackage(packageName);
                if (success) {
                    statusDiv.textContent = `${packageName} installé avec succès`;
                    statusDiv.style.color = 'green';
                    // Mettre à jour la liste des packages
                    const packages = await listInstalledPythonPackages();
                    const packageList = document.getElementById('package-list');
                    packageList.innerHTML = packages.map(pkg =>
                        `<div class="package-item">${pkg}</div>`
                    ).join('');
                } else {
                    throw new Error('Échec de l\'installation');
                }
            } catch (e) {
                statusDiv.textContent = `Erreur lors de l'installation de ${packageName}`;
                statusDiv.style.color = 'var(--crimson)';
            }
        });

        // Changement de thème
        document.querySelectorAll('.theme-option').forEach(option => {
            option.addEventListener('click', function() {
                document.querySelectorAll('.theme-option').forEach(opt => opt.classList.remove('active'));
                this.classList.add('active');
                currentEditorTheme = this.dataset.theme;
                if (functionEditor) {
                    functionEditor.setTheme(`ace/theme/${currentEditorTheme}`);
                }
            });
        });

        // Modale principale
        const modal = document.getElementById('element-modal');
        const closeModal = document.getElementById('close-modal');
        const modalTabs = document.querySelectorAll('.modal-tab');
        const modalBodies = document.querySelectorAll('.modal-body');

        closeModal.addEventListener('click', () => modal.classList.remove('active'));

        modalTabs.forEach(tab => {
            tab.addEventListener('click', function() {
                modalTabs.forEach(t => t.classList.remove('active'));
                modalBodies.forEach(b => b.classList.remove('active'));

                this.classList.add('active');
                document.querySelector(`.modal-body[data-tab="${this.dataset.tab}"]`).classList.add('active');
                document.getElementById('modal-title').textContent =
                    this.dataset.tab === 'text' ? 'Ajouter un texte' :
                    this.dataset.tab === 'chart' ? 'Ajouter un graphique' : 'Insérer une fonction';

                if (this.dataset.tab === 'chart') {
                    updateChartPreview();
                } else if (this.dataset.tab === 'functions') {
                    updateFunctionsList();
                }
            });
        });

        // Ajouter un élément texte
        document.getElementById('add-text-element').addEventListener('click', addTextElement);
        document.getElementById('add-chart-element').addEventListener('click', addChartElement);
        document.getElementById('chart-type').addEventListener('change', updateChartPreview);
        document.getElementById('chart-data-range').addEventListener('input', updateChartPreview);
        document.getElementById('chart-show-labels').addEventListener('change', updateChartPreview);
        document.getElementById('chart-color-scheme').addEventListener('change', updateChartPreview);
        document.getElementById('add-text-element').addEventListener('click', addOrUpdateTextElement);
        document.getElementById('add-chart-element').addEventListener('click', addOrUpdateChartElement);

        // Fonctions
        document.getElementById('function-search').addEventListener('input', updateFunctionsList);
        document.getElementById('insert-function').addEventListener('click', insertFunction);

        // Modale de couleur
        const colorModal = document.getElementById('color-modal');
        const closeColorModal = document.getElementById('close-color-modal');
        const applyColor = document.getElementById('apply-color');

        closeColorModal.addEventListener('click', () => colorModal.classList.remove('active'));
        applyColor.addEventListener('click', applySelectedColor);

        document.getElementById('text-color-btn').addEventListener('click', () => {
            colorModalTarget = 'text';
            colorModal.classList.add('active');
            document.getElementById('color-modal-title').textContent = 'Couleur du texte';
        });

        document.getElementById('fill-color-btn').addEventListener('click', () => {
            colorModalTarget = 'fill';
            colorModal.classList.add('active');
            document.getElementById('color-modal-title').textContent = 'Couleur de fond';
        });

        document.getElementById('color-palette').addEventListener('click', function(e) {
            if (e.target.classList.contains('color-option')) {
                this.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
                e.target.classList.add('selected');
            }
        });

        document.getElementById('custom-color').addEventListener('input', function() {
            document.querySelectorAll('#color-palette .color-option').forEach(opt => opt.classList.remove('selected'));
        });

        // Mise en forme
        document.getElementById('bold-btn').addEventListener('click', () => toggleFormat('bold'));
        document.getElementById('italic-btn').addEventListener('click', () => toggleFormat('italic'));
        document.getElementById('align-dropdown').addEventListener('click', function(e) {
            if (e.target.classList.contains('dropdown-item')) {
                setAlignment(e.target.dataset.align);
            }
        });

        // Gestion des raccourcis clavier
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey) {
                if (e.key === 'z') {
                    e.preventDefault();
                    undo();
                } else if (e.key === 'y') {
                    e.preventDefault();
                    redo();
                } else if (e.key === 'b') {
                    e.preventDefault();
                    toggleFormat('bold');
                } else if (e.key === 'i') {
                    e.preventDefault();
                    toggleFormat('italic');
                }
            }
        });

        // Menu déroulant Fichier
        const fileBtn = document.getElementById('file-btn');
        const fileDropdown = document.getElementById('file-dropdown');

        fileBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            fileDropdown.classList.toggle('show');
        });

        document.addEventListener('click', function() {
            fileDropdown.classList.remove('show');
        });
    }

    /**
     * Gère la sélection d'une cellule. Met à jour l'affichage de la cellule active et la barre de formule.
     * @param {Event} e - L'événement de clic.
     */
    function selectCell(e) {
        if (isEditing) return;

        if (currentCell) {
            saveCellContentFromInput();
            currentCell.classList.remove('selected');
        }

        // Sélectionner la nouvelle cellule
        currentCell = e.target;
        currentCell.classList.add('selected');
        document.getElementById('current-cell').textContent = currentCell.dataset.coords;
        document.getElementById('formula-input').value = currentCell.dataset.formula || currentCell.textContent;
        document.getElementById('formula-input').focus();

        // Mettre à jour l'état des boutons de format
        updateFormatButtons();
    }

    /**
     * Active le mode d'édition pour une cellule lorsqu'elle est double-cliquée.
     * @param {Event} e - L'événement de double-clic.
     */
    function startEditing(e) {
        if (isEditing) return;

        isEditing = true;
        currentCell = e.target;
        currentCell.classList.add('editing');
        currentCell.contentEditable = true;
        currentCell.focus();

        // Placer le curseur à la fin du contenu
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(currentCell);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    async function handleFormulaInput(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            await saveCellContentFromInput();
            currentCell.blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            document.getElementById('formula-input').value = currentCell.dataset.formula || currentCell.textContent;
            currentCell.blur();
        } else if (e.key === 'Tab') {
            e.preventDefault();
            await saveCellContentFromInput();
            moveToNextCell(e.shiftKey ? -1 : 1);
        }
    }

    async function saveCellContentFromInput() {
        if (currentCell) {
            const value = document.getElementById('formula-input').value;
            if (value !== (currentCell.dataset.formula || currentCell.textContent)) {
                await saveCellContent(currentCell, value);
            }
        }
    }

    /**
     * Sauvegarde le contenu d'une cellule, évalue les formules et met à jour l'historique.
     * @param {HTMLElement} cell - L'élément TD de la cellule à sauvegarder.
     * @param {string} value - La nouvelle valeur ou formule pour la cellule.
     */
    async function saveCellContent(cell, value) {
        if (value === undefined) return;

        const oldValue = cell.dataset.formula || cell.textContent;
        const oldStyle = getCellStyle(cell);

        if (value !== oldValue) {
            saveToHistory({
                type: 'cell_content',
                cell: cell.dataset.coords,
                oldValue: oldValue,
                newValue: value,
                oldStyle: oldStyle,
                newStyle: getCellStyle(cell)
            });
        }

        if (value && value.startsWith('=')) {
            try {
                const result = await evaluateFormula(value.substring(1), new Set([cell.dataset.coords]));
                cell.textContent = result;
                cell.dataset.formula = value;
            } catch (e) {
                cell.textContent = e.message.startsWith('#') ? e.message : '#ERREUR';
                cell.dataset.formula = value;
                console.error('Erreur dans la formule:', e);
            }
        } else {
            cell.textContent = value;
            delete cell.dataset.formula;
        }

        if (cell.classList.contains('editing')) {
            cell.classList.remove('editing');
            cell.contentEditable = false;
            isEditing = false;
        }

        document.dispatchEvent(new CustomEvent('spreadsheetDataChanged'));
        await recalculateAllFormulas();
    }

    /**
     * Évalue une formule de manière asynchrone.
     * Gère les fonctions personnalisées (via API), les références de cellules et les fonctions standard.
     * @param {string} formula - La chaîne de la formule à évaluer (sans le '=').
     * @param {Set<string>} visited - Un ensemble de coordonnées de cellules déjà visitées pour détecter les références circulaires.
     * @returns {Promise<any>} Le résultat calculé de la formule.
     */
    async function evaluateFormula(formula, visited = new Set()) {
        const customFuncRegex = new RegExp(`\\b(${Object.keys(customFunctions).join('|')})\\s*\\(`, 'gi');
        let processedFormula = formula;

        const matches = [...formula.matchAll(customFuncRegex)];
        for (const match of matches) {
            const funcName = match[1].toUpperCase();
            const funcData = customFunctions[funcName];
            if (!funcData) continue;

            const startIndex = match.index + match[0].length;
            const argsString = getMatchingBracket(formula, startIndex);

            // Evaluate arguments first
            const args = await Promise.all(
                splitArgs(argsString).map(arg => evaluateFormula(arg, new Set(visited)))
            );

            // Execute the function on the backend
            const result = await executeCode(funcData.code, args, funcData.language);

            // Replace the function call with the result
            const originalCall = `${match[0]}${argsString})`;
            processedFormula = processedFormula.replace(originalCall, JSON.stringify(result));
        }

        // 2. Handle cell references
        const cellRefRegex = /([A-Z]+[0-9]+)/g;
        processedFormula = await replaceAsync(processedFormula, cellRefRegex, async (match) => {
            const ref = match[0];
            if (visited.has(ref)) {
                throw new Error('#REF! Erreur de dépendance circulaire');
            }
            const cell = document.querySelector(`.cell[data-coords="${ref}"]`);
            if (cell) {
                const cellValue = cell.dataset.formula
                    ? await evaluateFormula(cell.dataset.formula.substring(1), new Set(visited).add(ref))
                    : cell.textContent;
                return cellValue || '0';
            }
            return '0'; // Cell not found
        });

        // 3. Evaluate the final expression (synchronous part)
        try {
            // Replace standard functions
            let finalFormula = processedFormula
                .replace(/;/g, ',') // Use comma as separator
                .replace(/SOMME\s*\(/gi, 'sum(')
                .replace(/MOYENNE\s*\(/gi, 'avg(')
                .replace(/MAX\s*\(/gi, 'max(')
                .replace(/MIN\s*\(/gi, 'min(')
                // Add other standard functions here...
                .replace(/PI\s*\(\)/gi, 'Math.PI');

            // Create a safe evaluation scope
            const evaluateInScope = new Function(
                'sum', 'avg', 'max', 'min',
                `return ${finalFormula}`
            );

            return evaluateInScope(
                (...args) => args.reduce((a, b) => a + Number(b || 0), 0),
                (...args) => args.reduce((a, b) => a + Number(b || 0), 0) / args.length,
                (...args) => Math.max(...args.map(a => Number(a || 0))),
                (...args) => Math.min(...args.map(a => Number(a || 0)))
            );
        } catch (e) {
            console.error('Erreur d\'évaluation finale:', e);
            return '#CALC!';
        }
    }

    // --- Helper functions for async formula evaluation ---
    async function replaceAsync(str, regex, asyncFn) {
        const promises = [];
        str.replace(regex, (match, ...args) => {
            const promise = asyncFn(match, ...args);
            promises.push(promise);
        });
        const data = await Promise.all(promises);
        return str.replace(regex, () => data.shift());
    }

    function getMatchingBracket(str, start) {
        let balance = 1;
        for (let i = start; i < str.length; i++) {
            if (str[i] === '(') balance++;
            if (str[i] === ')') balance--;
            if (balance === 0) return str.substring(start, i);
        }
        return ''; // Should not happen with valid formulas
    }

    function splitArgs(argsString) {
        const args = [];
        let balance = 0;
        let currentArg = '';
        for (let i = 0; i < argsString.length; i++) {
            const char = argsString[i];
            if (char === '(') balance++;
            if (char === ')') balance--;
            if (char === ';' && balance === 0) {
                args.push(currentArg.trim());
                currentArg = '';
            } else {
                currentArg += char;
            }
        }
        if (currentArg) {
            args.push(currentArg.trim());
        }
        return args;
    }

    function moveToNextCell(direction) {
        if (!currentCell) return;

        const currentRow = parseInt(currentCell.dataset.row);
        const currentCol = parseInt(currentCell.dataset.col);
        const totalRows = rows;
        const totalCols = cols;

        let newRow = currentRow;
        let newCol = currentCol + direction;

        if (newCol < 0) {
            newCol = totalCols - 1;
            newRow = Math.max(0, currentRow - 1);
        } else if (newCol >= totalCols) {
            newCol = 0;
            newRow = Math.min(totalRows - 1, currentRow + 1);
        }

        if (newRow >= 0 && newRow < totalRows) {
            const newCell = document.querySelector(`.cell[data-row="${newRow}"][data-col="${newCol}"]`);
            if (newCell) {
                newCell.click();
            }
        }
    }

    function openModal(tab, element = null) {
        const modal = document.getElementById('element-modal');
        modal.classList.add('active');
        currentEditingElement = element;

        document.querySelector(`.modal-tab[data-tab="${tab}"]`).click();

        if (tab === 'text') {
            const addBtn = document.getElementById('add-text-element');
            if (element) {
                // Récupérer le contenu du texte
                const textContent = element.querySelector('.text-content');
                document.getElementById('text-content').value = textContent ? textContent.textContent : '';

                // Récupérer les couleurs
                const textColor = element.dataset.textColor || '#333';
                const bgColor = element.dataset.bgColor || 'white';

                // Mettre à jour les sélecteurs de couleur
                document.querySelectorAll('#text-color-picker .color-option').forEach(option => {
                    option.classList.toggle('selected', option.dataset.color === textColor);
                });
                document.querySelectorAll('#text-bg-color-picker .color-option').forEach(option => {
                    option.classList.toggle('selected', option.dataset.color === bgColor);
                });

                addBtn.textContent = 'Modifier le texte';
            } else {
                document.getElementById('text-content').value = '';
                // Réinitialiser les sélecteurs de couleur
                document.querySelector('#text-color-picker .color-option[data-color="#333"]').classList.add('selected');
                document.querySelector('#text-bg-color-picker .color-option[data-color="white"]').classList.add('selected');
                addBtn.textContent = 'Ajouter le texte';
            }
        } else if (tab === 'chart') {
            const addBtn = document.getElementById('add-chart-element');
            if (element) {
                const chart = Chart.getChart(element.querySelector('canvas'));
                if (chart) {
                    // Récupérer les données actuelles du graphique
                    document.getElementById('chart-type').value = chart.config.type;
                    document.getElementById('chart-title').value = chart.options.plugins.title.text || '';
                    document.getElementById('chart-data-range').value = element.dataset.dataRange || '';
                    document.getElementById('chart-show-labels').checked = chart.options.plugins.legend.display !== false;
                    document.getElementById('chart-color-scheme').value = element.dataset.colorScheme || 'default';
                }
                addBtn.textContent = 'Modifier le graphique';
            } else {
                document.getElementById('chart-title').value = '';
                document.getElementById('chart-data-range').value = '';
                document.getElementById('chart-show-labels').checked = true;
                document.getElementById('chart-type').value = 'bar';
                document.getElementById('chart-color-scheme').value = 'default';
                addBtn.textContent = 'Ajouter le graphique';
            }
            // Mettre à jour l'aperçu
            updateChartPreview();
        }
    }

    function addOrUpdateTextElement() {
        const content = document.getElementById('text-content').value;
        const color = document.querySelector('#text-color-picker .color-option.selected')?.dataset.color || '#333';
        const bgColor = document.querySelector('#text-bg-color-picker .color-option.selected')?.dataset.color || 'white';

        if (currentEditingElement) {
            // Sauvegarder l'état actuel pour l'historique
            const oldState = {
                content: currentEditingElement.querySelector('.text-content').textContent,
                textColor: currentEditingElement.dataset.textColor,
                bgColor: currentEditingElement.dataset.bgColor,
                width: currentEditingElement.style.width,
                height: currentEditingElement.style.height,
                left: currentEditingElement.style.left,
                top: currentEditingElement.style.top
            };

            // Mettre à jour le texte et les styles
            const textContent = currentEditingElement.querySelector('.text-content');
            textContent.textContent = content;
            currentEditingElement.style.color = color;
            currentEditingElement.style.backgroundColor = bgColor;
            currentEditingElement.dataset.textColor = color;
            currentEditingElement.dataset.bgColor = bgColor;

            saveToHistory({
                type: 'edit_text_element',
                element: currentEditingElement,
                oldState: oldState,
                newState: {
                    content: content,
                    textColor: color,
                    bgColor: bgColor,
                    width: currentEditingElement.style.width,
                    height: currentEditingElement.style.height,
                    left: currentEditingElement.style.left,
                    top: currentEditingElement.style.top
                }
            });
        } else {
            addTextElement();
        }

        document.getElementById('element-modal').classList.remove('active');
        currentEditingElement = null;
    }

    function addOrUpdateChartElement() {
        const chartType = document.getElementById('chart-type').value;
        const title = document.getElementById('chart-title').value;
        const dataRange = document.getElementById('chart-data-range').value;
        const showLabels = document.getElementById('chart-show-labels').checked;
        const colorScheme = document.getElementById('chart-color-scheme').value;

        if (currentEditingElement) {
            // Sauvegarder l'état actuel pour l'historique
            const oldChart = currentEditingElement.querySelector('canvas');
            const oldChartInstance = Chart.getChart(oldChart);
            const oldState = {
                type: oldChartInstance.config.type,
                title: oldChartInstance.options.plugins.title.text,
                dataRange: currentEditingElement.dataset.dataRange,
                showLabels: oldChartInstance.options.plugins.legend.display !== false,
                colorScheme: currentEditingElement.dataset.colorScheme,
                width: currentEditingElement.style.width,
                height: currentEditingElement.style.height,
                left: currentEditingElement.style.left,
                top: currentEditingElement.style.top
            };

            // Mettre à jour le graphique
            createChart(oldChart, chartType, title, dataRange, showLabels, colorScheme);
            currentEditingElement.dataset.dataRange = dataRange;
            currentEditingElement.dataset.colorScheme = colorScheme;

            saveToHistory({
                type: 'edit_chart_element',
                element: currentEditingElement,
                oldState: oldState,
                newState: {
                    type: chartType,
                    title: title,
                    dataRange: dataRange,
                    showLabels: showLabels,
                    colorScheme: colorScheme,
                    width: currentEditingElement.style.width,
                    height: currentEditingElement.style.height,
                    left: currentEditingElement.style.left,
                    top: currentEditingElement.style.top
                }
            });
        } else {
            addChartElement();
        }

        document.getElementById('element-modal').classList.remove('active');
        currentEditingElement = null;
    }

    function addTextElement(data = null, fromLoad = false) {
        let elementData;

        if (fromLoad) {
            elementData = {
                id: data.id || `text_${Date.now()}`,
                content: data.content,
                color: data.style.color,
                bgColor: data.style.backgroundColor,
                left: data.style.left,
                top: data.style.top,
                width: data.style.width,
                height: data.style.height,
                zIndex: data.style.zIndex
            };
        } else {
            const content = document.getElementById('text-content').value;
            if (!content.trim()) return;
            elementData = {
                id: `text_${Date.now()}`,
                content: content,
                color: document.querySelector('#text-color-picker .color-option.selected')?.dataset.color || '#333',
                bgColor: document.querySelector('#text-bg-color-picker .color-option.selected')?.dataset.color || 'white',
                left: '100px',
                top: '100px',
                width: '200px',
                height: '100px',
                zIndex: 100
            };
        }

        const textElement = document.createElement('div');
        textElement.className = 'text-element';
        textElement.id = elementData.id;
        textElement.style.color = elementData.color;
        textElement.style.backgroundColor = elementData.bgColor;
        textElement.style.left = elementData.left;
        textElement.style.top = elementData.top;
        textElement.style.width = elementData.width;
        textElement.style.height = elementData.height;
        textElement.style.zIndex = elementData.zIndex;

        const textContainer = document.createElement('div');
        textContainer.className = 'text-content';
        textContainer.textContent = elementData.content;
        textElement.appendChild(textContainer);

        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.textContent = '✏️';
        editBtn.onclick = (e) => { e.stopPropagation(); openModal('text', textElement); };
        textElement.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '✕';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            textElement.remove();
            // L'historique n'est pas géré ici pour la suppression, pour garder la simplicité
        };
        textElement.appendChild(deleteBtn);

        document.querySelector('.spreadsheet-container').appendChild(textElement);
        makeDraggable(textElement);

        if (!fromLoad) {
            document.getElementById('element-modal').classList.remove('active');
            // L'historique pour l'ajout n'est pas géré pour garder la simplicité
        }
    }

    function addChartElement(data = null, fromLoad = false) {
        let chartData;

        if (fromLoad) {
            chartData = {
                id: data.id || `chart_${Date.now()}`,
                chartType: data.chartType,
                title: data.title,
                dataRange: data.dataRange,
                showLabels: data.showLabels,
                colorScheme: data.colorScheme,
                style: data.style
            };
        } else {
            const dataRange = document.getElementById('chart-data-range').value;
            if (!dataRange) return;
            chartData = {
                id: `chart_${Date.now()}`,
                chartType: document.getElementById('chart-type').value,
                title: document.getElementById('chart-title').value,
                dataRange: dataRange,
                showLabels: document.getElementById('chart-show-labels').checked,
                colorScheme: document.getElementById('chart-color-scheme').value,
                style: {
                    left: '150px',
                    top: '150px',
                    width: '400px',
                    height: '300px',
                    zIndex: 100
                }
            };
        }

        const chartElement = document.createElement('div');
        chartElement.className = 'graphic-element';
        chartElement.id = chartData.id;
        chartElement.style.left = chartData.style.left;
        chartElement.style.top = chartData.style.top;
        chartElement.style.width = chartData.style.width;
        chartElement.style.height = chartData.style.height;
        chartElement.style.zIndex = chartData.style.zIndex;

        // Stocker les métadonnées sur l'élément pour la sauvegarde et l'édition
        chartElement.dataset.dataRange = chartData.dataRange;
        chartElement.dataset.colorScheme = chartData.colorScheme;

        const canvas = document.createElement('canvas');
        chartElement.appendChild(canvas);

        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.textContent = '✏️';
        editBtn.onclick = (e) => { e.stopPropagation(); openModal('chart', chartElement); };
        chartElement.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '✕';
        deleteBtn.onclick = (e) => { e.stopPropagation(); chartElement.remove(); };
        chartElement.appendChild(deleteBtn);

        document.querySelector('.spreadsheet-container').appendChild(chartElement);

        createChart(canvas, chartData.chartType, chartData.title, chartData.dataRange, chartData.showLabels, chartData.colorScheme);
        makeDraggable(chartElement);

        if (!fromLoad) {
            document.getElementById('element-modal').classList.remove('active');
        }
    }

    /**
     * Crée ou met à jour un graphique Chart.js sur un canevas donné.
     * @param {HTMLCanvasElement} canvas - Le canevas sur lequel dessiner le graphique.
     * @param {string} type - Le type de graphique (ex: 'bar', 'line').
     * @param {string} title - Le titre du graphique.
     * @param {string} dataRange - La plage de cellules contenant les données (ex: 'A1:B10').
     * @param {boolean} showLabels - Indique si les étiquettes doivent être affichées.
     * @param {string} colorScheme - Le schéma de couleurs à utiliser pour le graphique.
     */
    function createChart(canvas, type, title, dataRange, showLabels, colorScheme) {
        const [start, end] = dataRange.split(':');
        const startMatch = start.match(/([A-Z]+)([0-9]+)/);
        const endMatch = end.match(/([A-Z]+)([0-9]+)/);

        if (!startMatch || !endMatch) return;

        const startCol = startMatch[1].charCodeAt(0) - 65;
        const startRow = parseInt(startMatch[2]) - 1;
        const endCol = endMatch[1].charCodeAt(0) - 65;
        const endRow = parseInt(endMatch[2]) - 1;

        const datasets = [];
        const labels = [];

        // Collecter les données
        for (let col = startCol; col <= endCol; col++) {
            const colLabel = String.fromCharCode(65 + col);
            const colData = [];

            for (let row = startRow; row <= endRow; row++) {
                if (col === startCol) {
                    const labelCell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
                    labels.push(labelCell ? labelCell.textContent : `Ligne ${row + 1}`);
                } else {
                    const dataCell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
                    const value = dataCell ? (dataCell.dataset.formula
                        ? evaluateFormula(dataCell.dataset.formula.substring(1), dataCell.dataset.coords)
                        : dataCell.textContent) : 0;
                    colData.push(parseFloat(value) || 0);
                }
            }

            if (colData.length > 0) {
                datasets.push({
                    label: col === startCol ? 'Valeurs' : String.fromCharCode(65 + col),
                    data: colData,
                    backgroundColor: getChartColors(col - startCol, colorScheme, datasets.length),
                    borderColor: getChartColors(col - startCol, colorScheme, datasets.length, true),
                    borderWidth: 1
                });
            }
        }

        // Créer le graphique
        new Chart(canvas, {
            type: type,
            data: {
                labels: showLabels ? labels : [],
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                resizeDelay: 100, // Ajouter un délai pour éviter trop de redessins pendant le redimensionnement
                plugins: {
                    title: {
                        display: !!title,
                        text: title
                    },
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.raw}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    function updateChartPreview() {
        const canvas = document.getElementById('chart-preview');
        const type = document.getElementById('chart-type').value;
        const title = document.getElementById('chart-title').value;
        const dataRange = document.getElementById('chart-data-range').value;
        const showLabels = document.getElementById('chart-show-labels').checked;
        const colorScheme = document.getElementById('chart-color-scheme').value;

        if (chartPreview) {
            chartPreview.destroy();
        }

        if (dataRange) {
            createChart(canvas, type, title, dataRange, showLabels, colorScheme);
        }
    }

    function getChartColors(index, scheme, total, isBorder = false) {
        const opacity = isBorder ? '1' : '0.7';
        const colorPalettes = {
            default: [
                `rgba(54, 162, 235, ${opacity})`, `rgba(255, 99, 132, ${opacity})`, `rgba(255, 206, 86, ${opacity})`,
                `rgba(75, 192, 192, ${opacity})`, `rgba(153, 102, 255, ${opacity})`, `rgba(255, 159, 64, ${opacity})`
            ],
            pastel: [
                `rgba(166, 206, 227, ${opacity})`, `rgba(31, 120, 180, ${opacity})`, `rgba(178, 223, 138, ${opacity})`,
                `rgba(51, 160, 44, ${opacity})`, `rgba(251, 154, 153, ${opacity})`, `rgba(227, 26, 28, ${opacity})`
            ],
            vibrant: [
                `rgba(228, 26, 28, ${opacity})`, `rgba(55, 126, 184, ${opacity})`, `rgba(77, 175, 74, ${opacity})`,
                `rgba(152, 78, 163, ${opacity})`, `rgba(255, 127, 0, ${opacity})`, `rgba(255, 255, 51, ${opacity})`
            ],
            monochrome: [
                `rgba(0, 0, 0, ${opacity})`, `rgba(34, 34, 34, ${opacity})`, `rgba(68, 68, 68, ${opacity})`,
                `rgba(102, 102, 102, ${opacity})`, `rgba(136, 136, 136, ${opacity})`, `rgba(170, 170, 170, ${opacity})`
            ]
        };

        const selectedPalette = colorPalettes[scheme] || colorPalettes.default;
        return selectedPalette[index % selectedPalette.length];
    }

    function makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        let isResizing = false;
        let originalWidth = 0, originalHeight = 0, originalX = 0, originalY = 0;

        element.onmousedown = dragMouseDown;

        // Ajouter des poignées de redimensionnement
        const resizeHandle = document.createElement('div');
        resizeHandle.style.width = '10px';
        resizeHandle.style.height = '10px';
        resizeHandle.style.backgroundColor = 'var(--primary-purple)';
        resizeHandle.style.position = 'absolute';
        resizeHandle.style.right = '0';
        resizeHandle.style.bottom = '0';
        resizeHandle.style.cursor = 'nwse-resize';
        resizeHandle.style.zIndex = '10';
        element.appendChild(resizeHandle);

        resizeHandle.onmousedown = function(e) {
            e.stopPropagation();
            isResizing = true;
            originalWidth = parseFloat(getComputedStyle(element, null).getPropertyValue('width').replace('px', ''));
            originalHeight = parseFloat(getComputedStyle(element, null).getPropertyValue('height').replace('px', ''));
            originalX = e.clientX;
            originalY = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = resizeElement;
        };

        function dragMouseDown(e) {
            if (e.target.classList.contains('delete-btn') || e.target === resizeHandle) return;

            e.preventDefault();
            isResizing = false;
            // get the mouse cursor position at startup
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            // call a function whenever the cursor moves
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            if (isResizing) return;

            e.preventDefault();
            // calculate the new cursor position
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            // set the element's new position
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
        }

        function resizeElement(e) {
            if (!isResizing) return;
            const width = Math.max(50, originalWidth + (e.clientX - originalX));
            const height = Math.max(30, originalHeight + (e.clientY - originalY));

            // Mettre à jour les dimensions de l'élément
            element.style.width = width + 'px';
            element.style.height = height + 'px';

            // Si c'est un graphique, redimensionner le canvas et mettre à jour le graphique
            if (element.classList.contains('graphic-element')) {
                const canvas = element.querySelector('canvas');
                if (canvas) {
                    const chart = Chart.getChart(canvas);
                    if (chart) {
                        // Forcer une nouvelle taille pour le canvas
                        canvas.style.width = '100%';
                        canvas.style.height = '100%';
                        // Redessiner le graphique avec les nouvelles dimensions
                        chart.resize();
                        chart.render();
                    }
                }
            }
        }

        function closeDragElement() {
            // stop moving when mouse button is released
            document.onmouseup = null;
            document.onmousemove = null;

            if (element.classList.contains('text-element')) {
                saveToHistory({
                    type: 'move_text_element',
                    element: element,
                    left: element.style.left,
                    top: element.style.top,
                    width: element.style.width,
                    height: element.style.height
                });
            } else if (element.classList.contains('graphic-element')) {
                saveToHistory({
                    type: 'move_chart_element',
                    element: element,
                    left: element.style.left,
                    top: element.style.top,
                    width: element.style.width,
                    height: element.style.height
                });
            }
            isResizing = false;
        }
    }

    function updateFunctionsList() {
        const search = document.getElementById('function-search').value.toLowerCase();
        const functionsList = document.getElementById('functions-list');
        functionsList.innerHTML = '';

        // Fonctions standard
        const standardFunctions = [
            { name: 'SOMME', signature: 'SOMME(nombre1; [nombre2]; ...) → Somme des arguments' },
            { name: 'MOYENNE', signature: 'MOYENNE(nombre1; [nombre2]; ...) → Moyenne des arguments' },
            { name: 'PUISSANCE', signature: 'PUISSANCE(base; exposant) → Base élevée à la puissance exposant' },
            { name: 'RACINE', signature: 'RACINE(nombre) → Racine carrée d\'un nombre' },
            { name: 'MAX', signature: 'MAX(nombre1; [nombre2]; ...) → Valeur maximale' },
            { name: 'MIN', signature: 'MIN(nombre1; [nombre2]; ...) → Valeur minimale' },
            { name: 'ARRONDI', signature: 'ARRONDI(nombre; [decimales]) → Arrondi un nombre' },
            { name: 'ABS', signature: 'ABS(nombre) → Valeur absolue' },
            { name: 'EXP', signature: 'EXP(nombre) → e élevé à la puissance nombre' },
            { name: 'LN', signature: 'LN(nombre) → Logarithme naturel' },
            { name: 'LOG', signature: 'LOG(nombre; [base]) → Logarithme' },
            { name: 'SIN', signature: 'SIN(angle) → Sinus d\'un angle (en radians)' },
            { name: 'COS', signature: 'COS(angle) → Cosinus d\'un angle (en radians)' },
            { name: 'TAN', signature: 'TAN(angle) → Tangente d\'un angle (en radians)' },
            { name: 'PI', signature: 'PI() → Valeur de π' },
            { name: 'ALEA', signature: 'ALEA() → Nombre aléatoire entre 0 et 1' },
            { name: 'NOW', signature: 'NOW() → Date et heure actuelles' },
            { name: 'AUJOURDHUI', signature: 'AUJOURDHUI() → Date actuelle' },
            { name: 'CONCATENER', signature: 'CONCATENER(texte1; [texte2]; ...) → Concatène des textes' },
            { name: 'GAUCHE', signature: 'GAUCHE(texte; [nombre_de_caractères]) → Caractères de gauche' },
            { name: 'DROITE', signature: 'DROITE(texte; [nombre_de_caractères]) → Caractères de droite' },
            { name: 'LONGUEUR', signature: 'LONGUEUR(texte) → Nombre de caractères' }
        ];

        // Ajouter les fonctions personnalisées
        for (const funcName in customFunctions) {
            const func = customFunctions[funcName];
            standardFunctions.push({
                name: funcName,
                signature: func.description || 'Fonction personnalisée',
                custom: true
            });
        }

        // Filtrer et afficher les fonctions
        standardFunctions.forEach(func => {
            if (func.name.toLowerCase().includes(search) || func.signature.toLowerCase().includes(search)) {
                const item = document.createElement('div');
                item.className = 'function-item';
                item.dataset.function = func.name;

                if (func.custom) {
                    item.innerHTML = `
                        <div><strong>${func.name}</strong> <span style="color: var(--primary-purple);">✦</span></div>
                        <div class="function-signature">${func.signature}</div>
                    `;
                } else {
                    item.innerHTML = `
                        <div><strong>${func.name}</strong></div>
                        <div class="function-signature">${func.signature}</div>
                    `;
                }

                item.addEventListener('click', function() {
                    document.querySelectorAll('.function-item').forEach(i => i.classList.remove('selected'));
                    this.classList.add('selected');
                    document.getElementById('function-args').focus();
                });

                functionsList.appendChild(item);
            }
        });
    }

    function insertFunction() {
        const selectedFunction = document.querySelector('.function-item.selected');
        if (!selectedFunction) return;

        const functionName = selectedFunction.dataset.function;
        const args = document.getElementById('function-args').value;

        if (currentCell) {
            const formula = `=${functionName}(${args})`;
            document.getElementById('formula-input').value = formula;
            document.getElementById('formula-input').focus();

            saveCellContent(currentCell, formula);

            document.getElementById('element-modal').classList.remove('active');
        }
    }

    function toggleFormat(format) {
        if (!currentCell) return;

        const isActive = currentCell.style[format === 'bold' ? 'fontWeight' :
                                 format === 'italic' ? 'fontStyle' : ''] === format;

        const oldStyle = getCellStyle(currentCell);

        if (format === 'bold') {
            currentCell.style.fontWeight = isActive ? '' : 'bold';
        } else if (format === 'italic') {
            currentCell.style.fontStyle = isActive ? '' : 'italic';
        }

        const newStyle = getCellStyle(currentCell);

        saveToHistory({
            type: 'cell_style',
            cell: currentCell.dataset.coords,
            oldStyle: oldStyle,
            newStyle: newStyle
        });

        updateFormatButtons();
    }

    function setAlignment(align) {
        if (!currentCell) return;

        const oldStyle = getCellStyle(currentCell);

        currentCell.style.textAlign = align;

        const newStyle = getCellStyle(currentCell);

        saveToHistory({
            type: 'cell_style',
            cell: currentCell.dataset.coords,
            oldStyle: oldStyle,
            newStyle: newStyle
        });

        updateFormatButtons();
    }

    function updateFormatButtons() {
        if (!currentCell) return;

        document.getElementById('bold-btn').classList.toggle('active',
            currentCell.style.fontWeight === 'bold');

        document.getElementById('italic-btn').classList.toggle('active',
            currentCell.style.fontStyle === 'italic');

        const alignBtn = document.getElementById('align-btn');
        alignBtn.textContent = currentCell.style.textAlign === 'left' ? '↖️' :
                              currentCell.style.textAlign === 'center' ? '≡' : '↘️';
    }

    function applySelectedColor() {
        if (!currentCell || !colorModalTarget) return;

        const selectedColor = document.querySelector('#color-palette .color-option.selected');
        let color = selectedColor ? selectedColor.dataset.color : document.getElementById('custom-color').value;

        const oldStyle = getCellStyle(currentCell);

        if (colorModalTarget === 'text') {
            currentCell.style.color = color;
        } else if (colorModalTarget === 'fill') {
            currentCell.style.backgroundColor = color;
        }

        const newStyle = getCellStyle(currentCell);

        saveToHistory({
            type: 'cell_style',
            cell: currentCell.dataset.coords,
            oldStyle: oldStyle,
            newStyle: newStyle
        });

        document.getElementById('color-modal').classList.remove('active');
        updateFormatButtons();
    }

    function getCellStyle(cell) {
        return {
            fontWeight: cell.style.fontWeight,
            fontStyle: cell.style.fontStyle,
            textAlign: cell.style.textAlign,
            color: cell.style.color,
            backgroundColor: cell.style.backgroundColor
        };
    }

    function saveToHistory(action) {
        // Si nous ne sommes pas à la fin de l'historique, tronquer les actions suivantes
        if (historyIndex < history.length - 1) {
            history = history.slice(0, historyIndex + 1);
        }

        history.push(action);
        historyIndex = history.length - 1;

        updateHistoryUI();
        updateUndoRedoButtons();
    }

    function updateHistoryUI() {
        const historyItems = document.getElementById('history-items');
        historyItems.innerHTML = '';

        history.forEach((action, index) => {
            const item = document.createElement('div');
            item.className = 'history-item' + (index === historyIndex ? ' current' : '');
            item.dataset.index = index;

            let description = '';
            switch (action.type) {
                case 'cell_content':
                    description = `Modification ${action.cell}: ${action.oldValue || ''} → ${action.newValue || ''}`;
                    break;
                case 'cell_style':
                    description = `Style ${action.cell} modifié`;
                    break;
                case 'add_text_element':
                    description = 'Texte ajouté';
                    break;
                case 'remove_text_element':
                    description = 'Texte supprimé';
                    break;
                case 'move_text_element':
                    description = 'Texte déplacé/redimensionné';
                    break;
                case 'add_chart_element':
                    description = 'Graphique ajouté';
                    break;
                case 'remove_chart_element':
                    description = 'Graphique supprimé';
                    break;
                case 'move_chart_element':
                    description = 'Graphique déplacé/redimensionné';
                    break;
                case 'add_custom_function':
                    description = `Fonction ${action.function.name} ajoutée`;
                    break;
                case 'edit_custom_function':
                    description = `Fonction ${action.function.name} modifiée`;
                    break;
                case 'remove_custom_function':
                    description = `Fonction ${action.function.name} supprimée`;
                    break;
            }

            item.innerHTML = `
                <span>${description}</span>
                <span class="history-action">${index === historyIndex ? 'Actuel' : ''}</span>
            `;

            item.addEventListener('click', () => {
                goToHistoryIndex(index);
            });

            historyItems.appendChild(item);
        });
    }

    function updateUndoRedoButtons() {
        document.getElementById('undo-btn').disabled = historyIndex < 0;
        document.getElementById('redo-btn').disabled = historyIndex >= history.length - 1;
    }

    function undo() {
        if (historyIndex < 0) return;

        const action = history[historyIndex];
        reverseAction(action);

        historyIndex--;
        updateHistoryUI();
        updateUndoRedoButtons();
    }

    function redo() {
        if (historyIndex >= history.length - 1) return;

        historyIndex++;
        const action = history[historyIndex];
        applyAction(action);

        updateHistoryUI();
        updateUndoRedoButtons();
    }

    function goToHistoryIndex(index) {
        // Rejouer toutes les actions depuis le début jusqu'à l'index souhaité
        resetSpreadsheet();

        for (let i = 0; i <= index; i++) {
            applyAction(history[i]);
        }

        historyIndex = index;
        updateHistoryUI();
        updateUndoRedoButtons();
    }

    function resetSpreadsheet() {
        // Réinitialiser toutes les cellules
        document.querySelectorAll('.cell').forEach(cell => {
            cell.textContent = '';
            delete cell.dataset.formula;
            cell.style.fontWeight = '';
            cell.style.fontStyle = '';
            cell.style.textAlign = '';
            cell.style.color = '';
            cell.style.backgroundColor = '';
        });

        // Supprimer tous les éléments texte et graphiques
        elements.forEach(el => el.remove());
        elements = [];

        charts.forEach(ch => ch.remove());
        charts = [];

        // Réinitialiser les fonctions personnalisées
        customFunctions = {};
        updateCustomFunctionsInList();
    }

    function applyAction(action) {
        switch (action.type) {
            case 'cell_content':
                const cell = document.querySelector(`.cell[data-coords="${action.cell}"]`);
                if (cell) {
                    if (action.newValue.startsWith('=')) {
                        cell.dataset.formula = action.newValue;
                        try {
                            cell.textContent = evaluateFormula(action.newValue.substring(1), action.cell);
                        } catch (e) {
                            cell.textContent = '#ERREUR';
                        }
                    } else {
                        cell.textContent = action.newValue;
                        delete cell.dataset.formula;
                    }

                    // Appliquer le style
                    if (action.newStyle) {
                        applyCellStyle(cell, action.newStyle);
                    }
                }
                break;

            case 'cell_style':
                const styleCell = document.querySelector(`.cell[data-coords="${action.cell}"]`);
                if (styleCell) {
                    applyCellStyle(styleCell, action.newStyle);
                }
                break;

            case 'add_text_element':
                addTextElementFromHistory(action.element);
                break;

            case 'remove_text_element':
                // Ne rien faire, l'élément sera recréé si nécessaire par une action ultérieure
                break;

            case 'move_text_element':
                // Les éléments sont recréés par add_text_element, donc cette action est gérée automatiquement
                break;

            case 'add_chart_element':
                addChartElementFromHistory(action.element);
                break;

            case 'remove_chart_element':
                // Ne rien faire, l'élément sera recréé si nécessaire par une action ultérieure
                break;

            case 'move_chart_element':
                // Les éléments sont recréés par add_chart_element, donc cette action est gérée automatiquement
                break;

            case 'add_custom_function':
            case 'edit_custom_function':
                customFunctions[action.function.name] = action.function;
                updateCustomFunctionsInList();
                break;

            case 'remove_custom_function':
                delete customFunctions[action.function.name];
                updateCustomFunctionsInList();
                break;
        }
    }

    function reverseAction(action) {
        switch (action.type) {
            case 'cell_content':
                const cell = document.querySelector(`.cell[data-coords="${action.cell}"]`);
                if (cell) {
                    if (action.oldValue && action.oldValue.startsWith('=')) {
                        cell.dataset.formula = action.oldValue;
                        try {
                            cell.textContent = evaluateFormula(action.oldValue.substring(1), action.cell);
                        } catch (e) {
                            cell.textContent = '#ERREUR';
                        }
                    } else {
                        cell.textContent = action.oldValue || '';
                        delete cell.dataset.formula;
                    }

                    // Appliquer l'ancien style
                    if (action.oldStyle) {
                        applyCellStyle(cell, action.oldStyle);
                    } else {
                        cell.style.fontWeight = '';
                        cell.style.fontStyle = '';
                        cell.style.textAlign = '';
                        cell.style.color = '';
                        cell.style.backgroundColor = '';
                    }
                }
                break;

            case 'cell_style':
                const styleCell = document.querySelector(`.cell[data-coords="${action.cell}"]`);
                if (styleCell) {
                    applyCellStyle(styleCell, action.oldStyle);
                }
                break;

            case 'add_text_element':
                // Supprimer l'élément (il sera recréé par une action ultérieure si nécessaire)
                const textElements = document.querySelectorAll('.text-element');
                textElements.forEach(el => {
                    if (el.textContent === action.element.content &&
                        el.style.color === action.element.color &&
                        el.style.backgroundColor === action.element.bgColor) {
                        el.remove();
                        elements = elements.filter(e => e !== el);
                    }
                });
                break;

            case 'remove_text_element':
                addTextElementFromHistory(action.element);
                break;

            case 'move_text_element':
                // Les éléments sont recréés par add_text_element, donc cette action est gérée automatiquement
                break;

            case 'add_chart_element':
                // Supprimer l'élément (il sera recréé par une action ultérieure si nécessaire)
                const chartElements = document.querySelectorAll('.graphic-element');
                chartElements.forEach(el => {
                    if (el.querySelector('canvas') &&
                        el.querySelector('canvas').previousSibling.textContent === action.element.title) {
                        el.remove();
                        charts = charts.filter(ch => ch !== el);
                    }
                });
                break;

            case 'remove_chart_element':
                addChartElementFromHistory(action.element);
                break;

            case 'move_chart_element':
                // Les éléments sont recréés par add_chart_element, donc cette action est gérée automatiquement
                break;

            case 'add_custom_function':
            case 'edit_custom_function':
                // Supprimer la fonction (elle sera recréée par une action ultérieure si nécessaire)
                delete customFunctions[action.function.name];
                updateCustomFunctionsInList();
                break;

            case 'remove_custom_function':
                customFunctions[action.function.name] = action.function;
                updateCustomFunctionsInList();
                break;
        }
    }

    function addTextElementFromHistory(element) {
        const textElement = document.createElement('div');
        textElement.className = 'text-element';
        textElement.textContent = element.content;
        textElement.style.color = element.color;
        textElement.style.backgroundColor = element.bgColor;
        textElement.style.left = element.left;
        textElement.style.top = element.top;
        if (element.width) textElement.style.width = element.width;
        if (element.height) textElement.style.height = element.height;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '✕';
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            textElement.remove();
            elements = elements.filter(el => el !== textElement);
        });

        textElement.appendChild(deleteBtn);
        document.querySelector('.spreadsheet-container').appendChild(textElement);

        makeDraggable(textElement);
        elements.push(textElement);
    }

    function addChartElementFromHistory(element) {
        const chartElement = document.createElement('div');
        chartElement.className = 'graphic-element';
        chartElement.style.left = element.left || '100px';
        chartElement.style.top = element.top || '100px';
        if (element.width) chartElement.style.width = element.width;
        if (element.height) chartElement.style.height = element.height;

        const canvas = document.createElement('canvas');
        chartElement.appendChild(canvas);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '✕';
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            chartElement.remove();
            charts = charts.filter(ch => ch !== chartElement);
        });

        chartElement.appendChild(deleteBtn);
        document.querySelector('.spreadsheet-container').appendChild(chartElement);

        createChart(canvas, element.type, element.title, element.dataRange, element.showLabels, element.colorScheme);
        makeDraggable(chartElement);
        charts.push(chartElement);
    }

    function toggleHistoryPanel() {
        const panel = document.getElementById('history-panel');
        panel.classList.toggle('active');
    }

    function toggleCustomFunctionsPanel() {
        const panel = document.getElementById('custom-functions-panel');
        panel.classList.toggle('active');

        if (panel.classList.contains('active')) {
            updateCustomFunctionsInList();
        }
    }

    function toggleReportsPanel() {
        const panel = document.getElementById('reports-panel');
        panel.classList.toggle('active');
    }

    async function loadAndDisplayReports() {
        try {
            const response = await fetch(`${CODE_SERVER_URL}/api/reports/list`);
            if (!response.ok) {
                throw new Error('Could not fetch reports.');
            }
            const reports = await response.json();
            const reportList = document.getElementById('report-list');
            reportList.innerHTML = ''; // Clear existing list

            if (reports.length === 0) {
                reportList.innerHTML = '<div style="text-align: center; padding: 1rem; color: #999;">Aucun rapport sauvegardé.</div>';
                return;
            }

            reports.forEach(report => {
                const item = document.createElement('div');
                item.className = 'report-list-item';
                item.innerHTML = `
                    <div class="report-header">
                        <span class="report-name">${report.name}</span>
                        <div class="report-actions">
                            <button class="small" onclick="editReport(${report.id})">✏️</button>
                            <button class="small" onclick="deleteReport(${report.id})">🗑️</button>
                        </div>
                    </div>
                    ${report.description ? `<div class="report-description">${report.description}</div>` : ''}
                `;
                reportList.appendChild(item);
            });
        } catch (e) {
            console.error("Failed to load reports:", e);
            document.getElementById('report-list').innerHTML = '<div style="color:red;">Erreur de chargement des rapports.</div>';
        }
    }

    async function deleteReport(templateId) {
        if (!confirm('Voulez-vous vraiment supprimer ce modèle de rapport ?')) {
            return;
        }
        try {
            const response = await fetch(`${CODE_SERVER_URL}/api/reports/delete/${templateId}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                throw new Error('Failed to delete report.');
            }
            await loadAndDisplayReports(); // Refresh the list
        } catch (e) {
            console.error("Failed to delete report:", e);
            alert("Erreur lors de la suppression du rapport.");
        }
    }

    async function editReport(templateId) {
        try {
            const response = await fetch(`${CODE_SERVER_URL}/api/reports/load/${templateId}`);
            if (!response.ok) {
                throw new Error("Failed to load report template.");
            }
            const template = await response.json();
            openReportEditor(template);
        } catch (e) {
            console.error("Error loading report for editing:", e);
            alert("Impossible de charger le modèle de rapport pour l'édition.");
        }
    }

    function confirmAddReportElement() {
        const type = document.getElementById('report-element-type').value;
        let source;
        if (type === 'chart') {
            source = document.getElementById('chart-source-select').value;
        } else if (type === 'range') {
            source = document.getElementById('cell-range-input').value;
        } else if (type === 'text') {
            source = document.getElementById('static-text-input').value;
        }

        if (!source) {
            alert("Veuillez sélectionner une source ou entrer une valeur.");
            return;
        }

        const elementData = {
            type: type,
            source: source,
            style: {
                top: '10px',
                left: '10px',
                width: '300px',
                height: '200px'
            }
        };

        renderReportElement(elementData);
        document.getElementById('add-element-modal').classList.remove('active');
    }

    // --- Report Editor Logic ---
    let currentReport = null; // To store the state of the report being edited

    function openReportEditor(template = null) {
        currentReport = template ? { ...template } : { id: null, name: '', description: '', layout: { elements: [] } };

        document.getElementById('report-name-input').value = currentReport.name;
        document.getElementById('report-desc-input').value = currentReport.description || '';

        refreshReportCanvas();

        document.getElementById('report-editor').classList.add('active');
        document.addEventListener('spreadsheetDataChanged', refreshReportCanvas);
    }

    function closeReportEditor() {
        if (confirm("Voulez-vous fermer l'éditeur ? Toutes les modifications non sauvegardées seront perdues.")) {
            document.getElementById('report-editor').classList.remove('active');
            document.removeEventListener('spreadsheetDataChanged', refreshReportCanvas);
            currentReport = null;
        }
    }

    function refreshReportCanvas() {
        if (!currentReport) return;
        const canvas = document.getElementById('report-canvas');
        canvas.innerHTML = ''; // Clear canvas
        if (currentReport.layout && currentReport.layout.elements) {
            currentReport.layout.elements.forEach(renderReportElement);
        }
    }

    function openAddElementModal() {
        // Populate chart dropdown
        const chartSelect = document.getElementById('chart-source-select');
        chartSelect.innerHTML = '';
        document.querySelectorAll('.graphic-element').forEach(el => {
            const chartInstance = Chart.getChart(el.querySelector('canvas'));
            if (chartInstance) {
                const option = document.createElement('option');
                option.value = el.id;
                option.textContent = chartInstance.options.plugins.title.text || `Graphique (ID: ${el.id})`;
                chartSelect.appendChild(option);
            }
        });
        document.getElementById('add-element-modal').classList.add('active');
    }

    function handleReportElementTypeChange() {
        const type = document.getElementById('report-element-type').value;
        document.querySelectorAll('.element-options').forEach(el => el.style.display = 'none');
        document.getElementById(`element-options-${type}`).style.display = 'block';
    }

    function renderReportElement(elementData) {
        const canvas = document.getElementById('report-canvas');
        const el = document.createElement('div');
        el.className = 'report-element';
        el.style.left = elementData.style.left;
        el.style.top = elementData.style.top;
        el.style.width = elementData.style.width;
        el.style.height = elementData.style.height;
        el.dataset.source = elementData.source;
        el.dataset.type = elementData.type;

        if (elementData.type === 'chart') {
            const sourceChart = document.getElementById(elementData.source);
            if (sourceChart) {
                const sourceCanvas = sourceChart.querySelector('canvas');
                const chartInstance = Chart.getChart(sourceCanvas);
                const newCanvas = document.createElement('canvas');
                el.appendChild(newCanvas);
                createChart(newCanvas, chartInstance.config.type, chartInstance.options.plugins.title.text, sourceChart.dataset.dataRange, chartInstance.options.plugins.legend.display, sourceChart.dataset.colorScheme);
            }
        } else if (elementData.type === 'range') {
            el.innerHTML = ''; // Clear placeholder
            const table = document.createElement('table');
            table.className = 'spreadsheet'; // Reuse spreadsheet styles

            const range = elementData.source;
            const [start, end] = range.split(':');
            const startMatch = start.match(/([A-Z]+)([0-9]+)/);
            const endMatch = end.match(/([A-Z]+)([0-9]+)/);

            if (startMatch && endMatch) {
                const startCol = colLabelToIndex(startMatch[1]);
                const startRow = parseInt(startMatch[2]) - 1;
                const endCol = colLabelToIndex(endMatch[1]);
                const endRow = parseInt(endMatch[2]) - 1;

                for (let r = startRow; r <= endRow; r++) {
                    const tr = document.createElement('tr');
                    for (let c = startCol; c <= endCol; c++) {
                        const sourceCell = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
                        const td = document.createElement('td');
                        td.className = 'cell';
                        td.textContent = sourceCell ? sourceCell.textContent : '';
                        tr.appendChild(td);
                    }
                    table.appendChild(tr);
                }
            }
            el.appendChild(table);
        } else if (elementData.type === 'text') {
            el.innerHTML = `<div>${elementData.source}</div>`;
        }

        canvas.appendChild(el);
        makeDraggable(el); // Reuse draggable logic
    }

    async function saveReport() {
        if (!currentReport) return;

        const name = document.getElementById('report-name-input').value;
        const description = document.getElementById('report-desc-input').value;

        if (!name) {
            alert("Le nom du rapport est requis.");
            return;
        }

        // Update currentReport object
        currentReport.name = name;
        currentReport.description = description;
        currentReport.layout.elements = [];

        document.querySelectorAll('#report-canvas .report-element').forEach(el => {
            currentReport.layout.elements.push({
                type: el.dataset.type,
                source: el.dataset.source,
                style: {
                    left: el.style.left,
                    top: el.style.top,
                    width: el.style.width,
                    height: el.style.height
                }
            });
        });

        try {
            const response = await fetch(`${CODE_SERVER_URL}/api/reports/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentReport)
            });
            if (!response.ok) {
                throw new Error("Failed to save the report.");
            }
            alert("Rapport sauvegardé avec succès !");
            await loadAndDisplayReports();
            closeReportEditor();
        } catch(e) {
            console.error("Error saving report:", e);
            alert("Erreur lors de la sauvegarde du rapport.");
        }
    }


    // Make editReport and deleteReport globally accessible
    window.editReport = editReport;
    window.deleteReport = deleteReport;

    function newCustomFunction() {
        document.getElementById('function-editor-container').style.display = 'block';
        document.getElementById('function-list-container').style.display = 'none';

        // Réinitialiser les champs
        document.getElementById('function-name').value = '';
        document.getElementById('function-description').value = '';
        document.getElementById('function-example').value = '';
        document.getElementById('function-params').value = '';
        functionEditor.setValue(
`/**
* @param {...any} args - Arguments de la fonction
* @return {any} Résultat de la fonction
*/
function NOUVELLE_FONCTION(...args) {
// Votre code ici
// Exemple: return args.reduce((a, b) => a + b, 0);
}
`, -1);

        document.getElementById('function-error').classList.remove('visible');
        currentEditingFunction = null;
    }

    async function saveCustomFunction() {
        const name = document.getElementById('function-name').value.trim().toUpperCase();
        const description = document.getElementById('function-description').value;
        const language = document.getElementById('function-language').value;
        const code = functionEditor.getValue();

        if (!name || !code) {
            alert('Le nom de la fonction et le code sont requis.');
            return;
        }

        const functionData = { name, description, language, code };

        try {
            const response = await fetch(`${CODE_SERVER_URL}/api/functions/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(functionData)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Échec de la sauvegarde de la fonction.');
            }

            // Recharger la liste complète des fonctions pour être sûr
            await loadCustomFunctions();

            cancelCustomFunction();

        } catch (e) {
            console.error('Erreur lors de la sauvegarde de la fonction personnalisée:', e);
            alert(`Erreur lors de la sauvegarde de la fonction : ${e.message}`);
        }
    }

    function cancelCustomFunction() {
        document.getElementById('function-editor-container').style.display = 'none';
        document.getElementById('function-list-container').style.display = 'block';
        document.getElementById('function-error').classList.remove('visible');
    }

    function editCustomFunction(name) {
        const func = customFunctions[name];
        if (!func) return;

        document.getElementById('function-editor-container').style.display = 'block';
        document.getElementById('function-list-container').style.display = 'none';

        // Remplir les champs
        document.getElementById('function-name').value = func.name;
        document.getElementById('function-description').value = func.description || '';
        document.getElementById('function-example').value = func.example || '';
        document.getElementById('function-params').value = func.params || '';
        document.getElementById('function-language').value = func.language || 'javascript';
        functionEditor.session.setMode(`ace/mode/${func.language || 'javascript'}`);
        functionEditor.setValue(func.code, -1);

        document.getElementById('function-error').classList.remove('visible');
        currentEditingFunction = name;
    }

    async function removeCustomFunction(name) {
        if (confirm(`Voulez-vous vraiment supprimer la fonction "${name}" ?`)) {
            try {
                const response = await fetch(`${CODE_SERVER_URL}/api/functions/delete/${name}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.detail || 'Échec de la suppression de la fonction.');
                }

                // Recharger la liste complète des fonctions pour être sûr
                await loadCustomFunctions();

            } catch (e) {
                console.error('Erreur lors de la suppression de la fonction personnalisée:', e);
                alert(`Erreur lors de la suppression de la fonction : ${e.message}`);
            }
        }
    }

    function updateCustomFunctionsInList() {
        const functionList = document.getElementById('function-list');
        functionList.innerHTML = '';

        if (Object.keys(customFunctions).length === 0) {
            functionList.innerHTML = '<div style="text-align: center; padding: 1rem; color: #999;">Aucune fonction personnalisée</div>';
            return;
        }

        for (const funcName in customFunctions) {
            const func = customFunctions[funcName];
            const item = document.createElement('div');
            item.className = 'function-list-item';

            item.innerHTML = `
                <div class="function-header">
                    <span class="function-name">${funcName}</span>
                    <div class="function-actions">
                        <button class="small" onclick="editCustomFunction('${funcName}')">✏️</button>
                        <button class="small" onclick="removeCustomFunction('${funcName}')">🗑️</button>
                    </div>
                </div>
                ${func.description ? `<div class="function-description">${func.description}</div>` : ''}
                ${func.example ? `<div class="function-example">${func.example}</div>` : ''}
            `;

            functionList.appendChild(item);
        }

        // Rendre les fonctions disponibles dans le scope global
        window.editCustomFunction = editCustomFunction;
        window.removeCustomFunction = removeCustomFunction;
    }

    function reloadAllCustomFunctions() {
        // Recharger toutes les fonctions personnalisées dans le scope global
        // pour qu'elles soient utilisables par le moteur de formules.
        for (const funcName in customFunctions) {
            const func = customFunctions[funcName];
            const language = func.language;

            // Créer un wrapper pour la fonction qui appellera le backend
            window[`${funcName}_custom`] = async function(...args) {
                try {
                    return await executeCode(func.code, args, language);
                } catch (e) {
                    console.error(`Erreur lors de l'exécution de la fonction personnalisée ${funcName}:`, e);
                    return 'ERREUR_EXEC';
                }
            };
        }
    }

    async function loadCustomFunctions() {
        try {
            const response = await fetch(`${CODE_SERVER_URL}/api/functions/list`);
            if (!response.ok) {
                throw new Error('Échec du chargement des fonctions personnalisées.');
            }
            const functionsList = await response.json();

            // Transformer la liste en dictionnaire
            customFunctions = {};
            functionsList.forEach(func => {
                customFunctions[func.name] = func;
            });

            reloadAllCustomFunctions(); // S'assure que les fonctions sont prêtes à être utilisées
            updateCustomFunctionsInList(); // Met à jour l'interface utilisateur

        } catch (e) {
            console.error('Erreur lors du chargement des fonctions personnalisées depuis la base de données:', e);
            // Ne pas bloquer l'utilisateur si les fonctions ne se chargent pas
        }
    }

    /**
     * Rassemble toutes les données du tableur (cellules, éléments, graphiques) et les envoie au backend pour sauvegarde.
     */
    async function saveSpreadsheet() {
                const spreadsheetName = document.getElementById('spreadsheet-container').dataset.spreadsheetName;
                if (!spreadsheetName) {
                    alert("Erreur: Nom du tableur non trouvé.");
                    return;
                }
                console.log(`Sauvegarde du tableur: ${spreadsheetName}...`);

        // 1. Rassembler les données des cellules
        const cellsData = {};
        document.querySelectorAll('.cell').forEach(cell => {
            if (cell.textContent || cell.dataset.formula || hasStyle(cell)) {
                cellsData[cell.dataset.coords] = {
                    value: cell.textContent,
                    formula: cell.dataset.formula || null,
                    style: getCellStyle(cell)
                };
            }
        });

        // 2. Rassembler les données des éléments flottants (texte)
        const elementsData = Array.from(document.querySelectorAll('.text-element')).map(el => {
            const textContent = el.querySelector('.text-content');
            return {
                id: el.id,
                type: 'text',
                content: textContent ? textContent.textContent : '',
                style: {
                    left: el.style.left,
                    top: el.style.top,
                    width: el.style.width,
                    height: el.style.height,
                    color: el.style.color,
                    backgroundColor: el.style.backgroundColor,
                    zIndex: el.style.zIndex
                }
            };
        });

        // 3. Rassembler les données des graphiques
        const chartsData = Array.from(document.querySelectorAll('.graphic-element')).map(el => {
            const chartInstance = Chart.getChart(el.querySelector('canvas'));
            if (!chartInstance) return null;
            return {
                id: el.id,
                type: 'chart',
                chartType: chartInstance.config.type,
                dataRange: el.dataset.dataRange,
                title: chartInstance.options.plugins.title.text,
                showLabels: chartInstance.options.plugins.legend.display,
                colorScheme: el.dataset.colorScheme,
                style: {
                    left: el.style.left,
                    top: el.style.top,
                    width: el.style.width,
                    height: el.style.height,
                    zIndex: el.style.zIndex
                }
            };
        }).filter(Boolean); // Filtrer les graphiques nuls

        // 4. Créer le payload complet
        const spreadsheetData = {
            cells: cellsData,
            elements: elementsData,
            charts: chartsData
        };

        // 5. Envoyer au backend
        try {
                    const response = await fetch(`${CODE_SERVER_URL}/api/spreadsheets/${spreadsheetName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(spreadsheetData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Échec de la sauvegarde des données du tableur.');
            }

            const result = await response.json();
            console.log('Tableur sauvegardé avec succès:', result.name);
            alert('Tableur sauvegardé avec succès !');

        } catch (e) {
            console.error('Erreur lors de la sauvegarde du tableur:', e);
            alert('Erreur lors de la sauvegarde du tableur dans la base de données. Voir la console pour les détails.');
        }
    }

    function recalculateAllFormulas() {
        // Créer une liste de toutes les cellules avec des formules
        const formulaCells = Array.from(document.querySelectorAll('.cell[data-formula]'));

        // Topologie-sort-like approach: recalculate cells with no dependencies first
        // For simplicity, we just iterate multiple times. A real implementation
        // would build a dependency graph.
        const maxIterations = formulaCells.length;
        for (let i = 0; i < maxIterations; i++) {
            let changed = false;
            formulaCells.forEach(cell => {
                try {
                    const oldText = cell.textContent;
                    const formula = cell.dataset.formula;
                    const result = evaluateFormula(formula.substring(1), cell.dataset.coords);
                    if (result !== oldText) {
                        cell.textContent = result;
                        changed = true;
                    }
                } catch (e) {
                    cell.textContent = '#ERREUR';
                    console.error(`Erreur lors du recalcul de la formule pour ${cell.dataset.coords}:`, e);
                }
            });
            // If no values changed in an iteration, we can stop
            if (!changed && i > 0) break;
        }
    }

    async function recalculateAllFormulas() {
        const formulaCells = Array.from(document.querySelectorAll('.cell[data-formula]'));
        for (const cell of formulaCells) {
            try {
                const formula = cell.dataset.formula;
                const result = await evaluateFormula(formula.substring(1), new Set([cell.dataset.coords]));
                cell.textContent = result;
            } catch (e) {
                cell.textContent = e.message.startsWith('#') ? e.message : '#ERREUR_RECALC';
                console.error(`Erreur lors du recalcul de ${cell.dataset.coords}:`, e);
            }
        }
    }

    /**
     * Charge les données du tableur actuel depuis le backend et les affiche.
     */
    async function loadSpreadsheet() {
        try {
            const spreadsheetName = document.getElementById('spreadsheet-container').dataset.spreadsheetName;
            const response = await fetch(`/api/spreadsheets/${spreadsheetName}`);

            if (!response.ok) {
                if (response.status === 404) {
                    console.log('Tableur non trouvé. Feuille vierge initialisée.');
                } else {
                    throw new Error(`Erreur serveur: ${response.status}`);
                }
                return;
            }

            const data = await response.json();
            renderSpreadsheet(data);
            console.log(`Tableur '${spreadsheetName}' chargé.`);

        } catch (e) {
            console.error('Erreur lors du chargement du tableur:', e);
            alert('Impossible de charger les données du tableur.');
        }
    }

    /**
     * Affiche les données d'un tableur (cellules, éléments, graphiques) sur la grille.
     * @param {object} data - L'objet contenant les données du tableur.
     */
    function renderSpreadsheet(data) {
        resetSpreadsheet();

        // 2. Rendre les cellules
        if (data.cells) {
            for (const coords in data.cells) {
                const cellData = data.cells[coords];
                const cell = document.querySelector(`.cell[data-coords="${coords}"]`);
                if (cell) {
                    cell.textContent = cellData.value || '';
                    if (cellData.formula) {
                        cell.dataset.formula = cellData.formula;
                    }
                    if (cellData.style) {
                        applyCellStyle(cell, cellData.style);
                    }
                }
            }
        }

        // 3. Rendre les éléments de texte
        if (data.elements) {
            data.elements.forEach(elementData => {
                // We pass 'true' to indicate this is from loading, not a new user action
                addTextElement(elementData, true);
            });
        }

        // 4. Rendre les graphiques
        if (data.charts) {
            data.charts.forEach(chartData => {
                // We pass 'true' to indicate this is from loading, not a new user action
                addChartElement(chartData, true);
            });
        }

        // 5. Recalculer toutes les formules après le chargement
        recalculateAllFormulas();
    }

    function hasStyle(cell) {
        return cell.style.fontWeight || cell.style.fontStyle || cell.style.textAlign ||
               cell.style.color || cell.style.backgroundColor;
    }

    function applyCellStyle(cell, style) {
        if (style.fontWeight) cell.style.fontWeight = style.fontWeight;
        if (style.fontStyle) cell.style.fontStyle = style.fontStyle;
        if (style.textAlign) cell.style.textAlign = style.textAlign;
        if (style.color) cell.style.color = style.color;
        if (style.backgroundColor) cell.style.backgroundColor = style.backgroundColor;
    }

    function exportToExcel() {
        const wb = XLSX.utils.book_new();

        // Créer une feuille de calcul
        const wsData = [];

        // Ajouter les en-têtes de colonne
        const headerRow = [''];
        for (let i = 0; i < initialCols; i++) {
            headerRow.push(String.fromCharCode(65 + i));
        }
        wsData.push(headerRow);

        // Ajouter les données
        for (let i = 0; i < initialRows; i++) {
            const rowData = [i + 1];
            for (let j = 0; j < initialCols; j++) {
                const cell = document.querySelector(`.cell[data-row="${i}"][data-col="${j}"]`);
                if (cell) {
                    rowData.push(cell.dataset.formula || cell.textContent);
                } else {
                    rowData.push('');
                }
            }
            wsData.push(rowData);
        }

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Feuil1");

        // Exporter
        XLSX.writeFile(wb, "tableur-export.xlsx");
    }

    // Fonctions pour l'importation de données
    async function startDataImport() {
        const url = document.getElementById('import-url').value;
        const range = document.getElementById('import-range').value;
        const interval = parseInt(document.getElementById('import-interval').value);
        const type = document.getElementById('import-type').value;
        const name = document.getElementById('import-name').value || `Import ${Object.keys(dataImporters).length + 1}`;

        if (!url || !range || !interval) {
            alert('Veuillez remplir tous les champs');
            return;
        }

        if (interval < 10) {
            alert('L\'intervalle doit être d\'au moins 10 secondes');
            return;
        }

        // Vérifier la validité de la plage
        if (!isValidRange(range)) {
            alert('Format de plage invalide. Utilisez le format A1 pour la cellule de départ.');
            return;
        }

        try {
            // Créer un identifiant unique pour cet importateur
            const importerId = `import_${Date.now()}`;

            // Arrêter l'importateur existant pour cette plage si nécessaire
            if (dataImporters[range]) {
                stopDataImport(range);
            }

            // Créer le nouvel importateur
            dataImporters[range] = {
                id: importerId,
                name: name,
                url: url,
                range: range,
                type: type,
                interval: interval * 1000, // Convertir en millisecondes
                intervalId: null,
                lastUpdate: null,
                status: 'active',
                lastValue: null,
                error: null
            };

            // Initialiser le suivi de ligne pour l'import incrémentiel
            if (type === 'incremental') {
                const match = range.match(/([A-Z]+)([0-9]+)/);
                lastIncrementalRow[range] = parseInt(match[2]) - 1;
            }

            // Faire la première importation
            await fetchAndImportData(importerId);

            // Configurer l'intervalle de mise à jour
            dataImporters[range].intervalId = setInterval(
                () => fetchAndImportData(importerId),
                interval * 1000
            );

            // Fermer la modale
            document.getElementById('element-modal').classList.remove('active');

            // Mettre à jour l'interface
            updateImportsList();

        } catch (error) {
            console.error('Erreur lors du démarrage de l\'importation:', error);
            alert('Erreur lors du démarrage de l\'importation. Vérifiez l\'URL et réessayez.');
        }
    }

    function stopDataImport(range) {
        if (dataImporters[range]) {
            clearInterval(dataImporters[range].intervalId);
            delete dataImporters[range];
        }
    }

    async function fetchAndImportData(importerId) {
        // Trouver l'importateur correspondant
        const importer = Object.values(dataImporters).find(imp => imp.id === importerId);
        if (!importer || importer.status === 'paused') return;

        try {
            // Récupérer les données
            const response = await fetch(importer.url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();

            // Mettre à jour la dernière mise à jour et la valeur
            importer.lastUpdate = new Date();
            importer.lastValue = data;
            importer.error = null;

            // Trouver la cellule de départ
            const match = importer.range.match(/([A-Z]+)([0-9]+)/);
            if (!match) throw new Error('Format de plage invalide');

            const startCol = match[1].charCodeAt(0) - 65; // Convertir A->0, B->1, etc.
            const startRow = importer.type === 'fixed'
                ? parseInt(match[2]) - 1
                : lastIncrementalRow[importer.range] + 1;

            // Fonction pour formater un objet en chaîne JSON lisible
            const formatObject = (obj) => {
                if (typeof obj === 'object' && obj !== null) {
                    return JSON.stringify(obj, null, 2);
                }
                return obj.toString();
            };

            // Importer les données
            if (Array.isArray(data)) {
                data.forEach((row, rowIndex) => {
                    const currentRow = importer.type === 'fixed' ? startRow + rowIndex : startRow + rowIndex;
                    if (Array.isArray(row)) {
                        row.forEach((value, colIndex) => {
                            const cell = document.querySelector(
                                `.cell[data-row="${currentRow}"][data-col="${startCol + colIndex}"]`
                            );
                            if (cell) {
                                const formattedValue = formatObject(value);
                                saveCellContent(cell, formattedValue);
                                cell.dataset.rawValue = JSON.stringify(value);
                            }
                        });
                    } else {
                        const cell = document.querySelector(
                            `.cell[data-row="${currentRow}"][data-col="${startCol}"]`
                        );
                        if (cell) {
                            const formattedValue = formatObject(row);
                            saveCellContent(cell, formattedValue);
                            cell.dataset.rawValue = JSON.stringify(row);
                        }
                    }
                });

                // Mettre à jour la dernière ligne pour l'import incrémentiel
                if (importer.type === 'incremental') {
                    lastIncrementalRow[importer.range] = startRow + data.length - 1;
                }
            } else if (typeof data === 'object' && data !== null) {
                Object.entries(data).forEach(([key, value], index) => {
                    const currentRow = importer.type === 'fixed' ? startRow + index : startRow + index;

                    // Stocker la clé
                    const keyCell = document.querySelector(
                        `.cell[data-row="${currentRow}"][data-col="${startCol}"]`
                    );
                    if (keyCell) {
                        saveCellContent(keyCell, key);
                    }

                    // Stocker la valeur
                    const valueCell = document.querySelector(
                        `.cell[data-row="${currentRow}"][data-col="${startCol + 1}"]`
                    );
                    if (valueCell) {
                        const formattedValue = formatObject(value);
                        saveCellContent(valueCell, formattedValue);
                        valueCell.dataset.rawValue = JSON.stringify(value);
                    }
                });

                // Mettre à jour la dernière ligne pour l'import incrémentiel
                if (importer.type === 'incremental') {
                    lastIncrementalRow[importer.range] = startRow + Object.keys(data).length - 1;
                }
            } else {
                // Valeur simple
                const cell = document.querySelector(
                    `.cell[data-row="${startRow}"][data-col="${startCol}"]`
                );
                if (cell) {
                    const formattedValue = formatObject(data);
                    saveCellContent(cell, formattedValue);
                    cell.dataset.rawValue = JSON.stringify(data);
                }

                if (importer.type === 'incremental') {
                    lastIncrementalRow[importer.range] = startRow;
                }
            }

            // Mettre à jour l'interface
            updateImportsList();

        } catch (error) {
            console.error('Erreur lors de l\'importation des données:', error);
            importer.error = error.message;
            importer.lastUpdate = new Date();

            // Marquer l'erreur dans la cellule de départ
            const cell = document.querySelector(`.cell[data-coords="${importer.range}"]`);
            if (cell) {
                saveCellContent(cell, '#ERREUR_IMPORT');
            }

            // Mettre à jour l'interface
            updateImportsList();
        }
    }

    function updateImportsList() {
        const importsList = document.getElementById('imports-list');
        if (!importsList) return;

        importsList.innerHTML = '';

        Object.values(dataImporters).forEach(importer => {
            const item = document.createElement('div');
            item.className = 'import-item';

            const lastUpdateText = importer.lastUpdate
                ? `Dernière mise à jour : ${importer.lastUpdate.toLocaleTimeString()}`
                : 'Pas encore mis à jour';

            item.innerHTML = `
                <div class="import-info">
                    <div class="import-name">${importer.name}</div>
                    <div class="import-details">
                        ${importer.url}<br>
                        Cellule : ${importer.range}, Type : ${importer.type === 'fixed' ? 'Fixe' : 'Incrémentiel'}
                    </div>
                    <div class="import-last-update">${lastUpdateText}</div>
                    ${importer.error ? `<div class="import-error" style="color: var(--crimson)">Erreur : ${importer.error}</div>` : ''}
                </div>
                <div class="import-status ${importer.status}">${importer.status === 'active' ? 'Actif' : 'Pause'}</div>
                <div class="import-actions">
                    ${importer.status === 'active'
                        ? `<button class="small" onclick="pauseImport('${importer.range}')">⏸️</button>`
                        : `<button class="small" onclick="resumeImport('${importer.range}')">▶️</button>`
                    }
                    <button class="small" onclick="stopImport('${importer.range}')">🗑️</button>
                </div>
            `;

            importsList.appendChild(item);
        });
    }

    function pauseImport(range) {
        if (dataImporters[range]) {
            dataImporters[range].status = 'paused';
            updateImportsList();
        }
    }

    function resumeImport(range) {
        if (dataImporters[range]) {
            dataImporters[range].status = 'active';
            // Forcer une mise à jour immédiate
            fetchAndImportData(dataImporters[range].id);
            updateImportsList();
        }
    }

    function stopImport(range) {
        if (confirm(`Voulez-vous vraiment arrêter l'import "${dataImporters[range].name}" ?`)) {
            if (dataImporters[range].intervalId) {
                clearInterval(dataImporters[range].intervalId);
            }
            delete dataImporters[range];
            delete lastIncrementalRow[range];
            updateImportsList();
        }
    }

    function isValidRange(range) {
        return /^[A-Z]+[0-9]+$/.test(range);
    }

    function toggleVisualizationMode() {
        const isActive = document.body.classList.toggle('visualization-active');
        const btn = document.getElementById('viz-mode-btn');
        if (isActive) {
            btn.innerHTML = '🚪 Quitter';
            btn.title = 'Quitter le mode Visualisation';
        } else {
            btn.innerHTML = '👁️ Visualiser';
            btn.title = 'Mode Visualisation';
        }
    }

    function importFromExcel(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});

                // Prendre la première feuille
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, {header: 1});

                // Réinitialiser le tableur
                resetSpreadsheet();
                history = [];
                historyIndex = -1;

                // Importer les données
                for (let i = 1; i < jsonData.length; i++) { // Commencer à 1 pour sauter l'en-tête
                    const row = jsonData[i];
                    for (let j = 1; j < row.length; j++) { // Commencer à 1 pour sauter l'en-tête de ligne
                        if (i - 1 < rows && j - 1 < cols) {
                            const cell = document.querySelector(`.cell[data-row="${i-1}"][data-col="${j-1}"]`);
                            if (cell) {
                                const value = row[j];
                                if (value && typeof value === 'string' && value.startsWith('=')) {
                                    cell.dataset.formula = value;
                                    try {
                                        cell.textContent = evaluateFormula(value.substring(1), cell.dataset.coords);
                                    } catch (e) {
                                        cell.textContent = '#ERREUR';
                                    }
                                } else {
                                    cell.textContent = value || '';
                                    delete cell.dataset.formula;
                                }
                            }
                        }
                    }
                }

                e.target.value = ''; // Réinitialiser l'input file

            } catch (e) {
                console.error('Erreur lors de l\'import Excel:', e);
                alert('Erreur lors de l\'import du fichier Excel.');
            }
        };
        reader.readAsArrayBuffer(file);
    }


    /**
     * Exporte un élément DOM (généralement le conteneur du tableur ou un rapport) en PDF.
     * @param {string} [targetSelector='.spreadsheet-container'] - Le sélecteur CSS de l'élément à exporter.
     */
    function exportToPDF(targetSelector = '.spreadsheet-container') {
        const { jsPDF } = window.jspdf;
        const targetElement = document.querySelector(targetSelector);
        if (!targetElement) {
            console.error("PDF export target not found:", targetSelector);
            return;
        }

        // Temporarily remove selection before capture
        if (currentCell) {
            currentCell.classList.remove('selected');
        }

        console.log('Génération du PDF...');
        alert('La génération du PDF a commencé. Cela peut prendre quelques instants...');

        html2canvas(targetElement, {
            scale: 2, // Augmenter la résolution pour une meilleure qualité
            useCORS: true, // Pour les images externes si nécessaire
            logging: true
        }).then(canvas => {
            // Rétablir la sélection
            if (currentCell) {
                currentCell.classList.add('selected');
            }

            const imgData = canvas.toDataURL('image/png');

            // Dimensions du PDF (A4 en mode paysage)
            const pdf = new jsPDF({
                orientation: 'landscape',
                unit: 'pt',
                format: 'a4'
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            // Conserver le ratio de l'image
            const imgProps = pdf.getImageProperties(imgData);
            const imgWidth = pdfWidth;
            const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

            let heightLeft = imgHeight;
            let position = 0;

            // Ajouter l'image
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pdfHeight;

            // Gérer plusieurs pages si l'image est trop haute
            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pdfHeight;
            }

            pdf.save('tableur-export.pdf');
            console.log('PDF généré avec succès.');

        }).catch(err => {
            // Rétablir la sélection en cas d'erreur
            if (currentCell) {
                currentCell.classList.add('selected');
            }
            console.error('Erreur lors de la génération du PDF:', err);
            alert('Une erreur est survenue lors de la génération du PDF.');
        });
    }

    // Fonctions standard pour référence
    const standardFunctions = [
        'SOMME', 'MOYENNE', 'PUISSANCE', 'RACINE', 'MAX', 'MIN', 'ARRONDI', 'ABS',
        'EXP', 'LN', 'LOG', 'SIN', 'COS', 'TAN', 'PI', 'ALEA', 'NOW', 'AUJOURDHUI',
        'CONCATENER', 'GAUCHE', 'DROITE', 'LONGUEUR'
    ];
});
