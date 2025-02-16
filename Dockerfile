# Stage 1: Build the Angular application
FROM node AS build

ARG CONFIGURATION

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

RUN echo $CONFIGURATION

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

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
