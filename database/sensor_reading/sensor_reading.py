from __future__ import annotations

from typing import List
from dataclasses import dataclass
from datetime import datetime


class UserNotFoundError(Exception):
    def __str__(self) -> str:
        return "User not found"


class UserAlreadyExistsError(Exception):
    def __str__(self) -> str:
        return "User not found"


class InvalidUserArgumentsError(Exception):
    def __str__(self) -> str:
        return "Invalid user arguments"


@dataclass
class CnUser:
    telegram_id: int


@dataclass
class DbUser(CnUser):
    id: int
    telegram_id: int


class UserFetcher:
    @staticmethod
    def fetch_all() -> List[DbUser]:
        return UserFetcher.constructor(DB.fetch_many(DB.users_table_name))

    @staticmethod
    def fetch_by_telegram_id(telegram_id: int):
        return UserFetcher.constructor(DB.fetch_one(DB.users_table_name, telegram_id=telegram_id))

    @staticmethod
    def fetch_by_id(id: int) -> DbUser:
        return UserFetcher.constructor(DB.fetch_one(DB.users_table_name, id=id))

    @staticmethod
    def fetch_by_group_id(group_id: int) -> List[DbUser]:
        users_id = [info["user_id"] for info in DB.fetch_many(DB.users_groups_table_name, group_id=group_id)]
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
            return DbUser(id=info["id"], telegram_id=info["telegram_id"])


class UserDeleter:
    @staticmethod
    def delete(user: DbUser):
        DB.delete_one(DB.users_table_name, id=user.id)
        DB.delete_one(DB.users_groups_table_name, user_id=user.id)
        DB.delete_one(DB.users_notifications_table_name, user_id=user.id)
        DB.delete_one(DB.timetable_table_name, user_id=user.id)
        DB.delete_one(DB.users_settings_table_name, user_id=user.id)

    @staticmethod
    def delete_group(user_id: int, group_id: int):
        DB.delete_one(DB.users_groups_table_name, user_id=user_id, group_id=group_id)


class UserInserter:
    @staticmethod
    def insert(telegram_id: int):
        DB.insert_one(DB.users_table_name, telegram_id=telegram_id)
        user = UserFetcher.fetch_by_telegram_id(telegram_id=telegram_id)
        UserSettings.insert(user_id=user.id)

    @staticmethod
    def insert_group(user_id, group_id):
        DB.insert_one(DB.users_groups_table_name, group_id=group_id, user_id=user_id)

    @staticmethod
    def insert_notification(user: DbUser, text: str):
        DB.insert_one(DB.users_notifications_table_name, user_id=user.id, value=text)

    @staticmethod
    def insert_notifications(user: DbUser, notifications: List[str] | str):
        if isinstance(notifications, str):
            DB.insert_one(DB.users_notifications_table_name, user_id=user.id, value=notifications)

        else:
            for notification in notifications:
                UserInserter.insert_notifications(user=user, notifications=notification)


class UserUpdater:
    @staticmethod
    def update_notifications(user: DbUser, notifications_state: int):
        DB.update_one(DB.users_notifications_table_name, dict(user_id=user.id), dict(value=notifications_state))


class User:
    _user: DbUser
    _user_settings: UserSettings

    def __init__(self, *args, **kwargs):
        kwargs_keys = set(kwargs.keys())

        if kwargs_keys == {"id"}:
            self._user = UserFetcher.fetch_by_id(kwargs["id"])

        elif kwargs_keys == {"telegram_id"}:
            self._user = UserFetcher.fetch_by_telegram_id(kwargs["telegram_id"])

        elif kwargs_keys == {"db_user"}:
            self._user = kwargs["db_user"]

        else:
            raise InvalidUserArgumentsError

        if not self._user:
            raise UserNotFoundError

        self._user_settings = UserSettings(user_id=self.id)

    @property
    def settings(self):
        return self._user_settings

    @property
    def notifications(self):
        return UserNotification.user_notifications(user_id=self.id)

    @notifications.setter
    def notifications(self, notifications: List[str] | str):
        UserNotification.delete_user_notifications(user_id=self.id)

        for notification in notifications:
            UserNotification.insert(self.id, notification)

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
    def telegram_id(self) -> int:
        return self._user.telegram_id

    @property
    def groups(self) -> List[Group]:
        return Group.user_groups(user_id=self.id)

    @staticmethod
    def by_group(group_id: int):
        users = UserFetcher.fetch_by_group_id(group_id=group_id)
        if users:
            return [User(db_user=user_info) for user_info in users]

        return []

    @staticmethod
    def safe_insert(telegram_id: int):
        try:
            User.insert(telegram_id=telegram_id)
        except UserAlreadyExistsError:
            pass

    def insert_notification(self, text: str):
        UserInserter.insert_notification(user=self._user, text=text)

    @staticmethod
    def insert(telegram_id: int) -> User:
        try:
            User(telegram_id=telegram_id)

            raise UserAlreadyExistsError

        except UserNotFoundError:
            UserInserter.insert(telegram_id=telegram_id)

            return User(telegram_id=telegram_id)

    @property
    def timetable(self) -> List[Timetable]:
        return Timetable.user_timetable(user_id=self.id)

    def get_date_timetable(self, date: str) -> Timetable:
        try:
            return Timetable(user_id=self.id, date=date)
        except TimetableNotFoundError:
            return None

    def insert_timetable(self, date: str, image: bytes, text: str):
        return Timetable.insert(user_id=self.id, date=date, image=image, text=text)

    def delete(self):
        UserDeleter.delete(self._user)
        self._user_settings.delete()

    def insert_group(self, group: Group):
        UserInserter.insert_group(user_id=self.id, group_id=group.id)

    def delete_group(self, group: Group):
        UserDeleter.delete_group(user_id=self.id, group_id=group.id)

    def date_events(self, date: str) -> List[Event]:
        user_groups = self.groups
        events = []
        for group in user_groups:
            events.extend(Event.by_group_and_date(group, date))
        for event in events:
            if not event.start:
                event.start = "00:00"
            if not event.end:
                event.end = "00:00"
        events.sort(
            key=lambda event: (datetime.strptime(event.start, "%H:%M"), datetime.strptime(event.end, "%H:%M")))

        if events:
            return events

        return []

    def __str__(self):
        return f"id: {self.id}, telegram_id: {self.telegram_id}"


if __name__ == "__main__":
    pass
