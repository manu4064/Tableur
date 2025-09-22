FROM gcc:11

# Install json-c library
RUN apt-get update && apt-get install -y libjson-c-dev && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN useradd -ms /bin/bash runner

# Copy the runner script and set permissions as root
COPY runner.sh /home/runner/runner.sh
RUN chmod +x /home/runner/runner.sh

# Switch to the non-root user
USER runner
WORKDIR /home/runner

# Entrypoint
ENTRYPOINT ["./runner.sh"]
