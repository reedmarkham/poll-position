# Use a lightweight base image - to support polars
FROM python:3.11-slim

# Set the working directory
WORKDIR /app

# Copy the application code
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Set the entrypoint script
CMD ["python", "main.py"]