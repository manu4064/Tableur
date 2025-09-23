# Tableur Pro

Tableur Pro est une application de feuille de calcul web puissante et flexible qui permet aux utilisateurs d'effectuer des calculs complexes en utilisant plusieurs langages de programmation (Python, JavaScript, Lua et C) directement dans les cellules. Conçue pour être à la fois robuste et sécurisée, elle utilise des conteneurs Docker pour exécuter le code de manière isolée.

## Fonctionnalités

*   **Moteur de Calcul Polyglotte :** Exécutez des formules et des scripts en Python, JavaScript, Lua et C.
*   **Gestion de Feuilles de Calcul :** Créez, sauvegardez et chargez plusieurs feuilles de calcul nommées.
*   **Fonctions Personnalisées :** Définissez vos propres fonctions réutilisables dans différents langages.
*   **Visualisation de Données :** Créez divers types de graphiques (barres, lignes, secteurs, etc.) pour visualiser vos données.
*   **Rapports et Exportation :** Concevez des modèles de rapport personnalisés et exportez vos feuilles de calcul ou rapports au format PDF.
*   **Importation de Données :** Importez des données depuis des URL externes pour les intégrer dans vos feuilles de calcul.
*   **Interface Intuitive :** Une interface utilisateur claire et simple pour une gestion facile des données.

## Structure du Projet

Le projet est organisé selon une structure d'application Flask standard :

```
.
├── app/
│   ├── static/
│   │   ├── css/
│   │   └── js/
│   ├── templates/
│   ├── execution_environments/
│   │   ├── c/
│   │   ├── javascript/
│   │   ├── lua/
│   │   └── python/
│   ├── code_executor.py
│   ├── database.py
│   └── main.py
├── .gitignore
└── README.md
```

*   `app/`: Contient le cœur de l'application Flask.
*   `app/static/`: Fichiers statiques (CSS, JavaScript, images).
*   `app/templates/`: Modèles HTML (Jinja2).
*   `app/execution_environments/`: Contient les Dockerfiles pour chaque langage de programmation.
*   `app/main.py`: Fichier principal de l'application Flask, gère les routes et la logique principale.
*   `app/database.py`: Définit le schéma de la base de données et les fonctions CRUD.
*   `app/code_executor.py`: Gère l'exécution sécurisée du code dans les conteneurs Docker.

## Prérequis

Avant de commencer, assurez-vous d'avoir les outils suivants installés sur votre système :

*   Python 3.12 ou supérieur
*   pip (généralement inclus avec Python)
*   Docker

## Installation et Lancement

1.  **Clonez le dépôt :**
    ```bash
    git clone <url-du-repo>
    cd <nom-du-repo>
    ```

2.  **Installez les dépendances Python :**
    ```bash
    pip install -r app/requirements.txt
    ```

3.  **Lancement de l'application :**

    L'application nécessite des droits d'accès à Docker. La méthode la plus simple dans un environnement de développement est de la lancer avec `sudo`.

    ```bash
    sudo $(which python) app/main.py
    ```
    *Note : `$(which python)` trouve automatiquement le chemin complet de votre exécutable Python. Si cela ne fonctionne pas, remplacez-le par le chemin que vous obtenez en exécutant `which python`.*

    Lors du premier lancement, l'application construira automatiquement les images Docker nécessaires pour chaque langage. Ce processus peut prendre plusieurs minutes. Les lancements suivants seront beaucoup plus rapides.

4.  **Accédez à l'application :**
    Ouvrez votre navigateur et allez à `http://localhost:8000`.

## Utilisation

*   **Créer une feuille de calcul :** Sur la page d'accueil, entrez un nom pour votre nouvelle feuille de calcul et cliquez sur "Créer".
*   **Utiliser des formules :** Dans une cellule, commencez par `=` pour entrer une formule. Par exemple : `=SOMME(A1:A10)`.
*   **Utiliser du code :** Pour utiliser les langages de programmation, créez une fonction personnalisée via le panneau "Fonctions Personnalisées". Vous pourrez ensuite appeler cette fonction dans n'importe quelle cellule.

## API Endpoints

L'application expose une API RESTful pour gérer les ressources :

*   `POST /execute`: Exécute un bloc de code.
*   `GET /api/spreadsheets`: Liste toutes les feuilles de calcul.
*   `POST /api/spreadsheets/<name>`: Sauvegarde une feuille de calcul.
*   `GET /api/spreadsheets/<name>`: Charge une feuille de calcul.
*   `GET /api/functions/list`: Liste toutes les fonctions personnalisées.
*   `POST /api/functions/save`: Sauvegarde une fonction personnalisée.
*   `DELETE /api/functions/delete/<name>`: Supprime une fonction personnalisée.
*   `GET /api/reports/list`: Liste tous les modèles de rapport.
*   `POST /api/reports/save`: Sauvegarde un modèle de rapport.
*   `GET /api/reports/load/<id>`: Charge un modèle de rapport.
*   `DELETE /api/reports/delete/<id>`: Supprime un modèle de rapport.
