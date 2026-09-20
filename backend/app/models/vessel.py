from sqlalchemy import Column, BigInteger, Integer, SmallInteger, Text, Numeric, Boolean, DateTime, String
from sqlalchemy import Float
from geoalchemy2 import Geometry
from app.database import Base


class AisVesselStatic(Base):
    __tablename__ = "ais_vessel_static"

    mmsi = Column(BigInteger, primary_key=True)
    class_ = Column("class", String(1))
    imo = Column(Integer)
    call_sign = Column(String(20))
    name = Column(Text)
    ship_type_code = Column(SmallInteger)
    dim_to_bow = Column(SmallInteger)
    dim_to_stern = Column(SmallInteger)
    dim_to_port = Column(SmallInteger)
    dim_to_starboard = Column(SmallInteger)
    length_m = Column(Numeric)
    width_m = Column(Numeric)
    draught_m = Column(Numeric)
    destination = Column(Text)
    eta_month = Column(SmallInteger)
    eta_day = Column(SmallInteger)
    eta_hour = Column(SmallInteger)
    eta_minute = Column(SmallInteger)
    vendor_id = Column(String(3))
    model = Column(String(2))
    serial_number = Column(Integer)
    last_static_update = Column(DateTime(timezone=True))


class VesselState(Base):
    __tablename__ = "vessel_states"

    mmsi = Column(BigInteger, primary_key=True)
    last_lat = Column(Float)
    last_lon = Column(Float)
    last_position = Column(Geometry("POINT", srid=4326))
    last_sog = Column(Float)
    last_cog = Column(Float)
    last_heading = Column(Integer)
    last_nav_status = Column(SmallInteger)
    last_station_id = Column(Text)
    last_timestamp_ais = Column(DateTime(timezone=True))
    last_received_at = Column(DateTime(timezone=True), nullable=False)
    last_msg_type = Column(SmallInteger)
    last_rot = Column(Float)
    last_pos_accuracy = Column(Boolean)
    last_raim_flag = Column(Boolean)
    last_manoeuvre = Column(SmallInteger)
