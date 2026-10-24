from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from decimal import Decimal
import random

from app.database.connection import get_db
from app.models.user import User
from app.models.account import Account

router = APIRouter(
    prefix="/accounts",
    tags=["Accounts"]
)


class AccountCreate(BaseModel):
    user_id: int


@router.post("/create")
def create_account(
    data: AccountCreate,
    db: Session = Depends(get_db)
):
    # Check whether user exists
    user = db.query(User).filter(User.id == data.user_id).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    # Check if user already has an account
    existing_account = db.query(Account).filter(
        Account.user_id == data.user_id
    ).first()

    if existing_account:
        raise HTTPException(
            status_code=400,
            detail="User already has an account"
        )

    # Generate account number
    account_number = str(random.randint(1000000000, 9999999999))

    account = Account(
        user_id=data.user_id,
        account_number=account_number,
        balance=10000.00
    )

    db.add(account)
    db.commit()
    db.refresh(account)

    return {
        "message": "Account created successfully",
        "account_id": account.id,
        "account_number": account.account_number,
        "balance": float(account.balance)
    }


@router.get("/{user_id}")
def get_account(
    user_id: int,
    db: Session = Depends(get_db)
):
    account = db.query(Account).filter(
        Account.user_id == user_id
    ).first()

    if not account:
        raise HTTPException(
            status_code=404,
            detail="Account not found"
        )

    return {
        "account_id": account.id,
        "user_id": account.user_id,
        "account_number": account.account_number,
        "balance": float(account.balance)
    }

class MoneyRequest(BaseModel):
    amount: Decimal


@router.post("/{user_id}/deposit")
def deposit_money(
    user_id: int,
    data: MoneyRequest,
    db: Session = Depends(get_db)
):
    if data.amount <= 0:
        raise HTTPException(
            status_code=400,
            detail="Amount must be greater than 0"
        )

    account = db.query(Account).filter(
        Account.user_id == user_id
    ).first()

    if not account:
        raise HTTPException(
            status_code=404,
            detail="Account not found"
        )

    account.balance += data.amount

    db.commit()
    db.refresh(account)

    return {
        "message": "Money deposited successfully",
        "account_id": account.id,
        "amount": float(data.amount),
        "balance": float(account.balance)
    }


@router.post("/{user_id}/withdraw")
def withdraw_money(
    user_id: int,
    data: MoneyRequest,
    db: Session = Depends(get_db)
):
    if data.amount <= 0:
        raise HTTPException(
            status_code=400,
            detail="Amount must be greater than 0"
        )

    account = db.query(Account).filter(
        Account.user_id == user_id
    ).first()

    if not account:
        raise HTTPException(
            status_code=404,
            detail="Account not found"
        )

    if account.balance < data.amount:
        raise HTTPException(
            status_code=400,
            detail="Insufficient balance"
        )

    account.balance -= data.amount

    db.commit()
    db.refresh(account)

    return {
        "message": "Money withdrawn successfully",
        "account_id": account.id,
        "amount": float(data.amount),
        "balance": float(account.balance)
    }