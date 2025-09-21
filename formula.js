// Configuration du serveur de code
const CODE_SERVER_URL = 'http://localhost:8000';

// Fonction pour évaluer les formules
async function evaluateFormula(formula, currentCoords) {
    try {
        // Remplacer les références de cellules par leurs valeurs
        const cellRefRegex = /([A-Z]+[0-9]+)/g;
        let matches;
        let modifiedFormula = formula;

        while ((matches = cellRefRegex.exec(formula)) !== null) {
            const cellRef = matches[1];
            if (cellRef !== currentCoords) {
                const cell = document.querySelector(`.cell[data-coords="${cellRef}"]`);
                if (cell) {
                    const value = cell.dataset.formula ? 
                        await evaluateFormula(cell.dataset.formula.substring(1), cellRef) : 
                        cell.textContent;
                    modifiedFormula = modifiedFormula.replace(cellRef, value);
                }
            }
        }

        // Remplacer les points-virgules par des virgules pour les arguments de fonction
        modifiedFormula = modifiedFormula.replace(/;/g, ',');

        // Si la formule contient une fonction personnalisée, l'exécuter via le serveur
        const customFunctionRegex = /([A-Z_]+)\((.*?)\)/;
        const match = modifiedFormula.match(customFunctionRegex);
        
        if (match) {
            const functionName = match[1];
            const args = match[2].split(',').map(arg => arg.trim());
            
            // Vérifier si c'est une fonction standard ou personnalisée
            if (typeof window[functionName.toLowerCase()] === 'function') {
                // Fonction standard
                return window[functionName.toLowerCase()](...args);
            } else {
                // Fonction personnalisée - exécuter via le serveur
                try {
                    const response = await fetch(`${CODE_SERVER_URL}/execute`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            function: functionName,
                            args: args,
                            language: 'python' // ou la langue appropriée selon la fonction
                        })
                    });
                    
                    if (!response.ok) {
                        throw new Error('Erreur lors de l\'exécution de la fonction');
                    }
                    
                    const result = await response.json();
                    return result.value;
                } catch (error) {
                    console.error('Erreur lors de l\'exécution de la fonction:', error);
                    return '#ERREUR!';
                }
            }
        }

        // Si pas de fonction personnalisée, évaluer comme une expression JavaScript
        return eval(modifiedFormula);
    } catch (error) {
        console.error('Erreur lors de l\'évaluation de la formule:', error);
        return '#ERREUR!';
    }
}

// Fonctions standard
const standardFunctions = {
    sum: (...args) => args.reduce((a, b) => a + parseFloat(b || 0), 0),
    avg: (...args) => standardFunctions.sum(...args) / args.length,
    max: (...args) => Math.max(...args.map(a => parseFloat(a || 0))),
    min: (...args) => Math.min(...args.map(a => parseFloat(a || 0))),
    round: (num, decimals = 0) => Number(Math.round(parseFloat(num + 'e' + decimals)) + 'e-' + decimals),
    abs: (num) => Math.abs(parseFloat(num || 0)),
    pow: (base, exp) => Math.pow(parseFloat(base || 0), parseFloat(exp || 0)),
    sqrt: (num) => Math.sqrt(parseFloat(num || 0)),
    len: (str) => (str || '').toString().length,
    left: (str, n) => (str || '').toString().substring(0, parseInt(n || 0)),
    right: (str, n) => {
        str = (str || '').toString();
        n = parseInt(n || 0);
        return str.substring(str.length - n);
    },
    mid: (str, start, n) => {
        str = (str || '').toString();
        start = parseInt(start || 0) - 1;
        n = parseInt(n || 0);
        return str.substring(start, start + n);
    }
};

// Ajouter les fonctions standard à window
Object.entries(standardFunctions).forEach(([name, func]) => {
    window[name] = func;
});

// Fonction pour initialiser les runtimes des langages
async function initLanguageRuntimes() {
    console.log('Initialisation des runtimes...');
    try {
        // Vérifier que le serveur est disponible
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

// Fonction pour sauvegarder le contenu d'une cellule
async function saveCellContent(cell, value) {
    if (value === undefined) return;

    const oldValue = cell.dataset.formula || cell.textContent;
    if (value === oldValue) return;

    // Si c'est une formule
    if (value && value.startsWith('=')) {
        cell.dataset.formula = value;
        try {
            const result = await evaluateFormula(value.substring(1), cell.dataset.coords);
            cell.textContent = result;
        } catch (error) {
            console.error('Erreur lors de l\'évaluation de la formule:', error);
            cell.textContent = '#ERREUR!';
        }
    } else {
        delete cell.dataset.formula;
        cell.textContent = value;
    }
}

window.evaluateFormula = evaluateFormula;
window.saveCellContent = saveCellContent;
window.initLanguageRuntimes = initLanguageRuntimes;