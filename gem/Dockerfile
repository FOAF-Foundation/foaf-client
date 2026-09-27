FROM ruby:3.4.11-slim

RUN apt-get update -qq \
  && apt-get install -y --no-install-recommends \
    autoconf \
    automake \
    build-essential \
    libssl-dev \
    libtool \
    pkg-config \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/gem
