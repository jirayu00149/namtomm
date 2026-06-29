FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    YOLO_HOST=0.0.0.0 \
    YOLO_PORT=8010 \
    YOLO_MODEL_PATH=/app/models/flood_water_level.pt \
    YOLO_CONF=0.25 \
    WATER_LEVEL_CLASS_STEP_CM=10 \
    WATER_LEVEL_CLASS_BASE_CM=0 \
    WATER_REFERENCE_HEIGHT_CM=900 \
    WATER_GAUGE_REFERENCE_HEIGHT_CM=200

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY tools/yolo-water-service/requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir -r requirements.txt

COPY tools/yolo-water-service/server.py ./server.py
COPY tools/yolo-water-service/models ./models

EXPOSE 8010

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8010/health', timeout=3).read()"

CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8010"]
