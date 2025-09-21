FROM node:18-slim

# Create a non-root user
RUN useradd -ms /bin/bash runner
USER runner
WORKDIR /home/runner

# Copy the runner script
COPY runner.js .

# Entrypoint
ENTRYPOINT ["node", "runner.js"]
