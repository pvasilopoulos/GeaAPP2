# SpaceHub Cloud Agent base image.
# Stable, slow-changing system dependencies live here (Node 22 + MariaDB).
# Repository-specific setup (npm install, schema, seed) runs in `install`.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg git build-essential \
        mariadb-server \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o /tmp/nodesource.key \
    && gpg --dearmor -o /usr/share/keyrings/nodesource.gpg /tmp/nodesource.key \
    && echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* /tmp/nodesource.key

# The `ubuntu` user (uid 1000) already exists and is used by the Cloud Agent
# runtime. MariaDB is started per-boot from `start`.
USER ubuntu
