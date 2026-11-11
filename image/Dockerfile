# The world image: rs-sdk's own server image (built from its server/Dockerfile at the pinned
# commit) plus two things the harness needs. Built by image/build.sh with rs-sdk/server as context.
ARG RS_SDK_IMAGE=rs-sdk:71d949d
FROM ${RS_SDK_IMAGE}

# The SDK's pathfinder loads ../server/vendor, which rs-sdk's Dockerfile does not copy.
COPY vendor /opt/server/vendor

# The engine autosaves every 1500 ticks. Let the harness set the interval (SAVE_EVERY_TICKS), so
# it can read the server's own save of every account during a run: the score over time.
RUN sed -i 's/PLAYER_SAVERATE: number = 1500;/PLAYER_SAVERATE: number = Number(process.env.SAVE_EVERY_TICKS || 1500);/' \
        /opt/server/engine/src/engine/World.ts \
    && grep -q 'SAVE_EVERY_TICKS' /opt/server/engine/src/engine/World.ts

# The harness starts the world itself, with each eval's settings.
ENTRYPOINT []
CMD ["sleep", "infinity"]
