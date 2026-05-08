FROM debian:bookworm

RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    libmysqlcppconn-dev \
    clang \
    iputils-ping \
    nlohmann-json3-dev \
    gdb \
    docker-compose \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# RUN mkdir -p build && cd build && \
#     cmake .. && \
#     make
