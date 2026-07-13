FROM node:22-alpine
WORKDIR /app
RUN mkdir -p /data && chown node:node /data
COPY *.mjs ./
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
USER node
CMD ["node", "server.mjs"]
