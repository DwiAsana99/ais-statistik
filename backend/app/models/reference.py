from sqlalchemy import Column, SmallInteger, Text
from app.database import Base


class AisShipType(Base):
    __tablename__ = "ais_ship_type"

    code = Column(SmallInteger, primary_key=True)
    group_name = Column(Text)
    description = Column(Text)


class AisNavStatus(Base):
    __tablename__ = "ais_nav_status"

    code = Column(SmallInteger, primary_key=True)
    name = Column(Text, nullable=False)
    description = Column(Text)


class AisMsgType(Base):
    __tablename__ = "ais_msg_type"

    code = Column(SmallInteger, primary_key=True)
    name = Column(Text, nullable=False)
    category = Column(Text)
    description = Column(Text)


class AisAtonType(Base):
    __tablename__ = "ais_aton_type"

    code = Column(SmallInteger, primary_key=True)
    description = Column(Text, nullable=False)
