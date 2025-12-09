from __future__ import annotations

from typing import List
from dataclasses import dataclass
from modules.database.database.database import DB
from modules.database.device.device import Device


class UserNotFoundError(Exception):
    def __str__(self) -> str:
        return "User not found"


class UserAlreadyExistsError(Exception):
    def __str__(self) -> str:
        return "User already exist"


class InvalidUserArgumentsError(Exception):
    def __str__(self) -> str:
        return "Invalid user arguments"


@dataclass
class DbUser:
    id: int
    login: str
    email: str
    password: str


class UserFetcher:
    @staticmethod
    def fetch_all() -> List[DbUser]:
        return UserFetcher.constructor(DB.fetch_many(DB.users_table_name))

    @staticmethod
    def fetch_by_id(id: int) -> DbUser:
        return UserFetcher.constructor(DB.fetch_one(DB.users_table_name, id=id))

    @staticmethod
    def fetch_by_email(email: str):
        return UserFetcher.constructor(DB.fetch_one(DB.users_table_name, email=email))

    @staticmethod
    def fetch_by_login(login: str) -> DbUser:
        return UserFetcher.constructor(DB.fetch_one(DB.users_table_name, login=login))

    @staticmethod
    def fetch_by_device_id(device_id: int) -> List[DbUser]:
        users_id = [info["user_id"] for info in DB.fetch_many(DB.users_devices_table_name, device_id=device_id)]
        if users_id:
            return [UserFetcher.fetch_by_id(id) for id in users_id]

        return []

    @staticmethod
    def constructor(info) -> DbUser | List[DbUser] | None:
        if not info:
            return None

        if isinstance(info, list):
            return [UserFetcher.constructor(user_info) for user_info in info]

        else:

            return DbUser(**dict(info))


class UserDeleter:
    @staticmethod
    def delete(user: DbUser):
        DB.delete_one(DB.users_table_name, id=user.id)

    @staticmethod
    def delete_device(user_id: int, device_id: int):
        pass
        DB.delete_one(DB.users_devices_table_name, user_id=user_id, device_id=device_id)


class UserInserter:
    @staticmethod
    def insert(login: str, email: str, password: str) -> DbUser:
        DB.insert_one(DB.users_table_name, login=login, email=email, password=password)
        user = UserFetcher.fetch_by_email(email=email)

        return user

    @staticmethod
    def insert_device(user_id, device_id):
        DB.insert_one(DB.users_devices_table_name, user_id=user_id, device_id=device_id)


class UserUpdater:
    @staticmethod
    def update_login(user: DbUser, login: str):
        DB.update_one(DB.users_table_name, dict(user_id=user.id), dict(login=login))

    @staticmethod
    def update_email(user: DbUser, email: str):
        DB.update_one(DB.users_table_name, dict(user_id=user.id), dict(email=email))

    @staticmethod
    def update_password(user: DbUser, password: str):
        DB.update_one(DB.users_table_name, dict(user_id=user.id), dict(password=password))


class User:
    _user: DbUser

    def __init__(self, *args, **kwargs):
        kwargs_keys = set(kwargs.keys())

        if kwargs_keys == {"id"}:
            self._user = UserFetcher.fetch_by_id(kwargs["id"])

        elif kwargs_keys == {"login"}:
            self._user = UserFetcher.fetch_by_login(kwargs["login"])

        elif kwargs_keys == {"email"}:
            self._user = UserFetcher.fetch_by_email(kwargs["email"])

        elif kwargs_keys == {"db_user"}:
            self._user = kwargs["db_user"]

        else:
            raise InvalidUserArgumentsError

        if not self._user:
            raise UserNotFoundError

    @staticmethod
    def all():
        users = UserFetcher.fetch_all()

        if users:
            return [User(db_user=user_info) for user_info in users]

        return []

    @property
    def id(self) -> int:
        return self._user.id

    @property
    def login(self) -> str:
        return self._user.login

    @login.setter
    def login(self, login: str):
        UserUpdater.update_login(self._user, login)

    @property
    def email(self):
        return self._user.email

    @email.setter
    def email(self, email: str):
        UserUpdater.update_email(self._user, email)

    @property
    def password(self) -> str:
        return self._user.password

    @password.setter
    def password(self, password: str):
        UserUpdater.update_password(self._user, password)

    @property
    def devices(self) -> List[Device]:
        return Device.user_devices(user_id=self.id)

    @staticmethod
    def by_device(device_id: int):
        users = UserFetcher.fetch_by_device_id(device_id=device_id)
        if users:
            return [User(db_user=user_info) for user_info in users]

        return []

    @staticmethod
    def safe_insert(login: str, email: str, password: str) :
        try:
            User.insert(login=login, email=email, password=password)

            return UserFetcher.fetch_by_email(email=email)

        except UserAlreadyExistsError:
            pass

    @staticmethod
    def insert(login: str, email: str, password: str) -> User:
        try:
            User(email=email)

            raise UserAlreadyExistsError

        except UserNotFoundError:
            UserInserter.insert(login=login, email=email, password=password)

            return User(email=email)

    def delete(self):
        UserDeleter.delete(self._user)

    def insert_device(self, device: Device):
        UserInserter.insert_device(user_id=self.id, device_id=device.id)

    def delete_device(self, device: Device):
        UserDeleter.delete_device(user_id=self.id, device_id=device.id)

    def __str__(self):
        return f"id: {self.id}, login: {self.login}, email: {self.email}, password: {self.password}"


if __name__ == "__main__":
    pass
