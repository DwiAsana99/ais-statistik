from sqlalchemy import Column, BigInteger, SmallInteger, Numeric, Boolean, DateTime, Float, Text
from geoalchemy2 import Geometry
from app.database import Base


class AisPosition(Base):
    __tablename__ = "ais_position"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    mmsi = Column(BigInteger, nullable=False)
    msg_type = Column(SmallInteger, nullable=False)
    nav_status_code = Column(SmallInteger)
    position_time = Column(DateTime(timezone=True), nullable=False)
    received_at = Column(DateTime(timezone=True), nullable=False)
    lat = Column(Float)
    lon = Column(Float)
    sog_knots = Column(Numeric)
    cog_deg = Column(Numeric)
    heading_deg = Column(SmallInteger)
    rot_deg_per_min = Column(Float)
    position_accuracy = Column(Boolean)
    raim_flag = Column(Boolean)
    maneuver_indicator = Column(SmallInteger)
    special_manoeuvre = Column(SmallInteger)
    geom = Column(Geometry("POINT", srid=4326))


class AisBaseStation(Base):
    __tablename__ = "ais_base_station"

    mmsi = Column(BigInteger, primary_key=True)
    lat = Column(Float)
    lon = Column(Float)
    geom = Column(Geometry("POINT", srid=4326))
    position_accuracy = Column(Boolean)
    utc_second = Column(SmallInteger)
    last_report_at = Column(DateTime(timezone=True))


class AisAton(Base):
    __tablename__ = "ais_aton"

    mmsi = Column(BigInteger, primary_key=True)
    aton_type_code = Column(SmallInteger)
    name = Column(Text)
    lat = Column(Float)
    lon = Column(Float)
    geom = Column(Geometry("POINT", srid=4326))
    virtual_aton = Column(Boolean)
    off_position = Column(Boolean)
    status = Column(SmallInteger)
    dim_to_bow = Column(SmallInteger)
    dim_to_stern = Column(SmallInteger)
    dim_to_port = Column(SmallInteger)
    dim_to_starboard = Column(SmallInteger)
    last_report_at = Column(DateTime(timezone=True))


class AisStation(Base):
    __tablename__ = "ais_station"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    station_id = Column(Text)
    name = Column(Text)
    location = Column(Geometry("POINT", srid=4326))
    description = Column(Text)
