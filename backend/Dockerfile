FROM node:22-alpine
WORKDIR /app
RUN sed -i 's#dl-cdn.alpinelinux.org#mirrors.aliyun.com#g' /etc/apk/repositories \
  && apk add --no-cache tesseract-ocr tesseract-ocr-data-eng \
  && mkdir -p /data \
  && chown node:node /data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --registry=https://registry.npmmirror.com \
  && npm cache clean --force
COPY *.mjs ./
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
USER node
CMD ["node", "server.mjs"]
