FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

EXPOSE 3000

# Start Vite dev server binding to 0.0.0.0
CMD ["npm", "run", "dev"]
