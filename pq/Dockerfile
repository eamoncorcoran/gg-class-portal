# The past-questions service for Render (runtime: docker, dockerfilePath: pq/Dockerfile, dockerContext: .).
# The 650 MB of site data is NOT in the image; it is uploaded once to the service's disk (README.md).
FROM python:3.12-slim
WORKDIR /app
COPY pq/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY pq/ /app/
RUN chmod +x /app/boot.sh
ENV PORT=10000 \
    DATA_DIR=/var/data/site \
    STATE_DIR=/var/data/state \
    PYTHONUNBUFFERED=1
EXPOSE 10000
CMD ["/app/boot.sh"]
