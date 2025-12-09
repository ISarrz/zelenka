import socket
import time

SERVER_HOST = '94.29.24.225'  # Замените на IP вашего сервера
SERVER_PORT = 4500  # Порт TCP
SEND_INTERVAL_SECONDS = 5  # Интервал отправки в секундах
DATA_TO_SEND = "hello"
BUFFER_SIZE = 4096


def run_client():
    client_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

    try:

        print(f"Попытка подключения к {SERVER_HOST}:{SERVER_PORT}...")
        client_socket.connect((SERVER_HOST, SERVER_PORT))
        print("Соединение успешно установлено. Начинаем постоянную отправку.")


        while True:

            data_bytes = DATA_TO_SEND.encode('utf-8')

            # --- ОТПРАВКА ДАННЫХ ---
            client_socket.sendall(data_bytes)
            print(f"[{time.strftime('%H:%M:%S')}] Отправлено {len(data_bytes)} байт.")


            client_socket.settimeout(2)




            time.sleep(SEND_INTERVAL_SECONDS)

    except socket.error as e:
        print(f"Произошла ошибка сокета: {e}")

    except KeyboardInterrupt:
        print("\nПрограмма остановлена пользователем.")

    finally:
        if 'client_socket' in locals() and client_socket._closed == False:
            client_socket.close()
            print("Соединение закрыто.")


if __name__ == "__main__":
    run_client()