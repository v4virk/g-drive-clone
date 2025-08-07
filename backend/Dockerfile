FROM node:22-bullseye-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 5000
CMD [ "node", "app.js" ]
