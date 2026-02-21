import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.database import Base
from sqlalchemy.orm import relationship

class University(Base):
    __tablename__ = "universities"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    university_name = Column(Text, nullable=False)
    state = Column(Text)
    city = Column(Text)
    affiliation = Column(Text)
    university_type = Column(Text) # 'private', 'deemed', 'state', 'central'
    website_url = Column(Text)
    website_status = Column(Text, default="new")
    outreach_stage = Column(Text, default="new")
    opted_out = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    stakeholders = relationship("Stakeholder", back_populates="university", cascade="all, delete-orphan")
    signals = relationship("UniversitySignal", back_populates="university", cascade="all, delete-orphan")
    priority_score = relationship("PriorityScore", back_populates="university", uselist=False, cascade="all, delete-orphan")
    sequences = relationship("OutreachSequence", back_populates="university", cascade="all, delete-orphan")


class Stakeholder(Base):
    __tablename__ = "stakeholders"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    university_id = Column(UUID(as_uuid=True), ForeignKey("universities.id", ondelete="CASCADE"))
    name = Column(Text)
    role = Column(Text)
    email = Column(Text)
    phone = Column(Text)
    source_url = Column(Text)
    confidence_score = Column(Float, default=0.0)
    linkedin_url = Column(Text)
    enrichment_status = Column(Text, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    university = relationship("University", back_populates="stakeholders")


class UniversitySignal(Base):
    __tablename__ = "university_signals"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    university_id = Column(UUID(as_uuid=True), ForeignKey("universities.id", ondelete="CASCADE"))
    signal_type = Column(Text)
    signal_value = Column(Text)
    weight = Column(Integer, default=0)
    source_url = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    university = relationship("University", back_populates="signals")


class PriorityScore(Base):
    __tablename__ = "priority_scores"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    university_id = Column(UUID(as_uuid=True), ForeignKey("universities.id", ondelete="CASCADE"), unique=True)
    deterministic_score = Column(Integer, default=0)
    ai_score = Column(Float, default=0.0)
    final_score = Column(Float, default=0.0)
    tier = Column(Text)
    ai_reasoning = Column(Text)
    computed_at = Column(DateTime(timezone=True), server_default=func.now())

    university = relationship("University", back_populates="priority_score")


class OutreachSequence(Base):
    __tablename__ = "outreach_sequences"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    university_id = Column(UUID(as_uuid=True), ForeignKey("universities.id", ondelete="CASCADE"))
    stakeholder_id = Column(UUID(as_uuid=True), ForeignKey("stakeholders.id"))
    tier = Column(Text)
    sequence_step = Column(Integer, default=0)
    next_email_date = Column(DateTime(timezone=True)) # NOTE: Postgres Date will map fine with generic DateTime or Date Type
    status = Column(Text, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    university = relationship("University", back_populates="sequences")


class EmailSent(Base):
    __tablename__ = "emails_sent"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    university_id = Column(UUID(as_uuid=True), ForeignKey("universities.id"))
    stakeholder_id = Column(UUID(as_uuid=True), ForeignKey("stakeholders.id"))
    sequence_id = Column(UUID(as_uuid=True), ForeignKey("outreach_sequences.id"))
    email_type = Column(Text)
    subject = Column(Text)
    sendgrid_message_id = Column(Text)
    email_status = Column(Text, default="sent")
    opened_at = Column(DateTime(timezone=True))
    clicked_at = Column(DateTime(timezone=True))
    bounced_at = Column(DateTime(timezone=True))
    sent_at = Column(DateTime(timezone=True), server_default=func.now())


class ReplyLog(Base):
    __tablename__ = "reply_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    university_id = Column(UUID(as_uuid=True), ForeignKey("universities.id"))
    stakeholder_id = Column(UUID(as_uuid=True), ForeignKey("stakeholders.id"))
    from_email = Column(Text)
    subject = Column(Text)
    body = Column(Text)
    classification = Column(Text)
    classification_confidence = Column(Float)
    action_taken = Column(Text)
    processed = Column(Boolean, default=False)
    received_at = Column(DateTime(timezone=True), server_default=func.now())


class Proposal(Base):
    __tablename__ = "proposals"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    university_id = Column(UUID(as_uuid=True), ForeignKey("universities.id"))
    stakeholder_id = Column(UUID(as_uuid=True), ForeignKey("stakeholders.id"))
    trigger_reason = Column(Text)
    generated_content = Column(JSONB)
    pdf_url = Column(Text)
    storage_path = Column(Text)
    status = Column(Text, default="draft")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
