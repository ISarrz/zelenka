from __future__ import annotations
from typing import List
from dataclasses import dataclass
from modules.database.database.database import DB


@dataclass
class DbUserSettings:
    id: int
    user_id: int
    notifications: bool
    mode: str


class UserSettingsFetcher:
    @staticmethod
    def fetch_by_user_id(user_id: int) -> DbUserSettings:
        return UserSettingsFetcher.constructor(
            DB.fetch_one(DB.users_settings_table_name, user_id=user_id))

    @staticmethod
    def fetch_by_id(id: int) -> DbUserSettings:
        return UserSettingsFetcher.constructor(DB.fetch_one(DB.users_settings_table_name, id=id))

    @staticmethod
    def constructor(info) -> DbUserSettings | List[DbUserSettings] | None:
        if not info:
            return None

        if isinstance(info, list):
            return [UserSettingsFetcher.constructor(user_info) for user_info in info]

        else:
            return DbUserSettings(id=info["id"], user_id=info["user_id"], notifications=bool(info["notifications"]), mode=str(info["mode"]))


class UserSettingsDeleter:
    @staticmethod
    def delete(user_settings: DbUserSettings):
        DB.delete_one(DB.users_settings_table_name, user_id=user_settings.user_id)


class UserSettingsUpdater:
    @staticmethod
    def update(user_settings: DbUserSettings):
        DB.update_one(DB.users_settings_table_name,
                      dict(id=user_settings.id),
                      dict(notifications=int(user_settings.notifications))
                      )

    @staticmethod
    def update_notifications(user_settings: DbUserSettings, notifications: int):
        DB.update_one(DB.users_settings_table_name, dict(id=user_settings.id), dict(notifications=notifications))

    @staticmethod
    def update_mode(user_settings: DbUserSettings, mode: str):
        DB.update_one(DB.users_settings_table_name, dict(id=user_settings.id), dict(mode=mode))


class UserSettingsInserter:
    @staticmethod
    def insert(user_settings: DbUserSettings):
        DB.insert_one(DB.users_settings_table_name,
                      notifications=int(user_settings.notifications),
                      mode=str(user_settings.mode))


class UserSettingsNotFoundError(Exception):
    def __str__(self) -> str:
        return "User settings not found"


class UserSettingsAlreadyExistsError(Exception):
    def __str__(self) -> str:
        return "User settings already exists"


class InvalidUserSettingsArgumentsError(Exception):
    def __str__(self) -> str:
        return "Invalid user settings arguments"


class UserSettings:
    _user_settings: DbUserSettings

    def __init__(self, **kwargs):
        fields = ["id", "user_id", "notifications", "db_user_settings", "mode"]

        for field in kwargs.keys():
            if field not in fields:
                raise InvalidUserSettingsArgumentsError

        if "db_user_settings" in kwargs:
            _user_settings = kwargs["db_user_settings"]

        elif "id" in kwargs:
            self._user_settings = UserSettingsFetcher.fetch_by_id(kwargs["id"])

        elif "user_id" in kwargs:
            self._user_settings = UserSettingsFetcher.fetch_by_user_id(kwargs["user_id"])

        else:
            raise InvalidUserSettingsArgumentsError

    @property
    def mode(self) -> str:
        return self._user_settings.mode

    @mode.setter
    def mode(self, mode: str):
        UserSettingsUpdater.update_mode(self._user_settings, str(mode))
        self._user_settings.mode = mode

    @property
    def notifications(self) -> bool:
        return self._user_settings.notifications

    @notifications.setter
    def notifications(self, notifications: bool) -> None:
        UserSettingsUpdater.update_notifications(self._user_settings, int(notifications))
        self._user_settings.notifications = notifications

    def delete(self):
        UserSettingsDeleter.delete(self._user_settings)

    @staticmethod
    def insert(user_id: int):
        DB.insert_one(DB.users_settings_table_name, user_id=user_id, notifications=1, mode="image")
        return UserSettings(user_id=user_id)
