# docker build -t foobar -f Dockerfile .
# docker run --rm -ti --user root --entrypoint /bin/bash foobar
# docker run --rm -ti --user node --entrypoint /bin/bash foobar

FROM node:24-trixie-slim

ARG TARGETPLATFORM
ARG BUILDPLATFORM

RUN echo "I am running build on $BUILDPLATFORM, building for $TARGETPLATFORM"

LABEL org.opencontainers.image.source=https://github.com/travisghansen/grpc-reflection-server
LABEL org.opencontainers.image.url=https://github.com/travisghansen/grpc-reflection-server
LABEL org.opencontainers.image.licenses=MIT

EXPOSE 50051

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production

ENV GRS_SERVER_ADDRESS=0.0.0.0

WORKDIR /app
COPY . .
RUN npm install --omit=dev

USER node
ENTRYPOINT ["node", "src/server.js"]
