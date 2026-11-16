# The past-questions service for Render: runtime docker with rootDir pq (render.yaml), so the build
# context is this folder. From the repo root the same image is `docker build -t pq pq`.
# The 650 MB of site data is NOT in the image; it is uploaded once to the service's disk (README.md).
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY . /app/
RUN chmod +x /app/boot.sh
ENV PORT=10000 \
    DATA_DIR=/var/data/site \
    STATE_DIR=/var/data/state \
    PYTHONUNBUFFERED=1
EXPOSE 10000
CMD ["/app/boot.sh"]
