from modules.database.device.device import Device
from modules.database.user.user import User
from modules.database.sensor_reading.sensor_reading import SensorReading
import datetime as dt
import pytz

moscow_timezone = pytz.timezone('Europe/Moscow')

device = Device.insert("123123")
user = User.insert(login="sarrz", email="@gmail.com", password="123")
user.insert_device(device)

datetime = dt.datetime.now(moscow_timezone).strftime("%d.%m.%Y %H:%M:%S")
sensor_reading = SensorReading.insert(device_id=device.id, datetime=datetime, temperature=22.3, humidity=40.1,
                                      pressure=106123.3, hydration=0.1, waterlevel=0.0)

print(sensor_reading)

for sr in device.sensor_readings:
    print(sr)

for sensor_reading in SensorReading.all():
    sensor_reading.delete()

for device in Device.all():
    device.delete()

for user in User.all():
    user.delete()
