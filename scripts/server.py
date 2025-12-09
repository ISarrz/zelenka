import socket
import datetime as dt
import pytz


HOST = "0.0.0.0"
PORT = 4600

moscow_timezone = pytz.timezone('Europe/Moscow')

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
                    print(f"Received from {addr}: {received_message}")


                    date = dt.datetime.now(moscow_timezone).strftime("%d.%m.%Y %H:%M:%S")

                    response_message = f"Hello, {date}"
                    conn.sendall(response_message.encode("utf-8"))
                    print(f"Sent response to {addr}: {response_message}")

        except Exception as e:
            print(f"General Error: {e}")
            continue