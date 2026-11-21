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

# omp (oh-my-pi), the agent harness the evals compare models in (evals/omp.py, which pins the same
# version), from omp's build service, checked against its sha256.
ARG OMP_VERSION=19.0.1
RUN bun -e "const h = { 'User-Agent': 'osrs-evals' }; \
    const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64'; \
    const build = await (await fetch('https://build.stencil.so/api/products/omp/versions/${OMP_VERSION}/linux-' + arch, { headers: h })).json(); \
    const bin = new Uint8Array(await (await fetch(build.download, { headers: h })).arrayBuffer()); \
    if (new Bun.CryptoHasher('sha256').update(bin).digest('hex') !== build.file.sha256) throw new Error('omp sha256 mismatch'); \
    await Bun.write('/usr/local/bin/omp', bin);" \
    && chmod 755 /usr/local/bin/omp && omp --version | grep -qx "omp/${OMP_VERSION}"

# The harness starts the world itself, with each eval's settings.
ENTRYPOINT []
CMD ["sleep", "infinity"]
