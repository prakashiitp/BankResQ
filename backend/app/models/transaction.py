from sqlalchemy import Column, Integer, Numeric, String, DateTime
from sqlalchemy.sql import func

from app.database.connection import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)

    sender_account_id = Column(Integer, nullable=False)
    receiver_account_id = Column(Integer, nullable=False)

    amount = Column(Numeric(12, 2), nullable=False)

    status = Column(String(20), nullable=False, default="PENDING")

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    processed_at = Column(
        DateTime(timezone=True),
        nullable=True
    )