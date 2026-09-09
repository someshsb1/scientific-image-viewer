FROM python:3.10-slim-bullseye

LABEL maintainer="NeuroScope Team"
LABEL description="High-performance deep-zoom scientific image viewer for JP2/TIFF microscopy images and gigabyte spatial GeoJSON/SWC overlays"

# Install system dependencies: libvips for high-speed tiling, nodejs for sub-second indexed overlay building
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips-tools \
    libvips-dev \
    nodejs \
    npm \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node.js dependencies
COPY package.json ./
RUN npm install --production --no-audit --no-fund

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY app.py iip_client.py image_pipeline.py overlay_index.py overlay_index_fast.js run.sh ./
COPY static/ ./static/
COPY demo.swc demo-points.json ./

# Create storage and mount directories
RUN mkdir -p /app/data /app/samples

ENV NEUROSCOPE_DATA_ROOT=/app/data \
    NEUROSCOPE_STORAGE_MOUNTS=samples:/app/samples \
    PYTHONUNBUFFERED=1

EXPOSE 8088

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8088/api/health || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8088"]
