# The game view: Max's rs-world (BSD-2) built as a static site, with the map cache from the
# world image so it renders exactly what the engine runs, plus serve.ts, which serves it, the
# recorded runs and their replays.
#
#   docker build -f viewer/Dockerfile -t rs-evals-viewer:71d949d .
ARG WORLD_IMAGE=rs-evals-world:71d949d
FROM ${WORLD_IMAGE} AS world

FROM node:20-bookworm AS build
ARG RS_WORLD_COMMIT=363a90d
COPY --from=oven/bun:1-debian /usr/local/bin/bun /usr/local/bin/bun
RUN git clone https://github.com/MaxBittker/rs-world /rs-world && git -C /rs-world checkout ${RS_WORLD_COMMIT}
WORKDIR /rs-world
RUN yarn install --ignore-scripts --frozen-lockfile --network-timeout 600000
COPY --from=world /opt/server/engine/data/pack /pack
RUN bun scripts/sync-rs-sdk-cache.ts --pack /pack
RUN PUBLIC_URL=/world GENERATE_SOURCEMAP=false NODE_OPTIONS=--max-old-space-size=3072 yarn build && cp -r caches build/caches

FROM oven/bun:1-debian
COPY --from=build /rs-world/build /viewer/world
COPY viewer/serve.ts /viewer/serve.ts
WORKDIR /viewer
ENV RUNS=/runs WORLD=/viewer/world PORT=7576
EXPOSE 7576
CMD ["bun", "serve.ts"]
