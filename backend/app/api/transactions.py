from decimal import Decimal
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database.connection import SessionLocal
from app.models.account import Account
from app.models.transaction import Transaction


router = APIRouter(
    prefix="/transactions",
    tags=["Transactions"]
)


class TransferRequest(BaseModel):
    sender_account_id: int
    receiver_account_id: int
    amount: Decimal


@router.post("/transfer")
def transfer_money(data: TransferRequest):
    db = SessionLocal()

    try:
        sender = db.query(Account).filter(
            Account.id == data.sender_account_id
        ).first()

        receiver = db.query(Account).filter(
            Account.id == data.receiver_account_id
        ).first()

        if not sender:
            raise HTTPException(
                status_code=404,
                detail="Sender account not found"
            )

        if not receiver:
            raise HTTPException(
                status_code=404,
                detail="Receiver account not found"
            )

        if sender.id == receiver.id:
            raise HTTPException(
                status_code=400,
                detail="Sender and receiver accounts cannot be the same"
            )

        if data.amount <= 0:
            raise HTTPException(
                status_code=400,
                detail="Transfer amount must be greater than 0"
            )

        if sender.balance < data.amount:
            raise HTTPException(
                status_code=400,
                detail="Insufficient balance"
            )

        # Create transaction as PENDING
        transaction = Transaction(
            sender_account_id=sender.id,
            receiver_account_id=receiver.id,
            amount=data.amount,
            status="PENDING"
        )

        db.add(transaction)
        db.commit()
        db.refresh(transaction)

        return {
            "message": "Transaction queued successfully",
            "transaction_id": transaction.id,
            "status": transaction.status,
            "sender_account_id": transaction.sender_account_id,
            "receiver_account_id": transaction.receiver_account_id,
            "amount": transaction.amount
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception as e:
        db.rollback()
        print("Transaction queue error:", e)

        raise HTTPException(
            status_code=500,
            detail="Failed to create transaction"
        )

    finally:
        db.close()


@router.get("/")
def get_transactions():
    db = SessionLocal()

    try:
        transactions = (
            db.query(Transaction)
            .order_by(Transaction.id.desc())
            .all()
        )

        return transactions

    finally:
        db.close()


@router.get("/{transaction_id}")
def get_transaction(transaction_id: int):
    db = SessionLocal()

    try:
        transaction = (
            db.query(Transaction)
            .filter(Transaction.id == transaction_id)
            .first()
        )

        if not transaction:
            raise HTTPException(
                status_code=404,
                detail="Transaction not found"
            )

        return transaction

    finally:
        db.close()