FROM python:3.11-slim

# Đặt thư mục làm việc là /
WORKDIR /app

# Copy toàn bộ code từ repo vào container
COPY . .

# Cài thư viện Python
RUN pip install --no-cache-dir -r requirements.txt

# Cấp quyền chạy cho start.sh
RUN chmod +x /app/start.sh

# Expose port cho Flask
EXPOSE 8000

# Chạy script start.sh
CMD ["./start.sh"]