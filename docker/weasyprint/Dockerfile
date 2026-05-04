FROM python:3.12-slim

# WeasyPrint dépendances système (Pango, cairo, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    fonts-liberation \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir weasyprint==60.2 pydyf==0.8.0 flask==3.0.3 gunicorn==22.0.0

WORKDIR /app
COPY server.py /app/server.py

EXPOSE 5001
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5001", "--timeout", "120", "server:app"]
