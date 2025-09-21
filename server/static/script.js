// Global state variables
let currentCell = null;
let isEditing = false;
let customFunctions = {};
let elements = [];
let charts = [];
let currentEditingElement = null;
let currentEditingFunction = null;
let functionEditor = null;
let chartPreview = null;
let history = [];
let currentHistoryIndex = -1;

// Initialize the spreadsheet application
document.addEventListener('DOMContentLoaded', async function() {
    initializeEditor();
    setupEventListeners();
    loadCustomFunctions();
    initExampleData();
});

// API Functions
async function callApi(endpoint, method = 'GET', data = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(`/api${endpoint}`, options);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Spreadsheet operations
async function saveSpreadsheet() {
    const cells = {};
    document.querySelectorAll('.cell:not(.cell-header):not(.row-header)').forEach(cell => {
        const coords = cell.dataset.coords;
        cells[coords] = {
            value: cell.textContent,
            formula: cell.dataset.formula || null,
            style: getCellStyle(cell)
        };
    });

    try {
        await callApi('/spreadsheet/save', 'POST', { cells });
        showNotification('Spreadsheet saved successfully!', 'success');
    } catch (error) {
        showNotification('Error saving spreadsheet', 'error');
    }
}

async function loadSpreadsheet() {
    try {
        const data = await callApi('/spreadsheet/load');
        Object.entries(data.cells).forEach(([coords, cellData]) => {
            const cell = document.querySelector(`.cell[data-coords="${coords}"]`);
            if (cell) {
                cell.textContent = cellData.value;
                if (cellData.formula) {
                    cell.dataset.formula = cellData.formula;
                }
                applyCellStyle(cell, cellData.style);
            }
        });
        showNotification('Spreadsheet loaded successfully!', 'success');
    } catch (error) {
        showNotification('Error loading spreadsheet', 'error');
    }
}

// Execute code in various languages
async function executeCode(code, args, language) {
    try {
        const response = await callApi('/execute', 'POST', {
            code,
            args,
            language,
            timeout: 5
        });

        if (response.error) {
            throw new Error(response.error);
        }

        return response.result;
    } catch (error) {
        console.error(`Error executing ${language} code:`, error);
        throw error;
    }
}

// Custom functions management
async function saveCustomFunction() {
    if (!functionEditor || !currentEditingFunction) return;

    const name = document.getElementById('function-name').value;
    const code = functionEditor.getValue();
    const language = document.getElementById('function-language').value;

    try {
        await callApi('/functions/save', 'POST', {
            name,
            code,
            language
        });

        customFunctions[name] = {
            code,
            language
        };

        showNotification('Function saved successfully!', 'success');
        updateCustomFunctionsInList();
    } catch (error) {
        showNotification('Error saving function', 'error');
    }
}

async function loadCustomFunctions() {
    try {
        const functions = await callApi('/functions/list');
        customFunctions = functions;
        updateCustomFunctionsInList();
    } catch (error) {
        console.error('Error loading custom functions:', error);
    }
}

// User preferences
async function saveUserPreferences(preferences) {
    try {
        await callApi('/preferences/save', 'POST', preferences);
    } catch (error) {
        console.error('Error saving preferences:', error);
    }
}

async function loadUserPreferences() {
    try {
        const preferences = await callApi('/preferences/load');
        applyUserPreferences(preferences);
    } catch (error) {
        console.error('Error loading preferences:', error);
    }
}

// Utility functions
function showNotification(message, type = 'info') {
    // Implementation of notification system
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function applyUserPreferences(preferences) {
    if (preferences.theme) {
        document.documentElement.setAttribute('data-theme', preferences.theme);
    }
    if (preferences.editorTheme && functionEditor) {
        functionEditor.setTheme(`ace/theme/${preferences.editorTheme}`);
    }
}

// Initialize the code editor
function initializeEditor() {
    functionEditor = ace.edit("function-editor");
    functionEditor.setTheme("ace/theme/dawn");
    functionEditor.session.setMode("ace/mode/javascript");
    functionEditor.setOptions({
        enableBasicAutocompletion: true,
        enableLiveAutocompletion: true,
        enableSnippets: true
    });
}

// Export data to Excel
async function exportToExcel() {
    const workbook = XLSX.utils.book_new();
    const wsData = [];
    
    // Convert cells to array format
    document.querySelectorAll('tr').forEach(row => {
        const rowData = [];
        row.querySelectorAll('.cell:not(.row-header)').forEach(cell => {
            rowData.push(cell.textContent);
        });
        if (rowData.length > 0) {
            wsData.push(rowData);
        }
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(workbook, ws, "Sheet1");
    XLSX.writeFile(workbook, "spreadsheet.xlsx");
}

// Import data from Excel
async function importFromExcel(e) {
    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, {header: 1});

        // Clear current spreadsheet
        document.querySelectorAll('.cell:not(.cell-header):not(.row-header)').forEach(cell => {
            cell.textContent = '';
            cell.dataset.formula = '';
        });

        // Fill cells with imported data
        jsonData.forEach((row, i) => {
            row.forEach((value, j) => {
                const cell = document.querySelector(`.cell[data-row="${i+1}"][data-col="${j+1}"]`);
                if (cell) {
                    cell.textContent = value;
                }
            });
        });
    };

    reader.readAsArrayBuffer(file);
}

// Event listener setup
function setupEventListeners() {
    // Implementation of all event listeners
    // (This is already in your HTML, just moved to a separate function)
}

// Initialize example data
function initExampleData() {
    // Implementation of example data initialization
    // (This is already in your HTML, just moved to a separate function)
}

// Export functions for use in HTML
window.saveSpreadsheet = saveSpreadsheet;
window.loadSpreadsheet = loadSpreadsheet;
window.exportToExcel = exportToExcel;
window.importFromExcel = importFromExcel;
window.saveCustomFunction = saveCustomFunction;