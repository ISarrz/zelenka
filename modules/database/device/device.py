from __future__ import annotations

from typing import List
from dataclasses import dataclass

from setools import Devicetreecon

from modules.database.database.database import DB
from modules.database.sensor_reading.sensor_reading import SensorReading


class DeviceNotFoundError(Exception):
    def __str__(self) -> str:
        return "Device not found"


class DeviceAlreadyExistsError(Exception):
    def __str__(self) -> str:
        return "Device already exists"


class IncorrectDeviceArgumentsError(Exception):
    def __str__(self) -> str:
        return "Incorrect device arguments"


# database container structure
@dataclass
class DbDevice:
    id: int
    serial_number: str


class DeviceDeleter:
    @staticmethod
    def delete(device: DbDevice):
        DB.delete_one(DB.devices_table_name, id=device.id)
        DB.delete_one(DB.users_devices_table_name, device_id=device.id)


class GroupUpdater:
    @staticmethod
    def update_serial_number(device: DbDevice, serial_number: str):
        DB.update_one(DB.devices_table_name, device.__dict__, {"serial_number": serial_number})


class DeviceFetcher:
    @staticmethod
    def fetch_all() -> List[DbDevice]:
        return DeviceFetcher.constructor(DB.fetch_many(DB.devices_table_name))

    @staticmethod
    def fetch_by_id(id: int) -> DbDevice:
        return DeviceFetcher.constructor(DB.fetch_one(DB.devices_table_name, id=id))

    @staticmethod
    def fetch_by_serial_number(serial_number: str) -> DbDevice:
        return DeviceFetcher.constructor(DB.fetch_one(DB.devices_table_name, serial_number=serial_number))

    @staticmethod
    def constructor(info) -> DbDevice | List[DbDevice] | None:
        if not info:
            return None

        if isinstance(info, list):
            devices = [DeviceFetcher.constructor(device_info) for device_info in info]

            if devices:
                return devices

            return []

        else:
            return DbDevice(**dict(info))

    @staticmethod
    def fetch_user_devices(user_id: int) -> List[DbDevice]:
        devices_id = [info["device_id"] for info in DB.fetch_many(DB.users_devices_table_name, user_id=user_id)]
        if devices_id:
            return [DeviceFetcher.fetch_by_id(device_id) for device_id in devices_id]

        return []


class DeviceInserter:
    @staticmethod
    def insert(serial_number: str):
        return DB.insert_one(DB.devices_table_name, serial_number=serial_number)


class Device:
    _device: DbDevice

    def __init__(self, *args, **kwargs):
        kwargs_keys = set(kwargs.keys())

        if kwargs_keys == {"id"}:
            self._device = DeviceFetcher.fetch_by_id(kwargs.get("id"))

        elif kwargs_keys == {"serial_number"}:
            self._device = DeviceFetcher.fetch_by_serial_number(kwargs.get("serial_number"))

        elif kwargs_keys == {"db_device"}:
            self._device = kwargs.get("db_device")

        else:
            raise IncorrectDeviceArgumentsError()

        if not self._device:
            raise DeviceNotFoundError

    @staticmethod
    def all() -> Device | List[Device]:
        devices = DeviceFetcher.fetch_all()

        if devices:
            return [Device(db_device=info) for info in devices]

        return []

    @staticmethod
    def user_devices(user_id: int) -> List[Device]:
        devices = DeviceFetcher.fetch_user_devices(user_id)

        if devices:
            return [Device(db_device=device_info) for device_info in devices]

        return []

    @property
    def id(self) -> int:
        return self._device.id

    @property
    def serial_number(self) -> str:
        return self._device.serial_number

    @serial_number.setter
    def serial_number(self, serial_number: str):
        GroupUpdater.update_serial_number(self._device, serial_number)
        self._device.serial_number = serial_number

    @staticmethod
    def insert(serial_number: str):
        devices_id = DeviceInserter.insert(serial_number)

        return Device(id=devices_id)

    @property
    def sensor_readings(self) -> List[SensorReading]:
        return SensorReading.by_device(self.id)

    def delete(self):
        DeviceDeleter.delete(self._device)

    def __str__(self):
        return f"Device id: {self.id}, serial_number: {self.serial_number}"


if __name__ == "__main__":
    pass
