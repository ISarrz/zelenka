from database.database.database import DB

res  = DB.fetch_many(DB.sensor_readings_table_name)
for row in res:
    print(f"id: {row[0]}; "
          f"device_id: {row[1]}; "
          f"datatime: {row[2]}; "
          f" temperature {row[3]}; "
          f"humidity: {row[4]}; "
          f"pressure: {row[5]}; "
          f"hydration: {row[6]}; "
          f"waterlevel: {row[7]}")