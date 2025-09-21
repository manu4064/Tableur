from sqlalchemy import create_engine, Column, Integer, String, JSON, Text, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import json

# Create database engine
SQLALCHEMY_DATABASE_URL = "sqlite:///./spreadsheet.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Spreadsheet(Base):
    __tablename__ = "spreadsheets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    data = Column(JSON)  # Stores cell data and formulas
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    cells = relationship("Cell", back_populates="spreadsheet")
    custom_functions = relationship("CustomFunction", back_populates="spreadsheet")

class Cell(Base):
    __tablename__ = "cells"

    id = Column(Integer, primary_key=True, index=True)
    spreadsheet_id = Column(Integer, ForeignKey("spreadsheets.id"))
    row = Column(Integer)
    col = Column(Integer)
    value = Column(String)
    formula = Column(String, nullable=True)
    style = Column(JSON, nullable=True)  # Stores cell styling
    spreadsheet = relationship("Spreadsheet", back_populates="cells")

class CustomFunction(Base):
    __tablename__ = "custom_functions"

    id = Column(Integer, primary_key=True, index=True)
    spreadsheet_id = Column(Integer, ForeignKey("spreadsheets.id"))
    name = Column(String, index=True)
    code = Column(Text)
    language = Column(String)  # python, javascript, lua, php, c
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    spreadsheet = relationship("Spreadsheet", back_populates="custom_functions")

class UserPreference(Base):
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, index=True)
    theme = Column(String, default="light")
    editor_theme = Column(String, default="dawn")
    auto_recalculate = Column(Integer, default=1)  # Boolean as integer
    default_language = Column(String, default="python")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# Database dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Create database tables
Base.metadata.create_all(bind=engine)

# Helper functions for database operations
def create_spreadsheet(db, name="Untitled"):
    spreadsheet = Spreadsheet(name=name, data=json.dumps({"cells": {}}))
    db.add(spreadsheet)
    db.commit()
    db.refresh(spreadsheet)
    return spreadsheet

def get_spreadsheet(db, spreadsheet_id):
    return db.query(Spreadsheet).filter(Spreadsheet.id == spreadsheet_id).first()

def update_cell(db, spreadsheet_id, row, col, value, formula=None, style=None):
    cell = db.query(Cell).filter(
        Cell.spreadsheet_id == spreadsheet_id,
        Cell.row == row,
        Cell.col == col
    ).first()
    
    if cell is None:
        cell = Cell(
            spreadsheet_id=spreadsheet_id,
            row=row,
            col=col,
            value=value,
            formula=formula,
            style=json.dumps(style) if style else None
        )
        db.add(cell)
    else:
        cell.value = value
        cell.formula = formula
        if style:
            cell.style = json.dumps(style)
    
    db.commit()
    return cell

def save_custom_function(db, spreadsheet_id, name, code, language, description=None):
    function = db.query(CustomFunction).filter(
        CustomFunction.spreadsheet_id == spreadsheet_id,
        CustomFunction.name == name
    ).first()
    
    if function is None:
        function = CustomFunction(
            spreadsheet_id=spreadsheet_id,
            name=name,
            code=code,
            language=language,
            description=description
        )
        db.add(function)
    else:
        function.code = code
        function.language = language
        function.description = description
        function.updated_at = datetime.utcnow()
    
    db.commit()
    return function

def get_custom_functions(db, spreadsheet_id):
    return db.query(CustomFunction).filter(CustomFunction.spreadsheet_id == spreadsheet_id).all()

def save_user_preferences(db, preferences):
    pref = db.query(UserPreference).first()
    if pref is None:
        pref = UserPreference(**preferences)
        db.add(pref)
    else:
        for key, value in preferences.items():
            setattr(pref, key, value)
    db.commit()
    return pref

def get_user_preferences(db):
    pref = db.query(UserPreference).first()
    if pref is None:
        pref = UserPreference()
        db.add(pref)
        db.commit()
    return pref