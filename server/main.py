from fastapi import FastAPI, HTTPException, Security, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Any, Dict, Optional
from pathlib import Path
import numpy as np
import pandas as pd
import asyncio
import logging
from sqlalchemy.orm import Session
from database import get_db, create_spreadsheet, get_spreadsheet, update_cell, save_custom_function
from database import get_custom_functions, save_user_preferences, get_user_preferences
from contextlib import contextmanager
import sys
import io
import json
import traceback
from datetime import datetime
from code_executor import CodeExecutor, Language

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('python_engine.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Python Execution Engine")

# Mount static files directory
app.mount("/static", StaticFiles(directory="static"), name="static")

# Configure templates
templates = Jinja2Templates(directory="templates")

# Configuration CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En production, spécifiez les domaines autorisés
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CodeExecutionRequest(BaseModel):
    code: str
    args: List[Any]
    language: Language
    timeout: int = 5  # Timeout par défaut de 5 secondes

class SpreadsheetData(BaseModel):
    cells: Dict[str, Dict[str, Any]]

class CustomFunctionData(BaseModel):
    name: str
    code: str
    language: str
    description: Optional[str] = None

class UserPreferencesData(BaseModel):
    theme: Optional[str] = None
    editor_theme: Optional[str] = None
    auto_recalculate: Optional[bool] = None
    default_language: Optional[str] = None

class CodeExecutionResponse(BaseModel):
    result: Any
    error: str = None
    execution_time: float
    memory_usage: str

@contextmanager
def capture_output():
    """Capture la sortie standard et les erreurs"""
    new_out, new_err = io.StringIO(), io.StringIO()
    old_out, old_err = sys.stdout, sys.stderr
    try:
        sys.stdout, sys.stderr = new_out, new_err
        yield sys.stdout, sys.stderr
    finally:
        sys.stdout, sys.stderr = old_out, old_err

executor = CodeExecutor()

# Helper functions for coordinates conversion
def coords_to_row_col(coords: str) -> tuple[int, int]:
    import re
    match = re.match(r'([A-Z]+)(\d+)', coords)
    if not match:
        raise ValueError(f"Invalid coordinates: {coords}")
    
    col = 0
    for char in match.group(1):
        col = col * 26 + (ord(char) - ord('A') + 1)
    
    return int(match.group(2)), col

def row_col_to_coords(row: int, col: int) -> str:
    col_str = ''
    while col > 0:
        col -= 1
        col_str = chr(ord('A') + (col % 26)) + col_str
        col //= 26
    return f"{col_str}{row}"

async def execute_code_safe(code: str, args: List[Any], language: Language) -> Any:
    """Exécute le code dans le langage spécifié de manière sécurisée"""
    try:
        if language == Language.PYTHON:
            return await executor.execute_python(code, args)
        elif language == Language.JAVASCRIPT:
            return await executor.execute_javascript(code, args)
        elif language == Language.LUA:
            return await executor.execute_lua(code, args)
        elif language == Language.PHP:
            return await executor.execute_php(code, args)
        elif language == Language.C:
            return await executor.execute_c(code, args)
        else:
            raise ValueError(f"Langage non supporté: {language}")
    except Exception as e:
        logger.error(f"Erreur d'exécution ({language}): {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/tableur", response_class=HTMLResponse)
async def get_tableur(request: Request):
    # Read the content between body tags from index.html
    index_path = Path("../index.html")
    if index_path.exists():
        content = index_path.read_text(encoding='utf-8')
        # Extract content between <body> and </body>
        body_content = content.split('<body>')[1].split('</body>')[0]
    else:
        body_content = "<div>Error: index.html not found</div>"
    
    return templates.TemplateResponse("tableur.html", {
        "request": request,
        "content": body_content
    })

@app.post("/execute", response_model=CodeExecutionResponse)
async def execute_code(request: CodeExecutionRequest):
    """Point d'entrée pour l'exécution du code dans différents langages"""
    start_time = datetime.now()
    result = None
    error = None
    
    try:
        # Capture la sortie et les erreurs
        with capture_output() as (out, err):
            # Exécute le code avec un timeout
            result = await asyncio.wait_for(
                execute_code_safe(request.code, request.args, request.language),
                timeout=request.timeout
            )
        
        # Récupère les sorties capturées
        stdout = out.getvalue()
        stderr = err.getvalue()
        
        if stderr:
            error = stderr
        
    except asyncio.TimeoutError:
        error = "L'exécution a dépassé le délai imparti"
        logger.error(error)
    except Exception as e:
        error = f"Erreur: {str(e)}\n{traceback.format_exc()}"
        logger.error(error)
    
    execution_time = (datetime.now() - start_time).total_seconds()
    memory_usage = "N/A"  # En production, utilisez psutil pour des mesures précises
    
    return CodeExecutionResponse(
        result=result,
        error=error,
        execution_time=execution_time,
        memory_usage=memory_usage
    )

@app.post("/api/spreadsheet/save")
async def save_spreadsheet_data(data: SpreadsheetData, db: Session = Depends(get_db)):
    spreadsheet = get_spreadsheet(db, 1)  # Using default spreadsheet ID 1
    if not spreadsheet:
        spreadsheet = create_spreadsheet(db)
    
    for coords, cell_data in data.cells.items():
        row, col = coords_to_row_col(coords)
        update_cell(
            db,
            spreadsheet.id,
            row,
            col,
            cell_data["value"],
            cell_data.get("formula"),
            cell_data.get("style")
        )
    
    return {"status": "success"}

@app.get("/api/spreadsheet/load")
async def load_spreadsheet_data(db: Session = Depends(get_db)):
    spreadsheet = get_spreadsheet(db, 1)  # Using default spreadsheet ID 1
    if not spreadsheet:
        spreadsheet = create_spreadsheet(db)
    
    cells = {}
    for cell in spreadsheet.cells:
        coords = row_col_to_coords(cell.row, cell.col)
        cells[coords] = {
            "value": cell.value,
            "formula": cell.formula,
            "style": cell.style
        }
    
    return {"cells": cells}

@app.post("/api/functions/save")
async def save_function(function: CustomFunctionData, db: Session = Depends(get_db)):
    saved_function = save_custom_function(
        db,
        1,  # Default spreadsheet ID
        function.name,
        function.code,
        function.language,
        function.description
    )
    return {"status": "success", "id": saved_function.id}

@app.get("/api/functions/list")
async def list_functions(db: Session = Depends(get_db)):
    functions = get_custom_functions(db, 1)  # Default spreadsheet ID
    return {f.name: {"code": f.code, "language": f.language} for f in functions}

@app.post("/api/preferences/save")
async def save_preferences(preferences: UserPreferencesData, db: Session = Depends(get_db)):
    saved_prefs = save_user_preferences(db, preferences.dict(exclude_unset=True))
    return {"status": "success"}

@app.get("/api/preferences/load")
async def load_preferences(db: Session = Depends(get_db)):
    prefs = get_user_preferences(db)
    return {
        "theme": prefs.theme,
        "editor_theme": prefs.editor_theme,
        "auto_recalculate": bool(prefs.auto_recalculate),
        "default_language": prefs.default_language
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)