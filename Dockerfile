# Stage 1: Build the Angular application
# Node 26 is the active LTS; Angular 22 supports ^22.22.3 || ^24.15.0 || >=26.
FROM node:26-alpine AS build

WORKDIR /app

# Install exactly what package-lock.json pins (fails if it is out of sync with package.json).
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build configuration: production (main branch) or stage (all other branches).
ARG CONFIGURATION=stage
RUN npm run build -- --configuration="$CONFIGURATION"

# Precompress text files once at maximum level so nginx can serve them with gzip_static
# instead of compressing per request. assets/config.json is excluded: the entrypoint rewrites
# it at container start, and a build-time .gz copy would be served instead.
RUN find dist/mobi.mapr/browser -type f \
        \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.json' -o -name '*.svg' -o -name '*.txt' \) \
        ! -path '*/assets/config.json' \
        -size +1k \
        -exec gzip -9 -k {} +

# Stage 2: Serve the application with nginx (stable branch)
FROM nginx:1.30-alpine

COPY --from=build /app/dist/mobi.mapr/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

# Writes assets/config.json (runtime config, e.g. maintenance mode), then starts nginx
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

CMD ["/docker-entrypoint.sh"]
