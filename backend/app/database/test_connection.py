from sqlalchemy import text
from app.database.connection import engine

try:
    with engine.connect() as connection:
        result = connection.execute(text("SELECT version();"))

        print("Database connected successfully!")
        print(result.fetchone())

except Exception as e:
    print("Database connection failed!")
    print(e)