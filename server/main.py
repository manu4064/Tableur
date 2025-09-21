from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Any, Dict, Optional
from sqlalchemy.orm import Session
import logging
import sys
import traceback
from datetime import datetime

# Import simplified database functions and models
from database import (
    get_db,
    save_spreadsheet,
    load_spreadsheet,
    save_custom_function,
    list_custom_functions,
    delete_custom_function,
    create_db_and_tables,
)
from code_executor import CodeExecutor, Language
from pydantic import BaseModel as PydanticBaseModel

class CodeExecutionResponse(PydanticBaseModel):
    result: Any
    error: Optional[str] = None
    execution_time: float = 0.0
    memory_usage: Optional[str] = None

# --- Logging Setup ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('server.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# --- FastAPI App Initialization ---
app = FastAPI(title="Tableur Pro Backend")

# Add CORS middleware to allow all origins (for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models for API Requests/Responses ---

class CodeExecutionRequest(BaseModel):
    code: str
    args: List[Any]
    language: Language

class SpreadsheetSaveRequest(BaseModel):
    name: str = "default"  # Allow naming spreadsheets, default to one
    data: Dict[str, Any]

class CustomFunctionSchema(BaseModel):
    name: str
    description: Optional[str] = None
    language: str
    code: str

# --- Global Instances ---
executor = CodeExecutor()

# --- FastAPI Events ---

@app.on_event("startup")
def on_startup():
    """Create database tables on application startup."""
    logger.info("Application starting up...")
    create_db_and_tables()
    logger.info("Database tables created or already exist.")

# --- API Endpoints ---

@app.get("/")
def read_root():
    return {"message": "Tableur Pro Backend is running."}

@app.post("/execute", response_model=CodeExecutionResponse)
async def execute_code(request: CodeExecutionRequest):
    """
    Executes code in a specified language using the sandboxed executor.
    """
    start_time = datetime.now()
    logger.info(f"Executing code in {request.language.value}...")
    try:
        result = await executor.execute(
            language=request.language,
            code=request.code,
            args=request.args
        )
        execution_time = (datetime.now() - start_time).total_seconds()
        logger.info(f"Execution successful in {request.language.value}. Result: {result}")
        return CodeExecutionResponse(
            result=result,
            execution_time=round(execution_time, 4)
        )
    except Exception as e:
        error_message = f"Failed to execute code: {e}"
        logger.error(f"{error_message}\n{traceback.format_exc()}")
        # Return a 200 OK with the error in the response body,
        # as this is an execution error, not a server error.
        return CodeExecutionResponse(result=None, error=str(e))


@app.post("/api/spreadsheet/save")
async def save_spreadsheet_endpoint(request: SpreadsheetSaveRequest, db: Session = Depends(get_db)):
    """
    Saves the entire state of a spreadsheet as a JSON object.
    """
    try:
        logger.info(f"Saving spreadsheet '{request.name}'...")
        save_spreadsheet(db, name=request.name, data=request.data)
        logger.info(f"Spreadsheet '{request.name}' saved successfully.")
        return {"status": "success", "name": request.name}
    except Exception as e:
        logger.error(f"Failed to save spreadsheet '{request.name}': {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Failed to save spreadsheet data.")

@app.get("/api/spreadsheet/load/{name}")
async def load_spreadsheet_endpoint(name: str, db: Session = Depends(get_db)):
    """
    Loads the state of a spreadsheet from the database.
    """
    logger.info(f"Loading spreadsheet '{name}'...")
    spreadsheet = load_spreadsheet(db, name)
    if not spreadsheet:
        logger.warning(f"Spreadsheet '{name}' not found.")
        raise HTTPException(status_code=404, detail="Spreadsheet not found")

    logger.info(f"Spreadsheet '{name}' loaded successfully.")
    return JSONResponse(content=spreadsheet.data)

@app.post("/api/functions/save")
async def save_function_endpoint(func_data: CustomFunctionSchema, db: Session = Depends(get_db)):
    """
    Saves or updates a global custom function.
    """
    try:
        logger.info(f"Saving function '{func_data.name}'...")
        save_custom_function(
            db,
            name=func_data.name,
            description=func_data.description,
            language=func_data.language,
            code=func_data.code
        )
        logger.info(f"Function '{func_data.name}' saved successfully.")
        return {"status": "success", "name": func_data.name}
    except Exception as e:
        logger.error(f"Failed to save function '{func_data.name}': {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Failed to save function.")

@app.get("/api/functions/list", response_model=List[CustomFunctionSchema])
async def list_functions_endpoint(db: Session = Depends(get_db)):
    """
    Lists all available global custom functions.
    """
    logger.info("Fetching list of custom functions...")
    functions = list_custom_functions(db)
    # Manually construct the response to fit the Pydantic model
    return [
        CustomFunctionSchema(
            name=f.name,
            description=f.description,
            language=f.language,
            code=f.code
        ) for f in functions
    ]

@app.delete("/api/functions/delete/{name}")
async def delete_function_endpoint(name: str, db: Session = Depends(get_db)):
    """
    Deletes a global custom function by name.
    """
    logger.info(f"Deleting function '{name}'...")
    success = delete_custom_function(db, name)
    if not success:
        logger.warning(f"Attempted to delete non-existent function '{name}'.")
        raise HTTPException(status_code=404, detail="Function not found")

    logger.info(f"Function '{name}' deleted successfully.")
    return {"status": "success", "name": name}

if __name__ == "__main__":
    import uvicorn
    # To run: uvicorn server.main:app --reload
    uvicorn.run(app, host="0.0.0.0", port=8000)
