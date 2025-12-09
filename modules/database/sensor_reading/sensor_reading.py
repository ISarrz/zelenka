from __future__ import annotations

from typing import List
from dataclasses import dataclass
from datetime import datetime
from modules.database.database.database import DB


class SensorReadingNotFoundError(Exception):
    def __str__(self) -> str:
        return "Sensor reading not found"


class SensorReadingAlreadyExistsError(Exception):
    def __str__(self) -> str:
        return "Sensor reading not found"


class InvalidSensorReadingArgumentsError(Exception):
    def __str__(self) -> str:
        return "Invalid sensor reading arguments"


@dataclass
class DbSensorReading:
    id: int
    device_id: int
    datetime: str
    temperature: float
    humidity: float
    pressure: float
    hydration: float
    waterlevel: float


class SensorReadingFetcher:
    @staticmethod
    def fetch_all() -> List[DbSensorReading]:
        return SensorReadingFetcher.constructor(DB.fetch_many(DB.sensor_readings_table_name))

    @staticmethod
    def fetch_by_id(id: int) -> DbSensorReading:
        return SensorReadingFetcher.constructor(DB.fetch_one(DB.sensor_readings_table_name, id=id))

    @staticmethod
    def constructor(info) -> DbSensorReading | List[DbSensorReading] | None:
        if not info:
            return None

        if isinstance(info, list):
            return [SensorReadingFetcher.constructor(sensor_reading_info) for sensor_reading_info in info]

        else:
            return DbSensorReading(**dict(info))

    @staticmethod
    def fetch_device_sensor_readings(device_id: int) -> List[DbSensorReading]:
        sensor_readings_id = [info["device_id"] for info in
                              DB.fetch_many(DB.sensor_readings_table_name, device_id=device_id)]
        if sensor_readings_id:
            return [SensorReadingFetcher.fetch_by_id(sensor_reading_id) for sensor_reading_id in sensor_readings_id]

        return []


class SensorReadingDeleter:
    @staticmethod
    def delete(sensor_reading: DbSensorReading):
        DB.delete_one(DB.sensor_readings_table_name, id=sensor_reading.id)


class SensorReadingInserter:
    @staticmethod
    def insert(device_id: int, datetime: str, temperature: float, humidity: float, pressure: float, hydration: float,
               waterlevel: float):
        sensor_reading_id = DB.insert_one(DB.sensor_readings_table_name,
                                          device_id=device_id,
                                          datetime=datetime,
                                          temperature=temperature,
                                          humidity=humidity,
                                          pressure=pressure,
                                          hydration=hydration,
                                          waterlevel=waterlevel)
        return sensor_reading_id


class SensorReadingUpdater:
    @staticmethod
    def update_device_id(sensor_reading: DbSensorReading, device_id: int):
        DB.update_one(DB.sensor_readings_table_name, dict(id=sensor_reading.id), dict(device_id=device_id))

    @staticmethod
    def update_datetime(sensor_reading: DbSensorReading, datetime: str):
        DB.update_one(DB.sensor_readings_table_name, dict(id=sensor_reading.id), dict(datetime=datetime))

    @staticmethod
    def update_temperature(sensor_reading: DbSensorReading, temperature: float):
        DB.update_one(DB.sensor_readings_table_name, dict(id=sensor_reading.id), dict(temperature=temperature))

    @staticmethod
    def update_humidity(sensor_reading: DbSensorReading, humidity: float):
        DB.update_one(DB.sensor_readings_table_name, dict(id=sensor_reading.id), dict(humidity=humidity))

    @staticmethod
    def update_pressure(sensor_reading: DbSensorReading, pressure: float):
        DB.update_one(DB.sensor_readings_table_name, dict(id=sensor_reading.id), dict(pressure=pressure))

    @staticmethod
    def update_hydration(sensor_reading: DbSensorReading, hydration: float):
        DB.update_one(DB.sensor_readings_table_name, dict(id=sensor_reading.id), dict(hydration=hydration))

    @staticmethod
    def update_waterlevel(sensor_reading: DbSensorReading, waterlevel: float):
        DB.update_one(DB.sensor_readings_table_name, dict(id=sensor_reading.id), dict(waterlevel=waterlevel))


class SensorReading:
    _sensor_reading: DbSensorReading

    def __init__(self, *args, **kwargs):
        kwargs_keys = set(kwargs.keys())

        if kwargs_keys == {"id"}:
            self._sensor_reading = SensorReadingFetcher.fetch_by_id(kwargs["id"])


        elif kwargs_keys == {"db_sensor_reading"}:
            self._sensor_reading = kwargs["db_sensor_reading"]

        else:
            raise InvalidSensorReadingArgumentsError

        if not self._sensor_reading:
            raise SensorReadingNotFoundError

    @property
    def id(self):
        return self._sensor_reading.id

    @property
    def device_id(self):
        return self._sensor_reading.device_id

    @device_id.setter
    def device_id(self, device_id: int):
        self._sensor_reading.device_id = device_id

    @property
    def datetime(self):
        return self._sensor_reading.datetime

    @datetime.setter
    def datetime(self, datetime: str):
        self._sensor_reading.datetime = datetime

    @property
    def temperature(self):
        return self._sensor_reading.temperature

    @temperature.setter
    def temperature(self, temperature: float):
        self._sensor_reading.temperature = temperature

    @property
    def humidity(self):
        return self._sensor_reading.humidity

    @humidity.setter
    def humidity(self, humidity: float):
        self._sensor_reading.humidity = humidity

    @property
    def pressure(self):
        return self._sensor_reading.pressure

    @pressure.setter
    def pressure(self, pressure: float):
        self._sensor_reading.pressure = pressure

    @property
    def hydration(self):
        return self._sensor_reading.hydration

    @hydration.setter
    def hydration(self, hydration: float):
        self._sensor_reading.hydration = hydration

    @property
    def waterlevel(self):
        return self._sensor_reading.waterlevel

    @waterlevel.setter
    def waterlevel(self, waterlevel: float):
        self._sensor_reading.waterlevel = waterlevel

    @staticmethod
    def all():
        sensor_readings = SensorReadingFetcher.fetch_all()

        if sensor_readings:
            return [SensorReading(db_sensor_reading=sensor_reading_info) for sensor_reading_info in sensor_readings]

        return []

    @staticmethod
    def by_device(device_id: int):
        sensor_readings = SensorReadingFetcher.fetch_device_sensor_readings(device_id=device_id)
        if sensor_readings:
            return [SensorReading(db_sensor_reading=sensor_reading_info) for sensor_reading_info in sensor_readings]

        return []

    @staticmethod
    def insert(device_id: int, datetime: str, temperature: float, humidity: float, pressure: float, hydration: float,
               waterlevel: float) -> SensorReading:
        # try:
        #     SensorReading(device_id=device_id, datetime=datetime, temperature=temperature, humidity=humidity,
        #                   pressure=pressure, hydration=hydration, waterlevel=waterlevel)
        #
        #     raise SensorReadingAlreadyExistsError

        # except SensorReadingNotFoundError:
        sensor_reading_id = SensorReadingInserter.insert(device_id=device_id, datetime=datetime,
                                                         temperature=temperature,
                                                         humidity=humidity, pressure=pressure, hydration=hydration,
                                                         waterlevel=waterlevel)

        return SensorReading(id=sensor_reading_id)

    def delete(self):
        SensorReadingDeleter.delete(self._sensor_reading)

    def __str__(self):
        return (f"id: {self.id}, "
                f"device_id: {self.device_id}, "
                f"datetime: {self.datetime}, "
                f"temperature: {self.temperature}, "
                f"humidity: {self.humidity}, "
                f"pressure: {self.pressure}, "
                f"hydration: {self.hydration}, "
                f"waterlevel: {self.waterlevel}")


if __name__ == "__main__":
    pass
