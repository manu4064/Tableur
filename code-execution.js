// Configuration du serveur de code
const CODE_SERVER_URL = 'http://localhost:8000';

// Gestion des packages Python via le serveur
async function installPythonPackage(packageName) {
    try {
        const response = await fetch(`${CODE_SERVER_URL}/install-package`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ package: packageName })
        });
        
        if (!response.ok) {
            throw new Error('Erreur lors de l\'installation du package');
        }

        const result = await response.json();
        return result.success;
    } catch (error) {
        console.error('Erreur lors de l\'installation du package:', error);
        throw error;
    }
}

async function listInstalledPythonPackages() {
    try {
        const response = await fetch(`${CODE_SERVER_URL}/list-packages`);
        if (!response.ok) {
            throw new Error('Erreur lors de la récupération des packages');
        }
        const result = await response.json();
        return result.packages;
    } catch (error) {
        console.error('Erreur lors de la récupération des packages:', error);
        throw error;
    }
}

// Initialisation des runtimes
async function initLanguageRuntimes() {
    console.log('Initialisation des runtimes...');
    try {
        const response = await fetch(`${CODE_SERVER_URL}/health`);
        if (!response.ok) {
            throw new Error('Le serveur n\'est pas disponible');
        }
        console.log('Serveur connecté avec succès');
        return true;
    } catch (error) {
        console.error('Erreur lors de l\'initialisation:', error);
        throw error;
    }
}

// Exécution de code
async function executeCode(code, args = [], language = 'python') {
    try {
        const response = await fetch(`${CODE_SERVER_URL}/execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code: code,
                args: args,
                language: language
            })
        });

        if (!response.ok) {
            throw new Error('Erreur lors de l\'exécution du code');
        }

        const result = await response.json();
        return result.result;
    } catch (error) {
        console.error('Erreur lors de l\'exécution du code:', error);
        throw error;
    }
}

// Fonctions spécifiques pour chaque langage
async function executePythonCode(code, args = []) {
    return executeCode(code, args, 'python');
}

async function executeJavaScriptCode(code, args = []) {
    return executeCode(code, args, 'javascript');
}

async function executeLuaCode(code, args = []) {
    return executeCode(code, args, 'lua');
}

async function executePhpCode(code, args = []) {
    return executeCode(code, args, 'php');
}

async function executeCCode(code, args = []) {
    return executeCode(code, args, 'c');
}

// Gestion des formules et évaluation
async function evaluateFormula(formula, currentCoords) {
    try {
        // Remplacer les références de cellules par leurs valeurs
        const cellRefRegex = /([A-Z]+[0-9]+)/g;
        let matches;
        let modifiedFormula = formula;
        let replacements = [];

        while ((matches = cellRefRegex.exec(formula)) !== null) {
            const cellRef = matches[1];
            if (cellRef !== currentCoords) {
                const cell = document.querySelector(`.cell[data-coords="${cellRef}"]`);
                if (cell) {
                    const value = cell.dataset.formula ? 
                        await evaluateFormula(cell.dataset.formula.substring(1), cellRef) : 
                        cell.textContent;
                    replacements.push({ ref: cellRef, value: value });
                }
            }
        }

        // Appliquer les remplacements
        for (const { ref, value } of replacements) {
            modifiedFormula = modifiedFormula.replace(new RegExp(ref, 'g'), value);
        }

        // Remplacer les points-virgules par des virgules
        modifiedFormula = modifiedFormula.replace(/;/g, ',');

        // Détecter et exécuter les fonctions personnalisées
        const customFunctionRegex = /([A-Z_]+)\((.*?)\)/;
        const match = modifiedFormula.match(customFunctionRegex);
        
        if (match) {
            const functionName = match[1];
            const args = match[2].split(',').map(arg => arg.trim());
            
            // Vérifier si c'est une fonction standard ou personnalisée
            if (typeof window[functionName.toLowerCase()] === 'function') {
                return window[functionName.toLowerCase()](...args);
            } else if (customFunctions[functionName]) {
                const code = customFunctions[functionName].code;
                const language = customFunctions[functionName].language;
                return await executeCode(code, args, language);
            }
        }

        // Évaluer l'expression finale
        return eval(modifiedFormula);
    } catch (error) {
        console.error('Erreur lors de l\'évaluation de la formule:', error);
        return '#ERREUR!';
    }
}

// Fonctions standard du tableur
const standardFunctions = {
    sum: (...args) => args.reduce((a, b) => a + parseFloat(b || 0), 0),
    avg: (...args) => standardFunctions.sum(...args) / args.length,
    max: (...args) => Math.max(...args.map(a => parseFloat(a || 0))),
    min: (...args) => Math.min(...args.map(a => parseFloat(a || 0))),
    pow: (base, exp) => Math.pow(parseFloat(base || 0), parseFloat(exp || 0)),
    sqrt: (num) => Math.sqrt(parseFloat(num || 0)),
    round: (num, decimals = 0) => Number(Math.round(parseFloat(num + 'e' + decimals)) + 'e-' + decimals),
    abs: (num) => Math.abs(parseFloat(num || 0)),
    len: (str) => (str || '').toString().length,
    concat: (...args) => args.join(''),
    left: (str, n) => (str || '').toString().substring(0, parseInt(n || 0)),
    right: (str, n) => {
        str = (str || '').toString();
        n = parseInt(n || 0);
        return str.substring(str.length - n);
    }
};

// Ajouter les fonctions standard à window
Object.entries(standardFunctions).forEach(([name, func]) => {
    window[name] = func;
});

// Exporter les fonctions nécessaires
window.executeCode = executeCode;
window.evaluateFormula = evaluateFormula;
window.initLanguageRuntimes = initLanguageRuntimes;
window.installPythonPackage = installPythonPackage;
window.listInstalledPythonPackages = listInstalledPythonPackages;
window.executePythonCode = executePythonCode;
window.executeJavaScriptCode = executeJavaScriptCode;
window.executeLuaCode = executeLuaCode;
window.executePhpCode = executePhpCode;
window.executeCCode = executeCCode;