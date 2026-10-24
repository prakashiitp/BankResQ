
import time
import logging

from app.database.connection import SessionLocal
from app.models.transaction import Transaction
from worker.processor import process_transaction

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)

logger = logging.getLogger(__name__)


def get_pending_transaction():
    db = SessionLocal()

    try:
        transaction = (
            db.query(Transaction)
            .filter(Transaction.status == "PENDING")
            .order_by(Transaction.id.asc())
            .first()
        )

        return transaction.id if transaction else None

    finally:
        db.close()


def start_worker():
    logger.info("BankResQ Worker started")
    logger.info("Waiting for pending transactions")

    while True:
        try:
            transaction_id = get_pending_transaction()

            if transaction_id is not None:
                logger.info(
                    "Found pending transaction: %s",
                    transaction_id,
                )
                process_transaction(transaction_id)
            else:
                time.sleep(2)

        except Exception:
            logger.exception(
                "Worker encountered an error; retrying in 5 seconds"
            )
            time.sleep(5)


if __name__ == "__main__":
    start_worker()
