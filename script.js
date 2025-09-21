// Configuration du serveur de code
const CODE_SERVER_URL = 'http://localhost:8000';

// Fonction générique pour exécuter du code dans n'importe quel langage via le serveur
async function executeCode(code, args, language) {
    try {
        const response = await fetch(`${CODE_SERVER_URL}/execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code: code,
                language: language,
                args: args
            })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Erreur lors de l\'exécution du code');
        }
        return result.result;
    } catch (error) {
        console.error('Erreur lors de l\'exécution du code:', error);
        throw error;
    }
}

// Fonctions spécifiques pour chaque langage
async function executePythonCode(code, args) {
    return executeCode(code, args, 'python');
}

async function executeJavaScriptCode(code, args) {
    return executeCode(code, args, 'javascript');
}

async function executeLuaCode(code, args) {
    return executeCode(code, args, 'lua');
}

async function executePhpCode(code, args) {
    return executeCode(code, args, 'php');
}

async function executeCCode(code, args) {
    return executeCode(code, args, 'c');
}

// Fonction pour initialiser les runtimes des langages
async function initLanguageRuntimes() {
    console.log('Initialisation des runtimes...');
    try {
        // Vérifier que le serveur est disponible
        const response = await fetch(`${CODE_SERVER_URL}/status`);
        if (!response.ok) {
            throw new Error('Le serveur n\'est pas disponible');
        }
        console.log('Serveur connecté avec succès');
    } catch (error) {
        console.error('Erreur lors de l\'initialisation:', error);
        throw error;
    }
}

// Exportation des fonctions
window.executeCode = executeCode;
window.executePythonCode = executePythonCode;
window.executeJavaScriptCode = executeJavaScriptCode;
window.executeLuaCode = executeLuaCode;
window.executePhpCode = executePhpCode;
window.executeCCode = executeCCode;
window.initLanguageRuntimes = initLanguageRuntimes;