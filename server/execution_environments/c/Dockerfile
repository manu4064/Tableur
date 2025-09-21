FROM gcc:11

# Install json-c library
RUN apt-get update && apt-get install -y libjson-c-dev && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN useradd -ms /bin/bash runner
USER runner
WORKDIR /home/runner

# Copy the runner script
COPY runner.sh .
RUN chmod +x runner.sh

# Entrypoint
ENTRYPOINT ["./runner.sh"]
