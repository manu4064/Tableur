async function evaluateFormula(formula, currentCoords) {
    // Remove the equals sign at the beginning
    formula = formula.substring(1);

    try {
        // Replace cell references with their values
        formula = await replaceCellReferences(formula);

        // Execute the formula using the server
        const result = await executeCode(formula, [], 'python');
        return result;
    } catch (error) {
        console.error('Formula evaluation error:', error);
        return '#ERROR!';
    }
}

async function replaceCellReferences(formula) {
    const cellRefRegex = /([A-Z]+[0-9]+)/g;
    let matches;
    let modifiedFormula = formula;
    const promises = [];

    // First, find all cell references
    while ((matches = cellRefRegex.exec(formula)) !== null) {
        const cellRef = matches[1];
        const cell = document.querySelector(`.cell[data-coords="${cellRef}"]`);
        if (cell) {
            if (cell.dataset.formula) {
                // If the referenced cell has a formula, evaluate it first
                promises.push(evaluateCellFormula(cell).then(value => ({
                    ref: cellRef,
                    value: value
                })));
            } else {
                // If it's a direct value, just get it
                promises.push(Promise.resolve({
                    ref: cellRef,
                    value: parseFloat(cell.textContent) || cell.textContent
                }));
            }
        }
    }

    // Wait for all cell references to be evaluated
    const values = await Promise.all(promises);

    // Replace all references with their values
    values.forEach(({ref, value}) => {
        const isNumber = !isNaN(parseFloat(value)) && isFinite(value);
        const replacement = isNumber ? value : `"${value}"`;
        modifiedFormula = modifiedFormula.replace(new RegExp(ref, 'g'), replacement);
    });

    return modifiedFormula;
}

async function evaluateCellFormula(cell) {
    if (!cell.dataset.formula) {
        return cell.textContent;
    }

    try {
        const result = await evaluateFormula(cell.dataset.formula, cell.dataset.coords);
        return result;
    } catch (error) {
        console.error('Cell formula evaluation error:', error);
        return '#ERROR!';
    }
}

// Execute code in various languages
async function executeCode(code, args = [], language = 'python') {
    try {
        const response = await fetch('/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                code,
                args,
                language,
                timeout: 5
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }

        return data.result;
    } catch (error) {
        console.error(`Error executing ${language} code:`, error);
        throw error;
    }
}

// Save cell content and evaluate formula if needed
async function saveCellContent(cell, value) {
    if (!cell || value === undefined) return;

    const oldValue = cell.dataset.formula || cell.textContent;
    const oldStyle = getCellStyle(cell);

    if (value !== oldValue) {
        // Add to history
        saveToHistory({
            type: 'cellEdit',
            cell: cell.dataset.coords,
            oldValue,
            newValue: value,
            oldStyle,
            newStyle: getCellStyle(cell)
        });

        // Check if it's a formula
        if (value && value.startsWith('=')) {
            cell.dataset.formula = value;
            try {
                const result = await evaluateFormula(value, cell.dataset.coords);
                cell.textContent = result;
            } catch (error) {
                cell.textContent = '#ERROR!';
                console.error('Formula evaluation error:', error);
            }
        } else {
            delete cell.dataset.formula;
            cell.textContent = value;
        }

        // Save to database
        await saveSpreadsheet();
    }

    if (cell.classList.contains('editing')) {
        cell.classList.remove('editing');
        cell.contentEditable = false;
        isEditing = false;
    }
}

// Update all formulas in the spreadsheet
async function updateFormulas() {
    const formulaCells = document.querySelectorAll('.cell[data-formula]');
    for (const cell of formulaCells) {
        try {
            const result = await evaluateFormula(cell.dataset.formula, cell.dataset.coords);
            cell.textContent = result;
        } catch (error) {
            cell.textContent = '#ERROR!';
            console.error('Formula update error:', error);
        }
    }
}

// Handle formula input
async function handleFormulaInput(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const value = document.getElementById('formula-input').value;
        if (currentCell) {
            await saveCellContent(currentCell, value);
            await updateFormulas(); // Update dependent formulas
        }
        currentCell.blur();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        if (currentCell) {
            currentCell.textContent = currentCell.dataset.formula || '';
        }
        currentCell.blur();
    } else if (e.key === 'Tab') {
        e.preventDefault();
        moveToNextCell(e.shiftKey ? -1 : 1);
    }
}

// Custom functions management
async function executeCustomFunction(funcName, args) {
    if (!customFunctions[funcName]) {
        throw new Error(`Function ${funcName} not found`);
    }

    const func = customFunctions[funcName];
    return await executeCode(func.code, args, func.language);
}

// Initialize spreadsheet
document.addEventListener('DOMContentLoaded', async function() {
    // Load saved data
    await loadSpreadsheet();
    await loadCustomFunctions();
    await loadUserPreferences();

    // Set up event listeners
    setupEventListeners();

    // Initialize editor
    initializeEditor();

    // Load example data
    initExampleData();
});

// Export necessary functions
window.evaluateFormula = evaluateFormula;
window.saveCellContent = saveCellContent;
window.executeCode = executeCode;
window.handleFormulaInput = handleFormulaInput;
window.updateFormulas = updateFormulas;