from flask import Flask, render_template, request, jsonify, redirect, url_for
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
import os
import logging
from datetime import datetime
import json

# --- App Setup ---
app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Database Setup ---
DATABASE_URL = "sqlite:///./spreadsheet.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Session = scoped_session(session_factory)

# Import all CRUD functions from the database module
from database import (
    Base,
    save_spreadsheet, load_spreadsheet, list_spreadsheets,
    save_custom_function, list_custom_functions, delete_custom_function,
    save_report_template, list_report_templates, load_report_template, delete_report_template
)

# Create tables
Base.metadata.create_all(bind=engine)

@app.teardown_appcontext
def shutdown_session(exception=None):
    """Closes the database session at the end of the request."""
    Session.remove()

# --- Code Executor ---
from code_executor import CodeExecutor, Language
executor = CodeExecutor()

# --- HTML Routes ---

@app.route('/')
def home():
    """Renders the homepage which lists all spreadsheets."""
    db_session = Session()
    spreadsheets = list_spreadsheets(db_session)
    return render_template('home.html', spreadsheets=spreadsheets)

@app.route('/spreadsheet/<string:name>')
def spreadsheet_view(name: str):
    """
    Renders the main spreadsheet editor view for a given spreadsheet.

    Args:
        name (str): The name of the spreadsheet to render.
    """
    return render_template('spreadsheet.html', spreadsheet_name=name)

@app.route('/spreadsheet', methods=['POST'])
def create_spreadsheet_post():
    """
    Handles the creation of a new spreadsheet from the homepage form.
    Expects 'spreadsheet_name' in the form data.
    """
    db_session = Session()
    name = request.form.get('spreadsheet_name')
    if not name:
        return "Spreadsheet name is required", 400

    # Check if spreadsheet already exists
    if load_spreadsheet(db_session, name):
        return "Spreadsheet with this name already exists", 409

    save_spreadsheet(db_session, name=name, data={"cells": {}, "elements": [], "charts": []})
    return redirect(url_for('spreadsheet_view', name=name))

# --- API Routes ---

@app.route("/execute", methods=['POST'])
def execute_code_route():
    """
    API endpoint to execute a block of code in a specified language.
    Expects a JSON payload with 'language', 'code', and 'args'.
    """
    req_data = request.get_json()
    try:
        import asyncio
        result = asyncio.run(executor.execute(
            language=Language(req_data['language']),
            code=req_data['code'],
            args=req_data['args']
        ))
        return jsonify({"result": result, "error": None})
    except Exception as e:
        logger.error(f"Failed to execute code: {e}", exc_info=True)
        return jsonify({"result": None, "error": f"{type(e).__name__}: {e}"})

@app.route('/api/spreadsheets', methods=['GET'])
def get_spreadsheets_api():
    """API endpoint to list all available spreadsheets."""
    db_session = Session()
    spreadsheets = list_spreadsheets(db_session)
    return jsonify([{"name": s.name, "updated_at": s.updated_at.isoformat()} for s in spreadsheets])

@app.route('/api/spreadsheets/<string:name>', methods=['POST'])
def save_spreadsheet_api(name: str):
    """
    API endpoint to save the data for a specific spreadsheet.

    Args:
        name (str): The name of the spreadsheet to save.
    """
    db_session = Session()
    data = request.get_json()
    save_spreadsheet(db_session, name=name, data=data)
    return jsonify({"status": "success", "name": name})

@app.route('/api/spreadsheets/<string:name>', methods=['GET'])
def load_spreadsheet_api(name: str):
    """
    API endpoint to load the data for a specific spreadsheet.

    Args:
        name (str): The name of the spreadsheet to load.
    """
    db_session = Session()
    spreadsheet = load_spreadsheet(db_session, name)
    if not spreadsheet:
        return jsonify({"error": "Spreadsheet not found"}), 404
    return jsonify(spreadsheet.data)

@app.route('/api/functions/list', methods=['GET'])
def list_functions_api():
    """API endpoint to list all saved custom functions."""
    db_session = Session()
    functions = list_custom_functions(db_session)
    return jsonify([{"name": f.name, "description": f.description, "language": f.language, "code": f.code} for f in functions])

@app.route('/api/functions/save', methods=['POST'])
def save_function_api():
    """API endpoint to save a new custom function."""
    db_session = Session()
    data = request.get_json()
    save_custom_function(db_session, name=data['name'], description=data.get('description'), language=data['language'], code=data['code'])
    return jsonify({"status": "success", "name": data['name']})

@app.route('/api/functions/delete/<string:name>', methods=['DELETE'])
def delete_function_api(name: str):
    """
    API endpoint to delete a custom function.

    Args:
        name (str): The name of the function to delete.
    """
    db_session = Session()
    success = delete_custom_function(db_session, name)
    if not success:
        return jsonify({"error": "Function not found"}), 404
    return jsonify({"status": "success"})

@app.route('/api/reports/list', methods=['GET'])
def list_reports_api():
    """API endpoint to list all saved report templates."""
    db_session = Session()
    templates = list_report_templates(db_session)
    return jsonify([{"id": t.id, "name": t.name, "description": t.description, "layout": t.layout} for t in templates])

@app.route('/api/reports/save', methods=['POST'])
def save_report_api():
    """API endpoint to save a new report template."""
    db_session = Session()
    data = request.get_json()
    save_report_template(db_session, name=data['name'], description=data.get('description'), layout=data['layout'])
    return jsonify({"status": "success", "name": data['name']})

@app.route('/api/reports/load/<int:template_id>', methods=['GET'])
def load_report_api(template_id: int):
    """
    API endpoint to load a specific report template.

    Args:
        template_id (int): The ID of the report template to load.
    """
    db_session = Session()
    template = load_report_template(db_session, template_id)
    if not template:
        return jsonify({"error": "Report template not found"}), 404
    return jsonify({"id": template.id, "name": template.name, "description": template.description, "layout": template.layout})

@app.route('/api/reports/delete/<int:template_id>', methods=['DELETE'])
def delete_report_api(template_id: int):
    """
    API endpoint to delete a report template.

    Args:
        template_id (int): The ID of the report template to delete.
    """
    db_session = Session()
    success = delete_report_template(db_session, template_id)
    if not success:
        return jsonify({"error": "Report template not found"}), 404
    return jsonify({"status": "success"})

if __name__ == '__main__':
    app.run(debug=True, port=8000)
