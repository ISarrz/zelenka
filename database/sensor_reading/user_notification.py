from __future__ import annotations

from typing import List
from dataclasses import dataclass
from modules.database.database.database import DB



class InvalidUserNotificationArgumentError(Exception):
    def __str__(self) -> str:
        return "Invalid notification argument"


class UserNotificationNotFoundError(Exception):
    def __str__(self) -> str:
        return "Notification not found"


@dataclass
class DbUserNotification:
    id: int
    user_id: int
    value: str


class UserNotificationFetcher:
    @staticmethod
    def fetch_all() -> List[DbUserNotification]:
        return UserNotificationFetcher.constructor(DB.fetch_many(DB.users_notifications_table_name))

    @staticmethod
    def fetch_by_id(id: int) -> DbUserNotification:
        return UserNotificationFetcher.constructor(DB.fetch_one(DB.users_notifications_table_name, id=id))

    @staticmethod
    def fetch_by_user_id(user_id: int) -> List[DbUserNotification] | None:
        return UserNotificationFetcher.constructor(DB.fetch_many(DB.users_notifications_table_name, user_id=user_id))

    @staticmethod
    def constructor(info):
        if not info:
            return None

        if isinstance(info, list):
            return [UserNotificationFetcher.constructor(notification_info) for notification_info in info]

        else:
            return DbUserNotification(id=info["id"],user_id=info["user_id"], value=info["value"])


class UserNotificationInserter:
    @staticmethod
    def insert(user_id: int, value: str):
        DB.insert_one(DB.users_notifications_table_name, user_id=user_id, value=value)


class UserNotificationDeleter:
    @staticmethod
    def delete(notification: DbUserNotification):
        DB.delete_one(DB.users_notifications_table_name, id=notification.id)

    @staticmethod
    def delete_by_user_id(user_id: int):
        DB.delete_one(DB.users_notifications_table_name, user_id=user_id)


class UserNotification:
    _user_notification: DbUserNotification

    def __init__(self, **kwargs):
        if "id" in kwargs.keys():
            self._user_notification = UserNotificationFetcher.fetch_by_id(kwargs["id"])

        elif "db_user_notification" in kwargs.keys():
            self._user_notification = kwargs["db_user_notification"]

        else:
            raise InvalidUserNotificationArgumentError

        if not self._user_notification:
            raise UserNotificationNotFoundError

    @property
    def value(self) -> str:
        return self._user_notification.value

    @property
    def id(self) -> int:
        return self._user_notification.id

    @staticmethod
    def insert(user_id: int, value: str):
        UserNotificationInserter.insert(user_id, value)

    def delete(self):
        UserNotificationDeleter.delete(self._user_notification)

    @staticmethod
    def all() -> List[UserNotification]:
        notifications = UserNotificationFetcher.fetch_all()

        if notifications:
            return [UserNotification(db_user_notification=notification) for notification in notifications]

        return []

    @staticmethod
    def user_notifications(user_id: int) -> List[UserNotification]:
        notifications = UserNotificationFetcher.fetch_by_user_id(user_id)

        if notifications:
            return [UserNotification(db_user_notification=notification) for notification in notifications]

        return []

    @staticmethod
    def delete_user_notifications(user_id: int):
        UserNotificationDeleter.delete_by_user_id(user_id)
