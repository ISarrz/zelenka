import socket

HOST = '0.0.0.0'
PORT = 4600

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind((HOST, PORT))
    s.listen()
    print(f"Server listening on {HOST}:{PORT}")

    while True:
        try:
            print("Waiting for connection...")
            conn, addr = s.accept()
            print(f"Connected by {addr}")
            with conn:
                while True:
                    data = conn.recv(1024)
                    if not data:
                        print(f"Connection closed by {addr}")
                        break
                    received_message = data.decode("utf-8").strip()
                    print(f"Received: {received_message}")
        except Exception as e:
            print(f"Error: {e}")
            continue
