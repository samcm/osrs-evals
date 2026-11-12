# The eval site: the site (site/), Max's rs-world (BSD-2) built against the map cache from the world
# image so it renders exactly what the engine runs, and serve.ts, which serves both and the runs'
# world feeds. The data comes from site/export.py, mounted at /data; Inspect's log dir at /runs
# (for samples running now).
#
#   docker build -f viewer/Dockerfile -t rs-evals-viewer:71d949d .
#   docker run --network host -v $PWD/site/public/data:/data:ro -v $PWD/logs:/runs:ro rs-evals-viewer:71d949d
ARG WORLD_IMAGE=rs-evals-world:71d949d
FROM ${WORLD_IMAGE} AS world

FROM node:20-bookworm AS rs-world
ARG RS_WORLD_COMMIT=363a90d
COPY --from=oven/bun:1-debian /usr/local/bin/bun /usr/local/bin/bun
RUN git clone https://github.com/MaxBittker/rs-world /rs-world && git -C /rs-world checkout ${RS_WORLD_COMMIT}
WORKDIR /rs-world
RUN yarn install --ignore-scripts --frozen-lockfile --network-timeout 600000
COPY --from=world /opt/server/engine/data/pack /pack
RUN bun scripts/sync-rs-sdk-cache.ts --pack /pack
RUN PUBLIC_URL=/world GENERATE_SOURCEMAP=false NODE_OPTIONS=--max-old-space-size=3072 yarn build && cp -r caches build/caches

FROM node:22-bookworm AS site
WORKDIR /site
COPY site/package.json site/package-lock.json ./
RUN npm ci
COPY site/ ./
RUN rm -rf public/data && npm run build

FROM oven/bun:1-debian
COPY --from=rs-world /rs-world/build /viewer/world
COPY --from=site /site/dist /viewer/site
COPY viewer/serve.ts /viewer/serve.ts
WORKDIR /viewer
ENV SITE=/viewer/site DATA=/data WORLD=/viewer/world RUNS=/runs PORT=7576
EXPOSE 7576
CMD ["bun", "serve.ts"]
