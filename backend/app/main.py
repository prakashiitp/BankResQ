from fastapi import FastAPI
from app.api.auth import router as auth_router
from app.api.accounts import router as accounts_router
from app.api.transactions import router as transactions_router

app = FastAPI(
    title="BankResQ API",
    description="Fault-Tolerant Cloud-Based Banking Transaction Processing Platform",
    version="1.0.0",
)

app.include_router(auth_router)
app.include_router(accounts_router)
app.include_router(transactions_router)


@app.get("/")
def root():
    return {
        "message": "BankResQ API is running"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }