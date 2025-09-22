from sqlalchemy import create_engine, Column, Integer, String, JSON, Text, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import json

# --- Database Setup ---
SQLALCHEMY_DATABASE_URL = "sqlite:///./spreadsheet.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- ORM Models ---

class Spreadsheet(Base):
    """
    Represents a single spreadsheet. The entire state of the sheet,
    including cells, floating elements, and charts, is stored in the `data` field as JSON.
    """
    __tablename__ = "spreadsheets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    data = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class CustomFunction(Base):
    """
    Represents a user-defined function that can be executed in formulas.
    These functions are global and not tied to a specific spreadsheet.
    """
    __tablename__ = "custom_functions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)
    language = Column(String, nullable=False)  # e.g., 'python', 'javascript'
    code = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ReportTemplate(Base):
    """
    Represents a user-defined report template. The layout field stores the
    positions and configurations of charts and cell ranges.
    """
    __tablename__ = "report_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)
    layout = Column(JSON, nullable=False) # Stores positions of elements
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# --- Database Initialization ---

def create_db_and_tables():
    """
    Creates all database tables defined in the Base metadata.
    This should be called once on application startup.
    """
    Base.metadata.create_all(bind=engine)

# --- Database Session Dependency ---

def get_db():
    """
    Dependency for FastAPI routes to get a database session.
    Ensures the session is closed after the request is finished.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- CRUD Helper Functions ---

def save_spreadsheet(db, name: str, data: dict):
    """
    Saves or updates a spreadsheet in the database.
    """
    spreadsheet = db.query(Spreadsheet).filter(Spreadsheet.name == name).first()
    if spreadsheet:
        spreadsheet.data = data
        spreadsheet.updated_at = datetime.utcnow()
    else:
        spreadsheet = Spreadsheet(name=name, data=data)
        db.add(spreadsheet)
    db.commit()
    db.refresh(spreadsheet)
    return spreadsheet

def load_spreadsheet(db, name: str):
    """
    Loads a spreadsheet from the database by its name.
    """
    return db.query(Spreadsheet).filter(Spreadsheet.name == name).first()

def list_spreadsheets(db):
    """
    Returns a list of all spreadsheets.
    """
    return db.query(Spreadsheet).all()

def save_custom_function(db, name: str, description: str, language: str, code: str):
    """
    Saves or updates a global custom function.
    """
    func = db.query(CustomFunction).filter(CustomFunction.name == name).first()
    if func:
        func.description = description
        func.language = language
        func.code = code
        func.updated_at = datetime.utcnow()
    else:
        func = CustomFunction(
            name=name,
            description=description,
            language=language,
            code=code
        )
        db.add(func)
    db.commit()
    db.refresh(func)
    return func

def list_custom_functions(db):
    """
    Returns a list of all custom functions.
    """
    return db.query(CustomFunction).all()

def delete_custom_function(db, name: str):
    """
    Deletes a custom function by its name.
    """
    func = db.query(CustomFunction).filter(CustomFunction.name == name).first()
    if func:
        db.delete(func)
        db.commit()
        return True
    return False

# --- Report Template CRUD ---

def save_report_template(db, name: str, description: str, layout: dict):
    """
    Saves or updates a report template.
    """
    template = db.query(ReportTemplate).filter(ReportTemplate.name == name).first()
    if template:
        template.description = description
        template.layout = layout
        template.updated_at = datetime.utcnow()
    else:
        template = ReportTemplate(
            name=name,
            description=description,
            layout=layout
        )
        db.add(template)
    db.commit()
    db.refresh(template)
    return template

def list_report_templates(db):
    """
    Returns a list of all report templates.
    """
    return db.query(ReportTemplate).all()

def load_report_template(db, template_id: int):
    """
    Loads a single report template by its ID.
    """
    return db.query(ReportTemplate).filter(ReportTemplate.id == template_id).first()

def delete_report_template(db, template_id: int):
    """
    Deletes a report template by its ID.
    """
    template = db.query(ReportTemplate).filter(ReportTemplate.id == template_id).first()
    if template:
        db.delete(template)
        db.commit()
        return True
    return False
