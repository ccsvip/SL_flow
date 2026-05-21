FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System deps: postgres client, ffmpeg-light for video probes, git for hot update,
# docker CLI for triggering rebuild from inside the container.
RUN set -eux; \
    for i in 1 2 3; do \
        apt-get update && apt-get install -y --no-install-recommends \
            build-essential \
            libpq-dev \
            curl \
            git \
            ca-certificates \
            gnupg \
            lsb-release \
        && break || sleep 5; \
    done \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list \
    && for i in 1 2 3; do \
        apt-get update && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
        && break || sleep 5; \
    done \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

RUN mkdir -p /app/uploads

EXPOSE 8000

CMD ["bash", "-lc", "/app/entrypoint.sh"]
