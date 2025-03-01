# Stage 1: Build the Angular application
FROM node:lts-alpine AS build

ARG CONFIGURATION=production

# Set the working directory
WORKDIR /app

# Copy package files first for better cache utilization
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the Angular application
RUN if [ "$CONFIGURATION" = "production" ]; then \
        npm run build --prod; \
    else \
        npm run build -- --configuration=stage; \
    fi

# Stage 2: Serve the application with Nginx
FROM nginx:alpine

# Copy the build output to the Nginx html directory
COPY --from=build /app/dist/mobi.mapr /usr/share/nginx/html

# Copy the custom Nginx configuration file
COPY nginx.conf /etc/nginx/nginx.conf

# Add permissions for nginx user
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Switch to non-root user
USER nginx

EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
