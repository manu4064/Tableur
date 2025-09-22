import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
import json

# Add the parent directory to the path to allow imports
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from server.main import app
from server.database import Base, get_db

# --- Test Database Setup ---
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Override the `get_db` dependency to use the test database
def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

# --- Fixtures ---
@pytest.fixture(scope="function")
def db_session():
    """Create a new database session for each test, with a clean database."""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def test_client(db_session):
    """A fixture to get a TestClient that uses the clean db_session."""
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as client:
        yield client

# --- Tests ---

def test_read_root(test_client):
    response = test_client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Tableur Pro Backend is running."}

def test_execute_python_code(test_client):
    """Test executing a simple Python script."""
    response = test_client.post(
        "/execute",
        json={
            "code": "def NOUVELLE_FONCTION(a, b):\n    return a + b",
            "args": [5, 10],
            "language": "python",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["result"] == 15
    assert data["error"] is None

def test_execute_javascript_code(test_client):
    """Test executing a simple JavaScript script."""
    response = test_client.post(
        "/execute",
        json={
            "code": "function NOUVELLE_FONCTION(a, b) { return a * b; }",
            "args": [5, 10],
            "language": "javascript",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["result"] == 50
    assert data["error"] is None

def test_execute_code_with_error(test_client):
    """Test that execution errors are handled gracefully."""
    response = test_client.post(
        "/execute",
        json={
            "code": "def NOUVELLE_FONCTION(a, b):\n    return a +", # Syntax error
            "args": [5, 10],
            "language": "python",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["result"] is None
    assert "SyntaxError" in data["error"]

def test_save_and_load_spreadsheet(test_client):
    """Test saving and loading a spreadsheet."""
    spreadsheet_data = {
        "cells": {
            "A1": {"value": "10", "formula": None, "style": {}},
            "B1": {"value": "20", "formula": None, "style": {}},
            "C1": {"value": "30", "formula": "=SOMME(A1:B1)", "style": {}},
        },
        "elements": [],
        "charts": [],
    }

    # Save the spreadsheet
    save_response = test_client.post(
        "/api/spreadsheet/save",
        json={"name": "test-sheet", "data": spreadsheet_data},
    )
    assert save_response.status_code == 200
    assert save_response.json()["status"] == "success"

    # Load the spreadsheet
    load_response = test_client.get("/api/spreadsheet/load/test-sheet")
    assert load_response.status_code == 200
    loaded_data = load_response.json()
    assert loaded_data["cells"]["A1"]["value"] == "10"
    assert loaded_data["cells"]["C1"]["formula"] == "=SOMME(A1:B1)"

def test_load_nonexistent_spreadsheet(test_client):
    """Test that loading a non-existent spreadsheet returns a 404."""
    response = test_client.get("/api/spreadsheet/load/nonexistent-sheet")
    assert response.status_code == 404

def test_custom_functions_crud(test_client):
    """Test the full CRUD lifecycle for custom functions."""

    # 1. Initially, the list should be empty
    response = test_client.get("/api/functions/list")
    assert response.status_code == 200
    assert response.json() == []

    # 2. Save a new function
    func_data = {
        "name": "MY_SUM",
        "description": "A custom sum function",
        "language": "python",
        "code": "def MY_SUM(a, b):\n    return a + b"
    }
    save_response = test_client.post("/api/functions/save", json=func_data)
    assert save_response.status_code == 200
    assert save_response.json()["name"] == "MY_SUM"

    # 3. List functions and verify the new one is there
    list_response = test_client.get("/api/functions/list")
    assert list_response.status_code == 200
    functions = list_response.json()
    assert len(functions) == 1
    assert functions[0]["name"] == "MY_SUM"
    assert functions[0]["language"] == "python"

    # 4. Delete the function
    delete_response = test_client.delete("/api/functions/delete/MY_SUM")
    assert delete_response.status_code == 200
    assert delete_response.json()["status"] == "success"

    # 5. List functions again and verify it's empty
    final_list_response = test_client.get("/api/functions/list")
    assert final_list_response.status_code == 200
    assert final_list_response.json() == []

def test_delete_nonexistent_function(test_client):
    """Test that deleting a non-existent function returns a 404."""
    response = test_client.delete("/api/functions/delete/NO_SUCH_FUNCTION")
    assert response.status_code == 404
