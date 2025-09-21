FROM python:3.9-slim

# Install dependencies
RUN pip install --no-cache-dir numpy pandas

# Create a non-root user
RUN useradd -ms /bin/bash runner
USER runner
WORKDIR /home/runner

# Copy the runner script
COPY runner.py .

# Entrypoint
ENTRYPOINT ["python", "runner.py"]
