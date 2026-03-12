from database import SessionLocal, Application

db = SessionLocal()
try:
    new_app = Application(company_name="Test Company")
    db.add(new_app)
    db.commit()
    db.refresh(new_app)
    print(f"Success: app_id={new_app.id}")
except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
