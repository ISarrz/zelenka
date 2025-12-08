import socket
import datetime as dt
import pytz

from database.database.database import DB

HOST = "0.0.0.0"
PORT = 4500

moscow_timezone = pytz.timezone('Europe/Moscow')
now = dt.datetime.now(moscow_timezone)

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind((HOST, PORT))
    s.listen()
    print(f"Server listening on {HOST}:{PORT}")
    while True:
        try:
            print("Waiting for connection...")
            conn, addr = s.accept()
            print("Connected by", addr)
            with conn:
                while True:
                    data = conn.recv(1024)
                    if not data:
                        print(f"Connection closed by {addr}")
                        break
                    received_message = data.decode("utf-8").strip()
                    inf = received_message.split(" ")
                    date = dt.datetime.now(moscow_timezone).strftime("%d.%m.%Y %H:%M:%S")

                    DB.insert_one(DB.sensor_readings_table_name,
                                  device_id=inf[0],
                                  datatime=date,
                                  temperature=inf[1],
                                  humidity=inf[2],
                                  pressure=inf[3],
                                  hydration=inf[4],
                                  waterlevel=inf[5],
                                  )
                    print(f"Received {received_message}")

        except Exception as e:
            print(f"Error: {e}")
            continue
