from datetime import datetime, timezone

from app.database.connection import SessionLocal
from app.models.user import User
from app.models.account import Account
from app.models.transaction import Transaction


def process_transaction(transaction_id: int):

    db = SessionLocal()

    try:
        transaction = (
            db.query(Transaction)
            .filter(Transaction.id == transaction_id)
            .with_for_update()
            .first()
        )

        if not transaction:
            print(f"Transaction {transaction_id} not found")
            return

        # Idempotency protection
        if transaction.status == "SUCCESS":
            print(f"Transaction {transaction_id} already completed")
            return

        sender = (
            db.query(Account)
            .filter(Account.id == transaction.sender_account_id)
            .with_for_update()
            .first()
        )

        receiver = (
            db.query(Account)
            .filter(Account.id == transaction.receiver_account_id)
            .with_for_update()
            .first()
        )

        if not sender or not receiver:
            transaction.status = "FAILED"
            db.commit()
            print(f"Transaction {transaction_id} failed: account not found")
            return

        if sender.balance < transaction.amount:
            transaction.status = "FAILED"
            db.commit()
            print(f"Transaction {transaction_id} failed: insufficient balance")
            return

        # Mark as processing
        transaction.status = "PROCESSING"
        db.commit()

        print(f"Processing transaction {transaction_id}...")

        # Perform money transfer
        sender.balance -= transaction.amount
        receiver.balance += transaction.amount

        transaction.status = "SUCCESS"
        transaction.processed_at = datetime.now(timezone.utc)

        db.commit()

        print(
            f"Transaction {transaction_id} completed successfully"
        )

    except Exception as e:
        db.rollback()
        print(
            f"Transaction {transaction_id} failed: {e}"
        )

    finally:
        db.close()