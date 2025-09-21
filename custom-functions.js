// Gestion des fonctions personnalisées
const customFunctions = {};

async function saveCustomFunction() {
    const functionName = document.getElementById('function-name').value.trim().toUpperCase();
    const functionDesc = document.getElementById('function-description').value.trim();
    const functionExample = document.getElementById('function-example').value.trim();
    const language = document.getElementById('function-language').value;
    const code = functionEditor.getValue();

    // Validation de base
    if (!functionName || !code) {
        showFunctionError('Le nom de la fonction et le code sont requis.');
        return;
    }

    // Validation du nom de la fonction
    if (!/^[A-Z][A-Z0-9_]*$/.test(functionName)) {
        showFunctionError('Le nom de la fonction doit commencer par une lettre et ne contenir que des lettres majuscules, des chiffres et des underscores.');
        return;
    }

    try {
        // Valider la syntaxe via le serveur
        const validateResponse = await fetch(`${CODE_SERVER_URL}/validate-syntax`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code: code,
                language: language
            })
        });

        if (!validateResponse.ok) {
            const error = await validateResponse.json();
            showFunctionError(`Erreur de syntaxe: ${error.message}`);
            return;
        }

        // Enregistrer la fonction sur le serveur
        const saveResponse = await fetch(`${CODE_SERVER_URL}/save-function`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: functionName,
                description: functionDesc,
                example: functionExample,
                code: code,
                language: language
            })
        });

        if (!saveResponse.ok) {
            const error = await saveResponse.json();
            showFunctionError(`Erreur lors de l'enregistrement: ${error.message}`);
            return;
        }

        // Mettre à jour la fonction localement
        customFunctions[functionName] = {
            name: functionName,
            description: functionDesc,
            example: functionExample,
            code: code,
            language: language
        };

        // Créer la fonction wrapper qui appelle le serveur
        window[`${functionName}_custom`] = async function(...args) {
            try {
                const response = await fetch(`${CODE_SERVER_URL}/execute-function`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: functionName,
                        args: args
                    })
                });

                if (!response.ok) {
                    throw new Error('Erreur lors de l\'exécution de la fonction');
                }

                const result = await response.json();
                return result.value;
            } catch (error) {
                console.error(`Erreur dans la fonction ${functionName}:`, error);
                return '#ERREUR!';
            }
        };

        // Masquer le panneau d'édition et mettre à jour la liste
        document.getElementById('function-editor-container').style.display = 'none';
        document.getElementById('function-list-container').style.display = 'block';
        updateCustomFunctionsInList();

        // Réinitialiser l'éditeur
        currentEditingFunction = null;
        document.getElementById('function-error').classList.remove('visible');
        
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de la fonction:', error);
        showFunctionError('Erreur lors de la sauvegarde de la fonction');
    }
}

function showFunctionError(message) {
    const errorElement = document.getElementById('function-error');
    errorElement.textContent = message;
    errorElement.classList.add('visible');
}