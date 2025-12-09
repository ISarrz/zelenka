import socket
import time

HOST = "0.0.0.0"
PORT = 1234
server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server_socket.bind((HOST, PORT))
server_socket.listen(5)
print("waiting for connection...")
conn, addr = server_socket.accept()
print("connection from", addr)
print(conn.recv(1024))
conn.send(b"Hello, world!")
conn.close()