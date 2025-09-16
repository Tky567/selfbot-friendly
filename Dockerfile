FROM python:3.11-slim

WORKDIR /app

# Cài thư viện
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy code
COPY . .
# Expose port Flask
EXPOSE 8000

RUN chmod +x start.sh

# Chạy script start.sh
CMD ["./start.sh"]