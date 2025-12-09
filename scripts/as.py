import asyncio
import datetime as dt
import pytz
import traceback
from modules.database.database.database import DB

HOST = "0.0.0.0"
PORT = 4500


moscow_timezone = pytz.timezone('Europe/Moscow')

# POST SENSOR READING {serial number} {temperature} {}
# POST USER REGISTRATION
# GET USER
# Асинхронная функция для обработки одного клиента
async def handle_client(reader, writer):
    # Получаем адрес клиента
    addr = writer.get_extra_info('peername')
    print(f"Connected by {addr} (Async)")

    try:
        while True:
            data = await reader.read(1024)

            if not data:
                print(f"Connection closed by {addr}")
                break

            received_message = data.decode("utf-8").strip()
            print(f"Received from {addr}: {received_message}")

            # --- Логика обработки запроса ---
            # NOTE: Операции с базой данных (DB.insert_one) могут быть блокирующими!
            # В идеале, их нужно оборачивать в loop.run_in_executor

            inf = received_message.split(" ")
            date = dt.datetime.now(moscow_timezone).strftime("%d.%m.%Y %H:%M:%S")
            print(received_message)
            # try:
            #
            #
            #     # 2. Формирование ответа
            #     response_message = f"ACK_OK: Data for device {inf[0]} received and saved at {date}"
            #
            # except Exception as db_e:
            #     print(f"Database Error for {addr}: {db_e}")
            #     traceback.print_exc()
            #     response_message = f"NACK_ERROR: Database insertion failed."

            # --- Отправка ответа клиенту ---
            # writer.write(response_message.encode("utf-8") + b'\n')
            # Асинхронно ждем, пока данные будут отправлены
            # await writer.drain()
            # print(f"Sent response to {addr}: {response_message}")

    except ConnectionResetError:
        print(f"Client {addr} disconnected unexpectedly.")
    except Exception as e:
        print(f"Error handling client {addr}: {e}")
        traceback.print_exc()

    finally:
        # Корректное закрытие соединения
        writer.close()
        await writer.wait_closed()
        print(f"Connection closed to {addr}")


async def main():
    # Создание и запуск сервера
    server = await asyncio.start_server(
        handle_client, HOST, PORT
    )

    addrs = ', '.join(str(sock.getsockname()) for sock in server.sockets)
    print(f"Server listening on {addrs} (Async)")

    # Асинхронно ждем остановки сервера
    async with server:
        await server.serve_forever()


if __name__ == '__main__':
    try:
        # Запуск главного цикла событий
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer shut down by user.")
    except Exception as e:
        print(f"Main server error: {e}")
        traceback.print_exc()