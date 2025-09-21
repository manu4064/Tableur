FROM debian:stable-slim

# Install Lua
RUN apt-get update && apt-get install -y lua5.4 && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN useradd -ms /bin/bash runner
USER runner
WORKDIR /home/runner

# Copy the runner and json library
COPY runner.lua .
COPY dkjson.lua .

# Entrypoint
ENTRYPOINT ["lua5.4", "runner.lua"]
